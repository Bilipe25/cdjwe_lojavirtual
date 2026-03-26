import { NextRequest, NextResponse } from 'next/server'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

/**
 * POST /api/logistics/directions
 *
 * Calculates the route directions (polyline + per-leg distance/duration)
 * for an ordered set of coordinates.
 *
 * Body: { coordinates: [number, number][] }
 *   where each coordinate is [lng, lat] (ORS format)
 *
 * Returns: { polyline: string, legs: { distance: number, duration: number }[], summary: { totalDistance: number, totalDuration: number } }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { coordinates } = body

        if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
            return NextResponse.json(
                { error: 'Informe pelo menos 2 coordenadas como [[lng, lat], ...].' },
                { status: 400 }
            )
        }

        const response = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car/geojson`, {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json, application/geo+json',
            },
            body: JSON.stringify({
                coordinates,
                instructions: false,
                geometry: true,
            }),
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('[ORS DIRECTIONS] HTTP error:', response.status, errText)
            return NextResponse.json(
                { error: 'Erro ao calcular direções da rota.' },
                { status: 502 }
            )
        }

        const data = await response.json()
        const feature = data?.features?.[0]

        if (!feature) {
            return NextResponse.json(
                { error: 'Nenhuma rota encontrada.' },
                { status: 422 }
            )
        }

        const segments = feature.properties?.segments || []
        const legs = segments.map((seg: { distance: number; duration: number }) => ({
            distance: Math.round(seg.distance / 10) / 100, // meters → km, 2 decimals
            duration: Math.round(seg.duration / 60 * 10) / 10, // seconds → minutes, 1 decimal
        }))

        const totalDistance = legs.reduce((s: number, l: { distance: number }) => s + l.distance, 0)
        const totalDuration = legs.reduce((s: number, l: { duration: number }) => s + l.duration, 0)

        return NextResponse.json({
            geometry: feature.geometry,   // GeoJSON LineString for Leaflet
            legs,
            summary: {
                totalDistance: Math.round(totalDistance * 100) / 100,
                totalDuration: Math.round(totalDuration * 10) / 10,
            },
        })
    } catch (error) {
        console.error('[DIRECTIONS API] Error:', error)
        return NextResponse.json({ error: 'Erro interno nas direções.' }, { status: 500 })
    }
}
