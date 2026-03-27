import { NextRequest, NextResponse } from 'next/server'
import { requireAdminLogisticsSession } from '../_auth'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

/**
 * Route Optimization Service - Dual Engine
 *
 * Engine 1 (preferred): ORS Optimization (Vroom-based) - requires ORS_API_KEY
 * Engine 2 (fallback):  OSRM + Nearest-Neighbor - free, no key required
 *
 * POST /api/logistics/optimize
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdminLogisticsSession()
        if (!auth.ok) return auth.response

        const body = await request.json()
        const { center, stops, vehicle } = body

        const centerLat = Number(center?.lat)
        const centerLng = Number(center?.lng)
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
            return NextResponse.json({ error: 'Centro de saida obrigatorio com coordenadas.' }, { status: 400 })
        }
        if (!stops || !Array.isArray(stops) || stops.length < 1) {
            return NextResponse.json({ error: 'Informe pelo menos 1 parada com coordenadas.' }, { status: 400 })
        }
        if (stops.length > 200) {
            return NextResponse.json({ error: 'Maximo de 200 paradas por rota.' }, { status: 400 })
        }

        const normalizedStops: StopInput[] = stops.map((stop: StopInput) => ({
            ...stop,
            id: String(stop.id),
            lat: Number(stop.lat),
            lng: Number(stop.lng),
            serviceTime: stop.serviceTime ? Number(stop.serviceTime) : undefined,
            priority: stop.priority ? Number(stop.priority) : undefined,
        }))

        for (const stop of normalizedStops) {
            if (!stop.id || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) {
                return NextResponse.json({ error: 'Todas as paradas devem ter id, lat e lng validos.' }, { status: 400 })
            }
        }

        const uniqueStopIds = new Set(normalizedStops.map((stop) => stop.id))
        if (uniqueStopIds.size !== normalizedStops.length) {
            return NextResponse.json({ error: 'A lista de paradas possui IDs duplicados.' }, { status: 400 })
        }

        let result: OptimizationResult

        if (ORS_API_KEY) {
            try {
                result = await optimizeWithORS({ lat: centerLat, lng: centerLng }, normalizedStops, vehicle)
            } catch (e) {
                console.warn('[OPTIMIZE] ORS failed, falling back to OSRM:', e)
                result = await optimizeWithOSRM({ lat: centerLat, lng: centerLng }, normalizedStops)
            }
        } else {
            result = await optimizeWithOSRM({ lat: centerLat, lng: centerLng }, normalizedStops)
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error('[OPTIMIZE API] Error:', error)
        return NextResponse.json({ error: 'Erro interno na otimizacao.' }, { status: 500 })
    }
}

// ==================== Types ====================

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

interface ORSJob {
    id: number
    location: [number, number]
    service: number
    priority?: number
    time_windows?: [[number, number]]
}

interface ORSVehicle {
    id: number
    profile: string
    start: [number, number]
    end: [number, number]
    capacity?: [number]
    max_tasks?: number
}

interface OptimizationResult {
    orderedStops: Array<{ id: string; position: number; arrival: number; distance: number }>
    unassigned: Array<{ id: string; reason: string }>
    summary: { totalDistance: number; totalDuration: number; totalStops: number }
    engine: string
}

// ==================== Engine 1: ORS Optimization (Vroom) ====================

async function optimizeWithORS(
    center: { lat: number; lng: number },
    stops: StopInput[],
    vehicle?: VehicleInput,
): Promise<OptimizationResult> {
    const jobs: ORSJob[] = stops.map((stop, idx) => {
        const job: ORSJob = {
            id: idx + 1,
            location: [stop.lng, stop.lat],
            service: (stop.serviceTime || 15) * 60,
        }
        if (stop.priority) job.priority = Math.min(Math.max(stop.priority, 0), 100)
        if (stop.timeWindowStart && stop.timeWindowEnd) {
            job.time_windows = [[
                Math.floor(new Date(stop.timeWindowStart).getTime() / 1000),
                Math.floor(new Date(stop.timeWindowEnd).getTime() / 1000),
            ]]
        }
        return job
    })

    const orsVehicle: ORSVehicle = {
        id: 1,
        profile: 'driving-car',
        start: [center.lng, center.lat],
        end: [center.lng, center.lat],
    }
    if (vehicle?.capacityKg) orsVehicle.capacity = [Math.round(vehicle.capacityKg)]
    if (vehicle?.maxStops) orsVehicle.max_tasks = vehicle.maxStops

    const response = await fetch(`${ORS_BASE_URL}/optimization`, {
        method: 'POST',
        headers: {
            Authorization: ORS_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ jobs, vehicles: [orsVehicle] }),
    })

    if (!response.ok) {
        throw new Error(`ORS Optimization failed: ${response.status}`)
    }

    const data = await response.json()
    const route = data.routes?.[0]
    const orderedStops: OptimizationResult['orderedStops'] = []

    if (route?.steps) {
        let position = 0
        for (const step of route.steps) {
            if (step.type === 'job') {
                const originalStop = stops[step.job - 1]
                orderedStops.push({
                    id: originalStop.id,
                    position: position++,
                    arrival: step.arrival || 0,
                    distance: Math.round((step.distance || 0) / 10) / 100,
                })
            }
        }
    }

    return {
        orderedStops,
        unassigned: (data.unassigned || []).map((u: { id: number; description?: string }) => ({
            id: stops[u.id - 1]?.id || String(u.id),
            reason: u.description || 'Nao foi possivel incluir na rota',
        })),
        summary: {
            totalDistance: Math.round((route?.distance || 0) / 10) / 100,
            totalDuration: Math.round((route?.duration || 0) / 60 * 10) / 10,
            totalStops: orderedStops.length,
        },
        engine: 'ors_vroom',
    }
}

// ==================== Engine 2: OSRM + Nearest-Neighbor ====================

async function optimizeWithOSRM(
    center: { lat: number; lng: number },
    stops: StopInput[],
): Promise<OptimizationResult> {
    // Step 1: Get distance/duration matrix from OSRM
    const allPoints = [center, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))]
    const coordsStr = allPoints.map((p) => `${p.lng},${p.lat}`).join(';')

    const matrixUrl = `https://router.project-osrm.org/table/v1/driving/${coordsStr}?annotations=distance,duration`

    const matrixRes = await fetch(matrixUrl, {
        headers: { 'User-Agent': 'CDJWE-Logistics/1.0' },
    })

    if (!matrixRes.ok) {
        throw new Error(`OSRM Table API failed: ${matrixRes.status}`)
    }

    const matrixData = await matrixRes.json()

    if (matrixData.code !== 'Ok') {
        throw new Error(`OSRM error: ${matrixData.code}`)
    }

    const distances: number[][] = matrixData.distances // meters
    const durations: number[][] = matrixData.durations // seconds

    // Step 2: Nearest-neighbor heuristic (greedy TSP)
    // Index 0 = depot, 1..N = stops
    const n = stops.length
    const visited = new Set<number>()
    const order: number[] = []
    let current = 0 // start at depot

    for (let i = 0; i < n; i++) {
        let nearest = -1
        let nearestDist = Infinity

        for (let j = 1; j <= n; j++) {
            if (!visited.has(j) && distances[current][j] < nearestDist) {
                nearest = j
                nearestDist = distances[current][j]
            }
        }

        if (nearest === -1) break
        visited.add(nearest)
        order.push(nearest)
        current = nearest
    }

    // Step 3: Build result with cumulative distances and ETAs
    let totalDistance = 0
    let totalDuration = 0
    let prev = 0 // depot

    const orderedStops: OptimizationResult['orderedStops'] = order.map((stopIdx, pos) => {
        const legDistance = distances[prev][stopIdx] / 1000 // m -> km
        const legDuration = durations[prev][stopIdx] / 60 // s -> min
        totalDistance += legDistance
        totalDuration += legDuration

        const serviceTime = stops[stopIdx - 1].serviceTime || 15
        const arrivalMin = totalDuration

        totalDuration += serviceTime // add service time
        prev = stopIdx

        return {
            id: stops[stopIdx - 1].id,
            position: pos,
            arrival: Math.round(arrivalMin * 60), // keep seconds for consistency
            distance: Math.round(totalDistance * 100) / 100,
        }
    })

    // Add return-to-depot distance
    if (order.length > 0) {
        const lastStop = order[order.length - 1]
        totalDistance += distances[lastStop][0] / 1000
        totalDuration += durations[lastStop][0] / 60
    }

    // Step 4: Get actual driving route polyline from OSRM
    const routePoints = [center, ...order.map((i) => ({ lat: stops[i - 1].lat, lng: stops[i - 1].lng })), center]
    const routeCoordsStr = routePoints.map((p) => `${p.lng},${p.lat}`).join(';')

    let routeGeometry: string | undefined
    try {
        const routeRes = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${routeCoordsStr}?overview=full&geometries=polyline`,
            { headers: { 'User-Agent': 'CDJWE-Logistics/1.0' } }
        )
        if (routeRes.ok) {
            const routeData = await routeRes.json()
            if (routeData.code === 'Ok' && routeData.routes?.[0]?.geometry) {
                routeGeometry = routeData.routes[0].geometry
            }
        }
    } catch {
        // Polyline fetch failed - non-critical
    }

    return {
        orderedStops,
        unassigned: [],
        summary: {
            totalDistance: Math.round(totalDistance * 100) / 100,
            totalDuration: Math.round(totalDuration * 10) / 10,
            totalStops: orderedStops.length,
        },
        engine: 'osrm_nn',
        ...(routeGeometry ? { polyline: routeGeometry } : {}),
    } as OptimizationResult & { polyline?: string }
}
