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

        let query = supabase
            .from('invoice_installments')
            .select(`
                id,
                installment_number,
                due_date,
                amount,
                paid_amount,
                status,
                invoice:invoices!inner(
                    id,
                    invoice_number,
                    status,
                    issue_date,
                    total_amount,
                    paid_amount,
                    open_amount,
                    installment_count,
                    payment_method_name,
                    payment_condition_name,
                    notes,
                    created_at,
                    order_id,
                    store_id,
                    profile_id,
                    order:orders!inner(
                        id,
                        order_number,
                        status,
                        total
                    ),
                    store:stores!inner(
                        id,
                        company_name,
                        cnpj
                    ),
                    profile:profiles!invoices_profile_id_fkey(
                        full_name
                    )
                )
            `)
            .order('due_date', { ascending: true })

        // Filter by installment status
        if (params.status && params.status !== 'all') {
            query = query.eq('status', params.status)
        }

        const { data, error } = await query.limit(500)

        if (error) {
            console.error('[CONTAS A RECEBER] Erro ao consultar:', error)
            return { error: 'Erro ao carregar contas a receber.' }
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: AccountReceivableItem[] = (data || []).map((row: any) => {
            const inv = row.invoice
            const order = inv?.order
            const store = inv?.store
            const profileData = inv?.profile

            const dueDate = new Date(row.due_date + 'T00:00:00')
            const diffMs = today.getTime() - dueDate.getTime()
            const daysOverdue = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0

            return {
                invoice_id: inv?.id || '',
                invoice_number: inv?.invoice_number || '',
                invoice_status: inv?.status || '',
                issue_date: inv?.issue_date || '',
                total_amount: Number(inv?.total_amount || 0),
                paid_amount: Number(inv?.paid_amount || 0),
                open_amount: Number(inv?.open_amount || 0),
                installment_count: Number(inv?.installment_count || 0),
                payment_method_name: inv?.payment_method_name || null,
                payment_condition_name: inv?.payment_condition_name || null,
                invoice_notes: inv?.notes || null,
                invoice_created_at: inv?.created_at || '',
                order_id: order?.id || '',
                order_number: order?.order_number || '',
                order_status: order?.status || '',
                order_total: Number(order?.total || 0),
                store_id: store?.id || '',
                company_name: store?.company_name || '',
                cnpj: store?.cnpj || null,
                profile_id: inv?.profile_id || '',
                client_name: profileData?.full_name || '',
                installment_id: row.id,
                installment_number: Number(row.installment_number),
                due_date: row.due_date,
                installment_amount: Number(row.amount || 0),
                installment_paid_amount: Number(row.paid_amount || 0),
                installment_status: row.status,
                days_overdue: daysOverdue,
            }
        })

        // Client-side search filter (client name, company, order number, invoice number)
        let filtered = rows
        if (params.search && params.search.trim()) {
            const term = params.search.trim().toLowerCase()
            filtered = rows.filter((r) =>
                r.client_name.toLowerCase().includes(term) ||
                r.company_name.toLowerCase().includes(term) ||
                r.order_number.toLowerCase().includes(term) ||
                r.invoice_number.toLowerCase().includes(term)
            )
        }

        return { data: filtered }
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

        // Get credit limit from store
        const { data: storeData } = await supabase
            .from('stores')
            .select('credit_limit')
            .eq('profile_id', profileId)
            .limit(1)
            .single()

        return {
            data: {
                invoices: invoices || [],
                summary: {
                    totalOpen,
                    totalOverdue,
                    totalPaid,
                    creditLimit: Number(storeData?.credit_limit || 0),
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
