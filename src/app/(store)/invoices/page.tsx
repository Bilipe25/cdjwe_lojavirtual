'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
    Receipt,
    Clock,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getClientInvoices } from '@/app/admin/financeiro/contas-a-receber/actions'
import { formatDateBR, daysOverdue as calcDaysOverdue } from '@/lib/financial/installment-calculator'
import type { InvoiceStatus, InstallmentStatus } from '@/lib/types'

// ==================== Config ====================

const invoiceStatusConfig: Record<string, { label: string; color: string }> = {
    open: { label: 'Em Aberto', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    partial: { label: 'Parcial', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    paid: { label: 'Paga', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    overdue: { label: 'Vencida', color: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { label: 'Cancelada', color: 'bg-gray-50 text-gray-500 border-gray-200' },
    renegotiated: { label: 'Renegociada', color: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const installmentStatusConfig: Record<string, { label: string; color: string }> = {
    open: { label: 'Em Aberto', color: 'text-blue-700 bg-blue-50' },
    paid: { label: 'Pago', color: 'text-emerald-700 bg-emerald-50' },
    overdue: { label: 'Vencido', color: 'text-red-700 bg-red-50' },
    cancelled: { label: 'Cancelado', color: 'text-gray-500 bg-gray-50' },
}

const filterTabs = [
    { value: 'all', label: 'Todas' },
    { value: 'open', label: 'Em Aberto' },
    { value: 'overdue', label: 'Vencidas' },
    { value: 'paid', label: 'Pagas' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvoiceRecord = any

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.06 },
    },
}

const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

// ==================== Page ====================

export default function ClientInvoicesPage() {
    const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState('all')

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getClientInvoices()
            if ('error' in result && result.error) {
                setError(result.error)
            } else if ('data' in result) {
                setInvoices(result.data || [])
            }
        } catch {
            setError('Erro ao carregar faturas.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadData()
    }, [loadData])

    // Determine overdue invoices
    const enrichedInvoices = invoices.map((inv: InvoiceRecord) => {
        const installments = inv.installments || []
        const hasOverdue = installments.some(
            (inst: { status: string; due_date: string }) =>
                inst.status === 'overdue' || (inst.status === 'open' && calcDaysOverdue(inst.due_date) > 0)
        )
        const nextDue = installments
            .filter((inst: { status: string }) => inst.status === 'open' || inst.status === 'overdue')
            .sort((a: { due_date: string }, b: { due_date: string }) => a.due_date.localeCompare(b.due_date))[0]

        const maxOverdueDays = Math.max(
            0,
            ...installments
                .filter((inst: { status: string }) => inst.status === 'open' || inst.status === 'overdue')
                .map((inst: { due_date: string }) => calcDaysOverdue(inst.due_date))
        )

        return {
            ...inv,
            hasOverdue,
            nextDue,
            maxOverdueDays,
        }
    })

    const filtered = enrichedInvoices.filter((inv: InvoiceRecord & { hasOverdue: boolean }) => {
        if (filter === 'all') return true
        if (filter === 'overdue') return inv.hasOverdue || inv.status === 'overdue'
        return inv.status === filter
    })

    const fmt = (v: number) =>
        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return (
        <div className="mx-auto max-w-3xl px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Receipt className="h-6 w-6" />
                        Minhas Faturas
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Acompanhe suas faturas e parcelas.
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void loadData()}
                    className="text-muted-foreground"
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
                {filterTabs.map((tab) => (
                    <button
                        key={tab.value}
                        onClick={() => setFilter(tab.value)}
                        className={cn(
                            'rounded-full px-4 py-1.5 text-xs font-semibold transition-all whitespace-nowrap',
                            filter === tab.value
                                ? 'bg-navy text-white shadow-sm'
                                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">
                    {error}
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadData()}>
                        Tentar novamente
                    </Button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                </div>
            )}

            {/* Invoice List */}
            {!loading && !error && (
                <>
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-navy/5 flex items-center justify-center mb-4">
                                <Receipt className="h-8 w-8 text-navy/40" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground">Nenhuma fatura encontrada</h3>
                            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                                {filter !== 'all'
                                    ? 'Nenhuma fatura com este filtro.'
                                    : 'Suas faturas aparecerão aqui quando geradas.'}
                            </p>
                        </div>
                    ) : (
                        <motion.div
                            variants={container}
                            initial="hidden"
                            animate="show"
                            className="space-y-3"
                        >
                            {filtered.map((inv: InvoiceRecord & { hasOverdue: boolean; nextDue: { due_date: string; amount: number } | null; maxOverdueDays: number }) => {
                                const stCfg = invoiceStatusConfig[inv.status as InvoiceStatus] || invoiceStatusConfig.open
                                const effectiveStatus = inv.hasOverdue && inv.status === 'open'
                                    ? invoiceStatusConfig.overdue
                                    : stCfg
                                const installments = inv.installments || []
                                const paidCount = installments.filter((i: { status: string }) => i.status === 'paid').length

                                return (
                                    <motion.div key={inv.id} variants={item}>
                                        <div
                                            className={cn(
                                                'rounded-2xl border p-4 bg-white transition-all hover:shadow-md',
                                                inv.hasOverdue ? 'border-red-200' : 'border-border/50'
                                            )}
                                        >
                                            {/* Top row */}
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono text-sm font-bold text-navy">
                                                            {inv.invoice_number}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn('text-[10px] font-semibold rounded-full', effectiveStatus.color)}
                                                        >
                                                            {effectiveStatus.label}
                                                        </Badge>
                                                        {inv.hasOverdue && inv.maxOverdueDays > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                                                <AlertTriangle className="h-3 w-3" />
                                                                {inv.maxOverdueDays}d atraso
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Pedido {inv.order?.order_number || '—'} • Emissão {formatDateBR(inv.issue_date)}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-lg font-black text-gradient-bronze">
                                                        {fmt(Number(inv.total_amount))}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {inv.installment_count}x de {fmt(Number(inv.total_amount) / inv.installment_count)}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="mb-3">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-medium text-muted-foreground">
                                                        {paidCount}/{installments.length} parcelas pagas
                                                    </span>
                                                    <span className="text-[10px] font-medium text-muted-foreground">
                                                        {Math.round((paidCount / installments.length) * 100)}%
                                                    </span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            'h-full rounded-full transition-all',
                                                            paidCount === installments.length
                                                                ? 'bg-emerald-500'
                                                                : inv.hasOverdue
                                                                    ? 'bg-red-400'
                                                                    : 'bg-blue-500'
                                                        )}
                                                        style={{ width: `${(paidCount / installments.length) * 100}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Installments list */}
                                            <div className="space-y-1.5">
                                                {installments.map((inst: { id: string; installment_number: number; due_date: string; amount: number; status: InstallmentStatus }) => {
                                                    const overdue = inst.status === 'overdue' || (inst.status === 'open' && calcDaysOverdue(inst.due_date) > 0)
                                                    const instCfg = overdue
                                                        ? installmentStatusConfig.overdue
                                                        : installmentStatusConfig[inst.status] || installmentStatusConfig.open

                                                    return (
                                                        <div
                                                            key={inst.id}
                                                            className={cn(
                                                                'flex items-center justify-between rounded-lg px-3 py-2 text-xs',
                                                                overdue ? 'bg-red-50/60' : 'bg-slate-50/60'
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-foreground">
                                                                    {inst.installment_number}/{installments.length}
                                                                </span>
                                                                <span className={cn('font-medium', overdue ? 'text-red-600' : 'text-foreground')}>
                                                                    {formatDateBR(inst.due_date)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold">
                                                                    {fmt(Number(inst.amount))}
                                                                </span>
                                                                <span className={cn(
                                                                    'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                                                    instCfg.color
                                                                )}>
                                                                    {inst.status === 'paid' ? '✓' : overdue ? '!' : '○'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {/* Next due info */}
                                            {inv.nextDue && inv.status !== 'paid' && (
                                                <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Próx. vencimento: {formatDateBR(inv.nextDue.due_date)}
                                                    </span>
                                                    <span className="font-medium">{fmt(Number(inv.nextDue.amount))}</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                    )}
                </>
            )}
        </div>
    )
}
