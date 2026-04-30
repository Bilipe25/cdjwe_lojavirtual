'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
    ArrowLeft,
    Route,
    MapPin,
    Search,
    Plus,
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
    Navigation,
    Timer,
    Hash,
    Pencil,
    Globe,
    AlertTriangle,
    Loader2,
    Maximize2,
    Minimize2,
    Fuel,
    FileDown,
    FileText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
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
    buildOptionLabelMap,
    buildRegionDisplayOptions,
    ensureCurrentOption,
    getRemovedEntityLabel,
    resolveLabelFromMap,
} from '@/lib/logistics/filter-display'
import { useRouteLiveLocation } from '@/lib/hooks/use-route-live-location'
import {
    getTrackingStatusLabel,
    getTrackingStatusTone,
    type LiveVehicleMarker,
} from '@/lib/logistics/live-tracking'
import {
    getRouteDetail,
    getRoutableOrders,
    getLogisticsPdfBranding,
    updateRouteStatus,
    updateStopStatus,
    applyOptimizationResult,
    saveRouteStopsOrder,
    addRouteStop,
    removeRouteStop,
    updateRouteAssignment,
    updateRoutePolyline,
    updateStopMetrics,
    getDrivers,
    getVehicles,
    getCenters,
    getRegions,
    getDistinctCities,
    updateStopCoordinates,
    getRouteCostProfile,
    saveRouteCostOverride,
    clearRouteCostOverride,
    type PaginationMeta,
    type RoutableOrder,
    type RegionItem,
    type RouteCostProfile,
    type RouteCostEstimate,
} from '../../services'
import {
    generateRouteDetailPDF,
    type RoutePdfBranding,
    type RoutePdfMode,
} from '@/lib/pdf/route-pdf-generator'
import RouteStopsSortableList from '@/components/logistics/route-stops-sortable-list'
import type { RouteStopCardItem } from '@/components/logistics/route-stop-card'
import RoutePendingChangesBar from '@/components/logistics/route-pending-changes-bar'

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

const stopLegendCompact = [
    { key: 'pending', label: 'Pendente', color: '#64748b' },
    { key: 'arrived', label: 'Chegou', color: '#3b82f6' },
    { key: 'delivered', label: 'Entregue', color: '#10b981' },
    { key: 'failed', label: 'Insucesso', color: '#ef4444' },
    { key: 'skipped', label: 'Pulada', color: '#f59e0b' },
] as const

type RouteCostFormState = {
    fuel_price_per_liter: string
    fuel_tax_pct: string
    additional_tax: string
    daily_rate: string
    consumption_km_l: string
    notes: string
}

function toInputNumber(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(value)) return ''
    return String(value)
}

function parseLocaleNumber(value: string) {
    const normalized = value.replace(',', '.').trim()
    if (!normalized) return Number.NaN
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : Number.NaN
}

type SequenceFeedbackState = {
    type: 'success' | 'error' | 'warning'
    message: string
}

type AddStopFiltersState = {
    status: string
    city: string
    region: string
    date: string
}

const addStopStatusOptions = [
    { value: 'all', label: 'Todos aptos' },
    { value: 'approved', label: 'Aprovado' },
    { value: 'in_production', label: 'Em producao' },
] as const

const defaultAddStopFilters: AddStopFiltersState = {
    status: 'all',
    city: '',
    region: '',
    date: '',
}

const defaultAddStopPagination: PaginationMeta = {
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
}

function sortStopsByPosition<T extends { stop_position?: number | null; id: string }>(input: T[]) {
    return [...input].sort((a, b) => {
        const aPos = Number(a.stop_position || 0)
        const bPos = Number(b.stop_position || 0)
        if (aPos !== bPos) return aPos - bPos
        return a.id.localeCompare(b.id)
    })
}

function normalizeStopPositions<T extends { stop_position?: number | null }>(input: T[]) {
    return input.map((stop, index) => ({
        ...stop,
        stop_position: index + 1,
    }))
}

