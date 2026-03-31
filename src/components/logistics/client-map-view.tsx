'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Loader2, MapPin } from 'lucide-react'
import { attachResizeObserver, createLogisticsMap } from './map-provider'
import { buildBounds, type MapLngLat } from './map-utils'
import type { ClientMapBootState, ClientMapItem, ClientMapMode } from './client-map-types'

interface ClientMapViewProps {
    clients: ClientMapItem[]
    selectedClientIds: Set<string>
    focusedClientId: string | null
    onToggleClient: (storeId: string) => void
    onFocusClient: (storeId: string) => void
    onOpenGeocode?: (storeId: string) => void
    loading?: boolean
    className?: string
    mode?: ClientMapMode
    geocodeTargetStoreId?: string | null
    geocodeCoords?: { lat: number; lng: number } | null
    onGeocodeCoordsChange?: (coords: { lat: number; lng: number }) => void
    onBootStateChange?: (state: ClientMapBootState) => void
    mapReinitKey?: number
}

const SOURCE_ID = 'clients-source'
const CLUSTER_LAYER_ID = 'clients-clusters'
const CLUSTER_COUNT_LAYER_ID = 'clients-cluster-count'
const POINTS_LAYER_ID = 'clients-points'

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function buildClientFeatures(
    clients: ClientMapItem[],
    selectedClientIds: Set<string>,
    focusedClientId: string | null,
) {
    return {
        type: 'FeatureCollection' as const,
        features: clients
            .filter((client) => (
                Number.isFinite(client.latitude)
                && Number.isFinite(client.longitude)
            ))
            .map((client) => ({
                type: 'Feature' as const,
                geometry: {
                    type: 'Point' as const,
                    coordinates: [Number(client.longitude), Number(client.latitude)] as [number, number],
                },
                properties: {
                    store_id: client.store_id,
                    company_name: client.company_name,
                    client_name: client.client_name,
                    city: client.city,
                    state: client.state,
                    region: client.region || '',
                    cnpj: client.cnpj || '',
                    has_orders: client.has_routable_orders ? 1 : 0,
                    orders_count: client.routable_orders_count,
                    is_selected: selectedClientIds.has(client.store_id) ? 1 : 0,
                    is_focused: focusedClientId === client.store_id ? 1 : 0,
                },
            })),
    }
}

function ensureClientLayers(map: maplibregl.Map) {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [],
            },
            cluster: true,
            clusterMaxZoom: 13,
            clusterRadius: 44,
        })
    }

    if (!map.getLayer(CLUSTER_LAYER_ID)) {
        map.addLayer({
            id: CLUSTER_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#1e293b',
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    18,
                    30,
                    24,
                    80,
                    30,
                ],
                'circle-opacity': 0.88,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
            },
        })
    }

    if (!map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
            id: CLUSTER_COUNT_LAYER_ID,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['Open Sans Bold'],
                'text-size': 12,
            },
            paint: {
                'text-color': '#ffffff',
            },
        })
    }

    if (!map.getLayer(POINTS_LAYER_ID)) {
        map.addLayer({
            id: POINTS_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': [
                    'case',
                    ['==', ['get', 'is_focused'], 1], '#1d4ed8',
                    ['==', ['get', 'is_selected'], 1], '#4f46e5',
                    ['==', ['get', 'has_orders'], 1], '#0891b2',
                    '#64748b',
                ],
                'circle-radius': [
                    'case',
                    ['==', ['get', 'is_focused'], 1], 12,
                    ['==', ['get', 'is_selected'], 1], 10,
                    ['==', ['get', 'has_orders'], 1], 8,
                    7,
                ],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': [
                    'case',
                    ['==', ['get', 'is_focused'], 1], 3,
                    ['==', ['get', 'is_selected'], 1], 2.6,
                    1.8,
                ],
                'circle-opacity': 0.92,
            },
        })
    }
}

function createGeocodeMarkerElement() {
    const element = document.createElement('div')
    element.style.width = '30px'
    element.style.height = '30px'
    element.style.borderRadius = '50% 50% 50% 0'
    element.style.background = 'linear-gradient(135deg, #6366f1, #4338ca)'
    element.style.transform = 'rotate(-45deg)'
    element.style.display = 'grid'
    element.style.placeItems = 'center'
    element.style.border = '3px solid white'
    element.style.boxShadow = '0 3px 12px rgba(79,70,229,0.45)'
    element.style.cursor = 'grab'

    const inner = document.createElement('div')
    inner.style.transform = 'rotate(45deg)'
    inner.style.width = '8px'
    inner.style.height = '8px'
    inner.style.borderRadius = '999px'
    inner.style.background = '#fff'
    element.append(inner)

    return element
}

