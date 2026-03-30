import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireLogisticsOperatorSession } from '../_auth'
import {
    isLiveLocationOnline,
    isValidTrackingStatus,
    normalizeTrackingStatus,
    parseFiniteNumber,
    type DriverLiveLocationRecord,
    type LiveTrackingStatus,
} from '@/lib/logistics/live-tracking'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TRACKABLE_ROUTE_STATUSES = new Set(['confirmed', 'in_progress'])

function isValidUuid(value: string) {
    return UUID_RE.test(value)
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
}

function normalizeIsoDate(value: unknown) {
    if (typeof value !== 'string') return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
}

function toNullableRoundedNumber(value: number | null, digits = 2) {
    if (value === null) return null
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
}

function normalizeLiveRow(
    row: Record<string, unknown> | null,
    driverName?: string | null,
): (DriverLiveLocationRecord & { driver_name?: string | null; is_online: boolean }) | null {
    if (!row) return null

    const latitude = parseFiniteNumber(row.latitude)
    const longitude = parseFiniteNumber(row.longitude)
    if (latitude === null || longitude === null) return null

    const lastSeenAt = typeof row.last_seen_at === 'string' ? row.last_seen_at : new Date().toISOString()

    const record: DriverLiveLocationRecord & { driver_name?: string | null; is_online: boolean } = {
        route_id: String(row.route_id || ''),
        driver_id: String(row.driver_id || ''),
        vehicle_id: typeof row.vehicle_id === 'string' ? row.vehicle_id : null,
        latitude,
        longitude,
        accuracy_m: toNullableRoundedNumber(parseFiniteNumber(row.accuracy_m), 2),
        speed_kmh: toNullableRoundedNumber(parseFiniteNumber(row.speed_kmh), 2),
        heading_deg: toNullableRoundedNumber(parseFiniteNumber(row.heading_deg), 2),
        tracking_status: normalizeTrackingStatus(row.tracking_status),
        captured_at: typeof row.captured_at === 'string' ? row.captured_at : lastSeenAt,
        last_seen_at: lastSeenAt,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
        driver_name: driverName || null,
        is_online: isLiveLocationOnline(lastSeenAt),
    }

    return record
}

async function getDriverByProfileId(supabase: Awaited<ReturnType<typeof createServerClient>>, profileId: string) {
    const { data, error } = await supabase
        .from('drivers')
        .select('id')
        .eq('profile_id', profileId)
        .maybeSingle()

    if (error) {
        return { error: 'Falha ao validar motorista.' as const, driverId: null }
    }

    if (!data?.id) {
        return { error: 'Motorista nao encontrado para o usuario autenticado.' as const, driverId: null }
    }

    return { error: null, driverId: data.id as string }
}

async function getRouteContext(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    routeId: string,
) {
    const { data, error } = await supabase
        .from('delivery_routes')
        .select(`
            id,
            driver_id,
            vehicle_id,
            status,
            drivers (
                profiles (
                    full_name
                )
            )
        `)
        .eq('id', routeId)
        .maybeSingle()

    if (error) {
        return { error: 'Falha ao consultar rota.' as const, route: null }
    }

    if (!data?.id) {
        return { error: 'Rota nao encontrada.' as const, route: null }
    }

    const driverRelation = pickFirst(data.drivers as { profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> } | Array<{ profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> }> | null)
    const driverProfile = driverRelation ? pickFirst(driverRelation.profiles as { full_name?: string | null } | Array<{ full_name?: string | null }> | null) : null

    return {
        error: null,
        route: {
            id: String(data.id),
            driverId: typeof data.driver_id === 'string' ? data.driver_id : null,
            vehicleId: typeof data.vehicle_id === 'string' ? data.vehicle_id : null,
            status: String(data.status || ''),
            driverName: driverProfile?.full_name ? String(driverProfile.full_name) : null,
        },
    }
}

