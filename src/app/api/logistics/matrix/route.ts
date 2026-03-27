import { NextRequest, NextResponse } from 'next/server'
import { requireLogisticsOperatorSession } from '../_auth'
import { readLogisticsApiCache, writeLogisticsApiCache } from '@/lib/logistics/api-cache'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

type MatrixResult = {
    durations: Array<Array<number | null>>
    distances: Array<Array<number | null>>
    engine: 'ors_matrix' | 'osrm_table'
}

/**
 * POST /api/logistics/matrix
 *
 * Body: { coordinates: [number, number][] } where each coordinate is [lng, lat]
 * Returns: { durations, distances, engine }
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireLogisticsOperatorSession()
        if (!auth.ok) return auth.response

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
                { error: 'Maximo de 50 pontos por requisicao.' },
                { status: 400 }
            )
        }

        const normalizedCoordinates: Array<[number, number]> = []
        for (const coordinate of coordinates) {
            if (!Array.isArray(coordinate) || coordinate.length !== 2) {
                return NextResponse.json(
                    { error: 'Cada coordenada deve ser [lng, lat].' },
                    { status: 400 }
                )
            }

            const lng = Number(coordinate[0])
            const lat = Number(coordinate[1])
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
                return NextResponse.json(
                    { error: 'Todas as coordenadas devem conter valores numericos validos.' },
                    { status: 400 }
                )
            }

            normalizedCoordinates.push([lng, lat])
        }

        const cacheSignature = {
            version: 1,
            coordinates: normalizedCoordinates.map(([lng, lat]) => [
                Number(lng.toFixed(6)),
                Number(lat.toFixed(6)),
            ]),
            orsEnabled: Boolean(ORS_API_KEY),
        }

        const cached = await readLogisticsApiCache<MatrixResult>('matrix', cacheSignature)
        if (cached) {
            return NextResponse.json(cached)
        }

        if (ORS_API_KEY) {
            try {
                const result = await matrixWithORS(normalizedCoordinates)
                await writeLogisticsApiCache('matrix', cacheSignature, result, {
                    createdBy: auth.userId,
                    ttlSeconds: 60 * 60 * 2,
                })
                return NextResponse.json(result)
            } catch (error) {
                console.warn('[MATRIX] ORS failed, falling back to OSRM:', error)
            }
        }

        const fallbackResult = await matrixWithOSRM(normalizedCoordinates)
        await writeLogisticsApiCache('matrix', cacheSignature, fallbackResult, {
            createdBy: auth.userId,
            ttlSeconds: 60 * 60 * 2,
        })
        return NextResponse.json(fallbackResult)
    } catch (error) {
        console.error('[MATRIX API] Error:', error)
        return NextResponse.json({ error: 'Erro interno na matrix.' }, { status: 500 })
    }
}

async function matrixWithORS(coordinates: Array<[number, number]>): Promise<MatrixResult> {
    const response = await fetch(`${ORS_BASE_URL}/v2/matrix/driving-car`, {
        method: 'POST',
        headers: {
            Authorization: ORS_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            locations: coordinates,
            metrics: ['duration', 'distance'],
            units: 'km',
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`ORS matrix failed: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    return {
        durations: data.durations || [],
        distances: data.distances || [],
        engine: 'ors_matrix',
    }
}

async function matrixWithOSRM(coordinates: Array<[number, number]>): Promise<MatrixResult> {
    const coordsStr = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/table/v1/driving/${coordsStr}?annotations=distance,duration`

    const response = await fetch(url, {
        headers: { 'User-Agent': 'CDJWE-Logistics/1.0' },
    })

    if (!response.ok) {
        throw new Error(`OSRM table failed: ${response.status}`)
    }

    const data = await response.json()
    if (data.code !== 'Ok') {
        throw new Error(`OSRM table error: ${data.code || 'unknown'}`)
    }

    const distances = (data.distances || []).map((row: Array<number | null>) =>
        row.map((value: number | null) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return null
            return Math.round((value / 1000) * 100) / 100 // meters -> km
        })
    )

    return {
        durations: data.durations || [],
        distances,
        engine: 'osrm_table',
    }
}
