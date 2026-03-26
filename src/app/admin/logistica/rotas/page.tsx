'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
    Route,
    Plus,
    RefreshCw,
    Eye,
    Trash2,
    Calendar,
    MapPin,
    Truck,
    UserCircle,
    Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
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
import { getRoutes, deleteRoute, type RouteListItem } from '../actions'

const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Rascunho', color: 'bg-slate-50 text-slate-600 border-slate-200' },
    optimized: { label: 'Otimizada', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    confirmed: { label: 'Confirmada', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    in_progress: { label: 'Em Andamento', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    completed: { label: 'Concluída', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function CentralDeRotasPage() {
    const [data, setData] = useState<RouteListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState('all')
    const [deleteTarget, setDeleteTarget] = useState<RouteListItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRoutes({ status: statusFilter })
        if ('error' in res && res.error) setError(res.error)
        else if ('data' in res && res.data) setData(res.data)
        setLoading(false)
    }, [statusFilter])

    useEffect(() => { void loadData() }, [loadData])

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        const res = await deleteRoute(deleteTarget.id)
        setDeleting(false)
        setDeleteTarget(null)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const formatDate = (d: string) => {
        try {
            return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
        } catch {
            return d
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <Route className="h-6 w-6" /> Central de Rotas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gerencie e acompanhe todas as rotas de entrega
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Link href="/admin/logistica/pedidos">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" /> Nova Rota
                        </Button>
                    </Link>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || 'all')}>
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {Object.entries(statusConfig).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhuma rota encontrada.
                </div>
            ) : (
                <div className="space-y-3">
                    {data.map((route) => {
                        const st = statusConfig[route.status] || statusConfig.draft
                        return (
                            <div key={route.id} className="rounded-xl border bg-white p-4 hover:shadow-sm transition">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                            {route.route_number.replace('ROT', '')}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-navy">{route.route_number}</h3>
                                                <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full', st.color)}>
                                                    {st.label}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" /> {formatDate(route.planned_date)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" /> {route.total_stops} paradas
                                                </span>
                                                {route.total_distance_km && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" /> {route.total_distance_km} km
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="hidden md:flex flex-col text-xs text-muted-foreground text-right gap-0.5">
                                            {route.driver_name && (
                                                <span className="flex items-center gap-1 justify-end">
                                                    <UserCircle className="h-3 w-3" /> {route.driver_name}
                                                </span>
                                            )}
                                            {route.vehicle_name && (
                                                <span className="flex items-center gap-1 justify-end">
                                                    <Truck className="h-3 w-3" /> {route.vehicle_plate} - {route.vehicle_name}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            <Link href={`/admin/logistica/rotas/${route.id}`}>
                                                <Button variant="outline" size="icon" className="h-8 w-8" title="Ver detalhes">
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                            </Link>
                                            {['draft', 'cancelled'].includes(route.status) && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(route)} title="Excluir">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Rota?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A rota <strong>{deleteTarget?.route_number}</strong> e todas as suas paradas serão excluídas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleDelete() }} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                            {deleting ? 'Excluindo...' : 'Excluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
