import { NextRequest, NextResponse } from 'next/server'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

/**
 * Directions API — Real Road Geometry
 * 
 * Engine 1 (preferred): OpenRouteService Directions — requires ORS_API_KEY
 * Engine 2 (fallback):  OSRM Route API — free, no key required
 * 
 * POST /api/logistics/directions
 * Body: { waypoints: [{ lat, lng }] }
 * Returns: { polyline, distance_km, duration_min, engine }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { waypoints } = body

        if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
            return NextResponse.json(
                { error: 'Informe pelo menos 2 waypoints com lat/lng.' },
                { status: 400 }
            )
        }

        // Validate all waypoints
        for (const wp of waypoints) {
            if (!wp.lat || !wp.lng) {
                return NextResponse.json(
                    { error: 'Todos os waypoints devem ter lat e lng.' },
                    { status: 400 }
                )
            }
        }

        let result: DirectionsResult

        if (ORS_API_KEY) {
            try {
                result = await directionsWithORS(waypoints)
            } catch (e) {
                console.warn('[DIRECTIONS] ORS failed, falling back to OSRM:', e)
                result = await directionsWithOSRM(waypoints)
            }
        } else {
            result = await directionsWithOSRM(waypoints)
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error('[DIRECTIONS API] Error:', error)
        return NextResponse.json(
            { error: 'Erro ao calcular trajeto.' },
            { status: 500 }
        )
    }
}

// ==================== Types ====================

interface DirectionsResult {
    polyline: string
    distance_km: number
    duration_min: number
    engine: string
    legs: Array<{ distance_km: number; duration_min: number }>
}

// ==================== Engine 1: ORS Directions ====================

async function directionsWithORS(
    waypoints: Array<{ lat: number; lng: number }>
): Promise<DirectionsResult> {
    // ORS expects coordinates as [lng, lat]
    const coordinates = waypoints.map(wp => [wp.lng, wp.lat])

    const response = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car`, {
        method: 'POST',
        headers: {
            'Authorization': ORS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json, application/geo+json',
        },
        body: JSON.stringify({
            coordinates,
            instructions: true,
            geometry: true,
            elevation: false,
        }),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`ORS Directions failed: ${response.status} — ${text}`)
    }

    const data = await response.json()

    // ORS returns GeoJSON with encoded polyline in routes[0].geometry
    const route = data.routes?.[0]
    if (!route?.geometry) {
        throw new Error('ORS returned no geometry')
    }

    // ORS geometry is an encoded polyline string
    const polyline = typeof route.geometry === 'string'
        ? route.geometry
        : encodeGeoJSONToPolyline(route.geometry)

    // Extract per-leg data from segments
    const legs = (route.segments || []).map((seg: { distance: number; duration: number }) => ({
        distance_km: Math.round((seg.distance || 0) / 10) / 100,
        duration_min: Math.round((seg.duration || 0) / 60 * 10) / 10,
    }))

    return {
        polyline,
        distance_km: Math.round((route.summary?.distance || 0) / 10) / 100,
        duration_min: Math.round((route.summary?.duration || 0) / 60 * 10) / 10,
        engine: 'ors_directions',
        legs,
    }
}

// ==================== Engine 2: OSRM Route ====================

async function directionsWithOSRM(
    waypoints: Array<{ lat: number; lng: number }>
): Promise<DirectionsResult> {
    // OSRM expects coords as "lng,lat;lng,lat;..."
    const coordsStr = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';')

    const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=polyline`,
        { headers: { 'User-Agent': 'CDJWE-Logistics/1.0' } }
    )

    if (!response.ok) {
        throw new Error(`OSRM Route API failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.code !== 'Ok' || !data.routes?.[0]) {
        throw new Error(`OSRM error: ${data.code || 'No route found'}`)
    }

    const route = data.routes[0]

    // Extract per-leg data
    const legs = (route.legs || []).map((leg: { distance: number; duration: number }) => ({
        distance_km: Math.round((leg.distance || 0) / 10) / 100,
        duration_min: Math.round((leg.duration || 0) / 60 * 10) / 10,
    }))

    return {
        polyline: route.geometry,
        distance_km: Math.round((route.distance || 0) / 10) / 100,
        duration_min: Math.round((route.duration || 0) / 60 * 10) / 10,
        engine: 'osrm',
        legs,
    }
}

// ==================== Helpers ====================

/**
 * Encode GeoJSON LineString coordinates to Google-style encoded polyline.
 * Used when ORS returns GeoJSON geometry instead of encoded string.
 */
function encodeGeoJSONToPolyline(
    geometry: { type: string; coordinates: number[][] }
): string {
    if (!geometry?.coordinates) return ''

    let encoded = ''
    let prevLat = 0
    let prevLng = 0

    for (const coord of geometry.coordinates) {
        const lat = Math.round(coord[1] * 1e5)
        const lng = Math.round(coord[0] * 1e5)

        encoded += encodeValue(lat - prevLat)
        encoded += encodeValue(lng - prevLng)

        prevLat = lat
        prevLng = lng
    }

    return encoded
}

function encodeValue(value: number): string {
    let v = value < 0 ? ~(value << 1) : value << 1
    let encoded = ''
    while (v >= 0x20) {
        encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
        v >>= 5
    }
    encoded += String.fromCharCode(v + 63)
    return encoded
}
