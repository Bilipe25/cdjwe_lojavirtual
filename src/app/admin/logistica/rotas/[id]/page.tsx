'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    Route,
    MapPin,
    Truck,
    UserCircle,
    Calendar,
    Clock,
    CheckCircle2,
    XCircle,
    Zap,
    Play,
    Flag,
    Ban,
    RefreshCw,
    Package,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
import { getRouteDetail, updateRouteStatus, updateStopStatus } from '../../actions'

const routeStatusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    optimized: { label: 'Otimizada', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    confirmed: { label: 'Confirmada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    in_progress: { label: 'Em Andamento', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    completed: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-600 border-red-200' },
}

const stopStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Pendente', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: Clock },
    arrived: { label: 'Chegou', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: MapPin },
    delivered: { label: 'Entregue', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    failed: { label: 'Insucesso', color: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
    skipped: { label: 'Pulada', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: Ban },
}

export default function RouteDetailPage() {
    const params = useParams()
    const router = useRouter()
    const routeId = params.id as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [route, setRoute] = useState<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [stops, setStops] = useState<any[]>([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [events, setEvents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [confirmAction, setConfirmAction] = useState<{ type: string; label: string; newStatus: string } | null>(null)
    const [optimizing, setOptimizing] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRouteDetail(routeId)
        if (res.error) { setError(res.error); setLoading(false); return }
        if (res.data) {
            setRoute(res.data.route)
            setStops(res.data.stops)
            setEvents(res.data.events)
        }
        setLoading(false)
    }, [routeId])

    useEffect(() => { void loadData() }, [loadData])

    const handleStatusChange = async (newStatus: string) => {
        setActionLoading(true)
        setError(null)
        const res = await updateRouteStatus(routeId, newStatus)
        setActionLoading(false)
        setConfirmAction(null)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const handleStopStatus = async (stopId: string, status: 'delivered' | 'failed') => {
        setActionLoading(true)
        const res = await updateStopStatus(stopId, status)
        setActionLoading(false)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const handleOptimize = async () => {
        if (!route) return

        const center = route.route_centers
        if (!center?.latitude || !center?.longitude) {
            setError('O centro de saída não possui coordenadas. Geocodifique o centro primeiro.')
            return
        }

        const validStops = stops.filter((s: { latitude: number | null; longitude: number | null }) => s.latitude && s.longitude)
        if (validStops.length === 0) {
            setError('Nenhuma parada possui coordenadas. Geocodifique os endereços antes de otimizar.')
            return
        }

        setOptimizing(true)
        setError(null)
        try {
            const response = await fetch('/api/logistics/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    center: { lat: center.latitude, lng: center.longitude },
                    stops: validStops.map((s: { id: string; latitude: number; longitude: number; estimated_service_min: number; priority: string }) => ({
                        id: s.id,
                        lat: s.latitude,
                        lng: s.longitude,
                        serviceTime: s.estimated_service_min || 15,
                        priority: s.priority === 'urgent' ? 100 : s.priority === 'high' ? 75 : s.priority === 'low' ? 25 : 50,
                    })),
                    vehicle: route.vehicles ? {
                        capacityKg: route.vehicles.capacity_kg,
                        maxStops: route.vehicles.max_stops,
                    } : undefined,
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                setError(result.error || 'Erro na otimização.')
                setOptimizing(false)
                return
            }

            // Update route status to optimized
            await updateRouteStatus(routeId, 'optimized')
            void loadData()
        } catch (e) {
            setError('Erro ao otimizar rota: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
        }
        setOptimizing(false)
    }

    const formatDate = (d: string) => {
        try {
            return new Date(d).toLocaleDateString('pt-BR')
        } catch {
            return d
        }
    }

    const formatDateTime = (d: string) => {
        try {
            return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        } catch {
            return d
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64 rounded-xl" />
                <div className="grid gap-4 sm:grid-cols-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
                <Skeleton className="h-60 rounded-xl" />
            </div>
        )
    }

    if (!route) {
        return (
            <div className="space-y-4">
                <Link href="/admin/logistica/rotas">
                    <Button variant="ghost" className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
                </Link>
                <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                    Rota não encontrada.
                </div>
            </div>
        )
    }

    const st = routeStatusConfig[route.status] || routeStatusConfig.draft

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link href="/admin/logistica/rotas">
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-black text-navy">{route.route_number}</h1>
                            <Badge variant="outline" className={cn('text-xs font-semibold rounded-full px-3 py-0.5', st.color)}>
                                {st.label}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" /> {formatDate(route.planned_date)}
                            {route.route_centers?.name && (
                                <><span className="text-muted-foreground/40">•</span><MapPin className="h-3.5 w-3.5" /> {route.route_centers.name}</>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>

                    {route.status === 'draft' && (
                        <Button size="sm" className="gap-1.5" onClick={handleOptimize} disabled={optimizing}>
                            <Zap className="h-3.5 w-3.5" />
                            {optimizing ? 'Otimizando...' : 'Otimizar'}
                        </Button>
                    )}
                    {['draft', 'optimized'].includes(route.status) && (
                        <Button size="sm" variant="outline" className="gap-1.5"
                            onClick={() => setConfirmAction({ type: 'confirm', label: 'Confirmar rota?', newStatus: 'confirmed' })}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
                        </Button>
                    )}
                    {route.status === 'confirmed' && (
                        <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => setConfirmAction({ type: 'start', label: 'Iniciar rota?', newStatus: 'in_progress' })}>
                            <Play className="h-3.5 w-3.5" /> Iniciar
                        </Button>
                    )}
                    {route.status === 'in_progress' && (
                        <Button size="sm" className="gap-1.5"
                            onClick={() => setConfirmAction({ type: 'complete', label: 'Concluir rota?', newStatus: 'completed' })}>
                            <Flag className="h-3.5 w-3.5" /> Concluir
                        </Button>
                    )}
                    {!['completed', 'cancelled'].includes(route.status) && (
                        <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setConfirmAction({ type: 'cancel', label: 'Cancelar rota?', newStatus: 'cancelled' })}>
                            <Ban className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Paradas</p>
                    <p className="text-2xl font-black text-navy">{route.total_stops}</p>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Distância</p>
                    <p className="text-2xl font-black text-navy">{route.total_distance_km ? `${route.total_distance_km} km` : '—'}</p>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Duração Est.</p>
                    <p className="text-2xl font-black text-navy">{route.total_duration_min ? `${Math.round(route.total_duration_min)} min` : '—'}</p>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Peso Total</p>
                    <p className="text-2xl font-black text-navy">{route.total_weight_kg ? `${route.total_weight_kg} kg` : '—'}</p>
                </div>
            </div>

            {/* Assignment Info */}
            <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                        <UserCircle className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Motorista</p>
                        <p className="font-semibold text-navy text-sm">{route.drivers?.profiles?.full_name || 'Não atribuído'}{route.drivers?.phone ? ` • ${route.drivers.phone}` : ''}</p>
                    </div>
                </div>
                <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Truck className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Veículo</p>
                        <p className="font-semibold text-navy text-sm">{route.vehicles ? `${route.vehicles.plate} - ${route.vehicles.name}` : 'Não atribuído'}</p>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Stops */}
            <div>
                <h2 className="text-lg font-bold text-navy mb-3 flex items-center gap-2">
                    <Route className="h-5 w-5" /> Paradas ({stops.length})
                </h2>
                <div className="space-y-2">
                    {stops.map((stop, idx) => {
                        const stopSt = stopStatusConfig[stop.status] || stopStatusConfig.pending
                        const StopIcon = stopSt.icon
                        return (
                            <div key={stop.id} className="rounded-xl border bg-white p-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex flex-col items-center gap-1 pt-0.5">
                                        <div className={cn(
                                            'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                                            stop.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                                            stop.status === 'failed' ? 'bg-red-100 text-red-600' :
                                            'bg-slate-100 text-slate-600'
                                        )}>
                                            {idx + 1}
                                        </div>
                                        {idx < stops.length - 1 && (
                                            <div className="w-px h-4 bg-slate-200" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-navy text-sm truncate">{stop.customer_name}</p>
                                            <Badge variant="outline" className={cn('text-[9px] font-semibold rounded-full gap-0.5', stopSt.color)}>
                                                <StopIcon className="h-2.5 w-2.5" />
                                                {stopSt.label}
                                            </Badge>
                                            {stop.priority !== 'normal' && (
                                                <Badge variant="secondary" className="text-[9px] rounded-full">
                                                    {stop.priority === 'urgent' ? '🔴 Urgente' : stop.priority === 'high' ? '🟡 Alta' : '⚪ Baixa'}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{stop.address_snapshot || '—'}</p>
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                                            <span className="flex items-center gap-0.5">
                                                <Package className="h-2.5 w-2.5" /> {stop.orders?.order_number || '—'}
                                            </span>
                                            {stop.orders?.total && (
                                                <span>R$ {Number(stop.orders.total).toFixed(2)}</span>
                                            )}
                                            {stop.delivered_at && (
                                                <span className="flex items-center gap-0.5">
                                                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" /> {formatDateTime(stop.delivered_at)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {route.status === 'in_progress' && stop.status === 'pending' && (
                                        <div className="flex gap-1 shrink-0">
                                            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                onClick={() => void handleStopStatus(stop.id, 'delivered')} disabled={actionLoading}>
                                                <CheckCircle2 className="h-3 w-3" /> Entregue
                                            </Button>
                                            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                                onClick={() => void handleStopStatus(stop.id, 'failed')} disabled={actionLoading}>
                                                <XCircle className="h-3 w-3" /> Insucesso
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Events Timeline */}
            {events.length > 0 && (
                <>
                    <Separator />
                    <div>
                        <h2 className="text-lg font-bold text-navy mb-3">Histórico</h2>
                        <div className="space-y-2">
                            {events.slice(0, 10).map((ev) => (
                                <div key={ev.id} className="flex items-start gap-3 text-xs">
                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <div>
                                        <span className="font-medium text-navy">{ev.event_type.replace(/_/g, ' ')}</span>
                                        {ev.profiles?.full_name && <span className="text-muted-foreground"> por {ev.profiles.full_name}</span>}
                                        <span className="text-muted-foreground ml-2">{formatDateTime(ev.created_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Status Change Confirm Dialog */}
            <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação alterará o status da rota para <strong>{routeStatusConfig[confirmAction?.newStatus || '']?.label}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); void handleStatusChange(confirmAction!.newStatus) }}
                            disabled={actionLoading}
                            className={cn(confirmAction?.type === 'cancel' && 'bg-red-600 hover:bg-red-700 text-white')}
                        >
                            {actionLoading ? 'Processando...' : 'Confirmar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
