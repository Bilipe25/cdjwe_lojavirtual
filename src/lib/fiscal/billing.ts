import 'server-only'

export interface FiscalInvoiceInstallmentSnapshot {
  id: string
  installment_number: number
  due_date: string
  amount: number
  paid_amount?: number | null
  status?: string | null
}

export interface FiscalInvoiceSnapshot {
  id: string
  invoice_number: string
  status: string
  issue_date: string
  total_amount: number
  installment_count: number
  payment_method_name?: string | null
  payment_condition_name?: string | null
  created_at?: string | null
  installments?: FiscalInvoiceInstallmentSnapshot[] | null
}

export interface ResolvedBillingDuplicate {
  numero: string
  vencimento: string
  vencimentoIso: string | null
  valor: number
}

export interface ResolvedBillingData {
  invoiceId: string | null
  invoiceNumber: string | null
  issueDate: string | null
  paymentMethodName: string | null
  paymentConditionName: string | null
  installmentCount: number | null
  valorOriginal: number
  valorDesconto: number
  valorLiquido: number
  duplicatas: ResolvedBillingDuplicate[]
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100
}

function normalizeDateBr(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}

export function buildPaymentSummary(paymentMethodName: string | null | undefined, installments: number | null | undefined) {
  const parts = [
    (paymentMethodName || '').trim() || null,
    installments && installments > 1 ? `${installments} parcelas` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' - ') : null
}

export function resolveBillingFromInvoices(params: {
  invoices?: FiscalInvoiceSnapshot[] | null
  paymentMethodName?: string | null
  paymentInstallments?: number | null
  documentNetValue: number
  documentDiscountValue?: number
}): ResolvedBillingData | null {
  const eligibleInvoice = (params.invoices || [])
    .filter((invoice) => invoice && !['cancelled', 'renegotiated'].includes(String(invoice.status || '').toLowerCase()))
    .sort((left, right) => {
      const leftDate = new Date(left.created_at || left.issue_date || 0).getTime()
      const rightDate = new Date(right.created_at || right.issue_date || 0).getTime()
      return rightDate - leftDate
    })[0]

  const valorDesconto = roundMoney(params.documentDiscountValue || 0)
  const valorLiquido = roundMoney(params.documentNetValue)
  const valorOriginal = roundMoney(valorLiquido + valorDesconto)

  if (!eligibleInvoice) {
    return {
      invoiceId: null,
      invoiceNumber: null,
      issueDate: null,
      paymentMethodName: params.paymentMethodName || null,
      paymentConditionName: null,
      installmentCount: params.paymentInstallments || null,
      valorOriginal,
      valorDesconto,
      valorLiquido,
      duplicatas: [],
    }
  }

  const duplicates = (eligibleInvoice.installments || [])
    .slice()
    .sort((left, right) => left.installment_number - right.installment_number)
    .map((installment) => ({
      numero: String(installment.installment_number).padStart(3, '0'),
      vencimento: normalizeDateBr(installment.due_date),
      vencimentoIso: installment.due_date || null,
      valor: roundMoney(installment.amount),
    }))

  return {
    invoiceId: eligibleInvoice.id,
    invoiceNumber: eligibleInvoice.invoice_number,
    issueDate: eligibleInvoice.issue_date,
    paymentMethodName: eligibleInvoice.payment_method_name || params.paymentMethodName || null,
    paymentConditionName: eligibleInvoice.payment_condition_name || null,
    installmentCount: eligibleInvoice.installment_count || params.paymentInstallments || duplicates.length || null,
    valorOriginal,
    valorDesconto,
    valorLiquido,
    duplicatas: duplicates.length > 1 ? duplicates : [],
  }
}
