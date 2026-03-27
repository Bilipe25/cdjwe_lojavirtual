'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
    Globe,
    AlertTriangle,
    Loader2,
    Crosshair,
    Maximize2,
    Minimize2,
    Fuel,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
    updateRoutePolyline,
    updateStopMetrics,
    getDrivers,
    getVehicles,
    getCenters,
    updateStopCoordinates,
    getRouteCostEstimate,
} from '../../actions'

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
    const [cancelReason, setCancelReason] = useState('')
    const [optimizing, setOptimizing] = useState(false)
    const [activeTab, setActiveTab] = useState<'stops' | 'timeline' | 'costs'>('stops')
    // Cost Estimate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [costEstimate, setCostEstimate] = useState<any>(null)
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
    // Batch geocoding
    const [batchGeocoding, setBatchGeocoding] = useState(false)
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
    // Map integration
    const [highlightStopId, setHighlightStopId] = useState<string | null>(null)
    const [isMapExpanded, setIsMapExpanded] = useState(false)
    // Optimization result banner
    const [optimizationBanner, setOptimizationBanner] = useState<{ distance: number; duration: number; engine: string; stops: number } | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRouteDetail(routeId)
        if (res.error) setError(res.error)
        else if ('data' in res && res.data) {
            const rte = res.data.route
            const rawStops = res.data.stops
            // Enrich stops with per-stop distance/ETA data
            // Priority: 1) native DB columns, 2) directionsStops JSONB, 3) orderedStops JSONB
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dirStops = rte?.optimization_result?.directionsStops || []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const optStops = rte?.optimization_result?.orderedStops || []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enrichedStops = rawStops.map((s: any) => {
                // Try native DB columns first
                if (s.estimated_arrival_min > 0 && s.estimated_distance_km > 0) return s
                // Try directions leg data (real road distances)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dirFound = dirStops.find((ds: any) => ds.id === s.id)
                if (dirFound) {
                    s.estimated_arrival_min = dirFound.estimated_arrival_min || s.estimated_arrival_min
                    s.estimated_distance_km = dirFound.estimated_distance_km || s.estimated_distance_km
                    return s
                }
                // Fallback: Vroom optimizer data
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const optFound = optStops.find((os: any) => os.id === s.id)
                if (optFound) {
                    if (!s.estimated_arrival_min) s.estimated_arrival_min = Math.round((optFound.arrival || 0) / 60)
                    if (!s.estimated_distance_km) s.estimated_distance_km = optFound.distance
                }
                return s
            })

            setRoute(rte)
            setStops(enrichedStops)
            setEvents(res.data.events)

            // Fetch cost estimate
            const costRes = await getRouteCostEstimate(routeId)
            if (costRes.data) setCostEstimate(costRes.data)
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

    const handleStatusChange = async (newStatus: string, reason?: string) => {
        setActionLoading(true)
        setError(null)
        const res = await updateRouteStatus(routeId, newStatus, reason)
        setActionLoading(false)
        setConfirmAction(null)
        setCancelReason('')
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

    // Fetch real road directions for the ordered waypoints and save per-stop metrics
    const fetchDirections = async (
        centerCoords: { lat: number; lng: number },
        orderedStops: Array<{ id: string; lat: number; lng: number }>
    ) => {
        try {
            const waypoints = [
                centerCoords,
                ...orderedStops.map(s => ({ lat: s.lat, lng: s.lng })),
                centerCoords,
            ]

            const dirRes = await fetch('/api/logistics/directions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ waypoints }),
            })

            if (dirRes.ok) {
                const dirData = await dirRes.json()
                if (dirData.polyline) {
                    // Compute per-stop cumulative distances from legs
                    let stopMetrics: Array<{ id: string; estimated_distance_km: number; estimated_arrival_min: number }> = []
                    if (dirData.legs?.length && orderedStops.length > 0) {
                        let cumulativeKm = 0
                        let cumulativeMin = 0
                        for (let i = 0; i < orderedStops.length; i++) {
                            if (dirData.legs[i]) {
                                cumulativeKm += dirData.legs[i].distance_km
                                cumulativeMin += dirData.legs[i].duration_min
                            }
                            stopMetrics.push({
                                id: orderedStops[i].id,
                                estimated_distance_km: Math.round(cumulativeKm * 100) / 100,
                                estimated_arrival_min: Math.round(cumulativeMin),
                            })
                        }
                    }

                    // Save polyline, distance, duration AND per-stop metrics in one call
                    await updateRoutePolyline(
                        routeId,
                        dirData.polyline,
                        dirData.engine,
                        dirData.distance_km,
                        dirData.duration_min,
                        stopMetrics.length > 0 ? stopMetrics : undefined,
                    )

                    // Also try saving to native DB columns (works after migration 043)
                    if (stopMetrics.length > 0) {
                        await updateStopMetrics(stopMetrics).catch(() => { /* non-critical if columns don't exist */ })
                    }

                    return true
                }
            }
        } catch (e) {
            console.warn('[DIRECTIONS] Failed to fetch road geometry:', e)
        }
        return false
    }

    const handleRecalculateRoute = async () => {
        if (!route) return
        const center = route.route_centers
        if (!center?.latitude || !center?.longitude) return

        const validStops = stops
            .filter((s: { latitude: number | null; longitude: number | null }) => s.latitude && s.longitude)
            .sort((a: { stop_position: number }, b: { stop_position: number }) => a.stop_position - b.stop_position)

        if (validStops.length === 0) return

        setOptimizing(true)
        setError(null)
        const ok = await fetchDirections(
            { lat: Number(center.latitude), lng: Number(center.longitude) },
            validStops.map((s: { id: string; latitude: number; longitude: number }) => ({ id: s.id, lat: Number(s.latitude), lng: Number(s.longitude) }))
        )
        if (ok) {
            void loadData()
        } else {
            setError('Não foi possível calcular o trajeto real. Tente novamente.')
        }
        setOptimizing(false)
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
        setOptimizationBanner(null)
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
                // Show optimization banner
                setOptimizationBanner({
                    distance: result.summary.totalDistance,
                    duration: result.summary.totalDuration,
                    engine: result.engine,
                    stops: result.summary.totalStops,
                })

                // Step 2: Fetch real road directions for the optimized order
                const orderedIds = result.orderedStops
                    .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
                    .map((os: { id: string }) => os.id)
                const orderedWithIds = orderedIds.map((id: string) => {
                    const s = validStops.find((st: { id: string }) => st.id === id)
                    return s ? { id, lat: Number(s.latitude), lng: Number(s.longitude) } : null
                }).filter(Boolean)

                await fetchDirections(
                    { lat: Number(center.latitude), lng: Number(center.longitude) },
                    orderedWithIds
                )

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

    const handleBatchGeocode = async () => {
        const ungeocodedStops = stops.filter(s => !s.latitude || !s.longitude)
        if (ungeocodedStops.length === 0) return

        setBatchGeocoding(true)
        setBatchProgress({ done: 0, total: ungeocodedStops.length })

        for (let i = 0; i < ungeocodedStops.length; i++) {
            const stop = ungeocodedStops[i]
            try {
                const body: Record<string, string> = stop.address_id
                    ? { addressId: stop.address_id }
                    : { address: stop.address_snapshot || '' }

                const response = await fetch('/api/logistics/geocode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                const data = await response.json()
                if (response.ok && data.lat && data.lng) {
                    await updateStopCoordinates(stop.id, data.lat, data.lng)
                }
            } catch {
                // Skip failed geocodes
            }
            setBatchProgress({ done: i + 1, total: ungeocodedStops.length })
        }

        setBatchGeocoding(false)
        void loadData()
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

    // Readiness checks
    const hasCenter = route?.route_centers?.latitude && route?.route_centers?.longitude
    const geocodedStops = stops.filter(s => s.latitude && s.longitude).length
    const ungeocodedStops = stops.length - geocodedStops
    const hasVehicle = !!route?.vehicle_id
    const hasDriver = !!route?.driver_id
    const routeCenter = route?.route_centers

    // Map data (memoized to avoid expensive Leaflet remounts on unrelated renders)
    const mapCenter = useMemo(() => {
        if (!routeCenter?.latitude || !routeCenter?.longitude) return null
        return {
            lat: Number(routeCenter.latitude),
            lng: Number(routeCenter.longitude),
            name: routeCenter.name,
        }
    }, [routeCenter])

    const mapStops = useMemo(() => (
        stops.map((s: { id: string; stop_position: number; latitude: number | null; longitude: number | null; customer_name: string; status: string; address_snapshot: string; estimated_arrival_min?: number; estimated_distance_km?: number; orders?: { total?: number } }) => ({
            id: s.id,
            position: s.stop_position,
            latitude: s.latitude ? Number(s.latitude) : null,
            longitude: s.longitude ? Number(s.longitude) : null,
            customer_name: s.customer_name,
            status: s.status,
            address_snapshot: s.address_snapshot,
            estimated_arrival_min: s.estimated_arrival_min,
            estimated_distance_km: s.estimated_distance_km,
            order_total: s.orders?.total ? Number(s.orders.total) : null,
        }))
    ), [stops])

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
                                {(route.optimization_result?.engine || route.optimization_engine) && (() => {
                                    const eng = route.optimization_result?.engine || route.optimization_engine
                                    return (
                                        <Badge variant="outline" className="text-[9px] font-medium rounded-full px-2 py-0.5 border-indigo-200 text-indigo-600 bg-indigo-50">
                                            ⚡ {eng === 'osrm_nn' ? 'OSRM' : eng === 'ors_vroom' ? 'ORS Vroom' : eng}
                                        </Badge>
                                    )
                                })()}
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
                            <Button size="sm" className="h-8 gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleOptimize} disabled={optimizing || ungeocodedStops > 0}>
                                {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
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
                                onClick={() => { setCancelReason(''); setConfirmAction({ type: 'cancel', label: 'Cancelar rota?', newStatus: 'cancelled' }) }}>
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

            {/* ===== OPTIMIZATION READINESS (draft only) ===== */}
            {route.status === 'draft' && (
                <div className="rounded-xl border bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                            <Zap className="h-4 w-4 text-indigo-500" /> Prontidão para Otimização
                        </h3>
                        {ungeocodedStops > 0 && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                onClick={handleBatchGeocode} disabled={batchGeocoding}>
                                {batchGeocoding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                                {batchGeocoding ? `Geocodificando ${batchProgress.done}/${batchProgress.total}...` : `Geocodificar Todas (${ungeocodedStops})`}
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className={cn('rounded-lg border p-2.5 text-xs flex items-center gap-2', hasCenter ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200')}>
                            {hasCenter ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            <span className={hasCenter ? 'text-emerald-700' : 'text-red-600'}>Centro geocodificado</span>
                        </div>
                        <div className={cn('rounded-lg border p-2.5 text-xs flex items-center gap-2', ungeocodedStops === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}>
                            {ungeocodedStops === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                            <span className={ungeocodedStops === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                                {ungeocodedStops === 0 ? 'Todas geocodificadas' : `${ungeocodedStops} sem coordenadas`}
                            </span>
                        </div>
                        <div className={cn('rounded-lg border p-2.5 text-xs flex items-center gap-2', hasDriver ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
                            {hasDriver ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5 text-slate-400" />}
                            <span className={hasDriver ? 'text-emerald-700' : 'text-slate-500'}>Motorista</span>
                        </div>
                        <div className={cn('rounded-lg border p-2.5 text-xs flex items-center gap-2', hasVehicle ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
                            {hasVehicle ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5 text-slate-400" />}
                            <span className={hasVehicle ? 'text-emerald-700' : 'text-slate-500'}>Veículo</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Optimization result banner */}
            {optimizationBanner && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 flex items-center gap-4 text-sm">
                    <Zap className="h-5 w-5 text-indigo-600 shrink-0" />
                    <div className="flex-1">
                        <p className="font-bold text-indigo-800">Rota otimizada com sucesso!</p>
                        <p className="text-xs text-indigo-600 mt-0.5">
                            {optimizationBanner.distance} km • {Math.round(optimizationBanner.duration)} min • {optimizationBanner.stops} paradas •
                            Engine: {optimizationBanner.engine === 'osrm_nn' ? 'OSRM' : optimizationBanner.engine === 'ors_vroom' ? 'ORS Vroom' : optimizationBanner.engine}
                        </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] border-indigo-300 text-indigo-700" onClick={() => setOptimizationBanner(null)}>
                        Fechar
                    </Button>
                </div>
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
                        <Fuel className="h-3.5 w-3.5 text-emerald-500" />
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Custo Estimado</p>
                    </div>
                    <p className="text-2xl font-black text-navy">{costEstimate ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costEstimate.total_cost) : '—'}</p>
                    {costEstimate && <p className="text-[10px] text-muted-foreground">Operação total</p>}
                </div>
            </div>

            {/* ===== ASSIGNMENT CARDS ===== */}
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
                        <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><Truck className="h-4 w-4" /></div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Veículo</p>
                        {isEditable && <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 ml-auto" />}
                    </div>
                    {isEditable ? (
                        <select className="w-full text-sm font-semibold text-navy border rounded-lg px-2.5 py-2 bg-slate-50/80 focus:ring-2 focus:ring-amber-200 transition" value={route.vehicle_id || ''} onChange={(e) => void handleAssignmentChange('vehicle_id', e.target.value || null)} disabled={assignSaving}>
                            <option value="">Selecionar veículo</option>
                            {vehiclesList.map((v: { id: string; name: string; plate: string }) => (<option key={v.id} value={v.id}>{v.plate} - {v.name}</option>))}
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

            {/* ===== SPLIT-PANEL: Stops + Map ===== */}
            <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
                {/* LEFT: Tabs (Stops / Timeline) */}
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="flex border-b">
                        {[
                            { key: 'stops' as const, label: 'Paradas', icon: Route, count: stops.length },
                            { key: 'timeline' as const, label: 'Histórico', icon: Clock, count: events.length },
                            { key: 'costs' as const, label: 'Custos', icon: Fuel },
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
                        <div className="divide-y max-h-[600px] overflow-y-auto">
                            {stops.length === 0 ? (
                                <div className="p-12 text-center text-sm text-muted-foreground">Nenhuma parada nesta rota.</div>
                            ) : stops.map((stop: any, idx: number) => {
                                const stopSt = stopStatusConfig[stop.status] || stopStatusConfig.pending
                                const StopIcon = stopSt.icon
                                const isActive = route.status === 'in_progress' && stop.status === 'pending'
                                const isHighlighted = highlightStopId === stop.id
                                return (
                                    <div key={stop.id}
                                        className={cn('flex items-start gap-3 p-4 transition cursor-pointer hover:bg-indigo-50/30',
                                            isActive && 'bg-blue-50/30',
                                            isHighlighted && 'bg-indigo-50/50 ring-1 ring-indigo-200 ring-inset'
                                        )}
                                        onClick={() => setHighlightStopId(stop.id === highlightStopId ? null : stop.id)}
                                    >
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
                                                 stop.stop_position || idx + 1}
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
                                                {stop.address_snapshot?.replace(/\[.*?\]\s*/g, '') || '—'}
                                                {stop.latitude && stop.longitude ? (
                                                    <Badge variant="outline" className="text-[8px] rounded-full text-emerald-600 border-emerald-200 shrink-0">📍</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[8px] rounded-full text-amber-600 border-amber-200 shrink-0">⚠</Badge>
                                                )}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                                                <span className="flex items-center gap-0.5"><Package className="h-2.5 w-2.5" /> {stop.orders?.order_number || '—'}</span>
                                                {stop.orders?.total && <span className="font-semibold text-navy">R$ {Number(stop.orders.total).toFixed(2)}</span>}
                                                {stop.estimated_arrival_min != null && stop.estimated_arrival_min > 0 && <span className="flex items-center gap-0.5 text-indigo-600"><Timer className="h-2.5 w-2.5" /> ETA {stop.estimated_arrival_min} min</span>}
                                                {stop.estimated_distance_km != null && stop.estimated_distance_km > 0 && <span className="flex items-center gap-0.5"><Navigation className="h-2.5 w-2.5" /> {stop.estimated_distance_km} km</span>}
                                                {stop.delivered_at && <span className="flex items-center gap-0.5 text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5" /> {formatDateTime(stop.delivered_at)}</span>}
                                                {stop.failure_reason && <span className="text-red-500">{stop.failure_reason}</span>}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col gap-1.5 shrink-0">
                                            {isEditable && (
                                                <Button size="sm" variant="outline"
                                                    className={cn('h-7 text-[10px] gap-1',
                                                        stop.latitude && stop.longitude
                                                            ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                                            : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                                                    )}
                                                    onClick={(e) => { e.stopPropagation(); setGeocodeDialog({
                                                        stopId: stop.id,
                                                        customerName: stop.customer_name,
                                                        address: stop.address_snapshot || '',
                                                        addressId: stop.address_id || undefined,
                                                        lat: stop.latitude ? Number(stop.latitude) : null,
                                                        lng: stop.longitude ? Number(stop.longitude) : null,
                                                    })}}
                                                >
                                                    <Crosshair className="h-2.5 w-2.5" />
                                                    {stop.latitude && stop.longitude ? '📍' : 'Geocod.'}
                                                </Button>
                                            )}
                                            {isActive && (
                                                <>
                                                    <Button size="sm" className="h-7 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                        onClick={(e) => { e.stopPropagation(); void handleStopStatus(stop.id, 'delivered') }} disabled={actionLoading}>
                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Entregue
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                                        onClick={(e) => { e.stopPropagation(); setFailureDialog({ stopId: stop.id, customerName: stop.customer_name }) }} disabled={actionLoading}>
                                                        <XCircle className="h-2.5 w-2.5" /> Insucesso
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* === TIMELINE TAB === */}
                    {activeTab === 'timeline' && (
                        <div className="max-h-[600px] overflow-y-auto">
                            {events.length === 0 ? (
                                <div className="p-12 text-center text-sm text-muted-foreground">Nenhum evento registrado.</div>
                            ) : (
                                <div className="relative p-4">
                                    <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-slate-100" />
                                    <div className="space-y-4">
                                        {events.map((ev: any) => {
                                            const colors: Record<string, string> = {
                                                route_created: 'bg-blue-500',
                                                route_optimized: 'bg-indigo-500',
                                                route_confirmed: 'bg-green-500',
                                                route_started: 'bg-amber-500',
                                                route_completed: 'bg-emerald-600',
                                                route_cancelled: 'bg-red-500',
                                                stop_arrived: 'bg-blue-400',
                                                stop_delivered: 'bg-emerald-500',
                                                stop_failed: 'bg-red-400',
                                            }
                                            return (
                                                <div key={ev.id} className="flex items-start gap-3 relative">
                                                    <div className={cn('h-4 w-4 rounded-full shrink-0 mt-0.5 z-10 border-2 border-white', colors[ev.event_type] || 'bg-slate-400')} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-semibold text-navy">{ev.event_type.replace(/_/g, ' ').replace(/(^\w|\s\w)/g, (m: string) => m.toUpperCase())}</p>
                                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                                            {formatDateTime(ev.created_at)}
                                                            {ev.profiles?.full_name && ` • ${ev.profiles.full_name}`}
                                                        </p>
                                                        {ev.metadata && typeof ev.metadata === 'object' && Object.keys(ev.metadata).length > 0 && (
                                                            <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-1">
                                                                {JSON.stringify(ev.metadata).slice(0, 100)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* === COSTS TAB === */}
                    {activeTab === 'costs' && (
                        <div className="p-4 sm:p-6 max-h-[600px] overflow-y-auto">
                            {!costEstimate ? (
                                <div className="text-center p-8 text-sm text-muted-foreground">
                                    <Fuel className="h-8 w-8 mx-auto mb-3 opacity-20" />
                                    A estimativa de custos requer um veículo com consumo definido e rota traçada.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="rounded-xl border bg-slate-50 p-4">
                                            <p className="text-xs font-medium text-muted-foreground mb-1">Combustível</p>
                                            <p className="text-lg font-black text-navy">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costEstimate.fuel_cost)}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground mt-1.5">
                                                {costEstimate.liters_used}L de {costEstimate.fuel_type} a R$ {costEstimate.fuel_price_per_liter}/L
                                            </p>
                                        </div>
                                        <div className="rounded-xl border bg-slate-50 p-4">
                                            <p className="text-xs font-medium text-muted-foreground mb-1">Encargos + Diária</p>
                                            <p className="text-lg font-black text-navy">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costEstimate.fuel_tax_value + costEstimate.additional_tax + costEstimate.daily_rate)}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground mt-1.5 flex flex-col gap-0.5">
                                                <span>Taxa combust.: R$ {costEstimate.fuel_tax_value}</span>
                                                <span>Adicional: R$ {costEstimate.additional_tax}</span>
                                                <span>Diária: R$ {costEstimate.daily_rate}</span>
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="rounded-xl bg-linear-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <span className="text-sm font-bold text-emerald-800 block">Custo Total Previsto</span>
                                            <span className="text-[10px] text-emerald-600/80">Operação da rota</span>
                                        </div>
                                        <span className="text-2xl font-black text-emerald-700">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costEstimate.total_cost)}
                                        </span>
                                    </div>

                                    <div className="rounded-lg bg-indigo-50/50 p-3 flex gap-2 items-start border border-indigo-100/50">
                                        <Zap className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                                        <p className="text-[10px] text-indigo-700/70 leading-relaxed">
                                            Valores calculados em tempo real com base nas configurações da sua última otimização de rota ({costEstimate.distance_km} km) e no rendimento do veículo atual ({costEstimate.consumption_km_l} km/l).
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT: Map (always visible on lg, responsive) */}
                {isMapExpanded && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" onClick={() => setIsMapExpanded(false)} />
                )}
                <div className={cn(
                    "bg-white overflow-hidden transition-all duration-300 flex flex-col",
                    isMapExpanded 
                        ? "fixed inset-4 sm:inset-10 z-50 shadow-2xl rounded-2xl border-0" 
                        : "rounded-xl border relative"
                )}>
                    <div className="p-3 border-b flex items-center justify-between shrink-0 bg-white">
                        <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-indigo-500" /> Mapa da Rota
                        </h3>
                        <div className="flex items-center gap-2">
                            {stops.filter(s => !s.latitude || !s.longitude).length > 0 && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    {stops.filter(s => !s.latitude || !s.longitude).length} sem coordenadas
                                </span>
                            )}
                            {['optimized', 'confirmed', 'in_progress'].includes(route.status) && (
                                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                    onClick={handleRecalculateRoute} disabled={optimizing}>
                                    {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}
                                    {route.route_polyline ? 'Recalcular' : 'Traçar Rota'}
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-slate-100" onClick={() => setIsMapExpanded(!isMapExpanded)}>
                                {isMapExpanded ? <Minimize2 className="h-4 w-4 text-slate-600" /> : <Maximize2 className="h-4 w-4 text-slate-600" />}
                            </Button>
                        </div>
                    </div>
                    <div className={cn("flex-1 min-h-0 bg-slate-50 relative", isMapExpanded ? "p-0" : "p-3")}>
                        <RouteMap
                            center={mapCenter}
                            stops={mapStops}
                            polyline={route.route_polyline}
                            height={isMapExpanded ? "100%" : "520px"}
                            className={isMapExpanded ? "h-full min-h-[500px] border-0 rounded-none" : ""}
                            totalDistance={route.total_distance_km}
                            totalDuration={route.total_duration_min}
                            engine={route.optimization_engine || route.optimization_result?.engine}
                            highlightStopId={highlightStopId}
                            onStopClick={(id) => setHighlightStopId(id === highlightStopId ? null : id)}
                        />
                    </div>
                </div>
            </div>

            {/* ===== DIALOGS ===== */}

            {/* Failure Dialog */}
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
                        <Textarea placeholder="Motivo do insucesso..." value={failureReason} onChange={(e) => setFailureReason(e.target.value)} rows={3} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setFailureDialog(null); setFailureReason('') }}>Cancelar</Button>
                        <Button onClick={handleFailureSubmit} disabled={!failureReason.trim() || actionLoading} className="bg-red-600 hover:bg-red-700 text-white gap-1">
                            <XCircle className="h-3.5 w-3.5" /> Registrar Insucesso
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Status Change Alert */}
            <AlertDialog open={!!confirmAction} onOpenChange={(o) => { if (!o) { setConfirmAction(null); setCancelReason('') } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação irá alterar o status da rota <strong>{route.route_number}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {confirmAction?.type === 'cancel' && (
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Motivo do cancelamento *</label>
                            <Textarea
                                rows={3}
                                placeholder="Ex.: problema operacional, replanejamento, indisponibilidade do motorista..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                            />
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actionLoading} onClick={() => setCancelReason('')}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                const reason = confirmAction?.type === 'cancel' ? cancelReason.trim() : undefined
                                void handleStatusChange(confirmAction!.newStatus, reason)
                            }}
                            disabled={actionLoading || (confirmAction?.type === 'cancel' && !cancelReason.trim())}
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
