'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import { ROUTE_STYLE } from './map-config'
import { attachResizeObserver, createLogisticsMap } from './map-provider'
import { buildBounds, decodePolyline, type MapLngLat } from './map-utils'
import { getTrackingStatusLabel, type LiveVehicleMarker } from '@/lib/logistics/live-tracking'

export interface RouteStop {
    id: string
    position: number
    latitude: number | null
    longitude: number | null
    customer_name: string
    status: string
    address_snapshot?: string
    estimated_arrival_min?: number | null
    estimated_distance_km?: number | null
    order_total?: number | null
}

export interface RouteMapProps {
    center?: { lat: number; lng: number; name?: string } | null
    stops: RouteStop[]
    polyline?: string | null
    height?: string
    className?: string
    totalDistance?: number | null
    totalDuration?: number | null
    engine?: string | null
    highlightStopId?: string | null
    onStopClick?: (stopId: string) => void
    compact?: boolean
    liveVehicle?: LiveVehicleMarker | null
    showOverlayPanels?: boolean
}

const statusColors: Record<string, { bg: string; label: string }> = {
    pending: { bg: '#64748b', label: 'Pendente' },
    arrived: { bg: '#3b82f6', label: 'Chegou' },
    delivered: { bg: '#10b981', label: 'Entregue' },
    failed: { bg: '#ef4444', label: 'Insucesso' },
    skipped: { bg: '#f59e0b', label: 'Pulada' },
}

const ROUTE_SOURCE_ID = 'route-geometry-source'
const ROUTE_LAYER_GLOW_ID = 'route-geometry-glow'
const ROUTE_LAYER_MAIN_ID = 'route-geometry-main'
const ROUTE_LAYER_DASHED_ID = 'route-geometry-dashed'

type MarkerEntry = {
    marker: maplibregl.Marker
    element: HTMLButtonElement
    position: number
    color: string
}

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function applyStopMarkerStyles(
    element: HTMLButtonElement,
    position: number,
    color: string,
    highlighted: boolean,
) {
    const size = highlighted ? 34 : 28
    const border = highlighted ? '3px solid #4f46e5' : '2.5px solid white'
    const shadow = highlighted
        ? '0 0 0 4px rgba(79,70,229,0.3), 0 2px 8px rgba(0,0,0,0.3)'
        : '0 2px 6px rgba(0,0,0,0.3)'

    element.style.width = `${size}px`
    element.style.height = `${size}px`
    element.style.border = border
    element.style.boxShadow = shadow
    element.style.background = color
    element.style.color = 'white'
    element.style.borderRadius = '999px'
    element.style.display = 'grid'
    element.style.placeItems = 'center'
    element.style.fontWeight = '700'
    element.style.fontSize = highlighted ? '14px' : '12px'
    element.style.lineHeight = '1'
    element.style.cursor = 'pointer'
    element.style.padding = '0'
    element.style.transition = 'all 0.2s ease'
    element.style.outline = 'none'
    element.style.pointerEvents = 'auto'
    element.textContent = String(position)
}

function createStopMarkerElement(position: number, color: string) {
    const element = document.createElement('button')
    element.type = 'button'
    applyStopMarkerStyles(element, position, color, false)
    return element
}

function createDepotMarkerElement() {
    const element = document.createElement('div')
    element.style.width = '36px'
    element.style.height = '36px'
    element.style.borderRadius = '999px'
    element.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)'
    element.style.color = 'white'
    element.style.fontWeight = '900'
    element.style.fontSize = '12px'
    element.style.display = 'grid'
    element.style.placeItems = 'center'
    element.style.border = '3px solid white'
    element.style.boxShadow = '0 3px 12px rgba(99,102,241,0.5)'
    element.textContent = 'CD'
    return element
}

function createVehicleMarkerElement(color: string) {
    const element = document.createElement('button')
    element.type = 'button'
    element.style.width = '34px'
    element.style.height = '34px'
    element.style.borderRadius = '999px'
    element.style.background = color
    element.style.color = 'white'
    element.style.fontWeight = '900'
    element.style.fontSize = '11px'
    element.style.display = 'grid'
    element.style.placeItems = 'center'
    element.style.border = '3px solid white'
    element.style.boxShadow = '0 3px 12px rgba(15,23,42,0.35)'
    element.style.cursor = 'pointer'
    element.style.padding = '0'
    element.style.outline = 'none'
    element.textContent = 'V'
    return element
}

