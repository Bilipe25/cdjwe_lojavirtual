'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    Search,
    Filter,
    DollarSign,
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileText,
    RefreshCw,
    Receipt,
    Banknote,
    Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { getAccountsReceivable, deleteInvoice, type AccountReceivableItem } from './actions'
import { formatDateBR, daysOverdue as calcDaysOverdue } from '@/lib/financial/installment-calculator'
import { PaymentWriteoffModal, type InstallmentForPayment } from './components/PaymentWriteoffModal'

// ==================== Status Config ====================

const installmentStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    open: { label: 'Em Aberto', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
    paid: { label: 'Pago', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    overdue: { label: 'Vencido', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
    cancelled: { label: 'Cancelado', color: 'bg-gray-50 text-gray-500 border-gray-200', icon: FileText },
}

const filterOptions = [
    { value: 'all', label: 'Todas' },
    { value: 'open', label: 'Em Aberto' },
    { value: 'overdue', label: 'Vencidas' },
    { value: 'paid', label: 'Pagas' },
    { value: 'cancelled', label: 'Canceladas' },
]

// ==================== Summary Card ====================

function SummaryCard({
    title,
    value,
    icon: Icon,
    color,
    accent,
    className,
}: {
    title: string
    value: string
    icon: React.ElementType
    color: string
    accent: string
    className?: string
}) {
    return (
        <div className={cn('rounded-2xl border p-4 transition-all duration-200 min-w-[240px] sm:min-w-0 snap-center shrink-0 w-full', color, className)}>
            <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', accent)}>
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {title}
                    </p>
                    <p className="mt-0.5 text-xl font-bold font-heading truncate">
                        {value}
                    </p>
                </div>
            </div>
        </div>
    )
}

// ==================== Main Page ====================

export default function ContasAReceberPage() {
    const [data, setData] = useState<AccountReceivableItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [paymentModal, setPaymentModal] = useState<InstallmentForPayment | null>(null)
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
            const result = await getAccountsReceivable({ status: statusFilter, search: search.trim() || null })
            if ('error' in result && result.error) {
                setError(result.error)
            } else if ('data' in result) {
                setData(result.data || [])
            }
        } catch {
            setError('Erro ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }, [statusFilter, search])

    useEffect(() => {
        const timeout = setTimeout(() => {
            void loadData()
        }, 300)
        return () => clearTimeout(timeout)
    }, [loadData])

    // Calculate summaries
    const summaries = {
        totalOpen: data
            .filter((r) => r.installment_status === 'open')
            .reduce((s, r) => s + r.installment_amount, 0),
        totalOverdue: data
            .filter((r) => r.installment_status === 'open' && r.days_overdue > 0)
            .reduce((s, r) => s + r.installment_amount, 0),
        totalPaid: data
            .filter((r) => r.installment_status === 'paid')
            .reduce((s, r) => s + r.installment_paid_amount, 0),
        count: data.length,
    }

    const fmt = (v: number) =>
        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Receipt className="h-6 w-6" />
                        Contas a Receber
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Controle de faturas e parcelas geradas a partir dos pedidos.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadData()}
                    className="gap-2 border-navy/20 text-navy hover:bg-navy/5"
                >
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="flex overflow-x-auto pb-4 gap-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 xl:grid-cols-4 snap-x snap-mandatory scrollbar-hide">
                <SummaryCard
                    title="Em Aberto"
                    value={fmt(summaries.totalOpen)}
                    icon={Clock}
                    color="border-blue-100 bg-blue-50/50"
                    accent="bg-blue-600"
                />
                <SummaryCard
                    title="Vencido"
                    value={fmt(summaries.totalOverdue)}
                    icon={AlertTriangle}
                    color="border-red-100 bg-red-50/50"
                    accent="bg-red-600"
                />
                <SummaryCard
                    title="Pago"
                    value={fmt(summaries.totalPaid)}
                    icon={CheckCircle2}
                    color="border-emerald-100 bg-emerald-50/50"
                    accent="bg-emerald-600"
                />
                <SummaryCard
                    title="Total de Parcelas"
                    value={String(summaries.count)}
                    icon={DollarSign}
                    color="border-slate-100 bg-slate-50/50"
                    accent="bg-navy"
                />
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por cliente, pedido ou fatura..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 rounded-lg"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-wrap gap-1.5">
                        {filterOptions.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setStatusFilter(opt.value)}
                                className={cn(
                                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                                    statusFilter === opt.value
                                        ? 'bg-navy text-white shadow-sm'
                                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Error & Loading */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadData()}>
                        Tentar novamente
                    </Button>
                </div>
            )}

            {loading && (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                </div>
            )}

            {/* Table */}
            {!loading && !error && (
                <>
                    {data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-navy/5 flex items-center justify-center mb-4">
                                <Receipt className="h-8 w-8 text-navy/40" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">Nenhuma conta encontrada</h3>
                            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                                {statusFilter !== 'all'
                                    ? 'Nenhum resultado para o filtro selecionado.'
                                    : 'Gere uma fatura a partir de um pedido para ver os títulos aqui.'}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border/60 bg-white overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-slate-50/80">
                                            <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Cliente
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">
                                                Pedido
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Fatura
                                            </th>
                                            <th className="px-4 py-3 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Parcela
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Valor
                                            </th>
                                            <th className="px-4 py-3 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Vencimento
                                            </th>
                                            <th className="px-4 py-3 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">
                                                Atraso
                                            </th>
                                            <th className="px-4 py-3 text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                                                Ação
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                        {data.map((row) => {
                                            const stCfg = installmentStatusConfig[row.installment_status] || installmentStatusConfig.open
                                            const overdue = row.installment_status === 'open' && row.days_overdue > 0
                                            const effectiveStatus = overdue ? installmentStatusConfig.overdue : stCfg

                                            return (
                                                <tr
                                                    key={row.installment_id}
                                                    className={cn(
                                                        'hover:bg-slate-50/60 transition-colors',
                                                        overdue && 'bg-red-50/30'
                                                    )}
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="max-w-[180px]">
                                                            <p className="font-medium text-foreground truncate">
                                                                {row.company_name || row.client_name}
                                                            </p>
                                                            {row.cnpj && (
                                                                <p className="text-xs text-muted-foreground truncate">
                                                                    {row.cnpj}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 hidden sm:table-cell">
                                                        <span className="font-mono text-xs font-medium text-navy">
                                                            {row.order_number}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs font-medium text-bronze">
                                                            {row.invoice_number}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="inline-flex items-center gap-1 text-xs">
                                                            <span className="font-bold">{row.installment_number}</span>
                                                            <span className="text-muted-foreground">/{row.installment_count}</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="font-semibold whitespace-nowrap">
                                                            {fmt(row.installment_amount)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={cn(
                                                            'text-xs font-medium',
                                                            overdue ? 'text-red-600 font-bold' : 'text-foreground'
                                                        )}>
                                                            {formatDateBR(row.due_date)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                'text-[10px] font-semibold px-2 py-0.5 rounded-full gap-1',
                                                                effectiveStatus.color
                                                            )}
                                                        >
                                                            {effectiveStatus.label}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                                                        {overdue ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                                                {row.days_overdue}d
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            {row.installment_status === 'open' ? (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 px-2.5 text-[10px] rounded-md text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1 font-semibold"
                                                                    onClick={() => setPaymentModal({
                                                                        id: row.installment_id,
                                                                        installment_number: row.installment_number,
                                                                        due_date: row.due_date,
                                                                        amount: row.installment_amount,
                                                                        paid_amount: row.installment_paid_amount,
                                                                        status: row.installment_status,
                                                                        invoice_id: row.invoice_id,
                                                                        invoice_number: row.invoice_number,
                                                                        invoice_total: row.total_amount,
                                                                        client_name: row.client_name,
                                                                        company_name: row.company_name,
                                                                    })}
                                                                >
                                                                    <Banknote className="h-3 w-3" />
                                                                    Baixar
                                                                </Button>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">—</span>
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-md"
                                                                onClick={() => setDeletingInvoice({ id: row.invoice_id, number: row.invoice_number })}
                                                                title="Excluir Fatura (Todas as Parcelas)"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="border-t bg-slate-50/50 px-4 py-2 text-xs text-muted-foreground">
                                Mostrando {data.length} parcela{data.length !== 1 ? 's' : ''} no total
                            </div>
                        </div>
                    )}
                </>
            )}

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
