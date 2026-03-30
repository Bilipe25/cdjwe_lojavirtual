'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Loader2, MapPin } from 'lucide-react'
import { attachResizeObserver, createLogisticsMap } from './map-provider'
import { buildBounds, type MapLngLat } from './map-utils'
import type { ClientMapItem } from './client-map-types'

interface ClientMapViewProps {
    clients: ClientMapItem[]
    selectedClientIds: Set<string>
    focusedClientId: string | null
    onToggleClient: (storeId: string) => void
    onFocusClient: (storeId: string) => void
    onOpenGeocode?: (storeId: string) => void
    loading?: boolean
    className?: string
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

export default function ClientMapView({
    clients,
    selectedClientIds,
    focusedClientId,
    onToggleClient,
    onFocusClient,
    onOpenGeocode,
    loading = false,
    className = '',
}: ClientMapViewProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const mapReadyRef = useRef(false)
    const resizeControllerRef = useRef<ReturnType<typeof attachResizeObserver> | null>(null)
    const popupRef = useRef<maplibregl.Popup | null>(null)
    const lastBoundsKeyRef = useRef('')

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

    const renderSourceData = useCallback(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return
        ensureClientLayers(map)

        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
        if (!source) return

        const data = buildClientFeatures(clients, selectedClientIds, focusedClientId)
        source.setData(data)
    }, [clients, selectedClientIds, focusedClientId])

    useEffect(() => {
        const container = mapContainerRef.current
        if (!container || mapRef.current) return

        const { map } = createLogisticsMap({ container, zoom: 4 })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

        const resizeController = attachResizeObserver(map, container)
        resizeControllerRef.current = resizeController

        const handleStyleReady = () => {
            mapReadyRef.current = true
            ensureClientLayers(map)
            renderSourceData()
            resizeController.scheduleResize()
        }

        const handleClusterClick = async (event: MapLayerMouseEvent) => {
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
                // no-op: invalid cluster expansion state
            }
        }

        const handlePointClick = (event: MapLayerMouseEvent) => {
            const features = map.queryRenderedFeatures(event.point, { layers: [POINTS_LAYER_ID] })
            const feature = features[0]
            if (!feature) return

            const storeId = String(feature.properties?.store_id || '')
            if (!storeId) return
            onFocusClient(storeId)
            onToggleClient(storeId)

            popupRef.current?.remove()
            const properties = feature.properties || {}
            const selectedLabel = Number(properties.is_selected) === 1 ? 'Selecionado' : 'Nao selecionado'
            const orderLabel = Number(properties.has_orders) === 1
                ? `${properties.orders_count || 0} pedido(s) aptos`
                : 'Sem pedidos aptos'

            const client = clientsById.get(storeId) || null
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
                    onOpenGeocode?.(storeId)
                })
            }

            popupRef.current = new maplibregl.Popup({ offset: 18, closeButton: false })
                .setLngLat(event.lngLat)
                .setDOMContent(popupElement)
                .addTo(map)
        }

        map.on('load', handleStyleReady)
        map.on('style.load', handleStyleReady)
        map.on('click', CLUSTER_LAYER_ID, handleClusterClick)
        map.on('click', POINTS_LAYER_ID, handlePointClick)
        map.on('mouseenter', CLUSTER_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', CLUSTER_LAYER_ID, () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', POINTS_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', POINTS_LAYER_ID, () => { map.getCanvas().style.cursor = '' })

        return () => {
            popupRef.current?.remove()
            popupRef.current = null
            map.off('load', handleStyleReady)
            map.off('style.load', handleStyleReady)
            map.off('click', CLUSTER_LAYER_ID, handleClusterClick)
            map.off('click', POINTS_LAYER_ID, handlePointClick)
            mapReadyRef.current = false
            resizeController.destroy()
            resizeControllerRef.current = null
            map.remove()
            mapRef.current = null
        }
    }, [clientsById, onFocusClient, onOpenGeocode, onToggleClient, renderSourceData])

    useEffect(() => {
        renderSourceData()
    }, [renderSourceData])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReadyRef.current) return
        if (!focusedClientId) return

        const focusedClient = pointsWithCoordinates.find((client) => client.store_id === focusedClientId)
        if (!focusedClient || !focusedClient.latitude || !focusedClient.longitude) return

        map.easeTo({
            center: [focusedClient.longitude, focusedClient.latitude],
            zoom: Math.max(map.getZoom(), 12),
            duration: 500,
        })
    }, [focusedClientId, pointsWithCoordinates])

    useEffect(() => {
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
    }, [pointsWithCoordinates])

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
