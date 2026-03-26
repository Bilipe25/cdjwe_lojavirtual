import { NextRequest, NextResponse } from 'next/server'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

/**
 * POST /api/logistics/matrix
 * 
 * Computes time/distance matrix between a set of coordinates using ORS.
 * 
 * Body: { coordinates: [number, number][] }
 *   where each coordinate is [lng, lat] (ORS format)
 * 
 * Returns: { durations: number[][], distances: number[][] }
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

        if (coordinates.length > 50) {
            return NextResponse.json(
                { error: 'Máximo de 50 pontos por requisição.' },
                { status: 400 }
            )
        }

        const response = await fetch(`${ORS_BASE_URL}/v2/matrix/driving-car`, {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                locations: coordinates,
                metrics: ['duration', 'distance'],
                units: 'km',
            }),
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('[ORS MATRIX] HTTP error:', response.status, errText)
            return NextResponse.json(
                { error: 'Erro ao calcular matriz de distância.' },
                { status: 502 }
            )
        }

        const data = await response.json()

        return NextResponse.json({
            durations: data.durations,   // seconds
            distances: data.distances,   // km
        })
    } catch (error) {
        console.error('[MATRIX API] Error:', error)
        return NextResponse.json({ error: 'Erro interno na matrix.' }, { status: 500 })
    }
}
