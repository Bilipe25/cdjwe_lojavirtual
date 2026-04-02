import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireAdminSession } from '@/lib/marketing/auth'

type UsageStatusFilter = 'all' | 'reserved' | 'released'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

function normalizeStatusFilter(value: string | null): UsageStatusFilter {
    if (value === 'reserved' || value === 'released') return value
    return 'all'
}

type CouponUsageRow = {
    id: string
    order_id: string | null
    profile_id: string
    store_id: string
    coupon_code_snapshot: string
    coupon_discount_type_snapshot: 'percentage' | 'fixed'
    coupon_discount_value_snapshot: number
    discount_amount: number
    status: 'reserved' | 'released'
    released_at: string | null
    release_reason: string | null
    created_at: string
    order?: { order_number?: string | null; status?: string | null; total?: number | null } | null
    profile?: { full_name?: string | null; email?: string | null } | null
    store?: { company_name?: string | null } | null
}

export async function GET(
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

        const searchParams = req.nextUrl.searchParams
        const page = parsePositiveInt(searchParams.get('page'), 1)
        const pageSize = Math.min(parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
        const status = normalizeStatusFilter(searchParams.get('status'))

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const supabase = createServiceRoleClient()

        const { data: coupon, error: couponError } = await supabase
            .from('discount_coupons')
            .select('id, code, name, discount_type, discount_value, is_active, valid_from, valid_until')
            .eq('id', id)
            .maybeSingle()

        if (couponError) {
            return NextResponse.json({ error: couponError.message || 'Falha ao carregar cupom.' }, { status: 500 })
        }

        if (!coupon) {
            return NextResponse.json({ error: 'Cupom nao encontrado.' }, { status: 404 })
        }

        let entriesQuery = supabase
            .from('coupon_usages')
            .select(
                `
                id,
                order_id,
                profile_id,
                store_id,
                coupon_code_snapshot,
                coupon_discount_type_snapshot,
                coupon_discount_value_snapshot,
                discount_amount,
                status,
                released_at,
                release_reason,
                created_at,
                order:orders(order_number, status, total),
                profile:profiles(full_name, email),
                store:stores(company_name)
            `,
                { count: 'exact' }
            )
            .eq('coupon_id', id)
            .order('created_at', { ascending: false })
            .range(from, to)

        if (status !== 'all') {
            entriesQuery = entriesQuery.eq('status', status)
        }

        const { data: entries, count, error: entriesError } = await entriesQuery
        if (entriesError) {
            return NextResponse.json({ error: entriesError.message || 'Falha ao carregar historico.' }, { status: 500 })
        }

        const [totalResult, reservedResult, releasedResult, aggregateRowsResult] = await Promise.all([
            supabase
                .from('coupon_usages')
                .select('id', { count: 'exact', head: true })
                .eq('coupon_id', id),
            supabase
                .from('coupon_usages')
                .select('id', { count: 'exact', head: true })
                .eq('coupon_id', id)
                .eq('status', 'reserved'),
            supabase
                .from('coupon_usages')
                .select('id', { count: 'exact', head: true })
                .eq('coupon_id', id)
                .eq('status', 'released'),
            supabase
                .from('coupon_usages')
                .select('discount_amount, profile_id')
                .eq('coupon_id', id),
        ])

        const aggregateRows = aggregateRowsResult.data || []
        const totalDiscountGranted = aggregateRows.reduce((sum, row) => sum + Number(row.discount_amount || 0), 0)
        const uniqueCustomers = new Set(aggregateRows.map((row) => row.profile_id)).size

        return NextResponse.json({
            coupon: {
                id: coupon.id,
                code: coupon.code,
                name: coupon.name || coupon.code,
                discountType: coupon.discount_type,
                discountValue: Number(coupon.discount_value || 0),
                isActive: coupon.is_active,
                validFrom: coupon.valid_from,
                validUntil: coupon.valid_until,
            },
            summary: {
                totalUsages: totalResult.count || 0,
                reservedUsages: reservedResult.count || 0,
                releasedUsages: releasedResult.count || 0,
                uniqueCustomers,
                totalDiscountGranted,
            },
            data: ((entries || []) as CouponUsageRow[]).map((entry) => ({
                id: entry.id,
                orderId: entry.order_id,
                profileId: entry.profile_id,
                storeId: entry.store_id,
                couponCode: entry.coupon_code_snapshot,
                couponDiscountType: entry.coupon_discount_type_snapshot,
                couponDiscountValue: Number(entry.coupon_discount_value_snapshot || 0),
                discountAmount: Number(entry.discount_amount || 0),
                status: entry.status,
                releasedAt: entry.released_at,
                releaseReason: entry.release_reason,
                createdAt: entry.created_at,
                order: {
                    orderNumber: entry.order?.order_number || null,
                    status: entry.order?.status || null,
                    total: entry.order?.total === undefined || entry.order?.total === null ? null : Number(entry.order.total),
                },
                customer: {
                    name: entry.profile?.full_name || null,
                    email: entry.profile?.email || null,
                },
                store: {
                    companyName: entry.store?.company_name || null,
                },
            })),
            pagination: {
                page,
                pageSize,
                total: count || 0,
                hasMore: from + (entries?.length || 0) < (count || 0),
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
