'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
    Route,
    MapPin,
    Truck,
    Clock,
    CheckCircle2,
    XCircle,
    ChevronRight,
    Calendar,
    Package,
    RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getDriverRoutes, getDriverKpis } from './actions'

const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    optimized: { label: 'Otimizada', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    confirmed: { label: 'Confirmada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    in_progress: { label: 'Em Andamento', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    completed: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-600 border-red-200' },
}

export default function MotoristaPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [routes, setRoutes] = useState<any[]>([])
    const [kpis, setKpis] = useState({ todayRoutes: 0, pendingStops: 0, deliveredToday: 0, failedToday: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const [routesRes, kpisRes] = await Promise.all([
            getDriverRoutes(),
            getDriverKpis(),
        ])
        if (routesRes.error) setError(routesRes.error)
        if (routesRes.data) setRoutes(routesRes.data)
        if (kpisRes.data) setKpis(kpisRes.data)
        setLoading(false)
    }, [])

    useEffect(() => { void loadData() }, [loadData])

    const formatDate = (d: string) => {
        try {
            const date = new Date(d)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const target = new Date(d)
            target.setHours(0, 0, 0, 0)
            const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            if (diff === 0) return 'Hoje'
            if (diff === 1) return 'Amanhã'
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        } catch { return d }
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
                <Skeleton className="h-10 rounded-xl" />
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white border p-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Route className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Rotas Hoje</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{kpis.todayRoutes}</p>
                </div>
                <div className="rounded-xl bg-white border p-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pendentes</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{kpis.pendingStops}</p>
                </div>
                <div className="rounded-xl bg-white border p-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Entregas</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{kpis.deliveredToday}</p>
                </div>
                <div className="rounded-xl bg-white border p-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="h-7 w-7 rounded-lg bg-red-100 flex items-center justify-center">
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Insucessos</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{kpis.failedToday}</p>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Routes List */}
            <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Minhas Rotas</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadData()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
            </div>

            {routes.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    Nenhuma rota atribuída.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {routes.map((route) => {
                        const st = statusConfig[route.status] || statusConfig.confirmed
                        const isActive = route.status === 'in_progress'

                        return (
                            <Link key={route.id} href={`/motorista/rota/${route.id}`}>
                                <div className={cn(
                                    'rounded-xl border bg-white p-4 transition active:scale-[0.98] shadow-sm',
                                    isActive && 'border-amber-300 ring-1 ring-amber-200 bg-amber-50/30'
                                )}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={cn(
                                                'h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0',
                                                isActive
                                                    ? 'bg-linear-to-br from-amber-500 to-orange-600'
                                                    : 'bg-linear-to-br from-blue-500 to-indigo-600'
                                            )}>
                                                {route.route_number?.replace('ROT', '').replace(/^0+/, '') || '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-slate-900 text-sm">{route.route_number}</p>
                                                    <Badge variant="outline" className={cn('text-[9px] rounded-full font-semibold', st.color)}>
                                                        {st.label}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                                    <span className="flex items-center gap-0.5">
                                                        <Calendar className="h-2.5 w-2.5" /> {formatDate(route.planned_date)}
                                                    </span>
                                                    <span className="text-muted-foreground/30">•</span>
                                                    <span className="flex items-center gap-0.5">
                                                        <MapPin className="h-2.5 w-2.5" /> {route.total_stops} paradas
                                                    </span>
                                                    {route.vehicles && (
                                                        <>
                                                            <span className="text-muted-foreground/30">•</span>
                                                            <span className="flex items-center gap-0.5">
                                                                <Truck className="h-2.5 w-2.5" /> {route.vehicles.plate}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                                {route.route_centers?.name && (
                                                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                                                        Saída: {route.route_centers.name}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
