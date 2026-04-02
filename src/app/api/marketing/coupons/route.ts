import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireAdminSession } from '@/lib/marketing/auth'

type CouponStatusFilter = 'all' | 'active' | 'inactive' | 'expired' | 'scheduled'
type CouponTypeFilter = 'all' | 'percentage' | 'fixed'

type CouponScopeRelation = { customer_type_id?: string | null; price_table_id?: string | null; product_id?: string | null; category_id?: string | null }

type CouponListRow = {
    id: string
    code: string
    name: string | null
    description: string | null
    discount_type: 'percentage' | 'fixed'
    discount_value: number
    min_order_amount: number | null
    max_discount_amount: number | null
    max_uses: number | null
    current_uses: number
    max_uses_per_customer: number | null
    is_cumulative: boolean
    is_active: boolean
    valid_from: string
    valid_until: string | null
    created_at: string
    updated_at: string
    customer_type_scopes?: CouponScopeRelation[] | null
    price_table_scopes?: CouponScopeRelation[] | null
    product_scopes?: CouponScopeRelation[] | null
    category_scopes?: CouponScopeRelation[] | null
}

type CouponUsageProjection = {
    coupon_id: string
    status: 'reserved' | 'released'
    discount_amount: number
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20
const PRODUCT_OPTION_LIMIT = 500

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

function normalizeStatusFilter(value: string | null): CouponStatusFilter {
    if (value === 'active' || value === 'inactive' || value === 'expired' || value === 'scheduled') {
        return value
    }
    return 'all'
}

function normalizeTypeFilter(value: string | null): CouponTypeFilter {
    if (value === 'percentage' || value === 'fixed') return value
    return 'all'
}

function normalizeCouponCode(value: string) {
    return value.trim().toUpperCase()
}

function escapeLikeInput(value: string) {
    return value
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_')
        .replaceAll(',', '\\,')
}

function parseNumberValue(value: unknown, fieldName: string, options?: { required?: boolean; allowNull?: boolean }) {
    const required = options?.required ?? false
    const allowNull = options?.allowNull ?? true

    if (value === undefined || value === null || value === '') {
        if (required) {
            throw new Error(`Campo obrigatorio: ${fieldName}.`)
        }
        return allowNull ? null : 0
    }

    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) {
        throw new Error(`Valor invalido para ${fieldName}.`)
    }

    return parsed
}

function parseIntegerValue(value: unknown, fieldName: string, options?: { required?: boolean; allowNull?: boolean }) {
    const required = options?.required ?? false
    const allowNull = options?.allowNull ?? true

    if (value === undefined || value === null || value === '') {
        if (required) {
            throw new Error(`Campo obrigatorio: ${fieldName}.`)
        }
        return allowNull ? null : 0
    }

    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(parsed)) {
        throw new Error(`Valor inteiro invalido para ${fieldName}.`)
    }

    return parsed
}

function parseBooleanValue(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    return fallback
}