function applyVehicleMarkerStyle(
    element: HTMLElement,
    color: string,
    online: boolean,
) {
    element.style.background = color
    element.style.boxShadow = online
        ? '0 0 0 6px rgba(16,185,129,0.18), 0 3px 12px rgba(15,23,42,0.32)'
        : '0 3px 10px rgba(100,116,139,0.35)'
}

function resolveVehicleColor(trackingStatus?: string | null, isOnline?: boolean) {
    if (!isOnline) return '#64748b'
    if (trackingStatus === 'active') return '#10b981'
    if (trackingStatus === 'awaiting_permission') return '#f59e0b'
    if (trackingStatus === 'paused') return '#475569'
    if (trackingStatus === 'offline' || trackingStatus === 'unavailable') return '#ef4444'
    return '#6366f1'
}

function formatTimeLabel(dateValue: string | null | undefined) {
    if (!dateValue) return null
    const timestamp = new Date(dateValue).getTime()
    if (Number.isNaN(timestamp)) return null

    const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
    if (diffSeconds < 60) return `${diffSeconds}s atras`

    const diffMinutes = Math.round(diffSeconds / 60)
    if (diffMinutes < 60) return `${diffMinutes} min atras`

    const diffHours = Math.round(diffMinutes / 60)
    return `${diffHours}h atras`
}

