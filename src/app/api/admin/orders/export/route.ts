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

    const header = ['ID', 'Pedido', 'Cliente', 'CNPJ/Empresa', 'Status', 'Total', 'Data']
    const lines = rows.map((row) => {
        const statusLabel = statusLabelMap[row.status] || row.status
        const total = Number(row.total || 0).toFixed(2).replace('.', ',')
        const companyInfo = `${row.store_cnpj || ''} - ${row.store_company_name || ''}`.trim()

        return [
            escapeCsvValue(row.id),
            escapeCsvValue(row.order_number),
            escapeCsvValue(row.profile_full_name || ''),
            escapeCsvValue(companyInfo),
            escapeCsvValue(statusLabel),
            escapeCsvValue(total),
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

