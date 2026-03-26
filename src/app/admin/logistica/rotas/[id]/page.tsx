'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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
    Navigation,
    Timer,
    Weight,
    Hash,
    Pencil,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    getRouteDetail,
    updateRouteStatus,
    updateStopStatus,
    applyOptimizationResult,
    updateRouteAssignment,
    getDrivers,
    getVehicles,
    getCenters,
    updateStopCoordinates,
} from '../../actions'

// Dynamic import of map and geocode picker to avoid SSR issues
const RouteMap = dynamic(() => import('@/components/logistics/route-map'), { ssr: false })
const GeocodePickerDialog = dynamic(() => import('@/components/logistics/geocode-picker-dialog'), { ssr: false })

const routeStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'Rascunho', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' },
    optimized: { label: 'Otimizada', color: 'text-indigo-700', bg: 'bg-indigo-100 border-indigo-200' },
    confirmed: { label: 'Confirmada', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-200' },
    in_progress: { label: 'Em Andamento', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-200' },
    completed: { label: 'Concluída', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'text-red-600', bg: 'bg-red-100 border-red-200' },
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
    const [activeTab, setActiveTab] = useState<'stops' | 'map' | 'timeline'>('stops')
    // Inline editing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [driversList, setDriversList] = useState<any[]>([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [vehiclesList, setVehiclesList] = useState<any[]>([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [centersList, setCentersList] = useState<any[]>([])
    const [assignSaving, setAssignSaving] = useState(false)
    // Failure dialog
    const [failureDialog, setFailureDialog] = useState<{ stopId: string; customerName: string } | null>(null)
    const [failureReason, setFailureReason] = useState('')
    // Geocode dialog
    const [geocodeDialog, setGeocodeDialog] = useState<{ stopId: string; customerName: string; address: string; addressId?: string; lat: number | null; lng: number | null } | null>(null)

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

    useEffect(() => {
        const loadResources = async () => {
            const [d, v, c] = await Promise.all([getDrivers(), getVehicles(), getCenters()])
            if ('data' in d && d.data) setDriversList(d.data)
            if ('data' in v && v.data) setVehiclesList(v.data)
            if ('data' in c && c.data) setCentersList(c.data)
        }
        void loadResources()
    }, [])

    const handleStatusChange = async (newStatus: string) => {
        setActionLoading(true)
        setError(null)
        const res = await updateRouteStatus(routeId, newStatus)
        setActionLoading(false)
        setConfirmAction(null)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const handleStopStatus = async (stopId: string, status: 'delivered' | 'failed', reason?: string) => {
        setActionLoading(true)
        const res = await updateStopStatus(stopId, status, reason ? { failureReason: reason } : undefined)
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

            const persistRes = await applyOptimizationResult(routeId, result)
            if ('error' in persistRes && persistRes.error) {
                setError(persistRes.error)
            } else {
                void loadData()
            }
        } catch (e) {
            setError('Erro ao otimizar rota: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
        }
        setOptimizing(false)
    }

    const handleAssignmentChange = async (field: string, value: string | null) => {
        setAssignSaving(true)
        setError(null)
        const res = await updateRouteAssignment(routeId, { [field]: value || null })
        setAssignSaving(false)
        if ('error' in res && res.error) setError(res.error)
        else void loadData()
    }

    const handleFailureSubmit = async () => {
        if (!failureDialog) return
        await handleStopStatus(failureDialog.stopId, 'failed', failureReason)
        setFailureDialog(null)
        setFailureReason('')
    }

    const formatDate = (d: string) => {
        try { return new Date(d).toLocaleDateString('pt-BR') }
        catch { return d }
    }

    const formatDateTime = (d: string) => {
        try { return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }
        catch { return d }
    }

    const isEditable = route && ['draft', 'optimized'].includes(route.status)

    // Compute progress
    const deliveredCount = stops.filter(s => s.status === 'delivered').length
    const failedCount = stops.filter(s => s.status === 'failed').length
    const completedCount = deliveredCount + failedCount
    const progressPct = stops.length > 0 ? Math.round((completedCount / stops.length) * 100) : 0

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-72 rounded-xl" />
                <div className="grid gap-4 sm:grid-cols-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-[400px] rounded-xl" />
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
        <div className="space-y-5">
            {/* ===== HEADER ===== */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/logistica/rotas">
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight">{route.route_number}</h1>
                                <Badge variant="outline" className={cn('text-xs font-bold rounded-full px-3 py-0.5 border', st.bg, st.color)}>
                                    {st.label}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(route.planned_date)}</span>
                                {route.route_centers?.name && (
                                    <><span className="text-muted-foreground/30">•</span><span className="flex items-center gap-1"><Navigation className="h-3 w-3" /> {route.route_centers.name}</span></>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => void loadData()}>
                            <RefreshCw className="h-3 w-3" /> Atualizar
                        </Button>

                        {route.status === 'draft' && (
                            <Button size="sm" className="h-8 gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleOptimize} disabled={optimizing}>
                                <Zap className="h-3 w-3" />
                                {optimizing ? 'Otimizando...' : 'Otimizar Rota'}
                            </Button>
                        )}
                        {['draft', 'optimized'].includes(route.status) && (
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                                onClick={() => setConfirmAction({ type: 'confirm', label: 'Confirmar rota?', newStatus: 'confirmed' })}>
                                <CheckCircle2 className="h-3 w-3" /> Confirmar
                            </Button>
                        )}
                        {route.status === 'confirmed' && (
                            <Button size="sm" className="h-8 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => setConfirmAction({ type: 'start', label: 'Iniciar rota?', newStatus: 'in_progress' })}>
                                <Play className="h-3 w-3" /> Iniciar
                            </Button>
                        )}
                        {route.status === 'in_progress' && (
                            <Button size="sm" className="h-8 gap-1 text-xs"
                                onClick={() => setConfirmAction({ type: 'complete', label: 'Concluir rota?', newStatus: 'completed' })}>
                                <Flag className="h-3 w-3" /> Concluir
                            </Button>
                        )}
                        {!['completed', 'cancelled'].includes(route.status) && (
                            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setConfirmAction({ type: 'cancel', label: 'Cancelar rota?', newStatus: 'cancelled' })}>
                                <Ban className="h-3 w-3" /> Cancelar
                            </Button>
                        )}
                    </div>
                </div>

                {/* Progress bar for in_progress routes */}
                {route.status === 'in_progress' && stops.length > 0 && (
                    <div className="rounded-xl border bg-white p-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-medium text-navy">Progresso da Rota</span>
                            <span className="text-muted-foreground">{completedCount} de {stops.length} paradas • <span className="font-bold text-navy">{progressPct}%</span></span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                    width: `${progressPct}%`,
                                    background: `linear-gradient(90deg, #10b981 ${deliveredCount > 0 ? (deliveredCount / completedCount * 100) : 100}%, #ef4444 100%)`,
                                }}
                            />
                        </div>
                        <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> {deliveredCount} entregas</span>
                            <span className="flex items-center gap-1"><XCircle className="h-2.5 w-2.5 text-red-500" /> {failedCount} insucessos</span>
                            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {stops.length - completedCount} pendentes</span>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* ===== KPI CARDS ===== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-white p-4 group hover:shadow-sm transition">
                    <div className="flex items-center gap-2 mb-1">
                        <Hash className="h-3.5 w-3.5 text-blue-500" />
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Paradas</p>
                    </div>
                    <p className="text-2xl font-black text-navy">{route.total_stops}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 group hover:shadow-sm transition">
                    <div className="flex items-center gap-2 mb-1">
                        <Navigation className="h-3.5 w-3.5 text-indigo-500" />
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Distância</p>
                    </div>
                    <p className="text-2xl font-black text-navy">{route.total_distance_km ? `${route.total_distance_km}` : '—'}</p>
                    {route.total_distance_km && <p className="text-[10px] text-muted-foreground">quilômetros</p>}
                </div>
                <div className="rounded-xl border bg-white p-4 group hover:shadow-sm transition">
                    <div className="flex items-center gap-2 mb-1">
                        <Timer className="h-3.5 w-3.5 text-amber-500" />
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Duração Est.</p>
                    </div>
                    <p className="text-2xl font-black text-navy">{route.total_duration_min ? `${Math.round(route.total_duration_min)}` : '—'}</p>
                    {route.total_duration_min && <p className="text-[10px] text-muted-foreground">minutos</p>}
                </div>
                <div className="rounded-xl border bg-white p-4 group hover:shadow-sm transition">
                    <div className="flex items-center gap-2 mb-1">
                        <Weight className="h-3.5 w-3.5 text-emerald-500" />
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Peso Total</p>
                    </div>
                    <p className="text-2xl font-black text-navy">{route.total_weight_kg ? `${route.total_weight_kg}` : '—'}</p>
                    {route.total_weight_kg && <p className="text-[10px] text-muted-foreground">kg</p>}
                </div>
            </div>

            {/* ===== ASSIGNMENT CARDS — Inline Editable ===== */}
            <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><UserCircle className="h-4 w-4" /></div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Motorista</p>
                        {isEditable && <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 ml-auto" />}
                    </div>
                    {isEditable ? (
                        <select className="w-full text-sm font-semibold text-navy border rounded-lg px-2.5 py-2 bg-slate-50/80 focus:ring-2 focus:ring-blue-200 transition" value={route.driver_id || ''} onChange={(e) => void handleAssignmentChange('driver_id', e.target.value || null)} disabled={assignSaving}>
                            <option value="">Selecionar motorista</option>
                            {driversList.map((d: { id: string; profile_name: string }) => (<option key={d.id} value={d.id}>{d.profile_name}</option>))}
                        </select>
                    ) : (
                        <p className="font-semibold text-navy text-sm">{route.drivers?.profiles?.full_name || <span className="text-muted-foreground/40">Não atribuído</span>}</p>
                    )}
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600"><Truck className="h-4 w-4" /></div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Veículo</p>
                        {isEditable && <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 ml-auto" />}
                    </div>
                    {isEditable ? (
                        <select className="w-full text-sm font-semibold text-navy border rounded-lg px-2.5 py-2 bg-slate-50/80 focus:ring-2 focus:ring-indigo-200 transition" value={route.vehicle_id || ''} onChange={(e) => void handleAssignmentChange('vehicle_id', e.target.value || null)} disabled={assignSaving}>
                            <option value="">Selecionar veículo</option>
                            {vehiclesList.map((v: { id: string; plate: string; name: string }) => (<option key={v.id} value={v.id}>{v.plate} - {v.name}</option>))}
                        </select>
                    ) : (
                        <p className="font-semibold text-navy text-sm">{route.vehicles ? `${route.vehicles.plate} - ${route.vehicles.name}` : <span className="text-muted-foreground/40">Não atribuído</span>}</p>
                    )}
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600"><Navigation className="h-4 w-4" /></div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Centro de Saída</p>
                        {isEditable && <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 ml-auto" />}
                    </div>
                    {isEditable ? (
                        <select className="w-full text-sm font-semibold text-navy border rounded-lg px-2.5 py-2 bg-slate-50/80 focus:ring-2 focus:ring-purple-200 transition" value={route.center_id || ''} onChange={(e) => void handleAssignmentChange('center_id', e.target.value || null)} disabled={assignSaving}>
                            <option value="">Selecionar centro</option>
                            {centersList.map((c: { id: string; name: string; city: string }) => (<option key={c.id} value={c.id}>{c.name} - {c.city}</option>))}
                        </select>
                    ) : (
                        <p className="font-semibold text-navy text-sm">{route.route_centers?.name || <span className="text-muted-foreground/40">Não atribuído</span>}</p>
                    )}
                </div>
            </div>

            {/* ===== TABS: Paradas | Mapa | Histórico ===== */}
            <div className="rounded-xl border bg-white overflow-hidden">
                <div className="flex border-b">
                    {[
                        { key: 'stops' as const, label: 'Paradas', icon: Route, count: stops.length },
                        { key: 'map' as const, label: 'Mapa', icon: MapPin },
                        { key: 'timeline' as const, label: 'Histórico', icon: Clock, count: events.length },
                    ].map(tab => (
                        <button key={tab.key}
                            className={cn(
                                'flex items-center gap-1.5 px-4 sm:px-6 py-3 text-sm font-medium transition border-b-2 -mb-px',
                                activeTab === tab.key
                                    ? 'border-indigo-600 text-indigo-700'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300'
                            )}
                            onClick={() => setActiveTab(tab.key)}>
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                                    activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                                )}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* === STOPS TAB === */}
                {activeTab === 'stops' && (
                    <div className="divide-y">
                        {stops.length === 0 ? (
                            <div className="p-12 text-center text-sm text-muted-foreground">Nenhuma parada nesta rota.</div>
                        ) : stops.map((stop, idx) => {
                            const stopSt = stopStatusConfig[stop.status] || stopStatusConfig.pending
                            const StopIcon = stopSt.icon
                            const isActive = route.status === 'in_progress' && stop.status === 'pending'
                            return (
                                <div key={stop.id} className={cn('flex items-start gap-3 p-4 transition', isActive && 'bg-blue-50/30')}>
                                    {/* Position badge */}
                                    <div className="flex flex-col items-center gap-1 pt-0.5">
                                        <div className={cn(
                                            'h-8 w-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border-2',
                                            stop.status === 'delivered' ? 'bg-emerald-500 text-white border-emerald-500' :
                                            stop.status === 'failed' ? 'bg-red-500 text-white border-red-500' :
                                            isActive ? 'bg-blue-500 text-white border-blue-500 animate-pulse' :
                                            'bg-white text-slate-500 border-slate-200'
                                        )}>
                                            {stop.status === 'delivered' ? <CheckCircle2 className="h-4 w-4" /> :
                                             stop.status === 'failed' ? <XCircle className="h-4 w-4" /> :
                                             idx + 1}
                                        </div>
                                        {idx < stops.length - 1 && (
                                            <div className={cn('w-0.5 h-6', stop.status === 'delivered' ? 'bg-emerald-200' : stop.status === 'failed' ? 'bg-red-200' : 'bg-slate-200')} />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-navy text-sm">{stop.customer_name}</p>
                                            <Badge variant="outline" className={cn('text-[9px] font-bold rounded-full gap-0.5 border', stopSt.color)}>
                                                <StopIcon className="h-2.5 w-2.5" />
                                                {stopSt.label}
                                            </Badge>
                                            {stop.priority !== 'normal' && (
                                                <Badge variant="secondary" className="text-[9px] rounded-full">
                                                    {stop.priority === 'urgent' ? '🔴 Urgente' : stop.priority === 'high' ? '🟡 Alta' : '⚪ Baixa'}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 flex items-center gap-1.5">
                                            {stop.address_snapshot || '—'}
                                            {stop.latitude && stop.longitude ? (
                                                <Badge variant="outline" className="text-[8px] rounded-full text-emerald-600 border-emerald-200 shrink-0">📍 Geocod.</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[8px] rounded-full text-amber-600 border-amber-200 shrink-0">⚠ Sem coord.</Badge>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                                            <span className="flex items-center gap-0.5"><Package className="h-2.5 w-2.5" /> {stop.orders?.order_number || '—'}</span>
                                            {stop.orders?.total && <span className="font-semibold text-navy">R$ {Number(stop.orders.total).toFixed(2)}</span>}
                                            {stop.estimated_service_min && <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" /> {stop.estimated_service_min} min</span>}
                                            {stop.delivered_at && <span className="flex items-center gap-0.5 text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5" /> {formatDateTime(stop.delivered_at)}</span>}
                                            {stop.failure_reason && <span className="text-red-500">{stop.failure_reason}</span>}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                                        {/* Geocode button */}
                                        {isEditable && (
                                            <Button size="sm" variant="outline"
                                                className={cn('h-8 text-xs gap-1',
                                                    stop.latitude && stop.longitude
                                                        ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                                        : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                                                )}
                                                onClick={() => setGeocodeDialog({
                                                    stopId: stop.id,
                                                    customerName: stop.customer_name,
                                                    address: stop.address_snapshot || '',
                                                    addressId: stop.address_id || undefined,
                                                    lat: stop.latitude ? Number(stop.latitude) : null,
                                                    lng: stop.longitude ? Number(stop.longitude) : null,
                                                })}
                                            >
                                                <MapPin className="h-3 w-3" />
                                                {stop.latitude && stop.longitude ? 'Regeocod.' : 'Geocodificar'}
                                            </Button>
                                        )}
                                        {/* Delivery actions */}
                                        {isActive && (
                                            <>
                                                <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                    onClick={() => void handleStopStatus(stop.id, 'delivered')} disabled={actionLoading}>
                                                    <CheckCircle2 className="h-3 w-3" /> Entregue
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                                    onClick={() => setFailureDialog({ stopId: stop.id, customerName: stop.customer_name })} disabled={actionLoading}>
                                                    <XCircle className="h-3 w-3" /> Insucesso
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* === MAP TAB === */}
                {activeTab === 'map' && (
                    <div className="p-4">
                        <RouteMap
                            center={route.route_centers?.latitude && route.route_centers?.longitude ? {
                                lat: Number(route.route_centers.latitude),
                                lng: Number(route.route_centers.longitude),
                            } : null}
                            stops={stops.map((s: { id: string; stop_position: number; latitude: number | null; longitude: number | null; customer_name: string; status: string; address_snapshot: string }) => ({
                                id: s.id,
                                position: s.stop_position,
                                latitude: s.latitude ? Number(s.latitude) : null,
                                longitude: s.longitude ? Number(s.longitude) : null,
                                customer_name: s.customer_name,
                                status: s.status,
                                address_snapshot: s.address_snapshot,
                            }))}
                            polyline={route.route_polyline}
                            height="500px"
                        />
                        {stops.filter(s => !s.latitude || !s.longitude).length > 0 && (
                            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                                ⚠ {stops.filter(s => !s.latitude || !s.longitude).length} parada(s) sem coordenadas — não exibidas no mapa.
                            </div>
                        )}
                    </div>
                )}

                {/* === TIMELINE TAB === */}
                {activeTab === 'timeline' && (
                    <div className="p-4">
                        {events.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">Nenhum evento registrado.</div>
                        ) : (
                            <div className="relative">
                                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200" />
                                <div className="space-y-4">
                                    {events.map((ev) => {
                                        const isDelivery = ev.event_type.includes('delivered')
                                        const isFail = ev.event_type.includes('failed')
                                        const isRoute = ev.event_type.startsWith('route_')
                                        return (
                                            <div key={ev.id} className="flex items-start gap-3 relative">
                                                <div className={cn(
                                                    'h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center shrink-0 z-10',
                                                    isDelivery ? 'bg-emerald-500 border-emerald-500 text-white' :
                                                    isFail ? 'bg-red-500 border-red-500 text-white' :
                                                    isRoute ? 'bg-indigo-500 border-indigo-500 text-white' :
                                                    'bg-white border-slate-300'
                                                )}>
                                                    {isDelivery ? <CheckCircle2 className="h-2.5 w-2.5" /> :
                                                     isFail ? <XCircle className="h-2.5 w-2.5" /> :
                                                     isRoute ? <Route className="h-2.5 w-2.5" /> :
                                                     <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
                                                </div>
                                                <div className="pt-0.5">
                                                    <p className="text-xs">
                                                        <span className="font-semibold text-navy capitalize">{ev.event_type.replace(/_/g, ' ')}</span>
                                                        {ev.profiles?.full_name && <span className="text-muted-foreground"> por {ev.profiles.full_name}</span>}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">{formatDateTime(ev.created_at)}</p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ===== DIALOGS ===== */}

            {/* Failure Reason Dialog */}
            <Dialog open={!!failureDialog} onOpenChange={(o) => { if (!o) { setFailureDialog(null); setFailureReason('') } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" /> Registrar Insucesso
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <p className="text-sm text-muted-foreground">
                            Parada: <strong className="text-navy">{failureDialog?.customerName}</strong>
                        </p>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Motivo do insucesso</label>
                            <Textarea
                                value={failureReason}
                                onChange={(e) => setFailureReason(e.target.value)}
                                placeholder="Descreva o motivo: cliente ausente, recusa, endereço não encontrado..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setFailureDialog(null); setFailureReason('') }}>Cancelar</Button>
                        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleFailureSubmit} disabled={actionLoading}>
                            {actionLoading ? 'Salvando...' : 'Registrar Insucesso'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
            {/* Geocode Picker Dialog */}
            {geocodeDialog && (
                <GeocodePickerDialog
                    open={!!geocodeDialog}
                    onOpenChange={(o) => { if (!o) setGeocodeDialog(null) }}
                    stopId={geocodeDialog.stopId}
                    customerName={geocodeDialog.customerName}
                    address={geocodeDialog.address}
                    addressId={geocodeDialog.addressId}
                    initialLat={geocodeDialog.lat}
                    initialLng={geocodeDialog.lng}
                    onConfirm={async (sid, lat, lng) => {
                        const res = await updateStopCoordinates(sid, lat, lng)
                        if ('error' in res && res.error) {
                            setError(res.error)
                        } else {
                            setGeocodeDialog(null)
                            void loadData()
                        }
                    }}
                />
            )}
        </div>
    )
}
