import { NextRequest, NextResponse } from 'next/server'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

/**
 * Route Optimization Service — V1 using ORS Optimization (Vroom-based)
 * 
 * Architecture Note:
 * This file acts as the abstraction layer for route optimization.
 * In V1, it calls ORS /optimization endpoint (based on Vroom).
 * In V2, you can swap this to call OR-Tools, your own Vroom instance,
 * or any other engine — without changing the consumer API contract.
 * 
 * POST /api/logistics/optimize
 * 
 * Body: {
 *   center: { lat: number, lng: number },
 *   stops: Array<{
 *     id: string,            // stop identifier (e.g. order ID)
 *     lat: number,
 *     lng: number,
 *     serviceTime?: number,  // minutes (default 15)
 *     priority?: number,     // 1-100 (higher = more important)
 *     timeWindowStart?: string,  // ISO datetime
 *     timeWindowEnd?: string,    // ISO datetime
 *   }>,
 *   vehicle?: {
 *     capacityKg?: number,
 *     maxStops?: number,
 *   }
 * }
 * 
 * Returns: {
 *   orderedStops: Array<{ id: string, position: number, arrival: number, distance: number }>,
 *   unassigned: Array<{ id: string, reason: string }>,
 *   summary: { totalDistance: number, totalDuration: number, totalStops: number },
 *   engine: 'ors_vroom'
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { center, stops, vehicle } = body

        if (!center?.lat || !center?.lng) {
            return NextResponse.json({ error: 'Centro de saída obrigatório.' }, { status: 400 })
        }
        if (!stops || !Array.isArray(stops) || stops.length < 1) {
            return NextResponse.json({ error: 'Informe pelo menos 1 parada.' }, { status: 400 })
        }

        // Build the ORS Optimization request (Vroom format)
        const result = await optimizeWithORS(center, stops, vehicle)

        return NextResponse.json(result)
    } catch (error) {
        console.error('[OPTIMIZE API] Error:', error)
        return NextResponse.json({ error: 'Erro interno na otimização.' }, { status: 500 })
    }
}

// ==================== V1 Engine: ORS Optimization (Vroom) ====================

interface StopInput {
    id: string
    lat: number
    lng: number
    serviceTime?: number
    priority?: number
    timeWindowStart?: string
    timeWindowEnd?: string
}

interface VehicleInput {
    capacityKg?: number
    maxStops?: number
}

interface OptimizationResult {
    orderedStops: Array<{ id: string; position: number; arrival: number; distance: number }>
    unassigned: Array<{ id: string; reason: string }>
    summary: { totalDistance: number; totalDuration: number; totalStops: number }
    engine: string
}

async function optimizeWithORS(
    center: { lat: number; lng: number },
    stops: StopInput[],
    vehicle?: VehicleInput,
): Promise<OptimizationResult> {
    // Build jobs (one per stop)
    const jobs = stops.map((stop, idx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const job: any = {
            id: idx + 1,
            location: [stop.lng, stop.lat],
            service: (stop.serviceTime || 15) * 60, // minutes → seconds
        }

        if (stop.priority) {
            job.priority = Math.min(Math.max(stop.priority, 0), 100)
        }

        if (stop.timeWindowStart && stop.timeWindowEnd) {
            const start = Math.floor(new Date(stop.timeWindowStart).getTime() / 1000)
            const end = Math.floor(new Date(stop.timeWindowEnd).getTime() / 1000)
            job.time_windows = [[start, end]]
        }

        return job
    })

    // Build vehicle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orsVehicle: any = {
        id: 1,
        profile: 'driving-car',
        start: [center.lng, center.lat],
        end: [center.lng, center.lat], // return to base
    }

    if (vehicle?.capacityKg) {
        orsVehicle.capacity = [Math.round(vehicle.capacityKg)]
    }

    if (vehicle?.maxStops) {
        orsVehicle.max_tasks = vehicle.maxStops
    }

    const requestBody = {
        jobs,
        vehicles: [orsVehicle],
    }

    const response = await fetch(`${ORS_BASE_URL}/optimization`, {
        method: 'POST',
        headers: {
            'Authorization': ORS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errText = await response.text()
        console.error('[ORS OPTIMIZE] HTTP error:', response.status, errText)
        throw new Error(`ORS Optimization failed: ${response.status}`)
    }

    const data = await response.json()

    // Parse the response
    const route = data.routes?.[0]
    const orderedStops: OptimizationResult['orderedStops'] = []

    if (route?.steps) {
        let position = 0
        for (const step of route.steps) {
            if (step.type === 'job') {
                const jobIdx = step.job - 1 // our ID is 1-indexed
                const originalStop = stops[jobIdx]
                orderedStops.push({
                    id: originalStop.id,
                    position: position++,
                    arrival: step.arrival || 0,
                    distance: Math.round((step.distance || 0) / 10) / 100, // m → km
                })
            }
        }
    }

    const unassigned = (data.unassigned || []).map((u: { id: number; description?: string }) => ({
        id: stops[u.id - 1]?.id || String(u.id),
        reason: u.description || 'Não foi possível incluir na rota',
    }))

    return {
        orderedStops,
        unassigned,
        summary: {
            totalDistance: Math.round((route?.distance || 0) / 10) / 100, // m → km
            totalDuration: Math.round((route?.duration || 0) / 60 * 10) / 10, // s → min
            totalStops: orderedStops.length,
        },
        engine: 'ors_vroom',
    }
}
