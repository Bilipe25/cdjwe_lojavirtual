'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'

export type FinancialReportData = {
    kpis: {
        totalReceivable: number
        totalOverdue: number
        totalReceivedInPeriod: number
        defaultRate: number
    }
    topDebtors: {
        profileId: string
        clientName: string
        companyName: string
        totalOpen: number
        totalOverdue: number
    }[]
    aging: {
        range: string
        total: number
        count: number
    }[]
}

type FinancialReportRpcResponse = {
    kpis?: {
        totalReceivable?: number | string
        totalOverdue?: number | string
        totalReceivedInPeriod?: number | string
        defaultRate?: number | string
    }
    topDebtors?: Array<{
        profileId?: string
        clientName?: string
        companyName?: string
        totalOpen?: number | string
        totalOverdue?: number | string
    }>
    aging?: Array<{
        range?: string
        total?: number | string
        count?: number | string
    }>
}

export async function getFinancialReport(params: {
    periodStart?: string | null
    periodEnd?: string | null
}) {
    try {
        const supabase = await createServerClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { error: 'Nao autenticado.' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin') return { error: 'Permissao negada.' }

        const referenceDate = new Date().toISOString().split('T')[0]

        const { data, error } = await supabase.rpc('admin_get_financial_report', {
            p_period_start: params.periodStart || null,
            p_period_end: params.periodEnd || null,
            p_reference_date: referenceDate,
        })

        if (error) {
            console.error('[FINANCIAL REPORT] RPC error:', error)
            return { error: error.message || 'Erro ao gerar relatorio.' }
        }

        const payload = (data || {}) as FinancialReportRpcResponse

        const normalized: FinancialReportData = {
            kpis: {
                totalReceivable: Number(payload.kpis?.totalReceivable || 0),
                totalOverdue: Number(payload.kpis?.totalOverdue || 0),
                totalReceivedInPeriod: Number(payload.kpis?.totalReceivedInPeriod || 0),
                defaultRate: Number(payload.kpis?.defaultRate || 0),
            },
            topDebtors: Array.isArray(payload.topDebtors)
                ? payload.topDebtors.map((debtor) => ({
                      profileId: debtor.profileId || '',
                      clientName: debtor.clientName || '',
                      companyName: debtor.companyName || '',
                      totalOpen: Number(debtor.totalOpen || 0),
                      totalOverdue: Number(debtor.totalOverdue || 0),
                  }))
                : [],
            aging: Array.isArray(payload.aging)
                ? payload.aging.map((bucket) => ({
                      range: bucket.range || '',
                      total: Number(bucket.total || 0),
                      count: Number(bucket.count || 0),
                  }))
                : [],
        }

        return { data: normalized }
    } catch (e) {
        console.error('[FINANCIAL REPORT] Erro inesperado:', e)
        return { error: 'Erro inesperado ao gerar relatorio.' }
    }
}
