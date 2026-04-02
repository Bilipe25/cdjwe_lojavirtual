import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/marketing/auth'

const PAGE_SIZE = 100

type AdminOrdersSearchRpcRow = {
    id: string
    order_number: string
    status: string
    total: number
    subtotal: number
    discount_amount: number
    created_at: string
    notes: string | null
    store_company_name: string | null
    store_cnpj: string | null
    profile_full_name: string | null
    payment_condition_name: string | null
    item_count: number | null
    total_count: number | null
    sales_channel?: string | null
    created_by_full_name?: string | null
}

type AdminOrderExportEnrichmentRow = {
    id: string
    sales_channel: 'customer_portal' | 'representative' | null
    coupon_code?: string | null
    coupon_discount_type?: 'percentage' | 'fixed' | null
    coupon_discount_value?: number | null
    coupon_discount_amount?: number | null
    customer_profile?: { full_name?: string | null } | null
    created_by_profile?: { full_name?: string | null } | null
    items?: Array<{ count?: number | null }>
}

const statusLabelMap: Record<string, string> = {
    pending: 'Em analise',
    approved: 'Aprovado',
    in_production: 'Em producao',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
}

function escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    const text = String(value)
    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`
    }
    return text
}

function formatDate(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
}

function formatMoney(value: number): string {
    return Number(value || 0).toFixed(2).replace('.', ',')
}

export async function GET(request: Request) {
    const authResult = await requireAdminSession()
    if (!authResult.ok) return authResult.response

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('q')?.trim() || null
    const rawStatus = searchParams.get('status')?.trim() || null
    const status = rawStatus === 'all' ? null : rawStatus

    const allowedStatus = new Set([
        'pending',
        'approved',
        'in_production',
        'shipped',
        'delivered',
        'cancelled',
    ])

    if (status && !allowedStatus.has(status)) {
        return NextResponse.json({ error: 'Status invalido.' }, { status: 400 })
    }

    const rows: AdminOrdersSearchRpcRow[] = []
    let page = 1
    let expectedTotal = Number.MAX_SAFE_INTEGER

    while (rows.length < expectedTotal) {
        const { data, error } = await supabase.rpc('admin_search_orders_paginated', {
            p_search: search,
            p_status: status,
            p_page: page,
            p_page_size: PAGE_SIZE,
        })

        if (error) {
            return NextResponse.json({ error: error.message || 'Falha ao exportar pedidos.' }, { status: 500 })
        }

        const pageRows = (data || []) as AdminOrdersSearchRpcRow[]
        if (pageRows.length === 0) break

        rows.push(...pageRows)

        const pageTotal = Number(pageRows[0]?.total_count || 0)
        expectedTotal = Number.isFinite(pageTotal) ? pageTotal : expectedTotal
        page += 1
    }

    const enrichmentById = new Map<string, {
        salesChannel: 'customer_portal' | 'representative' | null
        customerName: string
        representativeName: string
        itemCount: number
        couponCode: string
        couponDiscountType: 'percentage' | 'fixed' | null
        couponDiscountValue: number
        couponDiscountAmount: number
    }>()

    const orderIds = rows.map((row) => row.id)
    if (orderIds.length > 0) {
        const { data: enrichmentData } = await supabase
            .from('orders')
            .select(`
                id,
                sales_channel,
                coupon_code,
                coupon_discount_type,
                coupon_discount_value,
                coupon_discount_amount,
                customer_profile:profiles!orders_profile_id_fkey(full_name),
                created_by_profile:profiles!orders_created_by_profile_id_fkey(full_name),
                items:order_items(count)
            `)
            .in('id', orderIds)

        ;((enrichmentData || []) as AdminOrderExportEnrichmentRow[]).forEach((row) => {
            enrichmentById.set(row.id, {
                salesChannel: row.sales_channel || null,
                customerName: row.customer_profile?.full_name || '',
                representativeName: row.created_by_profile?.full_name || '',
                itemCount: Number(row.items?.[0]?.count || 0),
                couponCode: row.coupon_code || '',
                couponDiscountType: row.coupon_discount_type || null,
                couponDiscountValue: Number(row.coupon_discount_value || 0),
                couponDiscountAmount: Number(row.coupon_discount_amount || 0),
            })
        })
    }

    const header = [
        'ID',
        'Pedido',
        'Canal',
        'Representante',
        'Cliente',
        'CNPJ/Empresa',
        'Itens',
        'Status',
        'Total',
        'Cupom',
        'Tipo cupom',
        'Valor cupom',
        'Desconto cupom',
        'Desconto pagamento',
        'Desconto total',
        'Data',
    ]

    const lines = rows.map((row) => {
        const enrichment = enrichmentById.get(row.id)
        const channel = (row.sales_channel || enrichment?.salesChannel || 'customer_portal') === 'representative'
            ? 'Representante'
            : 'Cliente'
        const representativeName = row.created_by_full_name
            || enrichment?.representativeName
            || (channel === 'Representante' ? 'Nao informado' : 'Portal do cliente')
        const customerName = row.profile_full_name || enrichment?.customerName || ''
        const itemCount = enrichment ? enrichment.itemCount : Number(row.item_count || 0)
        const statusLabel = statusLabelMap[row.status] || row.status
        const total = formatMoney(Number(row.total || 0))
        const couponCode = enrichment?.couponCode || ''
        const couponDiscountType = enrichment?.couponDiscountType || ''
        const couponDiscountValue = enrichment?.couponDiscountValue || 0
        const couponDiscountAmount = enrichment?.couponDiscountAmount || 0
        const totalDiscountAmount = Number(row.discount_amount || 0)
        const paymentDiscountAmount = Math.max(0, totalDiscountAmount - couponDiscountAmount)
        const companyInfo = `${row.store_cnpj || ''} - ${row.store_company_name || ''}`.trim()
        const couponConfiguredValue =
            couponDiscountType === 'percentage'
                ? `${couponDiscountValue.toFixed(2).replace('.', ',')}%`
                : couponDiscountType === 'fixed'
                    ? formatMoney(couponDiscountValue)
                    : ''

        return [
            escapeCsvValue(row.id),
            escapeCsvValue(row.order_number),
            escapeCsvValue(channel),
            escapeCsvValue(representativeName),
            escapeCsvValue(customerName),
            escapeCsvValue(companyInfo),
            escapeCsvValue(itemCount),
            escapeCsvValue(statusLabel),
            escapeCsvValue(total),
            escapeCsvValue(couponCode),
            escapeCsvValue(couponDiscountType),
            escapeCsvValue(couponConfiguredValue),
            escapeCsvValue(formatMoney(couponDiscountAmount)),
            escapeCsvValue(formatMoney(paymentDiscountAmount)),
            escapeCsvValue(formatMoney(totalDiscountAmount)),
            escapeCsvValue(formatDate(row.created_at)),
        ].join(',')
    })

    const csv = '\uFEFF' + [header.join(','), ...lines].join('\n')
    const fileDate = new Date().toISOString().slice(0, 10)
    const fileName = `relatorio_pedidos_${fileDate}.csv`

    return new Response(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename=\"${fileName}\"`,
            'Cache-Control': 'no-store',
        },
    })
}
