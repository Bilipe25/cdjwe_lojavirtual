'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Receipt,
    Wallet,
    Banknote,
    Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { formatDateBR, daysOverdue } from '@/lib/financial/installment-calculator'
import { getCustomerFinancialData, deleteInvoice } from '@/app/admin/financeiro/contas-a-receber/actions'
import { PaymentWriteoffModal, type InstallmentForPayment } from '@/app/admin/financeiro/contas-a-receber/components/PaymentWriteoffModal'

// ==================== Types ====================

interface CustomerFinancialTabProps {
    profileId: string
    profileName: string
    companyName: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
    open: { label: 'Aberta', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    partial: { label: 'Parcial', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    paid: { label: 'Paga', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    overdue: { label: 'Vencida', color: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { label: 'Cancelada', color: 'bg-gray-50 text-gray-500 border-gray-200' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvoiceRecord = any

// ==================== Component ====================

export function CustomerFinancialTab({ profileId, profileName, companyName }: CustomerFinancialTabProps) {
    const [data, setData] = useState<{ invoices: InvoiceRecord[]; summary: { totalOpen: number; totalOverdue: number; totalPaid: number; creditLimit: number; invoiceCount: number } } | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [paymentModal, setPaymentModal] = useState<InstallmentForPayment | null>(null)
    const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
    const [deletingInvoice, setDeletingInvoice] = useState<{ id: string; number: string } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDeleteInvoice = async () => {
        if (!deletingInvoice) return
        setIsDeleting(true)
        setError(null)
        try {
            const res = await deleteInvoice(deletingInvoice.id)
            if (res.error) {
                setError(res.error)
            } else {
                void loadData()
            }
        } catch {
            setError('Erro ao excluir fatura.')
        } finally {
            setIsDeleting(false)
            setDeletingInvoice(null)
        }
    }

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getCustomerFinancialData(profileId)
            if ('error' in result && result.error) {
                setError(result.error)
            } else if ('data' in result && result.data) {
                setData(result.data)
            }
        } catch {
            setError('Erro ao carregar dados financeiros.')
        } finally {
            setLoading(false)
        }
    }, [profileId])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const fmt = (v: number) =>
        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-48 rounded-xl" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadData()}>
                    Tentar novamente
                </Button>
            </div>
        )
    }

    if (!data) return null

    const { summary, invoices } = data
    const creditUsage = summary.creditLimit > 0 ? ((summary.totalOpen + summary.totalOverdue) / summary.creditLimit) * 100 : 0

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 md:grid-cols-4 scrollbar-hide">
                <div className="rounded-xl border bg-white p-4 space-y-1 min-w-[240px] sm:min-w-0 snap-center shrink-0 w-full">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                        Em Aberto
                    </div>
                    <p className="text-xl font-black text-blue-700">{fmt(summary.totalOpen)}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 space-y-1 min-w-[240px] sm:min-w-0 snap-center shrink-0 w-full">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        Vencido
                    </div>
                    <p className={cn("text-xl font-black", summary.totalOverdue > 0 ? "text-red-600" : "text-foreground")}>{fmt(summary.totalOverdue)}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 space-y-1 min-w-[240px] sm:min-w-0 snap-center shrink-0 w-full">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        Pago
                    </div>
                    <p className="text-xl font-black text-emerald-600">{fmt(summary.totalPaid)}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 space-y-1 min-w-[240px] sm:min-w-0 snap-center shrink-0 w-full">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5 text-navy" />
                        Limite de Crédito
                    </div>
                    <p className="text-xl font-black text-navy">{summary.creditLimit > 0 ? fmt(summary.creditLimit) : '—'}</p>
                    {summary.creditLimit > 0 && (
                        <div className="mt-1">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all',
                                        creditUsage > 90 ? 'bg-red-400' : creditUsage > 70 ? 'bg-amber-400' : 'bg-emerald-400'
                                    )}
                                    style={{ width: `${Math.min(creditUsage, 100)}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{creditUsage.toFixed(0)}% utilizado</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Invoice List */}
            <div>
                <h4 className="text-sm font-semibold text-navy flex items-center gap-2 mb-3">
                    <Receipt className="h-4 w-4" />
                    Faturas ({summary.invoiceCount})
                </h4>

                {invoices.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Nenhuma fatura encontrada para este cliente.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {invoices.map((inv: InvoiceRecord) => {
                            const installments = inv.installments || []
                            const isExpanded = expandedInvoice === inv.id
                            const hasOverdue = installments.some(
                                (i: { status: string; due_date: string }) =>
                                    i.status === 'overdue' || (i.status === 'open' && daysOverdue(i.due_date) > 0)
                            )
                            const effectiveStatus = hasOverdue && inv.status === 'open' ? 'overdue' : inv.status
                            const stCfg = statusConfig[effectiveStatus] || statusConfig.open
                            const paidCount = installments.filter((i: { status: string }) => i.status === 'paid').length

                            return (
                                <div key={inv.id} className={cn(
                                    'rounded-xl border bg-white overflow-hidden transition-all',
                                    hasOverdue ? 'border-red-200' : 'border-border/60'
                                )}>
                                    {/* Invoice header row */}
                                    <button
                                        onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-slate-50/60 transition text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="font-mono text-xs font-bold text-navy">
                                                {inv.invoice_number}
                                            </span>
                                            <Badge variant="outline" className={cn('text-[9px] font-semibold rounded-full', stCfg.color)}>
                                                {stCfg.label}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground hidden sm:inline">
                                                {paidCount}/{installments.length} pagas
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="font-bold text-sm">{fmt(Number(inv.total_amount))}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-md"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setDeletingInvoice({ id: inv.id, number: inv.invoice_number })
                                                }}
                                                title="Excluir Fatura"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                            <span className={cn(
                                                "text-xs transition-transform",
                                                isExpanded ? "rotate-180" : ""
                                            )}>▼</span>
                                        </div>
                                    </button>

                                    {/* Expanded installments */}
                                    {isExpanded && (
                                        <div className="border-t bg-slate-50/30 px-3 py-2 space-y-1">
                                            {installments
                                                .sort((a: { installment_number: number }, b: { installment_number: number }) => a.installment_number - b.installment_number)
                                                .map((inst: { id: string; installment_number: number; due_date: string; amount: number; paid_amount: number; status: string }) => {
                                                    const overdue = inst.status === 'overdue' || (inst.status === 'open' && daysOverdue(inst.due_date) > 0)
                                                    const canPay = inst.status === 'open' || inst.status === 'overdue'

                                                    return (
                                                        <div key={inst.id} className={cn(
                                                            'flex items-center justify-between rounded-lg px-3 py-2 text-xs',
                                                            overdue ? 'bg-red-50/60' : inst.status === 'paid' ? 'bg-emerald-50/40' : 'bg-white/60'
                                                        )}>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold w-8">{inst.installment_number}/{installments.length}</span>
                                                                <span className={cn('font-medium', overdue ? 'text-red-600' : 'text-foreground')}>
                                                                    {formatDateBR(inst.due_date)}
                                                                </span>
                                                                {overdue && (
                                                                    <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                                                                        {daysOverdue(inst.due_date)}d
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold">{fmt(inst.amount)}</span>
                                                                {inst.status === 'paid' ? (
                                                                    <span className="text-emerald-600 text-[9px] font-bold bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ Pago</span>
                                                                ) : canPay ? (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-[10px] rounded-md text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setPaymentModal({
                                                                                id: inst.id,
                                                                                installment_number: inst.installment_number,
                                                                                due_date: inst.due_date,
                                                                                amount: inst.amount,
                                                                                paid_amount: inst.paid_amount,
                                                                                status: inst.status,
                                                                                invoice_id: inv.id,
                                                                                invoice_number: inv.invoice_number,
                                                                                invoice_total: Number(inv.total_amount),
                                                                                client_name: profileName,
                                                                                company_name: companyName,
                                                                            })
                                                                        }}
                                                                    >
                                                                        <Banknote className="h-3 w-3" />
                                                                        Baixar
                                                                    </Button>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <PaymentWriteoffModal
                installment={paymentModal}
                open={!!paymentModal}
                onOpenChange={(o) => { if (!o) setPaymentModal(null) }}
                onSuccess={() => {
                    setPaymentModal(null)
                    void loadData()
                }}
            />

            <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && !isDeleting && setDeletingInvoice(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Fatura Inteira?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Você está prestes a excluir a fatura <strong className="text-foreground">{deletingInvoice?.number}</strong>. isso apagará <strong className="text-foreground">todas</strong> as parcelas dessa fatura. <br/><br/>
                            Faturas que já possuem baixas de pagamento não podem ser excluídas por segurança. Se houver pagamentos, remova-os primeiro.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                void handleDeleteInvoice()
                            }}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting ? 'Excluindo...' : 'Sim, Excluir Fatura'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
