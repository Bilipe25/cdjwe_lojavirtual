'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'

// ==================== Types ====================

type AccountReceivableRow = {
    invoice_id: string
    invoice_number: string
    invoice_status: string
    issue_date: string
    total_amount: number
    paid_amount: number
    open_amount: number
    installment_count: number
    payment_method_name: string | null
    payment_condition_name: string | null
    invoice_notes: string | null
    invoice_created_at: string
    // Order
    order_id: string
    order_number: string
    order_status: string
    order_total: number
    // Store / Client
    store_id: string
    company_name: string
    cnpj: string | null
    profile_id: string
    client_name: string
    // Installment
    installment_id: string
    installment_number: number
    due_date: string
    installment_amount: number
    installment_paid_amount: number
    installment_status: string
}

export type AccountReceivableItem = AccountReceivableRow & {
    days_overdue: number
}

type GetAccountsReceivableParams = {
    status?: string | null
    search?: string | null
    page?: number
    pageSize?: number
}

type AccountsReceivableSummary = {
    totalOpen: number
    totalOverdue: number
    totalPaid: number
}

type AccountsReceivablePagination = {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
}

// ==================== Server Actions ====================

export async function getAccountsReceivable(params: GetAccountsReceivableParams = {}) {
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

        const page = Math.max(1, Number(params.page || 1))
        const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)))
        const status = params.status || 'all'
        const search = params.search?.trim() || null

        const { data, error } = await supabase.rpc('admin_list_accounts_receivable', {
            p_status: status,
            p_search: search,
            p_page: page,
            p_page_size: pageSize,
        })

        if (error) {
            console.error('[CONTAS A RECEBER] Erro no RPC paginado:', error)
            return { error: 'Erro ao carregar contas a receber.' }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: AccountReceivableItem[] = (data || []).map((row: any) => {
            return {
                invoice_id: row.invoice_id || '',
                invoice_number: row.invoice_number || '',
                invoice_status: row.invoice_status || '',
                issue_date: row.issue_date || '',
                total_amount: Number(row.total_amount || 0),
                paid_amount: Number(row.paid_amount || 0),
                open_amount: Number(row.open_amount || 0),
                installment_count: Number(row.installment_count || 0),
                payment_method_name: row.payment_method_name || null,
                payment_condition_name: row.payment_condition_name || null,
                invoice_notes: row.invoice_notes || null,
                invoice_created_at: row.invoice_created_at || '',
                order_id: row.order_id || '',
                order_number: row.order_number || '',
                order_status: row.order_status || '',
                order_total: Number(row.order_total || 0),
                store_id: row.store_id || '',
                company_name: row.company_name || '',
                cnpj: row.cnpj || null,
                profile_id: row.profile_id || '',
                client_name: row.client_name || '',
                installment_id: row.installment_id || '',
                installment_number: Number(row.installment_number || 0),
                due_date: row.due_date || '',
                installment_amount: Number(row.installment_amount || 0),
                installment_paid_amount: Number(row.installment_paid_amount || 0),
                installment_status: row.installment_status || 'open',
                days_overdue: Number(row.days_overdue || 0),
            }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const firstRow = (data as any[] | null)?.[0] || null

        const totalCount = Number(firstRow?.total_count || 0)
        const summary: AccountsReceivableSummary = {
            totalOpen: Number(firstRow?.summary_total_open || 0),
            totalOverdue: Number(firstRow?.summary_total_overdue || 0),
            totalPaid: Number(firstRow?.summary_total_paid || 0),
        }
        const pagination: AccountsReceivablePagination = {
            page,
            pageSize,
            totalCount,
            totalPages: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1,
        }

        return { data: rows, summary, pagination }
    } catch (e) {
        console.error('[CONTAS A RECEBER] Erro inesperado:', e)
        return { error: 'Erro inesperado ao carregar contas a receber.' }
    }
}

export async function invoiceOrderAction(params: {
    orderId: string
    issueDate: string
    paymentMethodId?: string | null
    paymentMethodName?: string | null
    paymentConditionId?: string | null
    paymentConditionName?: string | null
    installmentCount: number
    installmentDays?: string | null
    notes?: string | null
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

        const { data, error } = await supabase.rpc('admin_invoice_order_atomic', {
            p_order_id: params.orderId,
            p_issue_date: params.issueDate,
            p_payment_method_id: params.paymentMethodId || null,
            p_payment_method_name: params.paymentMethodName || null,
            p_payment_condition_id: params.paymentConditionId || null,
            p_payment_condition_name: params.paymentConditionName || null,
            p_installment_count: params.installmentCount,
            p_installment_days: params.installmentDays || null,
            p_notes: params.notes || null,
        })

        if (error) {
            console.error('[INVOICE ORDER] RPC error:', error)
            return { error: error.message || 'Erro ao gerar fatura.' }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = Array.isArray(data) ? (data as any[])[0] : data
        return { data: result }
    } catch (e) {
        console.error('[INVOICE ORDER] Erro inesperado:', e)
        return { error: 'Erro inesperado ao gerar fatura.' }
    }
}

export async function getClientInvoices() {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Nao autenticado.' }

        const { data, error } = await supabase
            .from('invoices')
            .select(`
                *,
                installments:invoice_installments(*),
                order:orders(id, order_number, status)
            `)
            .eq('profile_id', user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[CLIENT INVOICES] Erro:', error)
            return { error: 'Erro ao carregar faturas.' }
        }

        return { data: data || [] }
    } catch (e) {
        console.error('[CLIENT INVOICES] Erro inesperado:', e)
        return { error: 'Erro inesperado.' }
    }
}

export async function getClientFinancialSummary() {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Nao autenticado.' }

        // Query installments to get real-time overdue info
        const { data: installments, error } = await supabase
            .from('invoice_installments')
            .select(`
                id,
                amount,
                paid_amount,
                status,
                due_date,
                invoice:invoices!inner(
                    id,
                    profile_id,
                    status
                )
            `)
            .eq('invoice.profile_id', user.id)

        if (error) {
            console.error('[CLIENT FIN SUMMARY] Erro:', error)
            return { error: 'Erro ao carregar resumo financeiro.' }
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        let totalOpen = 0
        let totalOverdue = 0
        let totalPaid = 0

        for (const inst of installments || []) {
            const remaining = Number(inst.amount || 0) - Number(inst.paid_amount || 0)
            if (inst.status === 'paid') {
                totalPaid += Number(inst.amount || 0)
            } else if (inst.status === 'overdue') {
                totalOverdue += remaining
            } else if (inst.status === 'open') {
                const dueDate = new Date(inst.due_date + 'T00:00:00')
                if (dueDate < today) {
                    totalOverdue += remaining
                } else {
                    totalOpen += remaining
                }
            }
        }

        return {
            data: {
                totalOpen,
                totalOverdue,
                totalPaid,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                invoiceCount: new Set((installments || []).map((i: any) => {
                    const inv = Array.isArray(i.invoice) ? i.invoice[0] : i.invoice
                    return inv?.id
                }).filter(Boolean)).size,
            }
        }
    } catch (e) {
        console.error('[CLIENT FIN SUMMARY] Erro inesperado:', e)
        return { error: 'Erro inesperado.' }
    }
}

// ==================== Payment Write-off ====================

export async function recordInstallmentPayment(params: {
    installmentId: string
    amount: number
    paidDate?: string | null
    notes?: string | null
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

        const { data, error } = await supabase.rpc('admin_record_installment_payment', {
            p_installment_id: params.installmentId,
            p_amount: params.amount,
            p_paid_date: params.paidDate || new Date().toISOString().split('T')[0],
            p_notes: params.notes || null,
        })

        if (error) {
            console.error('[PAYMENT WRITEOFF] RPC error:', error)
            return { error: error.message || 'Erro ao registrar pagamento.' }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = Array.isArray(data) ? (data as any[])[0] : data
        return { data: result }
    } catch (e) {
        console.error('[PAYMENT WRITEOFF] Erro inesperado:', e)
        return { error: 'Erro inesperado ao registrar pagamento.' }
    }
}

// ==================== Invoice Detail ====================

export async function getInvoiceDetail(invoiceId: string) {
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

        const { data, error } = await supabase
            .from('invoices')
            .select(`
                *,
                installments:invoice_installments(*),
                events:invoice_events(*),
                order:orders(id, order_number, status),
                store:stores(id, company_name, cnpj),
                profile:profiles!invoices_profile_id_fkey(id, full_name, email)
            `)
            .eq('id', invoiceId)
            .single()

        if (error) {
            console.error('[INVOICE DETAIL] Erro:', error)
            return { error: 'Erro ao carregar detalhes da fatura.' }
        }

        return { data }
    } catch (e) {
        console.error('[INVOICE DETAIL] Erro inesperado:', e)
        return { error: 'Erro inesperado.' }
    }
}

// ==================== Customer Financial Data ====================

export async function getCustomerFinancialData(profileId: string) {
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

        const { data: invoices, error } = await supabase
            .from('invoices')
            .select(`
                *,
                installments:invoice_installments(*)
            `)
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[CUSTOMER FINANCIAL] Erro:', error)
            return { error: 'Erro ao carregar dados financeiros.' }
        }

        // Calculate summary
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        let totalOpen = 0
        let totalOverdue = 0
        let totalPaid = 0

        for (const inv of invoices || []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const inst of (inv.installments || []) as any[]) {
                const remaining = Number(inst.amount || 0) - Number(inst.paid_amount || 0)
                if (inst.status === 'paid') {
                    totalPaid += Number(inst.amount || 0)
                } else if (inst.status === 'overdue') {
                    totalOverdue += remaining
                } else if (inst.status === 'open') {
                    const dueDate = new Date(inst.due_date + 'T00:00:00')
                    if (dueDate < today) {
                        totalOverdue += remaining
                    } else {
                        totalOpen += remaining
                    }
                }
            }
        }

        // Get credit limit from store commercial settings (single source of truth)
        const { data: storeData } = await supabase
            .from('stores')
            .select('id')
            .eq('profile_id', profileId)
            .limit(1)
            .maybeSingle()

        let creditLimit = 0
        if (storeData?.id) {
            const { data: commercialData } = await supabase
                .from('store_commercial_settings')
                .select('credit_limit')
                .eq('store_id', storeData.id)
                .limit(1)
                .maybeSingle()

            creditLimit = Number(commercialData?.credit_limit || 0)
        }

        return {
            data: {
                invoices: invoices || [],
                summary: {
                    totalOpen,
                    totalOverdue,
                    totalPaid,
                    creditLimit,
                    invoiceCount: (invoices || []).length,
                }
            }
        }
    } catch (e) {
        console.error('[CUSTOMER FINANCIAL] Erro inesperado:', e)
        return { error: 'Erro inesperado.' }
    }
}

