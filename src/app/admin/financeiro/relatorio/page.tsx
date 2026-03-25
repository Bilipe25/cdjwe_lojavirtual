'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    DollarSign,
    AlertTriangle,
    TrendingUp,
    BarChart3,
    RefreshCw,
    Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getFinancialReport, type FinancialReportData } from './actions'

export default function FinancialReportPage() {
    const [data, setData] = useState<FinancialReportData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Period filters — default: current month
    const now = new Date()
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const today = now.toISOString().split('T')[0]
    const [periodStart, setPeriodStart] = useState(firstOfMonth)
    const [periodEnd, setPeriodEnd] = useState(today)

    const loadReport = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await getFinancialReport({ periodStart, periodEnd })
            if ('error' in result && result.error) {
                setError(result.error)
            } else if ('data' in result && result.data) {
                setData(result.data)
            }
        } catch {
            setError('Erro ao gerar relatório.')
        } finally {
            setLoading(false)
        }
    }, [periodStart, periodEnd])

    useEffect(() => {
        void loadReport()
    }, [loadReport])

    const fmt = (v: number) =>
        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-heading text-gradient-navy">
                        Relatório Financeiro
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Visão consolidada de contas a receber, inadimplência e aging.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadReport()}
                    disabled={loading}
                    className="gap-2 shrink-0"
                >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    Atualizar
                </Button>
            </div>

            {/* Period Filter */}
            <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border bg-white/80 shadow-sm">
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">De</Label>
                    <Input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        className="h-9 rounded-lg w-40"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Até</Label>
                    <Input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        className="h-9 rounded-lg w-40"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        className="text-xs px-3 py-2 rounded-lg bg-navy/5 text-navy font-medium hover:bg-navy/10 transition"
                        onClick={() => {
                            const d = new Date()
                            setPeriodStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
                            setPeriodEnd(d.toISOString().split('T')[0])
                        }}
                    >
                        Este mês
                    </button>
                    <button
                        className="text-xs px-3 py-2 rounded-lg bg-navy/5 text-navy font-medium hover:bg-navy/10 transition"
                        onClick={() => {
                            const d = new Date()
                            const q = Math.floor(d.getMonth() / 3) * 3
                            setPeriodStart(`${d.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`)
                            setPeriodEnd(d.toISOString().split('T')[0])
                        }}
                    >
                        Trimestre
                    </button>
                    <button
                        className="text-xs px-3 py-2 rounded-lg bg-navy/5 text-navy font-medium hover:bg-navy/10 transition"
                        onClick={() => {
                            const d = new Date()
                            setPeriodStart(`${d.getFullYear()}-01-01`)
                            setPeriodEnd(d.toISOString().split('T')[0])
                        }}
                    >
                        Ano
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <Skeleton className="h-64 rounded-xl" />
                        <Skeleton className="h-64 rounded-xl" />
                    </div>
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            ) : data ? (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 relative overflow-hidden">
                            <div className="absolute top-0 right-0 h-16 w-16 bg-blue-500/5 rounded-bl-[2rem]" />
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <DollarSign className="h-3.5 w-3.5 text-blue-500" />
                                Total a Receber
                            </div>
                            <p className="text-xl sm:text-2xl font-black text-blue-700">{fmt(data.kpis.totalReceivable)}</p>
                            <p className="text-[10px] text-muted-foreground">Parcelas em aberto</p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 relative overflow-hidden">
                            <div className="absolute top-0 right-0 h-16 w-16 bg-red-500/5 rounded-bl-[2rem]" />
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                Vencido
                            </div>
                            <p className={cn("text-xl sm:text-2xl font-black", data.kpis.totalOverdue > 0 ? "text-red-600" : "text-foreground")}>
                                {fmt(data.kpis.totalOverdue)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Parcelas em atraso</p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 relative overflow-hidden">
                            <div className="absolute top-0 right-0 h-16 w-16 bg-emerald-500/5 rounded-bl-[2rem]" />
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                Recebido no Período
                            </div>
                            <p className="text-xl sm:text-2xl font-black text-emerald-600">{fmt(data.kpis.totalReceivedInPeriod)}</p>
                            <p className="text-[10px] text-muted-foreground">
                                {periodStart && periodEnd
                                    ? `${new Date(periodStart + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(periodEnd + 'T12:00:00').toLocaleDateString('pt-BR')}`
                                    : 'Período selecionado'}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 relative overflow-hidden">
                            <div className="absolute top-0 right-0 h-16 w-16 bg-amber-500/5 rounded-bl-[2rem]" />
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
                                Inadimplência
                            </div>
                            <p className={cn("text-xl sm:text-2xl font-black", data.kpis.defaultRate > 10 ? "text-red-600" : data.kpis.defaultRate > 5 ? "text-amber-600" : "text-foreground")}>
                                {data.kpis.defaultRate.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">Razão vencido/emitido</p>
                        </div>
                    </div>

                    {/* Bottom Grid: Top Debtors + Aging */}
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Top Debtors */}
                        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="p-4 border-b bg-slate-50/60">
                                <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Maiores Devedores
                                </h3>
                            </div>
                            <div className="divide-y">
                                {data.topDebtors.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-muted-foreground">Nenhum devedor encontrado.</div>
                                ) : (
                                    data.topDebtors.map((d, idx) => (
                                        <div key={d.profileId} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="text-xs font-bold text-muted-foreground w-5">{idx + 1}.</span>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold truncate">{d.clientName}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{d.companyName}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold">{fmt(d.totalOpen)}</p>
                                                {d.totalOverdue > 0 && (
                                                    <p className="text-[10px] font-semibold text-red-600">{fmt(d.totalOverdue)} vencido</p>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Aging Report */}
                        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                            <div className="p-4 border-b bg-slate-50/60">
                                <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                                    <BarChart3 className="h-4 w-4" />
                                    Aging — Faixas de Vencimento
                                </h3>
                            </div>
                            <div className="p-4 space-y-4">
                                {data.aging.map((bucket) => {
                                    const maxTotal = Math.max(...data.aging.map(a => a.total), 1)
                                    const pct = (bucket.total / maxTotal) * 100
                                    const colors: Record<string, string> = {
                                        '0-30 dias': 'bg-amber-400',
                                        '31-60 dias': 'bg-orange-400',
                                        '61-90 dias': 'bg-red-400',
                                        '90+ dias': 'bg-red-600',
                                    }
                                    return (
                                        <div key={bucket.range}>
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="font-semibold text-foreground">{bucket.range}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground">{bucket.count} parcela{bucket.count !== 1 ? 's' : ''}</span>
                                                    <span className="font-bold">{fmt(bucket.total)}</span>
                                                </div>
                                            </div>
                                            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className={cn('h-full rounded-full transition-all', colors[bucket.range] || 'bg-slate-400')}
                                                    style={{ width: `${Math.max(pct, bucket.total > 0 ? 3 : 0)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}

                                {data.aging.every(a => a.total === 0) && (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Nenhuma parcela vencida encontrada. 🎉
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    )
}