function parseTrackingStatus(value: unknown): LiveTrackingStatus {
    if (typeof value === 'string' && isValidTrackingStatus(value)) {
        return value
    }
    return 'active'
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireLogisticsOperatorSession()
        if (!auth.ok) return auth.response

        const routeId = request.nextUrl.searchParams.get('routeId')?.trim() || ''
        if (!isValidUuid(routeId)) {
            return NextResponse.json({ error: 'routeId invalido.' }, { status: 400 })
        }

        const supabase = await createServerClient()
        const routeCtx = await getRouteContext(supabase, routeId)
        if (routeCtx.error || !routeCtx.route) {
            return NextResponse.json({ error: routeCtx.error || 'Rota nao encontrada.' }, { status: 404 })
        }

        if (auth.role === 'driver') {
            const driverCtx = await getDriverByProfileId(supabase, auth.userId)
            if (driverCtx.error || !driverCtx.driverId) {
                return NextResponse.json({ error: driverCtx.error || 'Permissao negada.' }, { status: 403 })
            }
            if (routeCtx.route.driverId !== driverCtx.driverId) {
                return NextResponse.json({ error: 'Permissao negada para esta rota.' }, { status: 403 })
            }
        }

        if (!routeCtx.route.driverId) {
            return NextResponse.json({ data: null })
        }

        const { data: liveRow, error: liveError } = await supabase
            .from('driver_live_locations')
            .select('*')
            .eq('route_id', routeId)
            .eq('driver_id', routeCtx.route.driverId)
            .maybeSingle()

        if (liveError) {
            return NextResponse.json({ error: 'Falha ao carregar localizacao em tempo real.' }, { status: 500 })
        }

        const normalized = normalizeLiveRow(liveRow as Record<string, unknown> | null, routeCtx.route.driverName)
        return NextResponse.json({ data: normalized })
    } catch (error) {
        console.error('[LIVE LOCATION][GET] Error:', error)
        return NextResponse.json({ error: 'Erro interno ao carregar localizacao.' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireLogisticsOperatorSession()
        if (!auth.ok) return auth.response

        let body: unknown
        try {
            body = await request.json()
        } catch {
            return NextResponse.json({ error: 'Body JSON invalido.' }, { status: 400 })
        }

        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
        }

        const payload = body as Record<string, unknown>
        const routeId = typeof payload.routeId === 'string' ? payload.routeId.trim() : ''
        if (!isValidUuid(routeId)) {
            return NextResponse.json({ error: 'routeId invalido.' }, { status: 400 })
        }

        const latitude = parseFiniteNumber(payload.latitude)
        const longitude = parseFiniteNumber(payload.longitude)
        if (
            latitude === null
            || longitude === null
            || latitude < -90
            || latitude > 90
            || longitude < -180
            || longitude > 180
        ) {
            return NextResponse.json({ error: 'Latitude/longitude invalidas.' }, { status: 400 })
        }

        const accuracy = parseFiniteNumber(payload.accuracy)
        const speedKmh = parseFiniteNumber(payload.speedKmh)
        const headingDeg = parseFiniteNumber(payload.headingDeg)
        const trackingStatus = parseTrackingStatus(payload.trackingStatus)
        const capturedAt = normalizeIsoDate(payload.capturedAt) || new Date().toISOString()

        const metadata = payload.metadata && typeof payload.metadata === 'object'
            ? payload.metadata
            : null

        const supabase = await createServerClient()
        const routeCtx = await getRouteContext(supabase, routeId)
        if (routeCtx.error || !routeCtx.route) {
            return NextResponse.json({ error: routeCtx.error || 'Rota nao encontrada.' }, { status: 404 })
        }

        if (!TRACKABLE_ROUTE_STATUSES.has(routeCtx.route.status)) {
            return NextResponse.json(
                { error: 'Rastreamento permitido apenas para rota confirmada ou em andamento.' },
                { status: 409 },
            )
        }

        let driverId = routeCtx.route.driverId
        if (auth.role === 'driver') {
            const driverCtx = await getDriverByProfileId(supabase, auth.userId)
            if (driverCtx.error || !driverCtx.driverId) {
                return NextResponse.json({ error: driverCtx.error || 'Permissao negada.' }, { status: 403 })
            }
            if (routeCtx.route.driverId !== driverCtx.driverId) {
                return NextResponse.json({ error: 'Permissao negada para esta rota.' }, { status: 403 })
            }
            driverId = driverCtx.driverId
        }

        if (!driverId) {
            return NextResponse.json({ error: 'Rota sem motorista atribuido.' }, { status: 409 })
        }

        const nowIso = new Date().toISOString()
        const upsertPayload = {
            route_id: routeId,
            driver_id: driverId,
            vehicle_id: routeCtx.route.vehicleId,
            latitude,
            longitude,
            accuracy_m: toNullableRoundedNumber(accuracy),
            speed_kmh: toNullableRoundedNumber(speedKmh),
            heading_deg: toNullableRoundedNumber(headingDeg),
            tracking_status: trackingStatus,
            source: 'pwa_geolocation',
            captured_at: capturedAt,
            last_seen_at: nowIso,
            metadata,
        }

        const { data: upsertedRow, error: upsertError } = await supabase
            .from('driver_live_locations')
            .upsert(upsertPayload, { onConflict: 'route_id,driver_id' })
            .select('*')
            .single()

        if (upsertError) {
            console.error('[LIVE LOCATION][POST] upsert error:', upsertError)
            return NextResponse.json({ error: 'Falha ao atualizar localizacao em tempo real.' }, { status: 500 })
        }

        const normalized = normalizeLiveRow(
            upsertedRow as Record<string, unknown> | null,
            routeCtx.route.driverName,
        )

        return NextResponse.json({ success: true, data: normalized })
    } catch (error) {
        console.error('[LIVE LOCATION][POST] Error:', error)
        return NextResponse.json({ error: 'Erro interno ao atualizar localizacao.' }, { status: 500 })
    }
}
