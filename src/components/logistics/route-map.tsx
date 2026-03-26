'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface RouteStop {
    id: string
    position: number
    latitude: number | null
    longitude: number | null
    customer_name: string
    status: string
    address_snapshot?: string
}

interface RouteMapProps {
    center?: { lat: number; lng: number } | null
    stops: RouteStop[]
    polyline?: string | null
    height?: string
    className?: string
}

const statusColors: Record<string, string> = {
    pending: '#64748b',
    arrived: '#3b82f6',
    delivered: '#10b981',
    failed: '#ef4444',
    skipped: '#f59e0b',
}

function createNumberedIcon(num: number, color: string) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: ${color}; color: white; font-weight: 700;
            font-size: 12px; display: flex; align-items: center;
            justify-content: center; border: 2.5px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">${num}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
    })
}

function createDepotIcon() {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width: 32px; height: 32px; border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: white; font-weight: 900; font-size: 14px;
            display: flex; align-items: center; justify-content: center;
            border: 3px solid white; box-shadow: 0 3px 8px rgba(99,102,241,0.4);
        ">⬤</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
    })
}

export default function RouteMap({ center, stops, polyline, height = '400px', className = '' }: RouteMapProps) {
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<L.Map | null>(null)

    useEffect(() => {
        if (!mapRef.current) return

        // Clean up previous
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove()
            mapInstanceRef.current = null
        }

        const validStops = stops.filter(s => s.latitude && s.longitude)
        const hasCenter = center?.lat && center?.lng

        if (validStops.length === 0 && !hasCenter) return

        // Initialize map
        const defaultCenter: [number, number] = hasCenter
            ? [center!.lat, center!.lng]
            : [validStops[0].latitude!, validStops[0].longitude!]

        const map = L.map(mapRef.current, {
            center: defaultCenter,
            zoom: 13,
            zoomControl: true,
            attributionControl: false,
        })

        mapInstanceRef.current = map

        // Tile layer — modern style
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(map)

        // Re-add attribution in a cleaner way
        L.control.attribution({ position: 'bottomright', prefix: false })
            .addAttribution('© <a href="https://carto.com">CARTO</a> © <a href="https://osm.org">OSM</a>')
            .addTo(map)

        const bounds = L.latLngBounds([])

        // Depot marker
        if (hasCenter) {
            const depot = L.marker([center!.lat, center!.lng], { icon: createDepotIcon() })
                .bindPopup(`<strong>Centro de Distribuição</strong>`)
                .addTo(map)
            bounds.extend(depot.getLatLng())
        }

        // Stop markers
        validStops
            .sort((a, b) => a.position - b.position)
            .forEach((stop) => {
                const color = statusColors[stop.status] || statusColors.pending
                const marker = L.marker([stop.latitude!, stop.longitude!], {
                    icon: createNumberedIcon(stop.position, color),
                })
                    .bindPopup(`
                        <div style="min-width:160px">
                            <strong style="font-size:13px">${stop.position}. ${stop.customer_name}</strong>
                            ${stop.address_snapshot ? `<br><span style="font-size:11px;color:#64748b">${stop.address_snapshot}</span>` : ''}
                            <br><span style="font-size:11px;text-transform:capitalize;color:${color};font-weight:600">${stop.status}</span>
                        </div>
                    `)
                    .addTo(map)
                bounds.extend(marker.getLatLng())
            })

        // Polyline (if ORS directions returned one)
        if (polyline) {
            try {
                const decoded = decodePolyline(polyline)
                L.polyline(decoded, {
                    color: '#4f46e5',
                    weight: 4,
                    opacity: 0.8,
                    smoothFactor: 1,
                    dashArray: undefined,
                }).addTo(map)
                decoded.forEach(p => bounds.extend(p))
            } catch {
                // If polyline decode fails, draw straight lines
                drawStraightLines(map, center, validStops, bounds)
            }
        } else {
            // No polyline — draw straight connecting lines
            drawStraightLines(map, center, validStops, bounds)
        }

        // Fit bounds
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
        }
    }, [center, stops, polyline])

    return (
        <div
            ref={mapRef}
            className={`rounded-xl overflow-hidden border ${className}`}
            style={{ height, width: '100%' }}
        />
    )
}

// Draw straight connecting lines between depot → stops in order → depot
function drawStraightLines(
    map: L.Map,
    center: { lat: number; lng: number } | null | undefined,
    stops: RouteStop[],
    bounds: L.LatLngBounds,
) {
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    const points: [number, number][] = []

    if (center?.lat && center?.lng) {
        points.push([center.lat, center.lng])
    }

    sorted.forEach(s => {
        if (s.latitude && s.longitude) points.push([s.latitude, s.longitude])
    })

    // Return to depot
    if (center?.lat && center?.lng && points.length > 1) {
        points.push([center.lat, center.lng])
    }

    if (points.length > 1) {
        L.polyline(points, {
            color: '#6366f1',
            weight: 3,
            opacity: 0.5,
            dashArray: '8, 6',
        }).addTo(map)
    }
}

// Decode Google-style encoded polyline
function decodePolyline(encoded: string): [number, number][] {
    const points: [number, number][] = []
    let index = 0
    let lat = 0
    let lng = 0

    while (index < encoded.length) {
        let shift = 0
        let result = 0
        let byte: number

        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)

        const dlat = result & 1 ? ~(result >> 1) : result >> 1
        lat += dlat

        shift = 0
        result = 0

        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)

        const dlng = result & 1 ? ~(result >> 1) : result >> 1
        lng += dlng

        points.push([lat / 1e5, lng / 1e5])
    }

    return points
}
