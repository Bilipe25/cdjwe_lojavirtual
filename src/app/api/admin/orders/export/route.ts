import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/marketing/auth'
import type { OrderType } from '@/lib/types'
import { getOrderTypeLabel, normalizeOrderType } from '@/lib/orders/order-type'

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
    order_type?: OrderType | string | null
    created_by_full_name?: string | null
    archived_at?: string | null
    archive_reason?: string | null
}

type AdminOrderExportEnrichmentRow = {
    id: string
    sales_channel: 'customer_portal' | 'representative' | null
    order_type?: OrderType | null
    coupon_code?: string | null
    coupon_discount_type?: 'percentage' | 'fixed' | null
    coupon_discount_value?: number | null
    coupon_discount_amount?: number | null
    customer_profile?: { full_name?: string | null } | null
    created_by_profile?: { full_name?: string | null } | null
    store?: { document_number?: string | null; cnpj?: string | null; company_name?: string | null } | null
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
    const rawArchiveVisibility = searchParams.get('archive_visibility')?.trim() || 'active'
    const archiveVisibility = rawArchiveVisibility === 'all' || rawArchiveVisibility === 'archived'
        ? rawArchiveVisibility
        : 'active'
    const rawOrderType = searchParams.get('order_type')?.trim().toUpperCase() || null
    const orderType = rawOrderType === 'PRE_VENDA' || rawOrderType === 'PRONTA_ENTREGA'
        ? rawOrderType
        : null

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

    if (rawOrderType && !orderType) {
        return NextResponse.json({ error: 'Tipo de pedido invalido.' }, { status: 400 })
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
            p_archive_visibility: archiveVisibility,
            p_order_type: orderType,
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
        orderType: OrderType
        customerName: string
        representativeName: string
        itemCount: number
        couponCode: string
        couponDiscountType: 'percentage' | 'fixed' | null
        couponDiscountValue: number
        couponDiscountAmount: number
        primaryDocument: string
        companyName: string
    }>()

    const orderIds = rows.map((row) => row.id)
    if (orderIds.length > 0) {
        const { data: enrichmentData } = await supabase
            .from('orders')
            .select(`
                id,
                sales_channel,
                order_type,
                coupon_code,
                coupon_discount_type,
                coupon_discount_value,
                coupon_discount_amount,
                customer_profile:profiles!orders_profile_id_fkey(full_name),
                created_by_profile:profiles!orders_created_by_profile_id_fkey(full_name),
                store:stores(document_number, cnpj, company_name),
                items:order_items(count)
            `)
            .in('id', orderIds)

        ;((enrichmentData || []) as AdminOrderExportEnrichmentRow[]).forEach((row) => {
            enrichmentById.set(row.id, {
                salesChannel: row.sales_channel || null,
                orderType: normalizeOrderType(row.order_type),
                customerName: row.customer_profile?.full_name || '',
                representativeName: row.created_by_profile?.full_name || '',
                itemCount: Number(row.items?.[0]?.count || 0),
                couponCode: row.coupon_code || '',
                couponDiscountType: row.coupon_discount_type || null,
                couponDiscountValue: Number(row.coupon_discount_value || 0),
                couponDiscountAmount: Number(row.coupon_discount_amount || 0),
                primaryDocument: row.store?.document_number || row.store?.cnpj || '',
                companyName: row.store?.company_name || '',
            })
        })
    }

    const header = [
        'ID',
        'Pedido',
        'Canal',
        'Tipo de pedido',
        'Representante',
        'Cliente',
        'Documento/Empresa',
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
        'Arquivado em',
        'Motivo arquivamento',
    ]

    const lines = rows.map((row) => {
        const enrichment = enrichmentById.get(row.id)
        const channel = (row.sales_channel || enrichment?.salesChannel || 'customer_portal') === 'representative'
            ? 'Representante'
            : 'Cliente'
        const orderTypeLabel = getOrderTypeLabel(row.order_type || enrichment?.orderType)
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
        const primaryDocument = enrichment?.primaryDocument || row.store_cnpj || ''
        const companyName = enrichment?.companyName || row.store_company_name || ''
        const companyInfo = `${primaryDocument} - ${companyName}`.trim()
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
            escapeCsvValue(orderTypeLabel),
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
            escapeCsvValue(row.archived_at ? formatDate(row.archived_at) : ''),
            escapeCsvValue(row.archive_reason || ''),
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

