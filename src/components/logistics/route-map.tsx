'use client'

import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ACTIVE_BASEMAP, MAP_TILE_LAYERS, ROUTE_STYLE, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './map-config'

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
}

const statusColors: Record<string, { bg: string; label: string }> = {
    pending: { bg: '#64748b', label: 'Pendente' },
    arrived: { bg: '#3b82f6', label: 'Chegou' },
    delivered: { bg: '#10b981', label: 'Entregue' },
    failed: { bg: '#ef4444', label: 'Insucesso' },
    skipped: { bg: '#f59e0b', label: 'Pulada' },
}

function createNumberedIcon(num: number, color: string, highlighted = false) {
    const size = highlighted ? 34 : 28
    const border = highlighted ? '3px solid #4f46e5' : '2.5px solid white'
    const shadow = highlighted
        ? '0 0 0 4px rgba(79,70,229,0.3), 0 2px 8px rgba(0,0,0,0.3)'
        : '0 2px 6px rgba(0,0,0,0.3)'

    return L.divIcon({
        className: '',
        html: `<div style="
            width: ${size}px; height: ${size}px; border-radius: 50%;
            background: ${color}; color: white; font-weight: 700;
            font-size: ${highlighted ? 14 : 12}px; display: flex; align-items: center;
            justify-content: center; border: ${border};
            box-shadow: ${shadow}; transition: all 0.2s;
            cursor: pointer;
        ">${num}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2 + 4)],
    })
}

function createDepotIcon() {
    return L.divIcon({
        className: '',
        html: `<div style="
            width: 36px; height: 36px; border-radius: 50%;
            background: linear-gradient(135deg, #7c3aed, #4f46e5);
            color: white; font-weight: 900; font-size: 18px;
            display: flex; align-items: center; justify-content: center;
            border: 3px solid white; box-shadow: 0 3px 12px rgba(99,102,241,0.5);
        ">🏭</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -22],
    })
}

function formatCurrency(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
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
}: RouteMapProps) {
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<L.Map | null>(null)
    const markersRef = useRef<Map<string, L.Marker>>(new Map())
    const invalidateMapSize = useCallback(() => {
        const map = mapInstanceRef.current
        if (!map) return
        try {
            map.invalidateSize()
        } catch {
            // no-op
        }
    }, [])

    useEffect(() => {
        if (!mapRef.current) return

        if (mapInstanceRef.current) {
            try {
                mapInstanceRef.current.off()
                mapInstanceRef.current.remove()
            } catch (e) {
                // Ignore leaflet internal cleanup errors
            }
            mapInstanceRef.current = null
            markersRef.current.clear()
        }

        const container = mapRef.current
        // Force cleanup to ensure fresh Leaflet instance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyContainer = container as any
        delete anyContainer._leaflet_id
        container.innerHTML = ''

        const validStops = stops.filter(s => s.latitude && s.longitude)
        const hasCenter = center?.lat && center?.lng

        if (validStops.length === 0 && !hasCenter) return

        const defaultCenter: [number, number] = hasCenter
            ? [center!.lat, center!.lng]
            : [validStops[0].latitude!, validStops[0].longitude!]

        const map = L.map(mapRef.current, {
            center: defaultCenter,
            zoom: 13,
            zoomControl: false,
            attributionControl: false,
        })

        mapInstanceRef.current = map

        // Zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(map)

        // Tile layer with runtime fallback to OSM on auth/provider failures.
        const primaryTileLayer = L.tileLayer(ACTIVE_BASEMAP.url, {
            maxZoom: ACTIVE_BASEMAP.maxZoom,
            attribution: ACTIVE_BASEMAP.attribution,
        }).addTo(map)

        if (ACTIVE_BASEMAP !== MAP_TILE_LAYERS.osm) {
            let switchedToFallback = false
            primaryTileLayer.on('tileerror', () => {
                if (switchedToFallback) return
                switchedToFallback = true
                try {
                    map.removeLayer(primaryTileLayer)
                } catch {
                    // no-op
                }
                L.tileLayer(MAP_TILE_LAYERS.osm.url, {
                    maxZoom: MAP_TILE_LAYERS.osm.maxZoom,
                    attribution: MAP_TILE_LAYERS.osm.attribution,
                }).addTo(map)
            })
        }

        const bounds = L.latLngBounds([])

        // === DEPOT MARKER ===
        if (hasCenter) {
            const depot = L.marker([center!.lat, center!.lng], { icon: createDepotIcon() })
                .bindPopup(`
                    <div style="min-width:180px;font-family:system-ui,sans-serif;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                            <span style="font-size:16px;">🏭</span>
                            <strong style="font-size:13px;color:#1e1b4b;">Centro de Distribuição</strong>
                        </div>
                        ${center.name ? `<span style="font-size:11px;color:#64748b;">${center.name}</span>` : ''}
                    </div>
                `)
                .addTo(map)
            bounds.extend(depot.getLatLng())
        }

        // === STOP MARKERS WITH RICH POPUPS ===
        const sorted = [...validStops].sort((a, b) => a.position - b.position)
        sorted.forEach((stop) => {
            const st = statusColors[stop.status] || statusColors.pending
            const isHighlighted = stop.id === highlightStopId
            const marker = L.marker([stop.latitude!, stop.longitude!], {
                icon: createNumberedIcon(stop.position, st.bg, isHighlighted),
                zIndexOffset: isHighlighted ? 1000 : 0,
            })

            // Rich popup
            const etaHtml = stop.estimated_arrival_min
                ? `<div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
                     <span style="font-size:10px;color:#6366f1;font-weight:600;">⏱ ETA: ${stop.estimated_arrival_min} min</span>
                     ${stop.estimated_distance_km ? `<span style="font-size:10px;color:#64748b;">• ${stop.estimated_distance_km} km</span>` : ''}
                   </div>`
                : ''

            const totalHtml = stop.order_total
                ? `<div style="font-size:11px;color:#1e1b4b;font-weight:700;margin-top:3px;">${formatCurrency(stop.order_total)}</div>`
                : ''

            marker.bindPopup(`
                <div style="min-width:200px;max-width:260px;font-family:system-ui,sans-serif;">
                    <div style="display:flex;align-items:flex-start;gap:8px;">
                        <div style="
                            width:26px;height:26px;border-radius:50%;
                            background:${st.bg};color:white;font-weight:700;font-size:11px;
                            display:flex;align-items:center;justify-content:center;flex-shrink:0;
                        ">${stop.position}</div>
                        <div style="flex:1;min-width:0;">
                            <strong style="font-size:12px;color:#1e1b4b;display:block;line-height:1.3;">${stop.customer_name}</strong>
                            ${stop.address_snapshot ? `<span style="font-size:10px;color:#94a3b8;display:block;margin-top:2px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${stop.address_snapshot.replace(/\[.*?\]\s*/g, '')}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;">
                        <span style="
                            font-size:10px;font-weight:600;color:${st.bg};
                            background:${st.bg}15;border:1px solid ${st.bg}30;
                            border-radius:999px;padding:1px 8px;
                        ">${st.label}</span>
                        ${totalHtml}
                    </div>
                    ${etaHtml}
                </div>
            `, { maxWidth: 280 })

            marker.addTo(map)
            markersRef.current.set(stop.id, marker)

            if (onStopClick) {
                marker.on('click', () => onStopClick(stop.id))
            }

            bounds.extend(marker.getLatLng())
        })

        // === POLYLINE ===
        if (polyline) {
            try {
                const decoded = decodePolyline(polyline)
                // Main route line
                L.polyline(decoded, ROUTE_STYLE.main).addTo(map)
                // Outer glow
                L.polyline(decoded, ROUTE_STYLE.glow).addTo(map)
                decoded.forEach(p => bounds.extend(p))
            } catch {
                drawStraightLines(map, center, validStops, bounds)
            }
        } else {
            drawStraightLines(map, center, validStops, bounds)
        }

        // === STATS OVERLAY (top-left) ===
        if (totalDistance || totalDuration) {
            const statsControl = new L.Control({ position: 'topleft' })
            statsControl.onAdd = () => {
                const div = L.DomUtil.create('div')
                div.innerHTML = `
                    <div style="
                        background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);
                        border-radius:12px;padding:10px 14px;
                        box-shadow:0 2px 12px rgba(0,0,0,0.1);border:1px solid rgba(0,0,0,0.06);
                        font-family:system-ui,sans-serif;min-width:140px;
                    ">
                        <div style="font-size:10px;font-weight:700;color:#1e1b4b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Resumo da Rota</div>
                        ${totalDistance ? `
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                                <span style="font-size:12px;">📏</span>
                                <span style="font-size:12px;font-weight:700;color:#1e1b4b;">${totalDistance} km</span>
                            </div>
                        ` : ''}
                        ${totalDuration ? `
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                                <span style="font-size:12px;">⏱</span>
                                <span style="font-size:12px;font-weight:700;color:#1e1b4b;">${Math.round(totalDuration)} min</span>
                            </div>
                        ` : ''}
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:12px;">📍</span>
                            <span style="font-size:12px;font-weight:700;color:#1e1b4b;">${validStops.length} paradas</span>
                        </div>
                        ${engine ? `<div style="font-size:9px;color:#94a3b8;margin-top:4px;border-top:1px solid #f1f5f9;padding-top:4px;">Engine: ${engine === 'osrm_nn' ? 'OSRM' : engine === 'ors_vroom' ? 'ORS Vroom' : engine}</div>` : ''}
                    </div>
                `
                L.DomEvent.disableClickPropagation(div)
                return div
            }
            statsControl.addTo(map)
        }

        // === LEGEND (bottom-left) ===
        const legendControl = new L.Control({ position: 'bottomleft' })
        legendControl.onAdd = () => {
            const div = L.DomUtil.create('div')
            const items = Object.entries(statusColors)
                .map(([, v]) => `
                    <div style="display:flex;align-items:center;gap:5px;">
                        <div style="width:10px;height:10px;border-radius:50%;background:${v.bg};border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
                        <span style="font-size:10px;color:#475569;">${v.label}</span>
                    </div>
                `).join('')
            div.innerHTML = `
                <div style="
                    background:rgba(255,255,255,0.92);backdrop-filter:blur(8px);
                    border-radius:10px;padding:8px 12px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.08);border:1px solid rgba(0,0,0,0.06);
                    font-family:system-ui,sans-serif;
                ">
                    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Status</div>
                    <div style="display:flex;flex-direction:column;gap:3px;">
                        ${items}
                    </div>
                </div>
            `
            L.DomEvent.disableClickPropagation(div)
            return div
        }
        legendControl.addTo(map)

        // Fit bounds
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
        }

        // Handle resize dynamically
        const resizeObserver = new ResizeObserver(() => {
            if (mapInstanceRef.current && mapRef.current?.isConnected) {
                try {
                    mapInstanceRef.current.invalidateSize()
                } catch (e) {
                    // Ignore _leaflet_pos or animation frame errors during resize
                }
            }
        })
        resizeObserver.observe(mapRef.current)

        return () => {
            resizeObserver.disconnect()
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.off()
                    mapInstanceRef.current.remove()
                } catch (e) {
                    // Ignore unmount errors
                }
                mapInstanceRef.current = null
                markersRef.current.clear()
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [center, stops, polyline, totalDistance, totalDuration, engine])

    // Handle highlight changes without full re-render
    useEffect(() => {
        if (!highlightStopId || !mapInstanceRef.current) return

        const marker = markersRef.current.get(highlightStopId)
        if (marker) {
            marker.openPopup()
            mapInstanceRef.current.flyTo(marker.getLatLng(), Math.max(mapInstanceRef.current.getZoom(), 15), { duration: 0.5 })
        }
    }, [highlightStopId])

    // Fullscreen/responsive transitions may not be fully captured by ResizeObserver alone.
    // Re-run invalidateSize across the transition window to avoid gray/blank map areas.
    useEffect(() => {
        const timeouts = [0, 120, 280, 480].map((delay) => (
            setTimeout(() => invalidateMapSize(), delay)
        ))

        return () => {
            timeouts.forEach((id) => clearTimeout(id))
        }
    }, [height, className, invalidateMapSize])

    return (
        <div className="relative">
            <div
                ref={mapRef}
                className={`rounded-xl overflow-hidden border ${className}`}
                style={{ height, width: '100%' }}
            />
        </div>
    )
}

// Draw straight connecting lines: depot → stops → depot
function drawStraightLines(
    map: L.Map,
    center: { lat: number; lng: number } | null | undefined,
    stops: RouteStop[],
    bounds: L.LatLngBounds,
) {
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    const points: [number, number][] = []

    if (center?.lat && center?.lng) points.push([center.lat, center.lng])
    sorted.forEach(s => {
        if (s.latitude && s.longitude) points.push([s.latitude, s.longitude])
    })
    if (center?.lat && center?.lng && points.length > 1) points.push([center.lat, center.lng])

    if (points.length > 1) {
        L.polyline(points, {
            color: '#6366f1',
            weight: 3,
            opacity: 0.4,
            dashArray: '8, 6',
        }).addTo(map)
    }
}

// Decode Google-style encoded polyline
function decodePolyline(encoded: string): [number, number][] {
    const points: [number, number][] = []
    let index = 0, lat = 0, lng = 0

    while (index < encoded.length) {
        let shift = 0, result = 0, byte: number
        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)
        lat += result & 1 ? ~(result >> 1) : result >> 1

        shift = 0; result = 0
        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)
        lng += result & 1 ? ~(result >> 1) : result >> 1

        points.push([lat / 1e5, lng / 1e5])
    }
    return points
}
