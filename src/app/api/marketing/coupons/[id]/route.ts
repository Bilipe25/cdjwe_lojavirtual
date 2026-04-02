import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireAdminSession } from '@/lib/marketing/auth'

type CouponScopeRelation = { customer_type_id?: string | null; price_table_id?: string | null; product_id?: string | null; category_id?: string | null }

type CouponRow = {
    id: string
    code: string
    name: string | null
    description: string | null
    discount_type: 'percentage' | 'fixed'
    discount_value: number
    min_order_amount: number | null
    max_discount_amount: number | null
    max_uses: number | null
    max_uses_per_customer: number | null
    is_cumulative: boolean
    is_active: boolean
    valid_from: string
    valid_until: string | null
    customer_type_scopes?: CouponScopeRelation[] | null
    price_table_scopes?: CouponScopeRelation[] | null
    product_scopes?: CouponScopeRelation[] | null
    category_scopes?: CouponScopeRelation[] | null
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeCouponCode(value: string) {
    return value.trim().toUpperCase()
}

function parseBooleanValue(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    return fallback
}

function parseNumberValue(value: unknown, fallback: number | null, fieldName: string) {
    if (value === undefined || value === null || value === '') return fallback
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) {
        throw new Error(`Valor invalido para ${fieldName}.`)
    }
    return parsed
}

function parseIntegerValue(value: unknown, fallback: number | null, fieldName: string) {
    if (value === undefined || value === null || value === '') return fallback
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(parsed)) {
        throw new Error(`Valor inteiro invalido para ${fieldName}.`)
    }
    return parsed
}

function parseDateValue(value: unknown, fallback: string | null, fieldName: string) {
    if (value === undefined || value === null || value === '') return fallback
    const date = new Date(String(value))
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Data invalida para ${fieldName}.`)
    }
    return date.toISOString()
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

function parseScopeIds(value: unknown, fallback: string[], fieldName: string): string[] {
    if (value === undefined) return fallback
    if (value === null) return []

    if (!Array.isArray(value)) {
        throw new Error(`Campo ${fieldName} deve ser uma lista.`)
    }

    const ids = value.map((entry) => String(entry).trim()).filter(Boolean)
    for (const id of ids) {
        if (!UUID_REGEX.test(id)) {
            throw new Error(`ID invalido encontrado em ${fieldName}.`)
        }
    }
    return Array.from(new Set(ids))
}

function buildMergedPayload(input: Record<string, unknown>, fallback: CouponRow) {
    const code = normalizeCouponCode(String(input.code ?? fallback.code ?? ''))
    const name = String(input.name ?? fallback.name ?? '').trim()
    const descriptionRaw = input.description ?? fallback.description ?? null
    const description = descriptionRaw === null ? null : String(descriptionRaw).trim() || null

    const discountTypeRaw = String(input.discountType ?? input.discount_type ?? fallback.discount_type ?? '').trim().toLowerCase()
    if (discountTypeRaw !== 'percentage' && discountTypeRaw !== 'fixed') {
        throw new Error('Tipo de desconto invalido. Use percentage ou fixed.')
    }

    const discountValue = parseNumberValue(
        input.discountValue ?? input.discount_value,
        Number(fallback.discount_value || 0),
        'discountValue'
    ) as number

    const minOrderAmount = parseNumberValue(
        input.minOrderAmount ?? input.min_order_amount,
        fallback.min_order_amount,
        'minOrderAmount'
    )

    const maxDiscountAmount = parseNumberValue(
        input.maxDiscountAmount ?? input.max_discount_amount,
        fallback.max_discount_amount,
        'maxDiscountAmount'
    )

    const maxUses = parseIntegerValue(
        input.maxUses ?? input.max_uses,
        fallback.max_uses,
        'maxUses'
    )

    const maxUsesPerCustomer = parseIntegerValue(
        input.maxUsesPerCustomer ?? input.max_uses_per_customer,
        fallback.max_uses_per_customer,
        'maxUsesPerCustomer'
    )

    const isCumulative = parseBooleanValue(input.isCumulative ?? input.is_cumulative, fallback.is_cumulative)
    const isActive = parseBooleanValue(input.isActive ?? input.is_active, fallback.is_active)

    const validFrom = parseDateValue(input.validFrom ?? input.valid_from, fallback.valid_from, 'validFrom')
    const validUntil = parseDateValue(input.validUntil ?? input.valid_until, fallback.valid_until, 'validUntil')

    const customerTypeScopeIds = parseScopeIds(
        input.customerTypeScopeIds ?? input.customer_type_scope_ids,
        extractScopeIds(fallback.customer_type_scopes, 'customer_type_id'),
        'customerTypeScopeIds'
    )

    const priceTableScopeIds = parseScopeIds(
        input.priceTableScopeIds ?? input.price_table_scope_ids,
        extractScopeIds(fallback.price_table_scopes, 'price_table_id'),
        'priceTableScopeIds'
    )

    const productScopeIds = parseScopeIds(
        input.productScopeIds ?? input.product_scope_ids,
        extractScopeIds(fallback.product_scopes, 'product_id'),
        'productScopeIds'
    )

    const categoryScopeIds = parseScopeIds(
        input.categoryScopeIds ?? input.category_scope_ids,
        extractScopeIds(fallback.category_scopes, 'category_id'),
        'categoryScopeIds'
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

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const { id } = await context.params
        if (!UUID_REGEX.test(id)) {
            return NextResponse.json({ error: 'ID de cupom invalido.' }, { status: 400 })
        }

        const supabaseService = createServiceRoleClient()
        const { data: existingCoupon, error: existingError } = await supabaseService
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
                max_uses_per_customer,
                is_cumulative,
                is_active,
                valid_from,
                valid_until,
                customer_type_scopes:coupon_customer_type_scopes(customer_type_id),
                price_table_scopes:coupon_price_table_scopes(price_table_id),
                product_scopes:coupon_product_scopes(product_id),
                category_scopes:coupon_category_scopes(category_id)
            `
            )
            .eq('id', id)
            .maybeSingle()

        if (existingError) {
            return NextResponse.json({ error: existingError.message || 'Falha ao carregar cupom.' }, { status: 500 })
        }

        if (!existingCoupon) {
            return NextResponse.json({ error: 'Cupom nao encontrado.' }, { status: 404 })
        }

        const body = (await req.json()) as Record<string, unknown>
        const payload = buildMergedPayload(body, existingCoupon as CouponRow)

        const supabase = await createServerClient()
        const { data: updatedCouponId, error: updateError } = await supabase.rpc('admin_upsert_coupon', {
            p_coupon_id: id,
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

        if (updateError) {
            return NextResponse.json({ error: updateError.message || 'Falha ao atualizar cupom.' }, { status: 400 })
        }

        return NextResponse.json({ id: updatedCouponId || id })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        const statusCode = message.toLowerCase().includes('invalido') || message.toLowerCase().includes('obrigatorio')
            ? 400
            : 500
        return NextResponse.json({ error: message }, { status: statusCode })
    }
}