function parseDateValue(value: unknown, fieldName: string, options?: { required?: boolean; fallback?: string | null }) {
    if (value === undefined || value === null || value === '') {
        if (options?.required) {
            throw new Error(`Campo obrigatorio: ${fieldName}.`)
        }
        return options?.fallback ?? null
    }

    const date = new Date(String(value))
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Data invalida para ${fieldName}.`)
    }

    return date.toISOString()
}

function parseScopeIds(value: unknown, fieldName: string, fallback: string[] = []): string[] {
    if (value === undefined) return fallback
    if (value === null) return []

    if (!Array.isArray(value)) {
        throw new Error(`Campo ${fieldName} deve ser uma lista.`)
    }

    const normalized = value.map((entry) => String(entry).trim()).filter(Boolean)

    for (const id of normalized) {
        if (!UUID_REGEX.test(id)) {
            throw new Error(`ID invalido encontrado em ${fieldName}.`)
        }
    }

    return Array.from(new Set(normalized))
}

function extractScopeIds(relations: CouponScopeRelation[] | null | undefined, key: keyof CouponScopeRelation) {
    if (!relations || relations.length === 0) return []
    return Array.from(
        new Set(
            relations
                .map((relation) => relation[key])
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
    )
}

function buildCouponMutationPayload(
    input: Record<string, unknown>,
    fallback?: CouponListRow
) {
    const code = normalizeCouponCode(String(input.code ?? fallback?.code ?? ''))
    const name = String(input.name ?? fallback?.name ?? '').trim()
    const descriptionRaw = input.description ?? fallback?.description ?? null
    const description = descriptionRaw === null ? null : String(descriptionRaw).trim() || null

    const discountTypeRaw = String(input.discountType ?? input.discount_type ?? fallback?.discount_type ?? '').trim().toLowerCase()
    if (discountTypeRaw !== 'percentage' && discountTypeRaw !== 'fixed') {
        throw new Error('Tipo de desconto invalido. Use percentage ou fixed.')
    }

    const discountValue = parseNumberValue(
        input.discountValue ?? input.discount_value ?? fallback?.discount_value,
        'discountValue',
        { required: true, allowNull: false }
    ) as number

    const minOrderAmount = parseNumberValue(
        input.minOrderAmount ?? input.min_order_amount ?? fallback?.min_order_amount,
        'minOrderAmount',
        { allowNull: true }
    )

    const maxDiscountAmount = parseNumberValue(
        input.maxDiscountAmount ?? input.max_discount_amount ?? fallback?.max_discount_amount,
        'maxDiscountAmount',
        { allowNull: true }
    )

    const maxUses = parseIntegerValue(
        input.maxUses ?? input.max_uses ?? fallback?.max_uses,
        'maxUses',
        { allowNull: true }
    )

    const maxUsesPerCustomer = parseIntegerValue(
        input.maxUsesPerCustomer ?? input.max_uses_per_customer ?? fallback?.max_uses_per_customer,
        'maxUsesPerCustomer',
        { allowNull: true }
    )

    const isCumulative = parseBooleanValue(
        input.isCumulative ?? input.is_cumulative,
        fallback?.is_cumulative ?? true
    )

    const isActive = parseBooleanValue(
        input.isActive ?? input.is_active,
        fallback?.is_active ?? true
    )

    const validFrom = parseDateValue(
        input.validFrom ?? input.valid_from,
        'validFrom',
        { required: true, fallback: fallback?.valid_from ?? null }
    )

    const validUntil = parseDateValue(
        input.validUntil ?? input.valid_until,
        'validUntil',
        { fallback: fallback?.valid_until ?? null }
    )

    const customerTypeScopeIds = parseScopeIds(
        input.customerTypeScopeIds ?? input.customer_type_scope_ids,
        'customerTypeScopeIds',
        extractScopeIds(fallback?.customer_type_scopes, 'customer_type_id')
    )

    const priceTableScopeIds = parseScopeIds(
        input.priceTableScopeIds ?? input.price_table_scope_ids,
        'priceTableScopeIds',
        extractScopeIds(fallback?.price_table_scopes, 'price_table_id')
    )

    const productScopeIds = parseScopeIds(
        input.productScopeIds ?? input.product_scope_ids,
        'productScopeIds',
        extractScopeIds(fallback?.product_scopes, 'product_id')
    )

    const categoryScopeIds = parseScopeIds(
        input.categoryScopeIds ?? input.category_scope_ids,
        'categoryScopeIds',
        extractScopeIds(fallback?.category_scopes, 'category_id')
    )

    if (!code) {
        throw new Error('Codigo do cupom e obrigatorio.')
    }

    if (!name) {
        throw new Error('Nome interno do cupom e obrigatorio.')
    }

    if (discountValue < 0) {
        throw new Error('Valor do desconto nao pode ser negativo.')
    }

    if (discountTypeRaw === 'percentage' && discountValue > 100) {
        throw new Error('Cupom percentual nao pode ultrapassar 100%.')
    }

    if (minOrderAmount !== null && minOrderAmount < 0) {
        throw new Error('Valor minimo do pedido nao pode ser negativo.')
    }

    if (maxDiscountAmount !== null && maxDiscountAmount < 0) {
        throw new Error('Valor maximo de desconto nao pode ser negativo.')
    }

    if (maxUses !== null && maxUses < 0) {
        throw new Error('Limite total de usos nao pode ser negativo.')
    }

    if (maxUsesPerCustomer !== null && maxUsesPerCustomer < 0) {
        throw new Error('Limite por cliente nao pode ser negativo.')
    }

    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) {
        throw new Error('Data final nao pode ser menor que a data inicial.')
    }

    if (maxUses !== null && maxUsesPerCustomer !== null && maxUsesPerCustomer > maxUses) {
        throw new Error('Limite por cliente nao pode ultrapassar o limite total de usos.')
    }

    return {
        code,
        name,
        description,
        discountType: discountTypeRaw,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        maxUses,
        maxUsesPerCustomer,
        isCumulative,
        validFrom,
        validUntil,
        isActive,
        customerTypeScopeIds,
        priceTableScopeIds,
        productScopeIds,
        categoryScopeIds,
    }
}

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const searchParams = req.nextUrl.searchParams
        const page = parsePositiveInt(searchParams.get('page'), 1)
        const pageSize = Math.min(parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
        const status = normalizeStatusFilter(searchParams.get('status'))
        const type = normalizeTypeFilter(searchParams.get('type'))
        const search = (searchParams.get('q') || '').trim()
        const createdFrom = searchParams.get('createdFrom')
        const createdTo = searchParams.get('createdTo')
        const nowIso = new Date().toISOString()

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const supabase = createServiceRoleClient()

        let query = supabase
            .from('discount_coupons')
            .select(
                `
                id,
                code,
                name,
                description,
                discount_type,
                discount_value,
                min_order_amount,
                max_discount_amount,
                max_uses,
                current_uses,
                max_uses_per_customer,
                is_cumulative,
                is_active,
                valid_from,
                valid_until,
                created_at,
                updated_at,
                customer_type_scopes:coupon_customer_type_scopes(customer_type_id),
                price_table_scopes:coupon_price_table_scopes(price_table_id),
                product_scopes:coupon_product_scopes(product_id),
                category_scopes:coupon_category_scopes(category_id)
            `,
                { count: 'exact' }
            )
            .order('created_at', { ascending: false })
            .range(from, to)

        if (type !== 'all') {
            query = query.eq('discount_type', type)
        }

        if (status === 'active') {
            query = query
                .eq('is_active', true)
                .lte('valid_from', nowIso)
                .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
        } else if (status === 'inactive') {
            query = query.eq('is_active', false)
        } else if (status === 'expired') {
            query = query.not('valid_until', 'is', null).lt('valid_until', nowIso)
        } else if (status === 'scheduled') {
            query = query.gte('valid_from', nowIso)
        }

        if (search) {
            const escaped = escapeLikeInput(search)
            query = query.or(`code.ilike.%${escaped}%,name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
        }

        if (createdFrom) {
            const parsed = new Date(createdFrom)
            if (!Number.isNaN(parsed.getTime())) {
                query = query.gte('created_at', parsed.toISOString())
            }
        }

        if (createdTo) {
            const parsed = new Date(createdTo)
            if (!Number.isNaN(parsed.getTime())) {
                query = query.lte('created_at', parsed.toISOString())
            }
        }

        const { data, count, error } = await query
        if (error) {
            return NextResponse.json({ error: error.message || 'Falha ao carregar cupons.' }, { status: 500 })
        }

        const rows = (data || []) as CouponListRow[]
        const couponIds = rows.map((row) => row.id)

        const usageMap = new Map<string, { reserved: number; released: number; discountGranted: number }>()

        if (couponIds.length > 0) {
            const { data: usageRows, error: usageError } = await supabase
                .from('coupon_usages')
                .select('coupon_id, status, discount_amount')
                .in('coupon_id', couponIds)

            if (!usageError && usageRows) {
                ;(usageRows as CouponUsageProjection[]).forEach((usage) => {
                    const current = usageMap.get(usage.coupon_id) || { reserved: 0, released: 0, discountGranted: 0 }
                    if (usage.status === 'reserved') {
                        current.reserved += 1
                    } else {
                        current.released += 1
                    }
                    current.discountGranted += Number(usage.discount_amount || 0)
                    usageMap.set(usage.coupon_id, current)
                })
            }
        }

        const [
            activeCouponsResult,
            expiredCouponsResult,
            inactiveCouponsResult,
            totalCouponsResult,
            totalUsagesResult,
            customerTypesResult,
            priceTablesResult,
            categoriesResult,
            productsResult,
        ] = await Promise.all([
            supabase
                .from('discount_coupons')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true)
                .lte('valid_from', nowIso)
                .or(`valid_until.is.null,valid_until.gte.${nowIso}`),
            supabase
                .from('discount_coupons')
                .select('id', { count: 'exact', head: true })
                .not('valid_until', 'is', null)
                .lt('valid_until', nowIso),
            supabase
                .from('discount_coupons')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', false),
            supabase.from('discount_coupons').select('id', { count: 'exact', head: true }),
            supabase.from('coupon_usages').select('id', { count: 'exact', head: true }),
            supabase
                .from('customer_types')
                .select('id, name')
                .eq('is_active', true)
                .order('name', { ascending: true }),
            supabase
                .from('price_tables')
                .select('id, name, is_active')
                .order('name', { ascending: true }),
            supabase
                .from('categories')
                .select('id, name')
                .eq('is_active', true)
                .order('name', { ascending: true }),
            supabase
                .from('products')
                .select('id, name, category_id')
                .eq('is_active', true)
                .order('name', { ascending: true })
                .limit(PRODUCT_OPTION_LIMIT),
        ])

        const coupons = rows.map((row) => {
            const usage = usageMap.get(row.id) || { reserved: 0, released: 0, discountGranted: 0 }
            const totalUses = usage.reserved + usage.released
            return {
                id: row.id,
                code: row.code,
                name: row.name || row.code,
                description: row.description,
                discountType: row.discount_type,
                discountValue: Number(row.discount_value || 0),
                minOrderAmount: row.min_order_amount === null ? null : Number(row.min_order_amount),
                maxDiscountAmount: row.max_discount_amount === null ? null : Number(row.max_discount_amount),
                maxUses: row.max_uses,
                currentUses: Number(row.current_uses || 0),
                maxUsesPerCustomer: row.max_uses_per_customer,
                isCumulative: row.is_cumulative,
                isActive: row.is_active,
                validFrom: row.valid_from,
                validUntil: row.valid_until,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                totalUses,
                reservedUses: usage.reserved,
                releasedUses: usage.released,
                totalDiscountGranted: usage.discountGranted,
                customerTypeScopeIds: extractScopeIds(row.customer_type_scopes, 'customer_type_id'),
                priceTableScopeIds: extractScopeIds(row.price_table_scopes, 'price_table_id'),
                productScopeIds: extractScopeIds(row.product_scopes, 'product_id'),
                categoryScopeIds: extractScopeIds(row.category_scopes, 'category_id'),
            }
        })

        return NextResponse.json({
            data: coupons,
            pagination: {
                page,
                pageSize,
                total: count || 0,
                hasMore: from + coupons.length < (count || 0),
            },
            summary: {
                totalCoupons: totalCouponsResult.count || 0,
                activeCoupons: activeCouponsResult.count || 0,
                expiredCoupons: expiredCouponsResult.count || 0,
                inactiveCoupons: inactiveCouponsResult.count || 0,
                totalUsages: totalUsagesResult.count || 0,
            },
            options: {
                customerTypes: (customerTypesResult.data || []).map((row) => ({ id: row.id, name: row.name })),
                priceTables: (priceTablesResult.data || []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
                categories: (categoriesResult.data || []).map((row) => ({ id: row.id, name: row.name })),
                products: (productsResult.data || []).map((row) => ({ id: row.id, name: row.name, categoryId: row.category_id })),
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const body = (await req.json()) as Record<string, unknown>
        const payload = buildCouponMutationPayload(body)

        const supabase = await createServerClient()
        const { data: createdCouponId, error } = await supabase.rpc('admin_upsert_coupon', {
            p_coupon_id: null,
            p_code: payload.code,
            p_name: payload.name,
            p_description: payload.description,
            p_discount_type: payload.discountType,
            p_discount_value: payload.discountValue,
            p_min_order_amount: payload.minOrderAmount,
            p_max_discount_amount: payload.maxDiscountAmount,
            p_max_uses: payload.maxUses,
            p_max_uses_per_customer: payload.maxUsesPerCustomer,
            p_is_cumulative: payload.isCumulative,
            p_valid_from: payload.validFrom,
            p_valid_until: payload.validUntil,
            p_is_active: payload.isActive,
            p_customer_type_scope_ids: payload.customerTypeScopeIds,
            p_price_table_scope_ids: payload.priceTableScopeIds,
            p_product_scope_ids: payload.productScopeIds,
            p_category_scope_ids: payload.categoryScopeIds,
            p_actor_profile_id: authResult.userId,
        })

        if (error) {
            return NextResponse.json({ error: error.message || 'Falha ao criar cupom.' }, { status: 400 })
        }

        return NextResponse.json({ id: createdCouponId })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        const statusCode = message.toLowerCase().includes('obrigatorio') || message.toLowerCase().includes('invalido')
            ? 400
            : 500
        return NextResponse.json({ error: message }, { status: statusCode })
    }
}
