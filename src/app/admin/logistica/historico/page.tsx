'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
    History,
    RefreshCw,
    Eye,
    Calendar,
    MapPin,
    Truck,
    UserCircle,
    Clock,
    CheckCircle2,
    XCircle,
    TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
    getRouteHistory,
    getDrivers,
    getVehicles,
    type PaginationMeta,
    type RouteHistoryItem,
    type DriverItem,
    type VehicleItem,
} from '../services'

const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Rascunho', color: 'bg-slate-50 text-slate-600 border-slate-200' },
    optimized: { label: 'Otimizada', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    confirmed: { label: 'Confirmada', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    in_progress: { label: 'Em Andamento', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    completed: { label: 'Concluída', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function HistoricoRotasPage() {
    const [data, setData] = useState<RouteHistoryItem[]>([])
    const [pagination, setPagination] = useState<PaginationMeta>({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    })
    const [metrics, setMetrics] = useState({ totalRoutes: 0, completedRoutes: 0, totalDeliveries: 0, totalFailures: 0, totalKm: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [drivers, setDrivers] = useState<DriverItem[]>([])
    const [vehicles, setVehicles] = useState<VehicleItem[]>([])

    const [statusFilter, setStatusFilter] = useState('all')
    const [driverFilter, setDriverFilter] = useState('all')
    const [vehicleFilter, setVehicleFilter] = useState('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRouteHistory({
            status: statusFilter,
            driverId: driverFilter,
            vehicleId: vehicleFilter,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page: pagination.page,
            pageSize: pagination.pageSize,
        })
        if ('error' in res && res.error) setError(res.error)
        if ('data' in res && res.data) setData(res.data)
        if ('metrics' in res && res.metrics) setMetrics(res.metrics)
        if ('pagination' in res && res.pagination) setPagination(res.pagination)
        setLoading(false)
    }, [statusFilter, driverFilter, vehicleFilter, dateFrom, dateTo, pagination.page, pagination.pageSize])

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadData() }, [loadData])

    useEffect(() => {
        const load = async () => {
            const [d, v] = await Promise.all([getDrivers(), getVehicles()])
            if ('data' in d && d.data) setDrivers(d.data)
            if ('data' in v && v.data) setVehicles(v.data)
        }
        void load()
    }, [])

    const formatDate = (d: string) => {
        try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }
        catch { return d }
    }

    const successRate = metrics.totalDeliveries + metrics.totalFailures > 0
        ? Math.round((metrics.totalDeliveries / (metrics.totalDeliveries + metrics.totalFailures)) * 100)
        : 0

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <History className="h-6 w-6" /> Histórico de Rotas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Análise completa das operações de entrega
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={() => void loadData()}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Rotas</p>
                    <p className="text-2xl font-black text-navy">{metrics.totalRoutes}</p>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Concluídas</p>
                    <p className="text-2xl font-black text-emerald-600">{metrics.completedRoutes}</p>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Entregas</p>
                    <div className="flex items-end gap-1">
                        <p className="text-2xl font-black text-navy">{metrics.totalDeliveries}</p>
                        {metrics.totalFailures > 0 && <p className="text-xs text-red-500 mb-0.5">({metrics.totalFailures} ✗)</p>}
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Taxa Sucesso</p>
                    <div className="flex items-center gap-1.5">
                        <p className={cn('text-2xl font-black', successRate >= 90 ? 'text-emerald-600' : successRate >= 70 ? 'text-amber-600' : 'text-red-600')}>{successRate}%</p>
                        <TrendingUp className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Km Total</p>
                    <p className="text-2xl font-black text-navy">{Math.round(metrics.totalKm)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={(v) => {
                    setStatusFilter(v || 'all')
                    setPagination((prev) => ({ ...prev, page: 1 }))
                }}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        {Object.entries(statusConfig).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={driverFilter} onValueChange={(v) => {
                    setDriverFilter(v || 'all')
                    setPagination((prev) => ({ ...prev, page: 1 }))
                }}>
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="Motorista" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos motoristas</SelectItem>
                        {drivers.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.profile_name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={vehicleFilter} onValueChange={(v) => {
                    setVehicleFilter(v || 'all')
                    setPagination((prev) => ({ ...prev, page: 1 }))
                }}>
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="Veículo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos veículos</SelectItem>
                        {vehicles.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.plate} - {v.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                            setDateFrom(e.target.value)
                            setPagination((prev) => ({ ...prev, page: 1 }))
                        }}
                        className="w-36 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                            setDateTo(e.target.value)
                            setPagination((prev) => ({ ...prev, page: 1 }))
                        }}
                        className="w-36 text-xs"
                    />
                </div>
            </div>

            {/* Routes Table */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhuma rota encontrada com os filtros aplicados.
                </div>
            ) : (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50/60">
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Rota</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Data</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Status</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy hidden md:table-cell">Motorista</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy hidden lg:table-cell">Veículo</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Paradas</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy hidden sm:table-cell">Entregas</th>
                                    <th className="px-4 py-3 text-right font-semibold text-navy hidden sm:table-cell">Km</th>
                                    <th className="px-4 py-3 w-12"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((route) => {
                                    const st = statusConfig[route.status] || statusConfig.draft
                                    return (
                                        <tr key={route.id} className="border-b last:border-b-0 hover:bg-slate-50/40 transition">
                                            <td className="px-4 py-3 font-mono font-bold text-navy text-xs">{route.route_number}</td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs">
                                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(route.planned_date)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full', st.color)}>{st.label}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs hidden md:table-cell">
                                                {route.driver_name ? (
                                                    <span className="flex items-center gap-1"><UserCircle className="h-3 w-3" /> {route.driver_name}</span>
                                                ) : <span className="text-muted-foreground/40">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs hidden lg:table-cell">
                                                {route.vehicle_plate ? (
                                                    <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {route.vehicle_plate}</span>
                                                ) : <span className="text-muted-foreground/40">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="flex items-center gap-1 justify-center"><MapPin className="h-3 w-3" /> {route.total_stops}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                                                <div className="flex items-center gap-2 justify-center">
                                                    {route.delivered_stops > 0 && (
                                                        <span className="flex items-center gap-0.5 text-emerald-600 text-xs">
                                                            <CheckCircle2 className="h-3 w-3" /> {route.delivered_stops}
                                                        </span>
                                                    )}
                                                    {route.failed_stops > 0 && (
                                                        <span className="flex items-center gap-0.5 text-red-500 text-xs">
                                                            <XCircle className="h-3 w-3" /> {route.failed_stops}
                                                        </span>
                                                    )}
                                                    {route.delivered_stops === 0 && route.failed_stops === 0 && (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right hidden sm:table-cell text-xs">
                                                {route.total_distance_km ? (
                                                    <span className="flex items-center gap-1 justify-end"><Clock className="h-3 w-3" /> {route.total_distance_km} km</span>
                                                ) : <span className="text-muted-foreground/40">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Link href={`/admin/logistica/rotas/${route.id}`}>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-2 border-t bg-slate-50/40 text-xs text-muted-foreground">
                        {pagination.total} rotas encontradas
                    </div>
                    <div className="px-4 py-3 border-t bg-white flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                            Pagina {pagination.page} de {pagination.totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pagination.hasPreviousPage || loading}
                                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pagination.hasNextPage || loading}
                                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                            >
                                Proxima
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