// ==================== Delete Invoice ====================

export async function deleteInvoice(invoiceId: string) {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Não autenticado.' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'admin') return { error: 'Permissão negada.' }

        // Fetch invoice to check if it has payments
        const { data: invoice, error: fetchErr } = await supabase
            .from('invoices')
            .select('paid_amount, invoice_number')
            .eq('id', invoiceId)
            .single()

        if (fetchErr || !invoice) {
            return { error: 'Fatura não encontrada.' }
        }

        if (Number(invoice.paid_amount) > 0) {
            return { error: `A fatura ${invoice.invoice_number} já possui pagamentos baixados. Remova os pagamentos antes de excluir a fatura inteira.` }
        }


        const { count: paymentCount, error: paymentCountErr } = await supabase
            .from('invoice_payments')
            .select('id', { count: 'exact', head: true })
            .eq('invoice_id', invoiceId)

        if (!paymentCountErr && (paymentCount || 0) > 0) {
            return { error: `A fatura ${invoice.invoice_number} possui registros no ledger de pagamentos e não pode ser excluída.` }
        }
        // Delete invoice (cascade handles installments and events)
        const { error: deleteErr } = await supabase
            .from('invoices')
            .delete()
            .eq('id', invoiceId)

        if (deleteErr) {
            console.error('[DELETE INVOICE] Erro:', deleteErr)
            return { error: 'Não foi possível excluir a fatura. Ela pode estar vinculada a outros registros bloqueantes.' }
        }

        return { success: true }
    } catch (e) {
        console.error('[DELETE INVOICE] Erro inesperado:', e)
        return { error: 'Erro inesperado ao excluir fatura.' }
    }
}
