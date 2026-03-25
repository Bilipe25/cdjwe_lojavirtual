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

export async function getFinancialReport(params: {
    periodStart?: string | null
    periodEnd?: string | null
}) {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Nao autenticado.' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin') return { error: 'Permissao negada.' }

        // Fetch all installments with invoice/store/profile data
        const { data: installments, error } = await supabase
            .from('invoice_installments')
            .select(`
                id,
                installment_number,
                due_date,
                amount,
                paid_amount,
                status,
                paid_at,
                invoice:invoices!inner(
                    id,
                    invoice_number,
                    profile_id,
                    store_id,
                    total_amount,
                    status,
                    store:stores!inner(company_name),
                    profile:profiles!invoices_profile_id_fkey(full_name)
                )
            `)
            .order('due_date', { ascending: true })

        if (error) {
            console.error('[FINANCIAL REPORT] Erro:', error)
            return { error: 'Erro ao gerar relatorio.' }
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Parse period filters
        const periodStart = params.periodStart ? new Date(params.periodStart + 'T00:00:00') : null
        const periodEnd = params.periodEnd ? new Date(params.periodEnd + 'T23:59:59') : null

        // KPIs
        let totalReceivable = 0
        let totalOverdue = 0
        let totalReceivedInPeriod = 0
        let totalIssued = 0

        // Aging buckets
        const agingBuckets = { '0-30': { total: 0, count: 0 }, '31-60': { total: 0, count: 0 }, '61-90': { total: 0, count: 0 }, '90+': { total: 0, count: 0 } }

        // Debtors map
        const debtorsMap = new Map<string, { profileId: string; clientName: string; companyName: string; totalOpen: number; totalOverdue: number }>()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const inst of (installments || []) as any[]) {
            const inv = Array.isArray(inst.invoice) ? inst.invoice[0] : inst.invoice
            const remaining = Number(inst.amount || 0) - Number(inst.paid_amount || 0)
            const dueDate = new Date(inst.due_date + 'T00:00:00')
            const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

            // Total issued (for default rate)
            totalIssued += Number(inst.amount || 0)

            if (inst.status === 'paid') {
                // Check if paid in the period
                if (inst.paid_at) {
                    const paidDate = new Date(inst.paid_at)
                    if ((!periodStart || paidDate >= periodStart) && (!periodEnd || paidDate <= periodEnd)) {
                        totalReceivedInPeriod += Number(inst.paid_amount || 0)
                    }
                }
            } else if (inst.status === 'open') {
                totalReceivable += remaining

                if (diffDays > 0) {
                    // Overdue
                    totalOverdue += remaining

                    // Aging
                    if (diffDays <= 30) agingBuckets['0-30'].total += remaining, agingBuckets['0-30'].count++
                    else if (diffDays <= 60) agingBuckets['31-60'].total += remaining, agingBuckets['31-60'].count++
                    else if (diffDays <= 90) agingBuckets['61-90'].total += remaining, agingBuckets['61-90'].count++
                    else agingBuckets['90+'].total += remaining, agingBuckets['90+'].count++
                }

                // Debtor tracking
                const profileId = inv?.profile_id || ''
                if (profileId) {
                    const existing = debtorsMap.get(profileId) || {
                        profileId,
                        clientName: inv?.profile?.full_name || '',
                        companyName: inv?.store?.company_name || '',
                        totalOpen: 0,
                        totalOverdue: 0,
                    }
                    existing.totalOpen += remaining
                    if (diffDays > 0) existing.totalOverdue += remaining
                    debtorsMap.set(profileId, existing)
                }
            }
        }

        const defaultRate = totalIssued > 0 ? (totalOverdue / totalIssued) * 100 : 0

        // Sort top debtors by totalOpen descending
        const topDebtors = Array.from(debtorsMap.values())
            .sort((a, b) => b.totalOpen - a.totalOpen)
            .slice(0, 10)

        const aging = [
            { range: '0-30 dias', ...agingBuckets['0-30'] },
            { range: '31-60 dias', ...agingBuckets['31-60'] },
            { range: '61-90 dias', ...agingBuckets['61-90'] },
            { range: '90+ dias', ...agingBuckets['90+'] },
        ]

        return {
            data: {
                kpis: {
                    totalReceivable,
                    totalOverdue,
                    totalReceivedInPeriod,
                    defaultRate,
                },
                topDebtors,
                aging,
            } satisfies FinancialReportData
        }
    } catch (e) {
        console.error('[FINANCIAL REPORT] Erro inesperado:', e)
        return { error: 'Erro inesperado ao gerar relatorio.' }
    }
}