export default function ClientMapView({
    clients,
    selectedClientIds,
    focusedClientId,
    onToggleClient,
    onFocusClient,
    onOpenGeocode,
    loading = false,
    className = '',
    mode = 'browse',
    geocodeTargetStoreId = null,
    geocodeCoords = null,
    onGeocodeCoordsChange,
    onBootStateChange,
    mapReinitKey = 0,
}: ClientMapViewProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const mapReadyRef = useRef(false)
    const resizeControllerRef = useRef<ReturnType<typeof attachResizeObserver> | null>(null)
    const popupRef = useRef<maplibregl.Popup | null>(null)
    const geocodeMarkerRef = useRef<maplibregl.Marker | null>(null)
    const bootTimeoutRef = useRef<number | null>(null)
    const lastBoundsKeyRef = useRef('')

    const modeRef = useRef<ClientMapMode>(mode)
    const onToggleClientRef = useRef(onToggleClient)
    const onFocusClientRef = useRef(onFocusClient)
    const onOpenGeocodeRef = useRef(onOpenGeocode)
    const onGeocodeCoordsChangeRef = useRef(onGeocodeCoordsChange)
    const onBootStateChangeRef = useRef(onBootStateChange)
    const clientsByIdRef = useRef(new Map<string, ClientMapItem>())
    const geocodeCoordsRef = useRef<{ lat: number; lng: number } | null>(geocodeCoords)
    const geocodeTargetStoreIdRef = useRef<string | null>(geocodeTargetStoreId)
    const renderSourceDataRef = useRef<() => void>(() => {})

    const pointsWithCoordinates = useMemo(
        () => clients.filter((client) => Number.isFinite(client.latitude) && Number.isFinite(client.longitude)),
        [clients],
    )

    const clientsById = useMemo(() => {
        const map = new Map<string, ClientMapItem>()
        for (const client of clients) {
            map.set(client.store_id, client)
        }
        return map
    }, [clients])

    const emitBootState = useCallback((state: ClientMapBootState) => {
        onBootStateChangeRef.current?.(state)
        if (state === 'ready') {
            mapReadyRef.current = true
            if (bootTimeoutRef.current !== null) {
                window.clearTimeout(bootTimeoutRef.current)
                bootTimeoutRef.current = null
            }
        }
        if (state === 'map_error') {
            mapReadyRef.current = false
        }
    }, [])

    const removeGeocodeMarker = useCallback(() => {
        geocodeMarkerRef.current?.remove()
        geocodeMarkerRef.current = null
    }, [])

    const renderSourceData = useCallback(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return
        ensureClientLayers(map)

        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
        if (!source) return

        const data = buildClientFeatures(clients, selectedClientIds, focusedClientId)
        source.setData(data)
    }, [clients, selectedClientIds, focusedClientId])

    const placeOrMoveGeocodeMarker = useCallback((coords: { lat: number; lng: number }, fly = false) => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return
        if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return

        if (!geocodeMarkerRef.current) {
            const marker = new maplibregl.Marker({
                element: createGeocodeMarkerElement(),
                anchor: 'bottom',
                draggable: true,
            })
                .setLngLat([coords.lng, coords.lat])
                .addTo(map)

            marker.on('dragend', () => {
                const pos = marker.getLngLat()
                onGeocodeCoordsChangeRef.current?.({
                    lat: Number(pos.lat.toFixed(7)),
                    lng: Number(pos.lng.toFixed(7)),
                })
            })

            geocodeMarkerRef.current = marker
        } else {
            geocodeMarkerRef.current.setLngLat([coords.lng, coords.lat])
        }

        if (fly) {
            map.easeTo({
                center: [coords.lng, coords.lat],
                zoom: Math.max(map.getZoom(), 14),
                duration: 450,
            })
        }
    }, [])

    useEffect(() => {
        modeRef.current = mode
        onToggleClientRef.current = onToggleClient
        onFocusClientRef.current = onFocusClient
        onOpenGeocodeRef.current = onOpenGeocode
        onGeocodeCoordsChangeRef.current = onGeocodeCoordsChange
        onBootStateChangeRef.current = onBootStateChange
        clientsByIdRef.current = clientsById
        geocodeCoordsRef.current = geocodeCoords
        geocodeTargetStoreIdRef.current = geocodeTargetStoreId
        renderSourceDataRef.current = renderSourceData
    }, [
        clientsById,
        geocodeCoords,
        geocodeTargetStoreId,
        mode,
        onBootStateChange,
        onFocusClient,
        onGeocodeCoordsChange,
        onOpenGeocode,
        onToggleClient,
        renderSourceData,
    ])

    useEffect(() => {
        const container = mapContainerRef.current
        if (!container) return

        emitBootState('boot_start')
        mapReadyRef.current = false

        let map: maplibregl.Map
        try {
            const created = createLogisticsMap({ container, zoom: 4 })
            map = created.map
        } catch {
            emitBootState('map_error')
            return
        }

        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

        const resizeController = attachResizeObserver(map, container)
        resizeControllerRef.current = resizeController

        const handleStyleReady = () => {
            emitBootState('style_ready')
            ensureClientLayers(map)
            renderSourceDataRef.current()
            resizeController.scheduleResize()
            emitBootState('ready')
        }

        const handleRenderReady = () => {
            emitBootState('render_ready')
        }

        const handleClusterClick = async (event: MapLayerMouseEvent) => {
            if (modeRef.current === 'geocode') return
            const features = map.queryRenderedFeatures(event.point, { layers: [CLUSTER_LAYER_ID] })
            const clusterFeature = features[0]
            if (!clusterFeature) return

            const clusterId = clusterFeature.properties?.cluster_id
            if (clusterId === undefined || clusterId === null) return
            const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
            if (!source) return

            const geometry = clusterFeature.geometry as { type?: string; coordinates?: unknown }
            if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) return
            const [lng, lat] = geometry.coordinates as [number, number]

            try {
                const zoom = await source.getClusterExpansionZoom(Number(clusterId))
                map.easeTo({ center: [lng, lat], zoom, duration: 500 })
            } catch {
                // no-op
            }
        }

        const handlePointClick = (event: MapLayerMouseEvent) => {
            const features = map.queryRenderedFeatures(event.point, { layers: [POINTS_LAYER_ID] })
            const feature = features[0]
            if (!feature) return

            const storeId = String(feature.properties?.store_id || '')
            if (!storeId) return

            if (modeRef.current === 'geocode') {
                onFocusClientRef.current(storeId)
                onOpenGeocodeRef.current?.(storeId)
                return
            }

            onFocusClientRef.current(storeId)
            onToggleClientRef.current(storeId)

            popupRef.current?.remove()
            const properties = feature.properties || {}
            const selectedLabel = Number(properties.is_selected) === 1 ? 'Selecionado' : 'Nao selecionado'
            const orderLabel = Number(properties.has_orders) === 1
                ? `${properties.orders_count || 0} pedido(s) aptos`
                : 'Sem pedidos aptos'

            const client = clientsByIdRef.current.get(storeId) || null
            const popupElement = document.createElement('div')
            popupElement.style.minWidth = '196px'
            popupElement.style.fontFamily = 'system-ui,sans-serif'
            popupElement.innerHTML = `
                <strong style="font-size:12px;color:#0f172a;display:block;">${escapeHtml(String(properties.company_name || 'Cliente'))}</strong>
                <span style="font-size:10px;color:#64748b;display:block;margin-top:2px;">${escapeHtml(String(properties.client_name || ''))}</span>
                <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:10px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:999px;padding:1px 8px;">${escapeHtml(orderLabel)}</span>
                    <span style="font-size:10px;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:999px;padding:1px 8px;">${selectedLabel}</span>
                </div>
                <div style="margin-top:5px;font-size:10px;color:#64748b;">${escapeHtml(String(properties.city || ''))}${properties.state ? ` / ${escapeHtml(String(properties.state))}` : ''}</div>
                <button type="button" data-geocode="1" style="margin-top:8px;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:8px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;">
                    Geocodificar cliente
                </button>
                ${client?.primary_address_label ? `<div style="margin-top:6px;font-size:10px;color:#64748b;">${escapeHtml(client.primary_address_label)}</div>` : ''}
            `

            const geocodeButton = popupElement.querySelector<HTMLButtonElement>('button[data-geocode="1"]')
            if (geocodeButton) {
                geocodeButton.addEventListener('click', (popupEvent) => {
                    popupEvent.preventDefault()
                    popupEvent.stopPropagation()
                    onOpenGeocodeRef.current?.(storeId)
                })
            }

            popupRef.current = new maplibregl.Popup({ offset: 18, closeButton: false })
                .setLngLat(event.lngLat)
                .setDOMContent(popupElement)
                .addTo(map)
        }

        const handleMapClick = (event: maplibregl.MapMouseEvent) => {
            if (modeRef.current !== 'geocode') return
            const coords = {
                lat: Number(event.lngLat.lat.toFixed(7)),
                lng: Number(event.lngLat.lng.toFixed(7)),
            }
            onGeocodeCoordsChangeRef.current?.(coords)
            placeOrMoveGeocodeMarker(coords, false)
        }

        map.on('load', handleStyleReady)
        map.on('style.load', handleStyleReady)
        map.once('render', handleRenderReady)
        map.on('click', handleMapClick)
        map.on('click', CLUSTER_LAYER_ID, handleClusterClick)
        map.on('click', POINTS_LAYER_ID, handlePointClick)
        map.on('mouseenter', CLUSTER_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', CLUSTER_LAYER_ID, () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', POINTS_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', POINTS_LAYER_ID, () => { map.getCanvas().style.cursor = '' })

        if (map.isStyleLoaded()) {
            handleStyleReady()
        }

        bootTimeoutRef.current = window.setTimeout(() => {
            if (!mapReadyRef.current) {
                emitBootState('map_error')
            }
        }, 3200)

        return () => {
            popupRef.current?.remove()
            popupRef.current = null
            removeGeocodeMarker()

            if (bootTimeoutRef.current !== null) {
                window.clearTimeout(bootTimeoutRef.current)
                bootTimeoutRef.current = null
            }

            map.off('load', handleStyleReady)
            map.off('style.load', handleStyleReady)
            map.off('click', handleMapClick)
            map.off('click', CLUSTER_LAYER_ID, handleClusterClick)
            map.off('click', POINTS_LAYER_ID, handlePointClick)
            mapReadyRef.current = false
            resizeController.destroy()
            resizeControllerRef.current = null
            map.remove()
            mapRef.current = null
        }
    }, [emitBootState, mapReinitKey, placeOrMoveGeocodeMarker, removeGeocodeMarker])

    useEffect(() => {
        renderSourceData()
    }, [renderSourceData])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return
        if (!focusedClientId) return

        const focusedClient = pointsWithCoordinates.find((client) => client.store_id === focusedClientId)
        if (!focusedClient || focusedClient.latitude === null || focusedClient.longitude === null) return

        map.easeTo({
            center: [focusedClient.longitude, focusedClient.latitude],
            zoom: Math.max(map.getZoom(), 12),
            duration: 500,
        })
    }, [focusedClientId, pointsWithCoordinates])

    useEffect(() => {
        if (mode !== 'browse') return
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return

        const boundsPoints: MapLngLat[] = pointsWithCoordinates
            .map((client) => [Number(client.longitude), Number(client.latitude)] as MapLngLat)

        if (boundsPoints.length === 0) return

        const key = boundsPoints
            .map((point) => `${point[0].toFixed(5)}:${point[1].toFixed(5)}`)
            .join('|')

        if (lastBoundsKeyRef.current === key) return
        lastBoundsKeyRef.current = key

        const bounds = buildBounds(boundsPoints)
        if (!bounds) return
        map.fitBounds(bounds, {
            padding: 64,
            maxZoom: 13,
            duration: 0,
        })
    }, [mode, pointsWithCoordinates])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return

        if (mode !== 'geocode') {
            removeGeocodeMarker()
            map.getCanvas().style.cursor = ''
            return
        }

        popupRef.current?.remove()
        popupRef.current = null
        map.getCanvas().style.cursor = 'crosshair'

        const fallbackClient = geocodeTargetStoreId
            ? clientsById.get(geocodeTargetStoreId) || null
            : null

        const resolvedCoords = geocodeCoords
            || (fallbackClient && fallbackClient.latitude !== null && fallbackClient.longitude !== null
                ? { lat: Number(fallbackClient.latitude), lng: Number(fallbackClient.longitude) }
                : null)

        if (resolvedCoords) {
            placeOrMoveGeocodeMarker(resolvedCoords, true)
        } else {
            removeGeocodeMarker()
        }
    }, [
        clientsById,
        geocodeCoords,
        geocodeTargetStoreId,
        mode,
        placeOrMoveGeocodeMarker,
        removeGeocodeMarker,
    ])

    useEffect(() => {
        if (mode !== 'geocode') return
        if (!mapReadyRef.current) return
        onBootStateChangeRef.current?.('ready')
    }, [mode])

    return (
        <div className={`relative h-full w-full ${className}`}>
            <div ref={mapContainerRef} className="h-full w-full" />

            {pointsWithCoordinates.length === 0 && !loading && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="rounded-xl border bg-white/95 px-4 py-3 text-center shadow-sm">
                        <MapPin className="mx-auto mb-1.5 h-4 w-4 text-slate-400" />
                        <p className="text-xs font-medium text-slate-600">Nenhum cliente com coordenadas para exibir</p>
                    </div>
                </div>
            )}

            {loading && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-white/45 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                        Carregando clientes no mapa...
                    </div>
                </div>
            )}
        </div>
    )
}