function toFiniteNumberOrNull(value: unknown) {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function roundCurrency(value: number) {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

function buildCostFormFromProfile(profile: RouteCostProfile): RouteCostFormState {
    return {
        fuel_price_per_liter: toInputNumber(profile.effective_settings.fuel_price_per_liter),
        fuel_tax_pct: toInputNumber(profile.effective_settings.fuel_tax_pct),
        additional_tax: toInputNumber(profile.effective_settings.additional_tax),
        daily_rate: toInputNumber(profile.effective_settings.daily_rate),
        consumption_km_l: toInputNumber(profile.effective_settings.consumption_km_l),
        notes: profile.override_settings?.notes || '',
    }
}

export default function RouteDetailPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const routeId = params.id as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [route, setRoute] = useState<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [stops, setStops] = useState<any[]>([])
    const [draftStops, setDraftStops] = useState<RouteStopCardItem[] | null>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [events, setEvents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [confirmAction, setConfirmAction] = useState<{ type: string; label: string; newStatus: string } | null>(null)
    const [cancelReason, setCancelReason] = useState('')
    const [optimizing, setOptimizing] = useState(false)
    const [activeTab, setActiveTab] = useState<'assignment' | 'stops' | 'timeline' | 'costs'>('assignment')
    const [costEstimate, setCostEstimate] = useState<RouteCostEstimate | null>(null)
    const [costProfile, setCostProfile] = useState<RouteCostProfile | null>(null)
    const [costForm, setCostForm] = useState<RouteCostFormState | null>(null)
    const [initialCostForm, setInitialCostForm] = useState<RouteCostFormState | null>(null)
    const [costSaving, setCostSaving] = useState(false)
    const [costResetting, setCostResetting] = useState(false)
    const [costFeedback, setCostFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null)
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
    const [exportingPdfMode, setExportingPdfMode] = useState<RoutePdfMode | null>(null)
    const [pdfBranding, setPdfBranding] = useState<RoutePdfBranding | null>(null)
    const [isSavingSequence, setIsSavingSequence] = useState(false)
    const [sequenceFeedback, setSequenceFeedback] = useState<SequenceFeedbackState | null>(null)
    const [lastEditSource, setLastEditSource] = useState<'drag' | 'quick' | null>(null)
    const [pendingReoptimizeDialogOpen, setPendingReoptimizeDialogOpen] = useState(false)
    const [deleteStopDialog, setDeleteStopDialog] = useState<RouteStopCardItem | null>(null)
    const [pendingDeleteStopDialog, setPendingDeleteStopDialog] = useState<RouteStopCardItem | null>(null)
    const [isDeletingStop, setIsDeletingStop] = useState(false)
    const [citiesList, setCitiesList] = useState<string[]>([])
    const [regionsList, setRegionsList] = useState<RegionItem[]>([])
    const [addStopDialogOpen, setAddStopDialogOpen] = useState(false)
    const [pendingAddStopDialogOpen, setPendingAddStopDialogOpen] = useState(false)
    const [pendingAddStopOrderId, setPendingAddStopOrderId] = useState<string | null>(null)
    const [isAddingStop, setIsAddingStop] = useState(false)
    const [addStopOrdersLoading, setAddStopOrdersLoading] = useState(false)
    const [addStopOrdersError, setAddStopOrdersError] = useState<string | null>(null)
    const [addStopSearchInput, setAddStopSearchInput] = useState('')
    const [addStopSearch, setAddStopSearch] = useState('')
    const [addStopFilters, setAddStopFilters] = useState<AddStopFiltersState>(defaultAddStopFilters)
    const [addStopPage, setAddStopPage] = useState(1)
    const [addStopPagination, setAddStopPagination] = useState<PaginationMeta>(defaultAddStopPagination)
    const [addStopOrders, setAddStopOrders] = useState<RoutableOrder[]>([])
    const [addStopSelectedOrderId, setAddStopSelectedOrderId] = useState<string | null>(null)

    const hydrateCostProfile = useCallback((profile: RouteCostProfile) => {
        const nextForm = buildCostFormFromProfile(profile)
        setCostProfile(profile)
        setCostEstimate(profile.estimate)
        setCostForm(nextForm)
        setInitialCostForm(nextForm)
    }, [])

    const loadCostProfile = useCallback(async () => {
        const response = await getRouteCostProfile(routeId)
        if ('error' in response && response.error) {
            setCostFeedback({ type: 'error', message: response.error })
            return null
        }
        if ('data' in response && response.data) {
            hydrateCostProfile(response.data)
            return response.data
        }
        return null
    }, [routeId, hydrateCostProfile])

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const [res, costRes] = await Promise.all([
            getRouteDetail(routeId),
            getRouteCostProfile(routeId),
        ])
        if (res.error) setError(res.error)
        else if ('data' in res && res.data) {
            const rte = res.data.route
            const rawStops = res.data.stops
            // Enrich stops with per-stop distance/ETA data
            // Priority: 1) native DB columns, 2) directionsStops JSONB, 3) orderedStops JSONB
            const dirStops = rte?.optimization_result?.directionsStops || []
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

            const orderedStops = sortStopsByPosition(enrichedStops)

            setRoute(rte)
            setStops(orderedStops)
            setDraftStops(null)
            setLastEditSource(null)
            setEvents(res.data.events)
        }

        if ('error' in costRes && costRes.error) {
            setCostFeedback({ type: 'error', message: costRes.error })
        } else if ('data' in costRes && costRes.data) {
            hydrateCostProfile(costRes.data)
        }
        setLoading(false)
    }, [routeId, hydrateCostProfile])

    useEffect(() => { void loadData() }, [loadData])

    useEffect(() => {
        const tab = searchParams.get('tab')
        if (tab === 'assignment' || tab === 'stops' || tab === 'timeline' || tab === 'costs') {
            setActiveTab(tab)
        }
    }, [searchParams])

    useEffect(() => {
        const loadResources = async () => {
            const [d, v, c, branding, citiesRes, regionsRes] = await Promise.all([
                getDrivers(),
                getVehicles(),
                getCenters(),
                getLogisticsPdfBranding(),
                getDistinctCities(),
                getRegions(),
            ])
            if ('data' in d && d.data) setDriversList(d.data)
            if ('data' in v && v.data) setVehiclesList(v.data)
            if ('data' in c && c.data) setCentersList(c.data)
            if ('data' in branding && branding.data) setPdfBranding(branding.data)
            if ('data' in citiesRes && citiesRes.data) setCitiesList(citiesRes.data)
            if ('data' in regionsRes && regionsRes.data) setRegionsList(regionsRes.data)
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
    const fetchDirections = useCallback(async (
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
                    const stopMetrics: Array<{ id: string; estimated_distance_km: number; estimated_arrival_min: number }> = []
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
    }, [routeId])

    const recalculateRouteGeometry = useCallback(async (sourceStops: Array<{ id: string; latitude: number | null; longitude: number | null }>) => {
        if (!route) return false
        const center = route.route_centers
        if (!center?.latitude || !center?.longitude) return false

        const validStops = sortStopsByPosition(sourceStops).filter((stop) => stop.latitude && stop.longitude)
        if (validStops.length === 0) return false

        return fetchDirections(
            { lat: Number(center.latitude), lng: Number(center.longitude) },
            validStops.map((stop) => ({
                id: stop.id,
                lat: Number(stop.latitude),
                lng: Number(stop.longitude),
            })),
        )
    }, [fetchDirections, route])

    const handleRecalculateRoute = async () => {
        if (hasPendingSequenceChanges) {
            setSequenceFeedback({
                type: 'warning',
                message: 'Salve a nova sequencia antes de recalcular a rota.',
            })
            return
        }

        setOptimizing(true)
        setError(null)

        const ok = await recalculateRouteGeometry(sequenceStops)
        if (ok) {
            setSequenceFeedback({ type: 'success', message: 'Rota recalculada com base na sequencia atual.' })
            void loadData()
        } else {
            setError('Nao foi possivel calcular o trajeto real. Tente novamente.')
        }
        setOptimizing(false)
    }

    const executeOptimizeRoute = useCallback(async (sourceStops: Array<{ id: string; latitude: number | null; longitude: number | null; estimated_service_min?: number | null; priority?: string | null }>) => {
        if (!route) return false

        const center = route.route_centers
        if (!center?.latitude || !center?.longitude) {
            setError('O centro de saida nao possui coordenadas. Geocodifique o centro primeiro.')
            return false
        }

        const validStops = sortStopsByPosition(sourceStops).filter((stop) => stop.latitude && stop.longitude)
        if (validStops.length === 0) {
            setError('Nenhuma parada possui coordenadas. Geocodifique os enderecos antes de otimizar.')
            return false
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
                    stops: validStops.map((stop) => ({
                        id: stop.id,
                        lat: stop.latitude,
                        lng: stop.longitude,
                        serviceTime: stop.estimated_service_min || 15,
                        priority: stop.priority === 'urgent' ? 100 : stop.priority === 'high' ? 75 : stop.priority === 'low' ? 25 : 50,
                    })),
                    vehicle: route.vehicles ? {
                        capacityKg: route.vehicles.capacity_kg,
                    } : undefined,
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                setError(result.error || 'Erro na otimizacao.')
                return false
            }

            const persistRes = await applyOptimizationResult(routeId, result)
            if ('error' in persistRes && persistRes.error) {
                setError(persistRes.error)
                return false
            }

            setOptimizationBanner({
                distance: result.summary.totalDistance,
                duration: result.summary.totalDuration,
                engine: result.engine,
                stops: result.summary.totalStops,
            })

            const orderedIds = result.orderedStops
                .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
                .map((orderedStop: { id: string }) => orderedStop.id)
            const orderedWithIds = orderedIds
                .map((id: string) => {
                    const stop = validStops.find((candidate: { id: string }) => candidate.id === id)
                    return stop ? { id, lat: Number(stop.latitude), lng: Number(stop.longitude) } : null
                })
                .filter(Boolean) as Array<{ id: string; lat: number; lng: number }>

            await fetchDirections(
                { lat: Number(center.latitude), lng: Number(center.longitude) },
                orderedWithIds,
            )

            setSequenceFeedback({ type: 'success', message: 'Rota reotimizada e sincronizada com sucesso.' })
            void loadData()
            return true
        } catch (e) {
            setError('Erro ao otimizar rota: ' + (e instanceof Error ? e.message : 'Erro desconhecido'))
            return false
        } finally {
            setOptimizing(false)
        }
    }, [fetchDirections, loadData, route, routeId])

    const handleOptimize = async () => {
        if (hasPendingSequenceChanges) {
            setPendingReoptimizeDialogOpen(true)
            return
        }
        await executeOptimizeRoute(sequenceStops)
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

    const handleExportPdf = async (mode: RoutePdfMode = 'standard') => {
        if (!route) return

        setExportingPdfMode(mode)
        setError(null)
        try {
            let brandingToUse = pdfBranding
            if (!brandingToUse) {
                const brandingRes = await getLogisticsPdfBranding()
                if ('data' in brandingRes && brandingRes.data) {
                    brandingToUse = brandingRes.data
                    setPdfBranding(brandingRes.data)
                }
            }

            await generateRouteDetailPDF({
                route,
                stops,
                costEstimate,
                branding: brandingToUse || undefined,
            }, mode)
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro desconhecido'
            const modeLabel = mode === 'operational' ? 'operacional' : 'de detalhes'
            setError(`Não foi possível gerar o PDF ${modeLabel} da rota. ${message}`)
        } finally {
            setExportingPdfMode(null)
        }
    }

    const formatDate = (d: string) => {
        try { return new Date(d).toLocaleDateString('pt-BR') }
        catch { return d }
    }

    const formatDateTime = (d: string) => {
        try { return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }
        catch { return d }
    }

    const formatCurrency = (value: number) => (
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
    )

    const handleCostFieldChange = (field: keyof RouteCostFormState, value: string) => {
        setCostFeedback(null)
        setCostForm((prev) => (prev ? { ...prev, [field]: value } : prev))
    }

    const costFormDirty = useMemo(() => {
        if (!costForm || !initialCostForm) return false
        return JSON.stringify(costForm) !== JSON.stringify(initialCostForm)
    }, [costForm, initialCostForm])

    const parsedCostInputs = useMemo(() => {
        if (!costForm) return null
        return {
            fuelPrice: parseLocaleNumber(costForm.fuel_price_per_liter),
            fuelTaxPct: parseLocaleNumber(costForm.fuel_tax_pct),
            additionalTax: parseLocaleNumber(costForm.additional_tax),
            dailyRate: parseLocaleNumber(costForm.daily_rate),
            consumptionKmL: parseLocaleNumber(costForm.consumption_km_l),
        }
    }, [costForm])

    const hasInvalidCostInput = Boolean(parsedCostInputs && Object.values(parsedCostInputs).some((value) => !Number.isFinite(value) || value < 0))
    const hasInvalidConsumption = Boolean(parsedCostInputs && Number.isFinite(parsedCostInputs.consumptionKmL) && parsedCostInputs.consumptionKmL <= 0)

    const previewEstimate = useMemo<RouteCostEstimate | null>(() => {
        if (!costProfile || !costForm || !parsedCostInputs) return costEstimate

        const distance = Number(costProfile.estimate.distance_km || 0)
        const fuelType = costProfile.estimate.fuel_type || 'diesel'

        const fuelPricePerLiter = Number.isFinite(parsedCostInputs.fuelPrice) ? Math.max(0, parsedCostInputs.fuelPrice) : 0
        const fuelTaxPct = Number.isFinite(parsedCostInputs.fuelTaxPct) ? Math.max(0, parsedCostInputs.fuelTaxPct) : 0
        const additionalTax = Number.isFinite(parsedCostInputs.additionalTax) ? Math.max(0, parsedCostInputs.additionalTax) : 0
        const dailyRate = Number.isFinite(parsedCostInputs.dailyRate) ? Math.max(0, parsedCostInputs.dailyRate) : 0
        const consumptionKmL = Number.isFinite(parsedCostInputs.consumptionKmL) ? Math.max(0, parsedCostInputs.consumptionKmL) : 0

        const canCalculateFuel = consumptionKmL > 0
        const litersUsed = canCalculateFuel ? distance / consumptionKmL : 0
        const fuelCost = litersUsed * fuelPricePerLiter
        const fuelTaxValue = fuelCost * (fuelTaxPct / 100)
        const totalCost = fuelCost + fuelTaxValue + additionalTax + dailyRate

        return {
            distance_km: roundCurrency(distance),
            consumption_km_l: roundCurrency(consumptionKmL),
            fuel_type: fuelType,
            liters_used: roundCurrency(litersUsed),
            fuel_price_per_liter: roundCurrency(fuelPricePerLiter),
            fuel_cost: roundCurrency(fuelCost),
            fuel_tax_pct: roundCurrency(fuelTaxPct),
            fuel_tax_value: roundCurrency(fuelTaxValue),
            additional_tax: roundCurrency(additionalTax),
            daily_rate: roundCurrency(dailyRate),
            total_cost: roundCurrency(totalCost),
            can_calculate_fuel: canCalculateFuel,
        }
    }, [costEstimate, costForm, costProfile, parsedCostInputs])

    const handleSaveRouteCostOverride = async () => {
        if (!costProfile?.can_edit || !costForm || !parsedCostInputs) return

        if (hasInvalidCostInput) {
            setCostFeedback({ type: 'error', message: 'Revise os campos: use apenas números válidos e não negativos.' })
            return
        }

        setCostSaving(true)
        setCostFeedback(null)
        const response = await saveRouteCostOverride(routeId, {
            fuel_price_per_liter: parsedCostInputs.fuelPrice,
            fuel_tax_pct: parsedCostInputs.fuelTaxPct,
            additional_tax: parsedCostInputs.additionalTax,
            daily_rate: parsedCostInputs.dailyRate,
            consumption_km_l: parsedCostInputs.consumptionKmL,
            notes: costForm.notes.trim() || null,
        })
        setCostSaving(false)

        if ('error' in response && response.error) {
            setCostFeedback({ type: 'error', message: response.error })
            return
        }

        setCostFeedback({ type: 'success', message: 'Customização de custos salva para esta rota.' })
        await loadCostProfile()
    }

    const handleClearRouteCostOverride = async () => {
        if (!costProfile?.can_edit) return
        setCostResetting(true)
        setCostFeedback(null)
        const response = await clearRouteCostOverride(routeId)
        setCostResetting(false)

        if ('error' in response && response.error) {
            setCostFeedback({ type: 'error', message: response.error })
            return
        }

        setCostFeedback({ type: 'success', message: 'Custos da rota restaurados para o padrão global.' })
        await loadCostProfile()
    }

    const isEditable = route && ['draft', 'optimized'].includes(route.status)
    const canEditStopSequence = Boolean(route && ['draft', 'optimized', 'confirmed'].includes(route.status))

    const orderedBaseStops = useMemo(
        () => normalizeStopPositions(sortStopsByPosition(stops)),
        [stops],
    )
    const orderedDraftStops = useMemo(
        () => (draftStops ? normalizeStopPositions(sortStopsByPosition(draftStops)) : null),
        [draftStops],
    )
    const sequenceStops = orderedDraftStops ?? orderedBaseStops

    const baseSequenceSignature = useMemo(
        () => orderedBaseStops.map((stop) => stop.id).join('|'),
        [orderedBaseStops],
    )
    const draftSequenceSignature = useMemo(
        () => sequenceStops.map((stop) => stop.id).join('|'),
        [sequenceStops],
    )
    const hasPendingSequenceChanges = Boolean(canEditStopSequence && baseSequenceSignature !== draftSequenceSignature)

    const setDraftSequence = useCallback((nextStops: RouteStopCardItem[], source: 'drag' | 'quick') => {
        setDraftStops(normalizeStopPositions(nextStops))
        setLastEditSource(source)
        setSequenceFeedback(null)
    }, [])

    const handleMoveStop = useCallback((stopId: string, direction: 'top' | 'up' | 'down' | 'bottom') => {
        if (!canEditStopSequence) return

        const source = normalizeStopPositions([...(draftStops ?? orderedBaseStops)])
        const currentIndex = source.findIndex((stop) => stop.id === stopId)
        if (currentIndex < 0) return

        let targetIndex = currentIndex
        if (direction === 'top') targetIndex = 0
        if (direction === 'up') targetIndex = Math.max(0, currentIndex - 1)
        if (direction === 'down') targetIndex = Math.min(source.length - 1, currentIndex + 1)
        if (direction === 'bottom') targetIndex = source.length - 1

        if (targetIndex === currentIndex) return

        const reordered = [...source]
        const [moved] = reordered.splice(currentIndex, 1)
        reordered.splice(targetIndex, 0, moved)
        setDraftSequence(reordered, 'quick')
    }, [canEditStopSequence, draftStops, orderedBaseStops, setDraftSequence])

    const handleDiscardStopSequenceChanges = useCallback(() => {
        setDraftStops(null)
        setLastEditSource(null)
        setSequenceFeedback(null)
    }, [])

    const persistStopSequence = useCallback(async (options?: { recalculateAfterSave?: boolean; reloadAfterSave?: boolean }) => {
        if (!canEditStopSequence) return false
        if (!hasPendingSequenceChanges) return true

        const recalculateAfterSave = options?.recalculateAfterSave ?? true
        const reloadAfterSave = options?.reloadAfterSave ?? true
        const normalizedStops = normalizeStopPositions(sequenceStops)
        const orderedStopIds = normalizedStops.map((stop) => stop.id)

        setIsSavingSequence(true)
        setSequenceFeedback(null)
        setError(null)

        const saveRes = await saveRouteStopsOrder(routeId, orderedStopIds, 'manual_sequence_edit')
        if ('error' in saveRes && saveRes.error) {
            setSequenceFeedback({ type: 'error', message: saveRes.error })
            setIsSavingSequence(false)
            return false
        }

        setStops(normalizedStops)
        setDraftStops(null)
        setLastEditSource(null)
        setRoute((prev: typeof route) => (prev ? {
            ...prev,
            route_polyline: null,
            total_distance_km: null,
            total_duration_min: null,
        } : prev))

        let recalculateOk = true
        if (recalculateAfterSave) {
            setOptimizing(true)
            recalculateOk = await recalculateRouteGeometry(normalizedStops)
            setOptimizing(false)
        }

        if (recalculateAfterSave && !recalculateOk) {
            setSequenceFeedback({
                type: 'warning',
                message: 'Sequencia salva. O recalculo automatico falhou; use "Recalcular" para atualizar o trajeto.',
            })
        } else {
            setSequenceFeedback({
                type: 'success',
                message: recalculateAfterSave
                    ? 'Sequencia salva e rota recalculada com sucesso.'
                    : 'Sequencia salva. Pronto para reotimizacao.',
            })
        }

        setIsSavingSequence(false)
        if (reloadAfterSave) {
            void loadData()
        }
        return true
    }, [
        canEditStopSequence,
        hasPendingSequenceChanges,
        loadData,
        recalculateRouteGeometry,
        routeId,
        sequenceStops,
    ])

    const handleSaveStopSequence = useCallback(async () => {
        await persistStopSequence({ recalculateAfterSave: true })
    }, [persistStopSequence])

    const handleApplyPendingAndReoptimize = useCallback(async () => {
        setPendingReoptimizeDialogOpen(false)
        const saved = await persistStopSequence({ recalculateAfterSave: false, reloadAfterSave: false })
        if (!saved) return
        await executeOptimizeRoute(sequenceStops)
    }, [executeOptimizeRoute, persistStopSequence, sequenceStops])

    const handleDiscardAndReoptimize = useCallback(async () => {
        setPendingReoptimizeDialogOpen(false)
        setDraftStops(null)
        setLastEditSource(null)
        setSequenceFeedback(null)
        await executeOptimizeRoute(orderedBaseStops)
    }, [executeOptimizeRoute, orderedBaseStops])

    const executeStopRemoval = useCallback(async (
        stop: RouteStopCardItem,
        sourceStops?: RouteStopCardItem[],
    ) => {
        if (!canEditStopSequence) return false

        setIsDeletingStop(true)
        setSequenceFeedback(null)
        setError(null)

        const response = await removeRouteStop(routeId, stop.id, 'manual_stop_delete')
        if ('error' in response && response.error) {
            setSequenceFeedback({ type: 'error', message: response.error })
            setIsDeletingStop(false)
            return false
        }

        const currentStops = normalizeStopPositions(sourceStops || sequenceStops)
        const nextStops = normalizeStopPositions(
            currentStops.filter((candidate) => candidate.id !== stop.id),
        )
        const remainingStops = 'data' in response && response.data
            ? Number(response.data.remaining_stops || nextStops.length)
            : nextStops.length

        setStops(nextStops)
        setDraftStops(null)
        setLastEditSource(null)
        setHighlightStopId((prev) => (prev === stop.id ? null : prev))
        setRoute((prev: typeof route) => (prev ? {
            ...prev,
            total_stops: remainingStops,
            route_polyline: null,
            total_distance_km: null,
            total_duration_min: null,
        } : prev))

        let recalculateOk = true
        if (nextStops.length > 0) {
            setOptimizing(true)
            recalculateOk = await recalculateRouteGeometry(nextStops)
            setOptimizing(false)
        }

        if (!recalculateOk) {
            setSequenceFeedback({
                type: 'warning',
                message: 'Parada removida e pedido devolvido para roteirizacao. O recalculo automatico falhou; use "Recalcular rota".',
            })
        } else {
            setSequenceFeedback({
                type: 'success',
                message: 'Parada removida, pedido devolvido para roteirizacao e rota recalculada.',
            })
        }

        setIsDeletingStop(false)
        void loadData()
        return true
    }, [
        canEditStopSequence,
        loadData,
        recalculateRouteGeometry,
        routeId,
        sequenceStops,
    ])

    const handleRequestDeleteStop = useCallback((stop: RouteStopCardItem) => {
        if (!canEditStopSequence) return

        if (sequenceStops.length <= 1) {
            setSequenceFeedback({
                type: 'warning',
                message: 'Nao e permitido remover a ultima parada da rota.',
            })
            return
        }

        if (hasPendingSequenceChanges) {
            setPendingDeleteStopDialog(stop)
            return
        }

        setDeleteStopDialog(stop)
    }, [canEditStopSequence, hasPendingSequenceChanges, sequenceStops.length])

    const handleConfirmDeleteStop = useCallback(async () => {
        if (!deleteStopDialog) return
        const targetStop = deleteStopDialog
        setDeleteStopDialog(null)
        await executeStopRemoval(targetStop)
    }, [deleteStopDialog, executeStopRemoval])

    const handleApplyPendingAndDeleteStop = useCallback(async () => {
        if (!pendingDeleteStopDialog) return
        const targetStop = pendingDeleteStopDialog
        setPendingDeleteStopDialog(null)

        const saved = await persistStopSequence({ recalculateAfterSave: false, reloadAfterSave: false })
        if (!saved) return

        await executeStopRemoval(targetStop, sequenceStops)
    }, [executeStopRemoval, pendingDeleteStopDialog, persistStopSequence, sequenceStops])

    const handleDiscardPendingAndDeleteStop = useCallback(async () => {
        if (!pendingDeleteStopDialog) return
        const targetStop = pendingDeleteStopDialog
        setPendingDeleteStopDialog(null)

        setDraftStops(null)
        setLastEditSource(null)
        setSequenceFeedback(null)

        await executeStopRemoval(targetStop, orderedBaseStops)
    }, [executeStopRemoval, orderedBaseStops, pendingDeleteStopDialog])

    useEffect(() => {
        const debounce = window.setTimeout(() => {
            const normalized = addStopSearchInput.trim()
            setAddStopSearch(normalized)
            setAddStopPage(1)
        }, 320)
        return () => window.clearTimeout(debounce)
    }, [addStopSearchInput])

    const loadAddStopOrders = useCallback(async () => {
        if (!addStopDialogOpen) return

        setAddStopOrdersLoading(true)
        setAddStopOrdersError(null)

        const response = await getRoutableOrders({
            status: addStopFilters.status,
            city: addStopFilters.city || undefined,
            region: addStopFilters.region || undefined,
            search: addStopSearch || undefined,
            date: addStopFilters.date || undefined,
            page: addStopPage,
            pageSize: defaultAddStopPagination.pageSize,
        })

        if ('error' in response && response.error) {
            setAddStopOrders([])
            setAddStopPagination({
                ...defaultAddStopPagination,
                page: addStopPage,
                hasPreviousPage: addStopPage > 1,
            })
            setAddStopOrdersError(response.error)
            setAddStopOrdersLoading(false)
            return
        }

        if ('data' in response && response.data) {
            setAddStopOrders(response.data)
        } else {
            setAddStopOrders([])
        }

        if ('pagination' in response && response.pagination) {
            setAddStopPagination(response.pagination)
            if (response.pagination.page !== addStopPage) {
                setAddStopPage(response.pagination.page)
            }
        } else {
            setAddStopPagination({
                ...defaultAddStopPagination,
                page: addStopPage,
                hasPreviousPage: addStopPage > 1,
            })
        }

        setAddStopSelectedOrderId((previous) => {
            if (!previous) return previous
            const existsInCurrentPage = (response.data || []).some((order) => order.order_id === previous)
            return existsInCurrentPage ? previous : null
        })
        setAddStopOrdersLoading(false)
    }, [
        addStopDialogOpen,
        addStopFilters.city,
        addStopFilters.date,
        addStopFilters.region,
        addStopFilters.status,
        addStopPage,
        addStopSearch,
    ])

    useEffect(() => {
        void loadAddStopOrders()
    }, [loadAddStopOrders])

    const handleOpenAddStopDialog = useCallback(() => {
        if (!canEditStopSequence) return
        setAddStopDialogOpen(true)
        setAddStopSearchInput('')
        setAddStopSearch('')
        setAddStopFilters({ ...defaultAddStopFilters })
        setAddStopPage(1)
        setAddStopPagination({ ...defaultAddStopPagination })
        setAddStopOrders([])
        setAddStopOrdersError(null)
        setAddStopSelectedOrderId(null)
    }, [canEditStopSequence])

    const handleCloseAddStopDialog = useCallback(() => {
        if (isAddingStop) return
        setAddStopDialogOpen(false)
        setAddStopOrdersError(null)
        setAddStopSelectedOrderId(null)
        setPendingAddStopOrderId(null)
    }, [isAddingStop])

    const executeStopAddition = useCallback(async (
        orderId: string,
        sourceStops?: RouteStopCardItem[],
    ) => {
        if (!canEditStopSequence) return false

        setIsAddingStop(true)
        setSequenceFeedback(null)
        setError(null)

        const response = await addRouteStop(routeId, orderId, 'manual_stop_add')
        if ('error' in response && response.error) {
            setSequenceFeedback({ type: 'error', message: response.error })
            setIsAddingStop(false)
            return false
        }

        const row = 'data' in response ? response.data : null
        const currentStops = normalizeStopPositions(sourceStops || sequenceStops)
        const addedStopId = String(row?.added_stop_id || '').trim()
        const currentOrder = addStopOrders.find((order) => order.order_id === orderId) || null

        const nextStop: RouteStopCardItem = {
            id: addedStopId || `added-${orderId}`,
            order_id: orderId,
            stop_position: Number(row?.stop_position || currentStops.length + 1),
            customer_name: String(
                row?.customer_name
                || currentOrder?.company_name
                || currentOrder?.client_name
                || 'Cliente sem nome',
            ),
            address_snapshot: String(row?.address_snapshot || currentOrder?.shipping_address || ''),
            status: 'pending',
            priority: 'normal',
            latitude: toFiniteNumberOrNull(row?.latitude ?? currentOrder?.address_lat ?? null),
            longitude: toFiniteNumberOrNull(row?.longitude ?? currentOrder?.address_lng ?? null),
            estimated_arrival_min: null,
            estimated_distance_km: null,
            delivered_at: null,
            failure_reason: null,
            address_id: null,
            orders: {
                order_number: String(row?.order_number || currentOrder?.order_number || ''),
                total: Number(currentOrder?.total || 0),
            },
        }

        const nextStops = normalizeStopPositions([...currentStops, nextStop])
        const nextTotalStops = Number(row?.total_stops || nextStops.length)

        setStops(nextStops)
        setDraftStops(null)
        setLastEditSource(null)
        setHighlightStopId(addedStopId || null)
        setRoute((previous: typeof route) => (previous ? {
            ...previous,
            total_stops: nextTotalStops,
            route_polyline: null,
            total_distance_km: null,
            total_duration_min: null,
        } : previous))

        let recalculateOk = true
        if (nextStops.length > 0) {
            setOptimizing(true)
            recalculateOk = await recalculateRouteGeometry(nextStops)
            setOptimizing(false)
        }

        if (!recalculateOk) {
            setSequenceFeedback({
                type: 'warning',
                message: 'Parada adicionada ao fim da sequencia. O recalculo automatico falhou; use "Recalcular rota".',
            })
        } else {
            setSequenceFeedback({
                type: 'success',
                message: 'Parada adicionada ao fim da sequencia e rota recalculada.',
            })
        }

        setAddStopDialogOpen(false)
        setPendingAddStopDialogOpen(false)
        setPendingAddStopOrderId(null)
        setAddStopSelectedOrderId(null)
        setIsAddingStop(false)
        void loadData()
        return true
    }, [
        addStopOrders,
        canEditStopSequence,
        loadData,
        recalculateRouteGeometry,
        routeId,
        sequenceStops,
    ])

    const handleConfirmAddStop = useCallback(async () => {
        setAddStopOrdersError(null)
        if (!addStopSelectedOrderId) {
            setAddStopOrdersError('Selecione um pedido para adicionar como parada.')
            return
        }

        if (hasPendingSequenceChanges) {
            setPendingAddStopOrderId(addStopSelectedOrderId)
            setAddStopDialogOpen(false)
            setPendingAddStopDialogOpen(true)
            return
        }

        await executeStopAddition(addStopSelectedOrderId)
    }, [addStopSelectedOrderId, executeStopAddition, hasPendingSequenceChanges])

    const handleApplyPendingAndAddStop = useCallback(async () => {
        if (!pendingAddStopOrderId) return
        const orderId = pendingAddStopOrderId
        setPendingAddStopDialogOpen(false)

        const saved = await persistStopSequence({ recalculateAfterSave: false, reloadAfterSave: false })
        if (!saved) return

        await executeStopAddition(orderId, sequenceStops)
    }, [executeStopAddition, pendingAddStopOrderId, persistStopSequence, sequenceStops])

    const handleDiscardPendingAndAddStop = useCallback(async () => {
        if (!pendingAddStopOrderId) return
        const orderId = pendingAddStopOrderId

        setPendingAddStopDialogOpen(false)
        setDraftStops(null)
        setLastEditSource(null)
        setSequenceFeedback(null)

        await executeStopAddition(orderId, orderedBaseStops)
    }, [executeStopAddition, orderedBaseStops, pendingAddStopOrderId])

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

    const driverOptions = useMemo(() => (
        driversList
            .map((driver: { id?: string; profile_name?: string }) => {
                const value = String(driver?.id || '').trim()
                if (!value) return null
                const label = String(driver?.profile_name || '').trim() || getRemovedEntityLabel('driver')
                return { value, label }
            })
            .filter((option): option is { value: string; label: string } => Boolean(option))
    ), [driversList])

    const vehicleOptions = useMemo(() => (
        vehiclesList
            .map((vehicle: { id?: string; plate?: string; name?: string }) => {
                const value = String(vehicle?.id || '').trim()
                if (!value) return null
                const label = [vehicle?.plate, vehicle?.name].filter(Boolean).join(' - ') || getRemovedEntityLabel('vehicle')
                return { value, label }
            })
            .filter((option): option is { value: string; label: string } => Boolean(option))
    ), [vehiclesList])

    const centerOptions = useMemo(() => (
        centersList
            .map((center: { id?: string; name?: string; city?: string }) => {
                const value = String(center?.id || '').trim()
                if (!value) return null
                const label = [center?.name, center?.city].filter(Boolean).join(' - ') || getRemovedEntityLabel('center')
                return { value, label }
            })
            .filter((option): option is { value: string; label: string } => Boolean(option))
    ), [centersList])

    const driverLabelMap = useMemo(() => buildOptionLabelMap(driverOptions), [driverOptions])
    const vehicleLabelMap = useMemo(() => buildOptionLabelMap(vehicleOptions), [vehicleOptions])
    const centerLabelMap = useMemo(() => buildOptionLabelMap(centerOptions), [centerOptions])

    const selectedDriverId = String(route?.driver_id || '').trim()
    const selectedVehicleId = String(route?.vehicle_id || '').trim()
    const selectedCenterId = String(route?.center_id || '').trim()

    const selectedDriverLabel = selectedDriverId
        ? resolveLabelFromMap(
            selectedDriverId,
            driverLabelMap,
            String(route?.drivers?.profiles?.full_name || '').trim() || getRemovedEntityLabel('driver'),
        )
        : 'Selecionar motorista'
    const selectedVehicleLabel = selectedVehicleId
        ? resolveLabelFromMap(
            selectedVehicleId,
            vehicleLabelMap,
            [
                route?.vehicles?.plate ? String(route.vehicles.plate) : '',
                route?.vehicles?.name ? String(route.vehicles.name) : '',
            ].filter(Boolean).join(' - ') || getRemovedEntityLabel('vehicle'),
        )
        : 'Selecionar veiculo'
    const selectedCenterLabel = selectedCenterId
        ? resolveLabelFromMap(
            selectedCenterId,
            centerLabelMap,
            [
                route?.route_centers?.name ? String(route.route_centers.name) : '',
                route?.route_centers?.city ? String(route.route_centers.city) : '',
            ].filter(Boolean).join(' - ') || getRemovedEntityLabel('center'),
        )
        : 'Selecionar centro'

    const visibleDriverOptions = selectedDriverId
        ? ensureCurrentOption(driverOptions, selectedDriverId, selectedDriverLabel)
        : driverOptions
    const visibleVehicleOptions = selectedVehicleId
        ? ensureCurrentOption(vehicleOptions, selectedVehicleId, selectedVehicleLabel)
        : vehicleOptions
    const visibleCenterOptions = selectedCenterId
        ? ensureCurrentOption(centerOptions, selectedCenterId, selectedCenterLabel)
        : centerOptions

    const addStopSelectedOrder = useMemo(
        () => addStopOrders.find((order) => order.order_id === addStopSelectedOrderId) || null,
        [addStopOrders, addStopSelectedOrderId],
    )
    const pendingAddStopOrder = useMemo(
        () => addStopOrders.find((order) => order.order_id === pendingAddStopOrderId) || null,
        [addStopOrders, pendingAddStopOrderId],
    )

    const addStopRegionCatalog = useMemo(() => (
        regionsList.map((region) => ({ id: region.id, name: region.name }))
    ), [regionsList])

    const addStopRegionBaseOptions = useMemo(() => {
        const rawRegionValues = [
            ...addStopOrders.map((order) => order.region),
            ...addStopRegionCatalog.map((region) => region.name),
        ]
        return buildRegionDisplayOptions(rawRegionValues, addStopRegionCatalog)
    }, [addStopOrders, addStopRegionCatalog])

    const addStopRegionLabelMap = useMemo(
        () => buildOptionLabelMap(addStopRegionBaseOptions),
        [addStopRegionBaseOptions],
    )

    const selectedAddStopRegionLabel = useMemo(() => {
        if (!addStopFilters.region) return 'Todas regioes'
        return resolveLabelFromMap(
            addStopFilters.region,
            addStopRegionLabelMap,
            getRemovedEntityLabel('region'),
        )
    }, [addStopFilters.region, addStopRegionLabelMap])

    const addStopRegionOptions = useMemo(() => (
        addStopFilters.region
            ? ensureCurrentOption(addStopRegionBaseOptions, addStopFilters.region, selectedAddStopRegionLabel)
            : addStopRegionBaseOptions
    ), [addStopFilters.region, addStopRegionBaseOptions, selectedAddStopRegionLabel])

    const addStopCityBaseOptions = useMemo(() => {
        const set = new Set<string>()
        for (const city of citiesList) {
            const normalized = String(city || '').trim()
            if (normalized) set.add(normalized)
        }
        for (const order of addStopOrders) {
            const normalized = String(order.city || '').trim()
            if (normalized) set.add(normalized)
        }
        return Array.from(set)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .map((city) => ({ value: city, label: city }))
    }, [addStopOrders, citiesList])

    const addStopCityLabelMap = useMemo(
        () => buildOptionLabelMap(addStopCityBaseOptions),
        [addStopCityBaseOptions],
    )

    const selectedAddStopCityLabel = useMemo(() => {
        if (!addStopFilters.city) return 'Todas cidades'
        return resolveLabelFromMap(addStopFilters.city, addStopCityLabelMap, addStopFilters.city)
    }, [addStopCityLabelMap, addStopFilters.city])

    const addStopCityOptions = useMemo(() => (
        addStopFilters.city
            ? ensureCurrentOption(addStopCityBaseOptions, addStopFilters.city, selectedAddStopCityLabel)
            : addStopCityBaseOptions
    ), [addStopCityBaseOptions, addStopFilters.city, selectedAddStopCityLabel])

    const canSubmitAddStop = Boolean(
        canEditStopSequence
        && addStopSelectedOrderId
        && !addStopOrdersLoading
        && !isAddingStop
        && !isSavingSequence
        && !isDeletingStop
        && !optimizing,
    )

    // Map data (memoized to avoid expensive map re-renders on unrelated renders)
    const mapCenter = useMemo(() => {
        if (!routeCenter?.latitude || !routeCenter?.longitude) return null
        return {
            lat: Number(routeCenter.latitude),
            lng: Number(routeCenter.longitude),
            name: routeCenter.name,
        }
    }, [routeCenter])

    const mapStops = useMemo(() => (
        sequenceStops.map((s: { id: string; stop_position: number; latitude: number | null; longitude: number | null; customer_name: string; status: string; address_snapshot: string; estimated_arrival_min?: number; estimated_distance_km?: number; orders?: { total?: number } }) => ({
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
    ), [sequenceStops])

    const liveTrackingEnabled = Boolean(routeId && route && ['confirmed', 'in_progress'].includes(route.status))
    const {
        location: routeLiveLocation,
        isLoading: liveLocationLoading,
        error: liveLocationError,
        refresh: refreshLiveLocation,
    } = useRouteLiveLocation({
        routeId,
        enabled: liveTrackingEnabled,
    })

    const liveVehicleMarker = useMemo<LiveVehicleMarker | null>(() => {
        if (!routeLiveLocation) return null
        return {
            latitude: routeLiveLocation.latitude,
            longitude: routeLiveLocation.longitude,
            label: routeLiveLocation.driver_name
                || route?.vehicles?.plate
                || route?.route_number
                || 'Veiculo em rota',
            trackingStatus: routeLiveLocation.tracking_status,
            updatedAt: routeLiveLocation.last_seen_at,
            isOnline: routeLiveLocation.is_online,
        }
    }, [route?.route_number, route?.vehicles?.plate, routeLiveLocation])

    const liveTrackingTone = routeLiveLocation
        ? getTrackingStatusTone(routeLiveLocation.tracking_status, routeLiveLocation.is_online)
        : null

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
                                    <><span className="text-muted-foreground/30">⬢</span><span className="flex items-center gap-1"><Navigation className="h-3 w-3" /> {route.route_centers.name}</span></>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => {
                                void loadData()
                                if (liveTrackingEnabled) {
                                    refreshLiveLocation()
                                }
                            }}
                        >
                            <RefreshCw className="h-3 w-3" /> Atualizar
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => void handleExportPdf('standard')}
                            disabled={!!exportingPdfMode}
                        >
                            {exportingPdfMode === 'standard' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <FileDown className="h-3 w-3" />
                            )}
                            {exportingPdfMode === 'standard' ? 'Gerando PDF...' : 'Exportar PDF'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs border-slate-300"
                            onClick={() => void handleExportPdf('operational')}
                            disabled={!!exportingPdfMode}
                            title="Versão otimizada para impressão e conferência em campo"
                        >
                            {exportingPdfMode === 'operational' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <FileText className="h-3 w-3" />
                            )}
                            {exportingPdfMode === 'operational' ? 'Gerando Operacional...' : 'PDF Operacional'}
                        </Button>

                        {['draft', 'optimized', 'confirmed'].includes(route.status) && (
                            <Button size="sm" className="h-8 gap-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => void handleOptimize()} disabled={optimizing || isSavingSequence || isDeletingStop || ungeocodedStops > 0}>
                                {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                {optimizing ? 'Otimizando...' : route.status === 'draft' ? 'Otimizar Rota' : 'Reotimizar'}
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
                            <span className="text-muted-foreground">{completedCount} de {stops.length} paradas ⬢ <span className="font-bold text-navy">{progressPct}%</span></span>
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
                            {optimizationBanner.distance} km ⬢ {Math.round(optimizationBanner.duration)} min ⬢ {optimizationBanner.stops} paradas ⬢
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

            {/* ===== SPLIT-PANEL: Stops + Map ===== */}
            <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
                {/* LEFT: Tabs (Stops / Timeline) */}
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="flex border-b">
                        {[
                            { key: 'assignment' as const, label: 'Alocação', icon: UserCircle },
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

                    {/* === ASSIGNMENT TAB === */}
                    {activeTab === 'assignment' && (
                        <div className="max-h-[600px] overflow-y-auto">
                            <div className="border-b bg-slate-50/70 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <UserCircle className="h-4 w-4 text-indigo-600" />
                                        <h3 className="text-sm font-bold text-navy">Alocação Operacional</h3>
                                    </div>
                                    {isEditable ? (
                                        <Badge variant="outline" className="text-[10px] border-indigo-200 bg-indigo-50 text-indigo-700">
                                            Editável
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] border-slate-200 bg-slate-50 text-slate-600">
                                            Somente leitura
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    Defina os recursos principais da rota com consistência operacional.
                                </p>
                            </div>

                            <div className="divide-y">
                                <div className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_1fr] sm:items-center">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                        <UserCircle className="h-3.5 w-3.5 text-blue-500" /> Motorista
                                    </div>
                                    {isEditable ? (
                                        <select
                                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-navy focus:ring-2 focus:ring-blue-200"
                                            value={route.driver_id || ''}
                                            onChange={(e) => void handleAssignmentChange('driver_id', e.target.value || null)}
                                            disabled={assignSaving}
                                        >
                                            <option value="">Selecionar motorista</option>
                                            {visibleDriverOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm font-semibold text-navy">
                                            {route.drivers?.profiles?.full_name || <span className="text-muted-foreground/50">Não atribuído</span>}
                                        </p>
                                    )}
                                </div>

                                <div className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_1fr] sm:items-center">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                        <Truck className="h-3.5 w-3.5 text-amber-500" /> Veículo
                                    </div>
                                    {isEditable ? (
                                        <select
                                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-navy focus:ring-2 focus:ring-amber-200"
                                            value={route.vehicle_id || ''}
                                            onChange={(e) => void handleAssignmentChange('vehicle_id', e.target.value || null)}
                                            disabled={assignSaving}
                                        >
                                            <option value="">Selecionar veículo</option>
                                            {visibleVehicleOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm font-semibold text-navy">
                                            {route.vehicles ? `${route.vehicles.plate} - ${route.vehicles.name}` : <span className="text-muted-foreground/50">Não atribuído</span>}
                                        </p>
                                    )}
                                </div>

                                <div className="grid gap-2 px-4 py-3 sm:grid-cols-[170px_1fr] sm:items-center">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                        <Navigation className="h-3.5 w-3.5 text-violet-500" /> Centro de saída
                                    </div>
                                    {isEditable ? (
                                        <select
                                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-navy focus:ring-2 focus:ring-violet-200"
                                            value={route.center_id || ''}
                                            onChange={(e) => void handleAssignmentChange('center_id', e.target.value || null)}
                                            disabled={assignSaving}
                                        >
                                            <option value="">Selecionar centro</option>
                                            {visibleCenterOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm font-semibold text-navy">
                                            {route.route_centers?.name || <span className="text-muted-foreground/50">Não atribuído</span>}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2 border-t bg-slate-50/60 px-4 py-3 text-[11px] text-slate-600 sm:grid-cols-3">
                                <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                    Planejada: <strong className="text-navy">{formatDate(route.planned_date)}</strong>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-slate-500" />
                                    Centro: <strong className="text-navy">{route.route_centers?.city || '—'}</strong>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                    Alterações: <strong className="text-navy">{isEditable ? (assignSaving ? 'Salvando...' : 'Liberadas') : 'Bloqueadas'}</strong>
                                </span>
                            </div>
                        </div>
                    )}
                    {/* === STOPS TAB === */}
                    {activeTab === 'stops' && (
                        <div className="max-h-[600px] overflow-y-auto">
                            <RoutePendingChangesBar
                                hasPendingChanges={hasPendingSequenceChanges}
                                canEditSequence={canEditStopSequence}
                                isSavingSequence={isSavingSequence || isDeletingStop || isAddingStop}
                                isReoptimizing={optimizing}
                                lastEditSource={lastEditSource}
                                feedback={sequenceFeedback}
                                onSave={() => void handleSaveStopSequence()}
                                onDiscard={handleDiscardStopSequenceChanges}
                                onReoptimize={() => void handleOptimize()}
                            />
                            <div className="border-b bg-white px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-[11px] text-slate-600">
                                        Inclua novos pedidos aptos ao final da sequencia para complementar a operacao.
                                    </p>
                                    {canEditStopSequence ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="h-8 gap-1 bg-indigo-600 text-[11px] text-white hover:bg-indigo-700"
                                            onClick={handleOpenAddStopDialog}
                                            disabled={isSavingSequence || isDeletingStop || isAddingStop || optimizing}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Adicionar parada
                                        </Button>
                                    ) : (
                                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                            Somente leitura
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {sequenceStops.length === 0 ? (
                                <div className="p-12 text-center text-sm text-muted-foreground">Nenhuma parada nesta rota.</div>
                            ) : (
                                <RouteStopsSortableList
                                    stops={sequenceStops}
                                    routeStatus={route.status}
                                    isSequenceEditable={canEditStopSequence}
                                    actionLoading={actionLoading || isSavingSequence || isDeletingStop || isAddingStop}
                                    highlightStopId={highlightStopId}
                                    stopStatusConfig={stopStatusConfig}
                                    onToggleHighlight={(stopId) => setHighlightStopId(stopId === highlightStopId ? null : stopId)}
                                    onMoveStop={handleMoveStop}
                                    onOpenGeocode={(stop) => {
                                        setGeocodeDialog({
                                            stopId: stop.id,
                                            customerName: stop.customer_name,
                                            address: stop.address_snapshot || '',
                                            addressId: stop.address_id || undefined,
                                            lat: stop.latitude ? Number(stop.latitude) : null,
                                            lng: stop.longitude ? Number(stop.longitude) : null,
                                        })
                                    }}
                                    onRequestDeleteStop={handleRequestDeleteStop}
                                    onMarkDelivered={(stopId) => { void handleStopStatus(stopId, 'delivered') }}
                                    onRequestFailure={(stopId, customerName) => setFailureDialog({ stopId, customerName })}
                                    onReorder={(nextStops) => setDraftSequence(nextStops, 'drag')}
                                />
                            )}
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
                                        {events.map((ev) => {
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
                                                            {ev.profiles?.full_name && ` ⬢ ${ev.profiles.full_name}`}
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
                        <div className="max-h-[600px] overflow-y-auto">
                            <div className="border-b bg-slate-50/70 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Fuel className="h-4 w-4 text-emerald-600" />
                                        <h3 className="text-sm font-bold text-navy">Custos da Rota</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'text-[10px] rounded-full px-2.5 py-0.5 font-semibold',
                                                costProfile?.is_custom
                                                    ? 'border-violet-200 bg-violet-50 text-violet-700'
                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                            )}
                                        >
                                            {costProfile?.is_custom ? 'Customizado' : 'Padrão Global'}
                                        </Badge>
                                        {costProfile && !costProfile.can_edit && (
                                            <Badge variant="outline" className="text-[10px] border-slate-200 bg-slate-100 text-slate-600">
                                                Somente leitura
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    Valores baseados no padrão global, com possibilidade de override específico por rota.
                                </p>
                            </div>

                            {!costProfile || !costForm || !previewEstimate ? (
                                <div className="text-center p-8 text-sm text-muted-foreground">
                                    <Fuel className="h-8 w-8 mx-auto mb-3 opacity-20" />
                                    Não foi possível carregar o perfil de custos desta rota.
                                </div>
                            ) : (
                                <div className="space-y-4 p-4">
                                    <div className="rounded-xl border overflow-hidden">
                                        <div className="divide-y">
                                            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_1fr] sm:items-center">
                                                <div className="text-xs font-semibold text-slate-600">Preço por litro (R$)</div>
                                                <Input
                                                    inputMode="decimal"
                                                    value={costForm.fuel_price_per_liter}
                                                    onChange={(e) => handleCostFieldChange('fuel_price_per_liter', e.target.value)}
                                                    readOnly={!costProfile.can_edit}
                                                    className={cn('h-9', !costProfile.can_edit && 'bg-slate-50 text-slate-500')}
                                                    placeholder="Ex.: 6.15"
                                                />
                                            </div>
                                            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_1fr] sm:items-center">
                                                <div className="text-xs font-semibold text-slate-600">Taxa combustível (%)</div>
                                                <Input
                                                    inputMode="decimal"
                                                    value={costForm.fuel_tax_pct}
                                                    onChange={(e) => handleCostFieldChange('fuel_tax_pct', e.target.value)}
                                                    readOnly={!costProfile.can_edit}
                                                    className={cn('h-9', !costProfile.can_edit && 'bg-slate-50 text-slate-500')}
                                                    placeholder="Ex.: 2.5"
                                                />
                                            </div>
                                            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_1fr] sm:items-center">
                                                <div className="text-xs font-semibold text-slate-600">Taxa adicional (R$)</div>
                                                <Input
                                                    inputMode="decimal"
                                                    value={costForm.additional_tax}
                                                    onChange={(e) => handleCostFieldChange('additional_tax', e.target.value)}
                                                    readOnly={!costProfile.can_edit}
                                                    className={cn('h-9', !costProfile.can_edit && 'bg-slate-50 text-slate-500')}
                                                    placeholder="Ex.: 40"
                                                />
                                            </div>
                                            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_1fr] sm:items-center">
                                                <div className="text-xs font-semibold text-slate-600">Diária (R$)</div>
                                                <Input
                                                    inputMode="decimal"
                                                    value={costForm.daily_rate}
                                                    onChange={(e) => handleCostFieldChange('daily_rate', e.target.value)}
                                                    readOnly={!costProfile.can_edit}
                                                    className={cn('h-9', !costProfile.can_edit && 'bg-slate-50 text-slate-500')}
                                                    placeholder="Ex.: 180"
                                                />
                                            </div>
                                            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[190px_1fr] sm:items-center">
                                                <div className="text-xs font-semibold text-slate-600">Consumo (km/l) da rota</div>
                                                <Input
                                                    inputMode="decimal"
                                                    value={costForm.consumption_km_l}
                                                    onChange={(e) => handleCostFieldChange('consumption_km_l', e.target.value)}
                                                    readOnly={!costProfile.can_edit}
                                                    className={cn('h-9', !costProfile.can_edit && 'bg-slate-50 text-slate-500')}
                                                    placeholder="Ex.: 8.5"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-600">Observação da customização</label>
                                        <Textarea
                                            value={costForm.notes}
                                            onChange={(e) => handleCostFieldChange('notes', e.target.value)}
                                            readOnly={!costProfile.can_edit}
                                            rows={3}
                                            className={cn(!costProfile.can_edit && 'bg-slate-50 text-slate-500')}
                                            placeholder="Opcional: justificativa ou contexto da customização desta rota."
                                        />
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl border bg-slate-50 p-4">
                                            <p className="text-xs font-medium text-muted-foreground mb-1">Combustível</p>
                                            <p className="text-lg font-black text-navy">{formatCurrency(previewEstimate.fuel_cost)}</p>
                                            <p className="text-[10px] text-muted-foreground mt-1.5">
                                                {previewEstimate.liters_used}L de {previewEstimate.fuel_type} a R$ {previewEstimate.fuel_price_per_liter}/L
                                            </p>
                                        </div>
                                        <div className="rounded-xl border bg-slate-50 p-4">
                                            <p className="text-xs font-medium text-muted-foreground mb-1">Encargos + Diária</p>
                                            <p className="text-lg font-black text-navy">
                                                {formatCurrency(previewEstimate.fuel_tax_value + previewEstimate.additional_tax + previewEstimate.daily_rate)}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground mt-1.5 flex flex-col gap-0.5">
                                                <span>Taxa combustível: {formatCurrency(previewEstimate.fuel_tax_value)}</span>
                                                <span>Adicional: {formatCurrency(previewEstimate.additional_tax)}</span>
                                                <span>Diária: {formatCurrency(previewEstimate.daily_rate)}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-linear-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <span className="text-sm font-bold text-emerald-800 block">Custo Total Previsto</span>
                                            <span className="text-[10px] text-emerald-700/80">
                                                Distância da rota: {previewEstimate.distance_km} km
                                            </span>
                                        </div>
                                        <span className="text-2xl font-black text-emerald-700">
                                            {formatCurrency(previewEstimate.total_cost)}
                                        </span>
                                    </div>

                                    {hasInvalidCostInput && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
                                            Existem campos com valor inválido. Use apenas números não negativos para salvar.
                                        </div>
                                    )}
                                    {hasInvalidConsumption && (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-700">
                                            Consumo menor ou igual a zero impede o cálculo de combustível. Ajuste o km/l para obter estimativa válida.
                                        </div>
                                    )}
                                    {costFeedback && (
                                        <div className={cn(
                                            'rounded-lg border p-3 text-[11px]',
                                            costFeedback.type === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                            costFeedback.type === 'error' && 'border-red-200 bg-red-50 text-red-700',
                                            costFeedback.type === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
                                        )}>
                                            {costFeedback.message}
                                        </div>
                                    )}

                                    {costProfile.can_edit ? (
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                            <Button
                                                variant="outline"
                                                onClick={() => void handleClearRouteCostOverride()}
                                                disabled={costResetting || costSaving || !costProfile.is_custom}
                                                className="h-9"
                                            >
                                                {costResetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                                                Restaurar padrão
                                            </Button>
                                            <Button
                                                onClick={() => void handleSaveRouteCostOverride()}
                                                disabled={costSaving || costResetting || hasInvalidCostInput || !costFormDirty}
                                                className="h-9 gap-1 bg-indigo-600 hover:bg-indigo-700"
                                            >
                                                {costSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                                                Salvar customização
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                                            A rota está em status <strong>{costProfile.route_status}</strong> e os custos estão bloqueados para edição.
                                        </div>
                                    )}
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
                        ? "fixed inset-4 sm:inset-10 z-50 shadow-2xl rounded-2xl border-0 h-[calc(100dvh-2rem)]" 
                        : "rounded-xl border relative"
                )}>
                    <div className="p-3 border-b flex items-center justify-between shrink-0 bg-white">
                        <h3 className="text-sm font-bold text-navy flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-indigo-500" /> Mapa da Rota
                        </h3>
                        <div className="flex items-center gap-2">
                            {liveTrackingEnabled && (
                                <div className={cn(
                                    'hidden sm:flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] font-semibold',
                                    liveTrackingTone?.badgeClass || 'border-slate-200 bg-slate-50 text-slate-600',
                                )}>
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: liveTrackingTone?.dot || '#64748b' }}
                                    />
                                    {liveLocationLoading ? (
                                        <span className="flex items-center gap-1">
                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                            Conectando tracking...
                                        </span>
                                    ) : routeLiveLocation ? (
                                        <span className={liveTrackingTone?.textClass}>
                                            {getTrackingStatusLabel(routeLiveLocation.tracking_status)}
                                            {routeLiveLocation.last_seen_at ? ` - ${formatDateTime(routeLiveLocation.last_seen_at)}` : ''}
                                        </span>
                                    ) : (
                                        <span>Aguardando sinal do motorista</span>
                                    )}
                                </div>
                            )}
                            {sequenceStops.filter(s => !s.latitude || !s.longitude).length > 0 && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    {sequenceStops.filter(s => !s.latitude || !s.longitude).length} sem coordenadas
                                </span>
                            )}
                            {['optimized', 'confirmed', 'in_progress'].includes(route.status) && (
                                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                    onClick={handleRecalculateRoute} disabled={optimizing || isSavingSequence || isDeletingStop || hasPendingSequenceChanges}>
                                    {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}
                                    {!hasPendingSequenceChanges && route.route_polyline ? 'Recalcular' : 'Traçar Rota'}
                                </Button>
                            )}
                            {liveTrackingEnabled && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg hover:bg-slate-100"
                                    onClick={refreshLiveLocation}
                                    title="Atualizar posicao ao vivo"
                                >
                                    <RefreshCw className="h-3.5 w-3.5 text-slate-600" />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-slate-100" onClick={() => setIsMapExpanded(!isMapExpanded)}>
                                {isMapExpanded ? <Minimize2 className="h-4 w-4 text-slate-600" /> : <Maximize2 className="h-4 w-4 text-slate-600" />}
                            </Button>
                        </div>
                    </div>
                    <div className={cn("flex-1 min-h-0 bg-slate-50 relative", isMapExpanded ? "p-0 h-full" : "p-3")}>
                        <RouteMap
                            center={mapCenter}
                            stops={mapStops}
                            polyline={hasPendingSequenceChanges ? null : route.route_polyline}
                            height={isMapExpanded ? "100%" : "520px"}
                            className={isMapExpanded ? "h-full border-0 rounded-none" : ""}
                            totalDistance={route.total_distance_km}
                            totalDuration={route.total_duration_min}
                            engine={route.optimization_engine || route.optimization_result?.engine}
                            highlightStopId={highlightStopId}
                            onStopClick={(id) => setHighlightStopId(id === highlightStopId ? null : id)}
                            liveVehicle={liveVehicleMarker}
                            showOverlayPanels={isMapExpanded}
                        />
                    </div>
                    {!isMapExpanded && (
                        <div className="border-t bg-white px-3 py-2">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-600">
                                <span className="font-semibold uppercase tracking-wide text-slate-500">Status:</span>
                                {stopLegendCompact.map((item) => (
                                    <span key={item.key} className="inline-flex items-center gap-1.5">
                                        <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: item.color }} />
                                        {item.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {liveTrackingEnabled && liveLocationError && (
                        <div className="border-t bg-red-50 px-3 py-2 text-[11px] text-red-700">
                            Falha no rastreamento em tempo real: {liveLocationError}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== DIALOGS ===== */}

            <AlertDialog open={pendingReoptimizeDialogOpen} onOpenChange={setPendingReoptimizeDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Existem alteracoes de sequencia pendentes</AlertDialogTitle>
                        <AlertDialogDescription>
                            Escolha como deseja seguir antes de reotimizar a rota.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-2">
                        <Button
                            type="button"
                            className="justify-start bg-indigo-600 text-white hover:bg-indigo-700"
                            onClick={() => { void handleApplyPendingAndReoptimize() }}
                            disabled={isSavingSequence || optimizing || isDeletingStop || isAddingStop}
                        >
                            Aplicar pendencias e reotimizar
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="justify-start"
                            onClick={() => { void handleDiscardAndReoptimize() }}
                            disabled={isSavingSequence || optimizing || isDeletingStop || isAddingStop}
                        >
                            Descartar pendencias e reotimizar
                        </Button>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSavingSequence || optimizing || isDeletingStop || isAddingStop}>Cancelar</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog
                open={addStopDialogOpen}
                onOpenChange={(open) => {
                    if (!open) handleCloseAddStopDialog()
                }}
            >
                <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-4xl overflow-hidden p-0">
                    <div className="flex max-h-[88dvh] min-h-0 flex-col">
                        <DialogHeader className="border-b px-5 py-4">
                            <DialogTitle className="flex items-center gap-2 text-base">
                                <Plus className="h-4 w-4 text-indigo-600" />
                                Adicionar parada por pedido
                            </DialogTitle>
                            <p className="text-xs text-slate-500">
                                Selecione um pedido Pre-venda apto para inserir no fim da sequencia desta rota. Pedidos Pronta entrega nao entram em rotas.
                            </p>
                        </DialogHeader>

                        <div className="border-b bg-slate-50/70 px-5 py-4">
                            <div className="grid gap-2 lg:grid-cols-[1.5fr_180px]">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        value={addStopSearchInput}
                                        onChange={(event) => setAddStopSearchInput(event.target.value)}
                                        placeholder="Buscar por pedido ou cliente..."
                                        className="h-9 pl-8"
                                    />
                                </div>
                                <select
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-navy focus:ring-2 focus:ring-violet-200"
                                    value={addStopFilters.status}
                                    onChange={(event) => {
                                        const value = event.target.value
                                        setAddStopFilters((previous) => ({ ...previous, status: value }))
                                        setAddStopPage(1)
                                    }}
                                >
                                    {addStopStatusOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <select
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-navy focus:ring-2 focus:ring-violet-200"
                                    value={addStopFilters.city}
                                    onChange={(event) => {
                                        const value = event.target.value
                                        setAddStopFilters((previous) => ({ ...previous, city: value }))
                                        setAddStopPage(1)
                                    }}
                                >
                                    <option value="">Todas cidades</option>
                                    {addStopCityOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <select
                                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-navy focus:ring-2 focus:ring-violet-200"
                                    value={addStopFilters.region}
                                    onChange={(event) => {
                                        const value = event.target.value
                                        setAddStopFilters((previous) => ({ ...previous, region: value }))
                                        setAddStopPage(1)
                                    }}
                                >
                                    <option value="">Todas regioes</option>
                                    {addStopRegionOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <Input
                                    type="date"
                                    className="h-9"
                                    value={addStopFilters.date}
                                    onChange={(event) => {
                                        const value = event.target.value
                                        setAddStopFilters((previous) => ({ ...previous, date: value }))
                                        setAddStopPage(1)
                                    }}
                                />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                            {addStopOrdersLoading ? (
                                <div className="space-y-2">
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <Skeleton key={index} className="h-14 w-full rounded-lg" />
                                    ))}
                                </div>
                            ) : addStopOrdersError ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {addStopOrdersError}
                                </div>
                            ) : addStopOrders.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                    Nenhum pedido apto encontrado com os filtros atuais.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {addStopOrders.map((order) => {
                                        const selected = addStopSelectedOrderId === order.order_id
                                        return (
                                            <div
                                                key={order.order_id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setAddStopSelectedOrderId(order.order_id)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault()
                                                        setAddStopSelectedOrderId(order.order_id)
                                                    }
                                                }}
                                                className={cn(
                                                    'rounded-xl border px-3 py-2.5 transition',
                                                    'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40',
                                                    selected
                                                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                                                        : 'border-slate-200 bg-white',
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <input
                                                        type="radio"
                                                        name="add-stop-order"
                                                        className="mt-1 h-4 w-4 accent-indigo-600"
                                                        checked={selected}
                                                        onChange={() => setAddStopSelectedOrderId(order.order_id)}
                                                        onClick={(event) => event.stopPropagation()}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="truncate text-sm font-semibold text-navy">{order.company_name || 'Cliente sem nome'}</p>
                                                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                                                {order.order_number}
                                                            </Badge>
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    'text-[10px]',
                                                                    order.status === 'approved'
                                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                        : 'border-blue-200 bg-blue-50 text-blue-700',
                                                                )}
                                                            >
                                                                {order.status === 'approved' ? 'Aprovado' : 'Em producao'}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-1 text-xs text-slate-600">
                                                            {order.shipping_address || '-'}
                                                        </p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                                                            <span>{order.city || '-'} / {order.state || '-'}</span>
                                                            <span>R$ {Number(order.total || 0).toFixed(2)}</span>
                                                            {order.region_label ? <span>{order.region_label}</span> : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <DialogFooter className="border-t px-5 py-3 sm:justify-between">
                            <div className="text-xs text-slate-500">
                                Pagina {addStopPagination.page} de {addStopPagination.totalPages} • {addStopPagination.total} pedido(s)
                                {addStopSelectedOrder ? ` • Selecionado: ${addStopSelectedOrder.order_number}` : ''}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAddStopPage((previous) => Math.max(1, previous - 1))}
                                    disabled={!addStopPagination.hasPreviousPage || addStopOrdersLoading || isAddingStop}
                                >
                                    Anterior
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAddStopPage((previous) => previous + 1)}
                                    disabled={!addStopPagination.hasNextPage || addStopOrdersLoading || isAddingStop}
                                >
                                    Proxima
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleCloseAddStopDialog}
                                    disabled={isAddingStop}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                                    onClick={() => { void handleConfirmAddStop() }}
                                    disabled={!canSubmitAddStop}
                                >
                                    {isAddingStop ? (
                                        <>
                                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                            Adicionando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="mr-1 h-3.5 w-3.5" />
                                            Adicionar parada
                                        </>
                                    )}
                                </Button>
                            </div>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={pendingAddStopDialogOpen}
                onOpenChange={(open) => {
                    if (!open && !isAddingStop && !isSavingSequence) {
                        setPendingAddStopDialogOpen(false)
                        setAddStopDialogOpen(true)
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Alteracoes pendentes antes de adicionar parada</AlertDialogTitle>
                        <AlertDialogDescription>
                            Escolha como tratar a sequencia atual antes de adicionar o novo pedido ao fim da rota.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        <p><strong>Pedido:</strong> {pendingAddStopOrder?.order_number || '-'}</p>
                        <p><strong>Cliente:</strong> {pendingAddStopOrder?.company_name || '-'}</p>
                    </div>
                    <div className="grid gap-2">
                        <Button
                            type="button"
                            className="justify-start bg-indigo-600 text-white hover:bg-indigo-700"
                            onClick={() => { void handleApplyPendingAndAddStop() }}
                            disabled={isSavingSequence || isAddingStop || optimizing}
                        >
                            Salvar pendencias e adicionar
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="justify-start border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => { void handleDiscardPendingAndAddStop() }}
                            disabled={isSavingSequence || isAddingStop || optimizing}
                        >
                            Descartar pendencias e adicionar
                        </Button>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={isSavingSequence || isAddingStop || optimizing}
                            onClick={() => {
                                setPendingAddStopDialogOpen(false)
                                setAddStopDialogOpen(true)
                            }}
                        >
                            Cancelar
                        </AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={!!deleteStopDialog}
                onOpenChange={(open) => { if (!open && !isDeletingStop && !isAddingStop) setDeleteStopDialog(null) }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir parada da rota?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acao remove a parada da rota e devolve o pedido para roteirizacao.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        <p><strong>Cliente:</strong> {deleteStopDialog?.customer_name || '-'}</p>
                        <p><strong>Pedido:</strong> {deleteStopDialog?.orders?.order_number || deleteStopDialog?.order_id || '-'}</p>
                        <p><strong>Posicao atual:</strong> #{deleteStopDialog?.stop_position || '-'}</p>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingStop || isAddingStop}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault()
                                void handleConfirmDeleteStop()
                            }}
                            disabled={isDeletingStop || isAddingStop}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeletingStop ? 'Excluindo...' : 'Excluir parada'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={!!pendingDeleteStopDialog}
                onOpenChange={(open) => { if (!open && !isDeletingStop && !isAddingStop) setPendingDeleteStopDialog(null) }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Alteracoes pendentes antes da exclusao</AlertDialogTitle>
                        <AlertDialogDescription>
                            Escolha como tratar a sequencia atual antes de excluir a parada.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        <p><strong>Cliente:</strong> {pendingDeleteStopDialog?.customer_name || '-'}</p>
                        <p><strong>Pedido:</strong> {pendingDeleteStopDialog?.orders?.order_number || pendingDeleteStopDialog?.order_id || '-'}</p>
                        <p><strong>Posicao atual:</strong> #{pendingDeleteStopDialog?.stop_position || '-'}</p>
                    </div>
                    <div className="grid gap-2">
                        <Button
                            type="button"
                            className="justify-start bg-indigo-600 text-white hover:bg-indigo-700"
                            onClick={() => { void handleApplyPendingAndDeleteStop() }}
                            disabled={isSavingSequence || isDeletingStop || optimizing || isAddingStop}
                        >
                            Salvar pendencias e excluir
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="justify-start border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => { void handleDiscardPendingAndDeleteStop() }}
                            disabled={isSavingSequence || isDeletingStop || optimizing || isAddingStop}
                        >
                            Descartar pendencias e excluir
                        </Button>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSavingSequence || isDeletingStop || optimizing || isAddingStop}>Cancelar</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                            throw new Error(res.error)
                        }
                        setGeocodeDialog(null)
                        void loadData()
                    }}
                />
            )}
        </div>
    )
}
