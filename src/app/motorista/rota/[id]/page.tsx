'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
    ArrowLeft,
    MapPin,
    CheckCircle2,
    XCircle,
    Play,
    Flag,
    Clock,
    Package,
    Navigation,
    Truck,
    RefreshCw,
    Map as MapIcon,
    Maximize2,
    Minimize2,
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
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
    getDriverRouteDetail,
    driverStartRoute,
    driverDeliverStop,
    driverFailStop,
    driverCompleteRoute,
} from '../../actions'

const RouteMap = dynamic(() => import('@/components/logistics/route-map'), { ssr: false })

const routeStatusConfig: Record<string, { label: string; color: string }> = {
    confirmed: { label: 'Confirmada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    in_progress: { label: 'Em Andamento', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    completed: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-600 border-red-200' },
}

const stopStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Pendente', color: 'bg-slate-50 text-slate-500', icon: Clock },
    delivered: { label: 'Entregue', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
    failed: { label: 'Insucesso', color: 'bg-red-50 text-red-600', icon: XCircle },
}

export default function DriverRoutePage() {
    const params = useParams()
    const router = useRouter()
    const routeId = params.id as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [route, setRoute] = useState<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [stops, setStops] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [isMapExpanded, setIsMapExpanded] = useState(false)
    const [highlightStopId, setHighlightStopId] = useState<string | null>(null)

    // Dialogs
    const [confirmStart, setConfirmStart] = useState(false)
    const [confirmComplete, setConfirmComplete] = useState(false)
    const [failStopId, setFailStopId] = useState<string | null>(null)
    const [failReason, setFailReason] = useState('')

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getDriverRouteDetail(routeId)
        if (res.error) { setError(res.error); setLoading(false); return }
        if (res.data) {
            setRoute(res.data.route)
            setStops(res.data.stops)
        }
        setLoading(false)
    }, [routeId])

    useEffect(() => { void loadData() }, [loadData])

    const handleStart = async () => {
        setActionLoading(true)
        const res = await driverStartRoute(routeId)
        setActionLoading(false)
        setConfirmStart(false)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const handleDeliver = async (stopId: string) => {
        setActionLoading(true)
        const res = await driverDeliverStop(stopId)
        setActionLoading(false)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const handleFail = async () => {
        if (!failStopId || !failReason.trim()) return
        setActionLoading(true)
        const res = await driverFailStop(failStopId, failReason)
        setActionLoading(false)
        setFailStopId(null)
        setFailReason('')
        if (res.error) setError(res.error)
        else void loadData()
    }

    const handleComplete = async () => {
        setActionLoading(true)
        const res = await driverCompleteRoute(routeId)
        setActionLoading(false)
        setConfirmComplete(false)
        if (res.error) setError(res.error)
        else router.push('/motorista')
    }

    const openNavigation = (lat: number, lng: number) => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        window.open(url, '_blank')
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48 rounded-xl" />
                <Skeleton className="h-52 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
        )
    }

    if (!route) {
        return (
            <div className="space-y-4">
                <Link href="/motorista"><Button variant="ghost" className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</Button></Link>
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">Rota não encontrada.</div>
            </div>
        )
    }

    const st = routeStatusConfig[route.status] || routeStatusConfig.confirmed
    const deliveredCount = stops.filter((s: { status: string }) => s.status === 'delivered').length
    const failedCount = stops.filter((s: { status: string }) => s.status === 'failed').length
    const totalStops = stops.length
    const completedCount = deliveredCount + failedCount
    const progress = totalStops > 0 ? Math.round((completedCount / totalStops) * 100) : 0
    const allDone = completedCount === totalStops && totalStops > 0

    // Map data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rc = route.route_centers as any
    const mapCenter = rc?.latitude && rc?.longitude
        ? { lat: Number(rc.latitude), lng: Number(rc.longitude), name: rc.name }
        : null
    const mapStops = stops
        .filter((s: { latitude: number; longitude: number }) => s.latitude && s.longitude)
        .map((s: { id: string; stop_position: number; latitude: number; longitude: number; customer_name: string; status: string; address_snapshot: string; estimated_arrival_min: number; estimated_distance_km: number; orders?: { total: number } }) => ({
            id: s.id,
            position: s.stop_position || 0,
            latitude: s.latitude ? Number(s.latitude) : null,
            longitude: s.longitude ? Number(s.longitude) : null,
            customer_name: s.customer_name || '',
            status: s.status || 'pending',
            address_snapshot: s.address_snapshot,
            estimated_arrival_min: s.estimated_arrival_min,
            estimated_distance_km: s.estimated_distance_km,
            order_total: s.orders?.total ? Number(s.orders.total) : null,
        }))
    const hasMapData = mapStops.length > 0

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/motorista">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-black text-slate-900">{route.route_number}</h1>
                        <Badge variant="outline" className={cn('text-[9px] rounded-full font-semibold', st.color)}>
                            {st.label}
                        </Badge>
                    </div>
                    {route.vehicles && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Truck className="h-3 w-3" /> {route.vehicles.plate} — {route.vehicles.name}
                        </p>
                    )}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8 ml-auto shrink-0" onClick={() => void loadData()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Progress Bar */}
            {route.status === 'in_progress' && (
                <div className="rounded-xl bg-white border p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground">Progresso</p>
                        <p className="text-sm font-bold text-slate-900">{completedCount}/{totalStops}</p>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-linear-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[10px]">
                        <span className="text-emerald-600 font-semibold">✓ {deliveredCount} entregas</span>
                        {failedCount > 0 && <span className="text-red-500 font-semibold">✗ {failedCount} insucessos</span>}
                    </div>
                </div>
            )}

            {/* Route Map */}
            {hasMapData && (
                <>
                    {isMapExpanded && (
                        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" onClick={() => setIsMapExpanded(false)} />
                    )}
                    <div className={cn(
                        'bg-white overflow-hidden transition-all duration-300 flex flex-col',
                        isMapExpanded
                            ? 'fixed inset-3 z-50 shadow-2xl rounded-2xl border-0'
                            : 'rounded-xl border shadow-sm relative'
                    )}>
                        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 bg-white">
                            <div className="flex items-center gap-2">
                                <MapIcon className="h-3.5 w-3.5 text-indigo-500" />
                                <p className="text-xs font-bold text-slate-900">Mapa da Rota</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setIsMapExpanded(!isMapExpanded)}>
                                {isMapExpanded ? <Minimize2 className="h-4 w-4 text-slate-600" /> : <Maximize2 className="h-4 w-4 text-slate-600" />}
                            </Button>
                        </div>
                        <RouteMap
                            center={mapCenter}
                            stops={mapStops}
                            polyline={route.route_polyline}
                            height={isMapExpanded ? '100%' : '280px'}
                            className={isMapExpanded ? 'h-full min-h-[400px] border-0 rounded-none' : 'border-0 rounded-none'}
                            totalDistance={route.total_distance_km}
                            totalDuration={route.total_duration_min}
                            engine={route.optimization_engine}
                            highlightStopId={highlightStopId}
                            onStopClick={(id) => setHighlightStopId(id === highlightStopId ? null : id)}
                        />
                    </div>
                </>
            )}

            {/* Actions */}
            {route.status === 'confirmed' && (
                <Button
                    className="w-full h-14 text-base gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg"
                    onClick={() => setConfirmStart(true)}
                    disabled={actionLoading}
                >
                    <Play className="h-5 w-5" /> Iniciar Rota
                </Button>
            )}

            {route.status === 'in_progress' && allDone && (
                <Button
                    className="w-full h-14 text-base gap-2 rounded-xl font-bold shadow-lg"
                    onClick={() => setConfirmComplete(true)}
                    disabled={actionLoading}
                >
                    <Flag className="h-5 w-5" /> Concluir Rota
                </Button>
            )}

            <Separator />

            {/* Stops List */}
            <div>
                <h2 className="text-sm font-bold text-slate-900 mb-3">
                    Paradas ({totalStops})
                </h2>
                <div className="space-y-2">
                    {stops.map((stop, idx) => {
                        const stopSt = stopStatusConfig[stop.status] || stopStatusConfig.pending
                        const StopIcon = stopSt.icon
                        const isPending = stop.status === 'pending'
                        const hasCoords = stop.latitude && stop.longitude
                        const isHighlighted = highlightStopId === stop.id

                        return (
                            <div key={stop.id}
                                className={cn(
                                    'rounded-xl border bg-white p-3 transition',
                                    stop.status === 'delivered' && 'opacity-60',
                                    stop.status === 'failed' && 'opacity-60',
                                    isHighlighted && 'ring-2 ring-indigo-300 shadow-md',
                                )}
                                onClick={() => setHighlightStopId(stop.id === highlightStopId ? null : stop.id)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                                        stop.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                                        stop.status === 'failed' ? 'bg-red-100 text-red-600' :
                                        'bg-blue-100 text-blue-600'
                                    )}>
                                        {stop.status === 'delivered' ? <CheckCircle2 className="h-4 w-4" /> :
                                         stop.status === 'failed' ? <XCircle className="h-4 w-4" /> :
                                         idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-slate-900 text-sm truncate">{stop.customer_name}</p>
                                            <Badge variant="outline" className={cn('text-[8px] rounded-full font-semibold gap-0.5', stopSt.color)}>
                                                <StopIcon className="h-2 w-2" />
                                                {stopSt.label}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{stop.address_snapshot || '—'}</p>
                                        {stop.orders && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                                <Package className="h-2.5 w-2.5" /> {stop.orders.order_number}
                                                {stop.orders.total && <span>• R$ {Number(stop.orders.total).toFixed(2)}</span>}
                                            </p>
                                        )}

                                        {/* Distance/ETA info */}
                                        {(stop.estimated_distance_km || stop.estimated_arrival_min) && (
                                            <div className="flex items-center gap-2 mt-1 text-[10px] text-indigo-600">
                                                {stop.estimated_distance_km && <span>{stop.estimated_distance_km} km</span>}
                                                {stop.estimated_arrival_min && <span>• {stop.estimated_arrival_min} min</span>}
                                            </div>
                                        )}

                                        {/* Action buttons for pending stops in active route */}
                                        {route.status === 'in_progress' && isPending && (
                                            <div className="flex items-center gap-2 mt-2.5">
                                                {hasCoords && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-9 text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 flex-1"
                                                        onClick={(e) => { e.stopPropagation(); openNavigation(stop.latitude, stop.longitude) }}
                                                    >
                                                        <Navigation className="h-3 w-3" /> Navegar
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                                                    onClick={(e) => { e.stopPropagation(); void handleDeliver(stop.id) }}
                                                    disabled={actionLoading}
                                                >
                                                    <CheckCircle2 className="h-3 w-3" /> Entregue
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                                                    onClick={(e) => { e.stopPropagation(); setFailStopId(stop.id); setFailReason('') }}
                                                    disabled={actionLoading}
                                                >
                                                    <XCircle className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        )}

                                        {stop.status === 'failed' && stop.failure_reason && (
                                            <p className="text-[10px] text-red-500 mt-1">Motivo: {stop.failure_reason}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Start Route Dialog */}
            <AlertDialog open={confirmStart} onOpenChange={setConfirmStart}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Iniciar Rota?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ao iniciar a rota, você poderá registrar entregas e insucessos em cada parada. Deseja continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); void handleStart() }}
                            disabled={actionLoading}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {actionLoading ? 'Iniciando...' : 'Iniciar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Complete Route Dialog */}
            <AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Concluir Rota?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Todas as paradas foram processadas. Deseja finalizar a rota <strong>{route.route_number}</strong>?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); void handleComplete() }}
                            disabled={actionLoading}
                        >
                            {actionLoading ? 'Concluindo...' : 'Concluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Fail Stop Dialog */}
            <AlertDialog open={!!failStopId} onOpenChange={(o) => !o && setFailStopId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Registrar Insucesso</AlertDialogTitle>
                        <AlertDialogDescription>
                            Informe o motivo pelo qual a entrega não pôde ser realizada.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                        placeholder="Ex: Cliente ausente, endereço não encontrado..."
                        value={failReason}
                        onChange={(e) => setFailReason(e.target.value)}
                        className="mt-2"
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); void handleFail() }}
                            disabled={actionLoading || !failReason.trim()}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {actionLoading ? 'Registrando...' : 'Registrar Insucesso'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