function buildStopPopup(stop: RouteStop, status: { bg: string; label: string }, detailed: boolean) {
    if (!detailed) {
        return `
            <div style="min-width:140px;font-family:system-ui,sans-serif;">
                <strong style="font-size:12px;color:#1e1b4b;display:block;">${escapeHtml(stop.customer_name)}</strong>
                <span style="font-size:10px;color:#64748b;">${status.label}</span>
            </div>
        `
    }

    const address = stop.address_snapshot?.replace(/\[.*?\]\s*/g, '') || ''
    const etaHtml = stop.estimated_arrival_min !== null && stop.estimated_arrival_min !== undefined
        ? `<div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
             <span style="font-size:10px;color:#6366f1;font-weight:600;">ETA: ${stop.estimated_arrival_min} min</span>
             ${stop.estimated_distance_km !== null && stop.estimated_distance_km !== undefined ? `<span style="font-size:10px;color:#64748b;">- ${stop.estimated_distance_km} km</span>` : ''}
           </div>`
        : ''

    const totalHtml = stop.order_total !== null && stop.order_total !== undefined
        ? `<div style="font-size:11px;color:#1e1b4b;font-weight:700;margin-top:3px;">${formatCurrency(stop.order_total)}</div>`
        : ''

    return `
        <div style="min-width:200px;max-width:260px;font-family:system-ui,sans-serif;">
            <div style="display:flex;align-items:flex-start;gap:8px;">
                <div style="
                    width:26px;height:26px;border-radius:50%;
                    background:${status.bg};color:white;font-weight:700;font-size:11px;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0;
                ">${stop.position}</div>
                <div style="flex:1;min-width:0;">
                    <strong style="font-size:12px;color:#1e1b4b;display:block;line-height:1.3;">${escapeHtml(stop.customer_name)}</strong>
                    ${address ? `<span style="font-size:10px;color:#94a3b8;display:block;margin-top:2px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(address)}</span>` : ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;">
                <span style="
                    font-size:10px;font-weight:600;color:${status.bg};
                    background:${status.bg}15;border:1px solid ${status.bg}30;
                    border-radius:999px;padding:1px 8px;
                ">${status.label}</span>
                ${totalHtml}
            </div>
            ${etaHtml}
        </div>
    `
}

function buildFallbackRouteLine(
    center: { lat: number; lng: number } | null | undefined,
    stops: RouteStop[],
) {
    const points: MapLngLat[] = []

    if (center?.lat !== undefined && center.lng !== undefined) {
        points.push([center.lng, center.lat])
    }

    stops
        .sort((a, b) => a.position - b.position)
        .forEach((stop) => {
            if (stop.latitude !== null && stop.longitude !== null) {
                points.push([stop.longitude, stop.latitude])
            }
        })

    if (center?.lat !== undefined && center.lng !== undefined && points.length > 1) {
        points.push([center.lng, center.lat])
    }

    return points
}

function ensureRouteLayers(map: maplibregl.Map) {
    if (!map.getSource(ROUTE_SOURCE_ID)) {
        const emptyFeatureCollection: FeatureCollection<LineString> = {
            type: 'FeatureCollection',
            features: [],
        }
        map.addSource(ROUTE_SOURCE_ID, {
            type: 'geojson',
            data: emptyFeatureCollection,
        })
    }

    if (!map.getLayer(ROUTE_LAYER_GLOW_ID)) {
        map.addLayer({
            id: ROUTE_LAYER_GLOW_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            filter: ['==', ['get', 'style'], 'glow'],
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: {
                'line-color': ROUTE_STYLE.glow.color,
                'line-width': ROUTE_STYLE.glow.width,
                'line-opacity': ROUTE_STYLE.glow.opacity,
            },
        })
    }

    if (!map.getLayer(ROUTE_LAYER_MAIN_ID)) {
        map.addLayer({
            id: ROUTE_LAYER_MAIN_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            filter: ['==', ['get', 'style'], 'main'],
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: {
                'line-color': ROUTE_STYLE.main.color,
                'line-width': ROUTE_STYLE.main.width,
                'line-opacity': ROUTE_STYLE.main.opacity,
            },
        })
    }

    if (!map.getLayer(ROUTE_LAYER_DASHED_ID)) {
        map.addLayer({
            id: ROUTE_LAYER_DASHED_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            filter: ['==', ['get', 'style'], 'dashed'],
            layout: {
                'line-join': 'round',
                'line-cap': 'round',
            },
            paint: {
                'line-color': ROUTE_STYLE.dashedFallback.color,
                'line-width': ROUTE_STYLE.dashedFallback.width,
                'line-opacity': ROUTE_STYLE.dashedFallback.opacity,
                'line-dasharray': ROUTE_STYLE.dashedFallback.dashArray,
            },
        })
    }
}

function updateRouteGeometry(
    map: maplibregl.Map,
    points: MapLngLat[],
    fallbackLine: boolean,
) {
    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined
    if (!source) return

    const features: Feature<LineString>[] = []
    if (points.length > 1) {
        if (fallbackLine) {
            features.push({
                type: 'Feature',
                properties: { style: 'dashed' },
                geometry: {
                    type: 'LineString',
                    coordinates: points,
                },
            })
        } else {
            features.push(
                {
                    type: 'Feature',
                    properties: { style: 'glow' },
                    geometry: {
                        type: 'LineString',
                        coordinates: points,
                    },
                },
                {
                    type: 'Feature',
                    properties: { style: 'main' },
                    geometry: {
                        type: 'LineString',
                        coordinates: points,
                    },
                },
            )
        }
    }

    const featureCollection: FeatureCollection<LineString> = {
        type: 'FeatureCollection',
        features,
    }
    source.setData(featureCollection)
}

function getEngineLabel(engine?: string | null) {
    if (!engine) return null
    if (engine === 'osrm_nn') return 'OSRM'
    if (engine === 'ors_vroom') return 'ORS Vroom'
    return engine
}

export default function RouteMap({
    center,
    stops,
    polyline,
    height = '500px',
    className = '',
    totalDistance,
    totalDuration,
    engine,
    highlightStopId,
    onStopClick,
    compact = false,
    liveVehicle = null,
    showOverlayPanels = true,
}: RouteMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const mapReadyRef = useRef(false)
    const resizeControllerRef = useRef<ReturnType<typeof attachResizeObserver> | null>(null)
    const stopMarkersRef = useRef<Map<string, MarkerEntry>>(new Map())
    const depotMarkerRef = useRef<maplibregl.Marker | null>(null)
    const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null)
    const onStopClickRef = useRef(onStopClick)
    const renderRef = useRef<() => void>(() => { })

    const validStops = useMemo(() => (
        stops.filter((stop) => (
            stop.latitude !== null
            && stop.longitude !== null
            && Number.isFinite(stop.latitude)
            && Number.isFinite(stop.longitude)
        ))
    ), [stops])

    const sortedStops = useMemo(() => (
        [...validStops].sort((a, b) => a.position - b.position)
    ), [validStops])

    const clearMarkers = useCallback(() => {
        stopMarkersRef.current.forEach((entry) => entry.marker.remove())
        stopMarkersRef.current.clear()
        depotMarkerRef.current?.remove()
        depotMarkerRef.current = null
    }, [])

    const renderMapData = useCallback(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return

        ensureRouteLayers(map)
        clearMarkers()

        const boundsPoints: MapLngLat[] = []
        const hasCenter = center?.lat !== undefined && center?.lng !== undefined
        const shouldRenderDetailedPopups = !compact && sortedStops.length <= 80

        if (hasCenter) {
            const depotElement = createDepotMarkerElement()
            const depotMarker = new maplibregl.Marker({ element: depotElement, anchor: 'center' })
                .setLngLat([center.lng, center.lat])
                .setPopup(
                    new maplibregl.Popup({ offset: 18 }).setHTML(`
                        <div style="min-width:180px;font-family:system-ui,sans-serif;">
                            <strong style="font-size:13px;color:#1e1b4b;">Centro de Distribuicao</strong>
                            ${center?.name ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">${escapeHtml(center.name)}</div>` : ''}
                        </div>
                    `),
                )
                .addTo(map)

            depotMarkerRef.current = depotMarker
            boundsPoints.push([center.lng, center.lat])
        }

        sortedStops.forEach((stop) => {
            const status = statusColors[stop.status] || statusColors.pending
            const markerElement = createStopMarkerElement(stop.position, status.bg)
            const popupHtml = buildStopPopup(stop, status, shouldRenderDetailedPopups)
            const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
                .setLngLat([stop.longitude!, stop.latitude!])
                .setPopup(
                    new maplibregl.Popup({
                        offset: 18,
                        closeButton: false,
                        maxWidth: shouldRenderDetailedPopups ? '280px' : '220px',
                    }).setHTML(popupHtml),
                )
                .addTo(map)

            markerElement.addEventListener('click', () => {
                onStopClickRef.current?.(stop.id)
            })

            stopMarkersRef.current.set(stop.id, {
                marker,
                element: markerElement,
                position: stop.position,
                color: status.bg,
            })
            boundsPoints.push([stop.longitude!, stop.latitude!])
        })

        let routePoints: MapLngLat[] = []
        let fallbackLine = false

        if (polyline) {
            try {
                routePoints = decodePolyline(polyline)
            } catch {
                fallbackLine = true
                routePoints = buildFallbackRouteLine(center, sortedStops)
            }
        } else {
            fallbackLine = true
            routePoints = buildFallbackRouteLine(center, sortedStops)
        }

        updateRouteGeometry(map, routePoints, fallbackLine)
        boundsPoints.push(...routePoints)

        const bounds = buildBounds(boundsPoints)
        if (bounds) {
            map.fitBounds(bounds, {
                padding: compact ? 40 : 60,
                maxZoom: 15,
                duration: 0,
            })
        } else if (hasCenter) {
            map.easeTo({
                center: [center.lng, center.lat],
                zoom: 13,
                duration: 0,
            })
        }

        resizeControllerRef.current?.scheduleResize()
    }, [center, clearMarkers, compact, polyline, sortedStops])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return

        const hasLiveCoords = !!(
            liveVehicle
            && Number.isFinite(liveVehicle.latitude)
            && Number.isFinite(liveVehicle.longitude)
        )

        if (!hasLiveCoords || !liveVehicle) {
            vehicleMarkerRef.current?.remove()
            vehicleMarkerRef.current = null
            return
        }

        const markerColor = resolveVehicleColor(liveVehicle.trackingStatus, liveVehicle.isOnline)
        const markerPosition: [number, number] = [liveVehicle.longitude, liveVehicle.latitude]

        const markerLabel = liveVehicle.label || 'Veiculo'
        const trackingLabel = getTrackingStatusLabel(liveVehicle.trackingStatus || 'active')
        const timeLabel = formatTimeLabel(liveVehicle.updatedAt)
        const statusHtml = liveVehicle.isOnline ? 'Online' : 'Offline'
        const popupHtml = `
            <div style="min-width:180px;font-family:system-ui,sans-serif;">
                <strong style="font-size:12px;color:#1e1b4b;display:block;">${escapeHtml(markerLabel)}</strong>
                <div style="margin-top:4px;font-size:11px;color:#334155;display:flex;align-items:center;gap:6px;">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${liveVehicle.isOnline ? '#10b981' : '#64748b'};"></span>
                    ${statusHtml}
                </div>
                <div style="margin-top:3px;font-size:10px;color:#64748b;">${escapeHtml(trackingLabel)}</div>
                ${timeLabel ? `<div style="margin-top:3px;font-size:10px;color:#94a3b8;">Atualizado ${escapeHtml(timeLabel)}</div>` : ''}
            </div>
        `

        if (!vehicleMarkerRef.current) {
            const vehicleElement = createVehicleMarkerElement(markerColor)
            applyVehicleMarkerStyle(vehicleElement, markerColor, Boolean(liveVehicle.isOnline))
            const vehicleMarker = new maplibregl.Marker({
                element: vehicleElement,
                anchor: 'center',
            })
                .setLngLat(markerPosition)
                .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml))
                .addTo(map)

            vehicleMarkerRef.current = vehicleMarker
            return
        }

        vehicleMarkerRef.current.setLngLat(markerPosition)
        vehicleMarkerRef.current.setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml))

        const existingElement = vehicleMarkerRef.current.getElement()
        applyVehicleMarkerStyle(existingElement, markerColor, Boolean(liveVehicle.isOnline))
    }, [liveVehicle])

    useEffect(() => {
        onStopClickRef.current = onStopClick
    }, [onStopClick])

    useEffect(() => {
        renderRef.current = renderMapData
    }, [renderMapData])

    useEffect(() => {
        const container = mapContainerRef.current
        if (!container || mapRef.current) return

        const { map } = createLogisticsMap({
            container,
            center: center ? [center.lng, center.lat] : undefined,
            zoom: center ? 12 : undefined,
        })

        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

        const resizeController = attachResizeObserver(map, container)
        resizeControllerRef.current = resizeController

        const handleReady = () => {
            mapReadyRef.current = true
            ensureRouteLayers(map)
            renderRef.current()
            resizeController.scheduleResize()
        }

        map.on('load', handleReady)
        map.on('style.load', handleReady)

        return () => {
            map.off('load', handleReady)
            map.off('style.load', handleReady)
            mapReadyRef.current = false
            clearMarkers()
            resizeController.destroy()
            resizeControllerRef.current = null
            map.remove()
            mapRef.current = null
        }
        // center is intentionally excluded here to avoid remounting the map instance.
        // Data recentering is handled by renderMapData().
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearMarkers])

    useEffect(() => {
        renderMapData()
    }, [renderMapData])

    useEffect(() => {
        stopMarkersRef.current.forEach((entry, stopId) => {
            applyStopMarkerStyles(
                entry.element,
                entry.position,
                entry.color,
                stopId === highlightStopId,
            )
        })

        if (!highlightStopId) return

        const entry = stopMarkersRef.current.get(highlightStopId)
        const map = mapRef.current
        if (!entry || !map) return

        const popup = entry.marker.getPopup()
        if (popup && !popup.isOpen()) {
            entry.marker.togglePopup()
        }

        map.easeTo({
            center: entry.marker.getLngLat(),
            zoom: Math.max(map.getZoom(), 15),
            duration: 500,
        })
    }, [highlightStopId])

    useEffect(() => {
        const timeouts = [0, 120, 280, 480, 800].map((delay) => (
            setTimeout(() => resizeControllerRef.current?.scheduleResize(), delay)
        ))
        return () => {
            timeouts.forEach((timerId) => clearTimeout(timerId))
        }
    }, [height, className])

    const engineLabel = getEngineLabel(engine)
    const showSummaryCard = showOverlayPanels && !compact && (totalDistance || totalDuration || validStops.length > 0)

    return (
        <div className="relative isolate z-0" style={{ height, width: '100%' }}>
            <div
                ref={mapContainerRef}
                className={`rounded-xl overflow-hidden border z-0 bg-slate-100 ${className}`}
                style={{ height: '100%', width: '100%' }}
            />

            {showSummaryCard && (
                <div className="absolute left-3 top-3 z-10 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-950">Resumo da Rota</div>
                    {totalDistance ? (
                        <div className="text-sm font-bold text-indigo-950">{totalDistance} km</div>
                    ) : null}
                    {totalDuration ? (
                        <div className="text-sm font-semibold text-indigo-950">{Math.round(totalDuration)} min</div>
                    ) : null}
                    <div className="text-sm font-semibold text-indigo-950">{validStops.length} paradas</div>
                    {engineLabel ? (
                        <div className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-400">Engine: {engineLabel}</div>
                    ) : null}
                </div>
            )}

            {showOverlayPanels && !compact && (
                <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</div>
                    <div className="space-y-1">
                        {Object.entries(statusColors).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                <span
                                    className="h-2.5 w-2.5 rounded-full border border-white shadow-sm"
                                    style={{ backgroundColor: value.bg }}
                                />
                                {value.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
