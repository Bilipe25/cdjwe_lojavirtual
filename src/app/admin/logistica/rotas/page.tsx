'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
    Search,
    CheckCircle2,
    XCircle,
    Zap,
    Play,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { getRoutes, deleteRoute, type PaginationMeta, type RouteListItem } from '../services'

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    draft: { label: 'Rascunho', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: Clock },
    optimized: { label: 'Otimizada', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Zap },
    confirmed: { label: 'Confirmada', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2 },
    in_progress: { label: 'Em Andamento', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Play },
    completed: { label: 'Concluída', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    cancelled: { label: 'Cancelada', color: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
}

export default function CentralDeRotasPage() {
    const router = useRouter()
    const [data, setData] = useState<RouteListItem[]>([])
    const [pagination, setPagination] = useState<PaginationMeta>({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [deleteTarget, setDeleteTarget] = useState<RouteListItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRoutes({
            status: statusFilter,
            page: pagination.page,
            pageSize: pagination.pageSize,
        })
        if ('error' in res && res.error) setError(res.error)
        else if ('data' in res && res.data) {
            setData(res.data)
            if ('pagination' in res && res.pagination) {
                setPagination(res.pagination)
            }
        }
        setLoading(false)
    }, [statusFilter, pagination.page, pagination.pageSize])

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }
        catch { return d }
    }

    // Filter by search
    const filtered = data.filter(r => {
        if (!searchTerm) return true
        const q = searchTerm.toLowerCase()
        return r.route_number.toLowerCase().includes(q) ||
            r.driver_name?.toLowerCase().includes(q) ||
            r.vehicle_plate?.toLowerCase().includes(q)
    })

    // Status summary counts
    const counts = {
        all: data.length,
        draft: data.filter(r => r.status === 'draft').length,
        optimized: data.filter(r => r.status === 'optimized').length,
        confirmed: data.filter(r => r.status === 'confirmed').length,
        in_progress: data.filter(r => r.status === 'in_progress').length,
        completed: data.filter(r => r.status === 'completed').length,
        cancelled: data.filter(r => r.status === 'cancelled').length,
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2 tracking-tight">
                        <Route className="h-6 w-6" /> Central de Rotas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Gerencie e acompanhe todas as rotas de entrega
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Link href="/admin/logistica/pedidos">
                        <Button className="gap-2 h-9">
                            <Plus className="h-4 w-4" /> Nova Rota
                        </Button>
                    </Link>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Status tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
                {[
                    { key: 'all', label: 'Todas' },
                    { key: 'draft', label: 'Rascunho' },
                    { key: 'optimized', label: 'Otimizada' },
                    { key: 'confirmed', label: 'Confirmada' },
                    { key: 'in_progress', label: 'Em Andamento' },
                    { key: 'completed', label: 'Concluída' },
                    { key: 'cancelled', label: 'Cancelada' },
                ].map(tab => (
                    <button key={tab.key}
                        className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition border',
                            statusFilter === tab.key
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-muted-foreground border-slate-200 hover:border-slate-300 hover:text-foreground'
                        )}
                        onClick={() => { setStatusFilter(tab.key); setPagination((prev) => ({ ...prev, page: 1 })) }}>
                        {tab.label}
                        <span className={cn('ml-1 text-[10px]', statusFilter === tab.key ? 'text-indigo-200' : 'text-muted-foreground/50')}>
                            {tab.key === 'all' ? pagination.total : counts[tab.key as keyof typeof counts] || 0}
                        </span>
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Buscar por número, motorista, placa..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            {/* Routes List */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center">
                    <Route className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhuma rota encontrada.</p>
                    <Link href="/admin/logistica/pedidos">
                        <Button variant="outline" size="sm" className="mt-3 gap-1"><Plus className="h-3 w-3" /> Criar primeira rota</Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((route) => {
                        const st = statusConfig[route.status] || statusConfig.draft
                        const StatusIcon = st.icon
                        return (
                            <Link key={route.id} href={`/admin/logistica/rotas/${route.id}`} className="block">
                                <div className="rounded-xl border bg-white p-4 hover:shadow-md hover:border-indigo-200/60 transition-all duration-200 group cursor-pointer">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm group-hover:shadow-md transition">
                                                {route.route_number.replace('ROT', '')}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-bold text-navy group-hover:text-indigo-700 transition">{route.route_number}</h3>
                                                    <Badge variant="outline" className={cn('text-[10px] font-bold rounded-full gap-0.5 border', st.color)}>
                                                        <StatusIcon className="h-2.5 w-2.5" />
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
                                                            <Route className="h-3 w-3" /> {route.total_distance_km} km
                                                        </span>
                                                    )}
                                                    {route.total_duration_min && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" /> {Math.round(route.total_duration_min)} min
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
                                                <Button variant="outline" size="icon" className="h-8 w-8 group-hover:border-indigo-200" title="Ver detalhes" onClick={(e) => e.stopPropagation()}>
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-8 w-8 group-hover:border-indigo-200"
                                                    title="Editar sequencia"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        router.push(`/admin/logistica/rotas/${route.id}?tab=stops`)
                                                    }}
                                                >
                                                    <Route className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-600 hover:bg-red-50"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(route) }} title="Excluir">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                    <div className="rounded-xl border bg-white px-4 py-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                            Pagina {pagination.page} de {pagination.totalPages} • {pagination.total} rotas
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

            {/* Delete Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Rota da Operação?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A rota <strong>{deleteTarget?.route_number}</strong> será removida da operação por exclusão lógica.
                            O histórico técnico e de auditoria será preservado.
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


