'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'

const DRIVER_TIMEZONE = 'America/Fortaleza'
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function formatDateKeyInTimezone(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: DRIVER_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)

    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value

    if (!year || !month || !day) {
        return date.toISOString().slice(0, 10)
    }

    return `${year}-${month}-${day}`
}

function toDateKey(value: string | null | undefined) {
    if (!value) return null
    if (ISO_DATE_RE.test(value)) return value

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null

    return formatDateKeyInTimezone(date)
}

function getTodayDateKey() {
    return formatDateKeyInTimezone(new Date())
}

// ==================== Helper: verify driver ====================
async function requireDriver() {
    const supabase = await createServerClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Nao autenticado.')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()

    const isDriver = profile?.role === 'driver'
    const isAdmin = profile?.role === 'admin'

    if (!isDriver && !isAdmin) throw new Error('Permissao negada.')

    // Find driver record
    const { data: driver } = await supabase
        .from('drivers')
        .select('id, phone, status, default_vehicle_id')
        .eq('profile_id', user.id)
        .single()

    return {
        supabase,
        userId: user.id,
        driverId: driver?.id || null,
        driverStatus: driver?.status || null,
        fullName: profile?.full_name || '',
        isAdmin,
    }
}

// ==================== Driver Profile ====================

export async function getDriverProfile() {
    try {
        const ctx = await requireDriver()
        const { supabase, userId } = ctx

        const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, email, phone, avatar_url')
            .eq('id', userId)
            .single()

        let driver = null
        if (ctx.driverId) {
            const { data } = await supabase
                .from('drivers')
                .select('*, vehicles ( name, plate, type )')
                .eq('id', ctx.driverId)
                .single()
            driver = data
        }

        return { data: { profile, driver, isAdmin: ctx.isAdmin } }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== Driver Routes List ====================

export async function getDriverRoutes(filter?: 'today' | 'upcoming' | 'completed') {
    try {
        const ctx = await requireDriver()
        if (!ctx.driverId) return { data: [] }

        const { supabase } = ctx

        let query = supabase.from('delivery_routes').select(`
            id,
            route_number,
            status,
            planned_date,
            total_stops,
            total_distance_km,
            total_duration_min,
            total_weight_kg,
            vehicles ( name, plate ),
            route_centers ( name )
        `)
            .eq('driver_id', ctx.driverId)
            .eq('is_deleted', false)

        const today = new Date().toISOString().split('T')[0]

        if (filter === 'today') {
            query = query.eq('planned_date', today).in('status', ['confirmed', 'in_progress'])
        } else if (filter === 'upcoming') {
            query = query.gte('planned_date', today).in('status', ['confirmed', 'optimized', 'draft'])
        } else if (filter === 'completed') {
            query = query.in('status', ['completed', 'cancelled'])
        } else {
            // Default: show active + today
            query = query.in('status', ['confirmed', 'in_progress', 'optimized'])
        }

        query = query.order('planned_date', { ascending: true }).limit(50)

        const { data, error } = await query

        if (error) {
            console.error('[DRIVER ROUTES]', error)
            return { error: 'Erro ao carregar rotas.' }
        }

        return { data: data || [] }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== Driver Route Detail ====================

export async function getDriverRouteDetail(routeId: string) {
    try {
        const ctx = await requireDriver()
        const { supabase } = ctx

        const { data: route, error } = await supabase
            .from('delivery_routes')
            .select(`
                *,
                vehicles ( name, plate, type ),
                route_centers ( name, address, city )
            `)
            .eq('id', routeId)
            .eq('is_deleted', false)
            .single()

        if (error || !route) return { error: 'Rota nao encontrada.' }

        // Verify access: must be assigned to this driver (or admin)
        if (!ctx.isAdmin && route.driver_id !== ctx.driverId) {
            return { error: 'Acesso negado a esta rota.' }
        }

        const { data: stops } = await supabase
            .from('delivery_route_stops')
            .select(`
                *,
                orders ( order_number, total )
            `)
            .eq('route_id', routeId)
            .order('stop_position', { ascending: true })

        return { data: { route, stops: stops || [] } }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== Driver Actions ====================

export async function driverStartRoute(routeId: string) {
    try {
        const ctx = await requireDriver()
        const { supabase } = ctx

        // Verify ownership
        const { data: route } = await supabase
            .from('delivery_routes')
            .select('id, driver_id, status, is_deleted')
            .eq('id', routeId)
            .single()

        if (!route) return { error: 'Rota nao encontrada.' }
        if (route.is_deleted) return { error: 'Rota nao encontrada.' }
        if (!ctx.isAdmin && route.driver_id !== ctx.driverId) return { error: 'Acesso negado.' }
        if (route.status !== 'confirmed') return { error: 'Apenas rotas confirmadas podem ser iniciadas.' }

        const { error } = await supabase
            .from('delivery_routes')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString(),
                updated_by: ctx.userId,
            })
            .eq('id', routeId)
            .eq('is_deleted', false)

        if (error) return { error: 'Erro ao iniciar rota.' }

        await supabase.from('route_events').insert({
            route_id: routeId,
            event_type: 'route_started',
            actor_id: ctx.userId,
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function driverDeliverStop(stopId: string, notes?: string) {
    try {
        const ctx = await requireDriver()
        const { supabase } = ctx

        const { error } = await supabase.rpc('logistics_update_stop_status_atomic', {
            p_stop_id: stopId,
            p_new_status: 'delivered',
            p_failure_reason: null,
            p_notes: notes?.trim() || null,
        })

        if (error) return { error: error.message || 'Erro ao registrar entrega.' }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function driverFailStop(stopId: string, reason: string) {
    try {
        const ctx = await requireDriver()
        const { supabase } = ctx

        if (!reason.trim()) return { error: 'Informe o motivo do insucesso.' }

        const { error } = await supabase.rpc('logistics_update_stop_status_atomic', {
            p_stop_id: stopId,
            p_new_status: 'failed',
            p_failure_reason: reason.trim(),
            p_notes: reason.trim(),
        })

        if (error) return { error: error.message || 'Erro ao registrar insucesso.' }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function driverCompleteRoute(routeId: string) {
    try {
        const ctx = await requireDriver()
        const { supabase } = ctx

        const { data: route } = await supabase
            .from('delivery_routes')
            .select('id, driver_id, status, is_deleted')
            .eq('id', routeId)
            .single()

        if (!route) return { error: 'Rota nao encontrada.' }
        if (route.is_deleted) return { error: 'Rota nao encontrada.' }
        if (!ctx.isAdmin && route.driver_id !== ctx.driverId) return { error: 'Acesso negado.' }

        const { error } = await supabase.rpc('logistics_complete_route_atomic', {
            p_route_id: routeId,
            p_close_open_stops_as: 'failed',
            p_close_reason: 'Parada encerrada automaticamente pelo motorista ao concluir a rota.',
        })

        if (error) return { error: error.message || 'Erro ao concluir rota.' }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== Driver KPIs ====================

export async function getDriverKpis() {
    try {
        const ctx = await requireDriver()
        if (!ctx.driverId) return { data: { todayRoutes: 0, pendingStops: 0, deliveredToday: 0, failedToday: 0 } }

        const { supabase } = ctx
        const todayDateKey = getTodayDateKey()

        // Fetch candidate routes once and classify "today" in app layer to avoid date/timestamp drift.
        const { data: driverRoutes } = await supabase
            .from('delivery_routes')
            .select('id, planned_date, status')
            .eq('driver_id', ctx.driverId)
            .eq('is_deleted', false)
            .in('status', ['draft', 'optimized', 'confirmed', 'in_progress', 'completed', 'cancelled'])
            .order('planned_date', { ascending: false })
            .limit(200)

        const todayRoutesData = (driverRoutes || []).filter((route) => (
            toDateKey(route.planned_date) === todayDateKey
        ))

        const todayRoutes = todayRoutesData.filter((route) => (
            ['confirmed', 'in_progress', 'completed'].includes(route.status)
        )).length

        const routeIds = todayRoutesData.map((route) => route.id)

        let pendingStops = 0
        let deliveredToday = 0
        let failedToday = 0

        if (routeIds.length > 0) {
            const { count: pending } = await supabase
                .from('delivery_route_stops')
                .select('id', { count: 'exact', head: true })
                .in('route_id', routeIds)
                .eq('status', 'pending')

            pendingStops = pending || 0
        }

        // IMPORTANT:
        // "Entregas" and "Insucessos" cards should reflect real driver execution history,
        // not only routes planned for today.
        const [deliveredRes, failedRes] = await Promise.all([
            supabase
                .from('delivery_route_stops')
                .select('id, delivery_routes!inner(driver_id)', { count: 'exact', head: true })
                .eq('delivery_routes.driver_id', ctx.driverId)
                .eq('delivery_routes.is_deleted', false)
                .eq('status', 'delivered'),
            supabase
                .from('delivery_route_stops')
                .select('id, delivery_routes!inner(driver_id)', { count: 'exact', head: true })
                .eq('delivery_routes.driver_id', ctx.driverId)
                .eq('delivery_routes.is_deleted', false)
                .eq('status', 'failed'),
        ])

        deliveredToday = deliveredRes.count || 0
        failedToday = failedRes.count || 0

        return {
            data: {
                todayRoutes: todayRoutes || 0,
                pendingStops,
                deliveredToday,
                failedToday,
            },
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== Active Route Map Data ====================

export async function getDriverActiveRouteMap() {
    try {
        const ctx = await requireDriver()
        if (!ctx.driverId) return { data: null }

        const { supabase } = ctx
        const todayDateKey = getTodayDateKey()

        // Get candidate routes and choose active first for today's window.
        const { data: routeCandidates } = await supabase
            .from('delivery_routes')
            .select(`
                id,
                route_number,
                status,
                planned_date,
                route_polyline,
                total_distance_km,
                total_duration_min,
                optimization_engine,
                optimization_result,
                route_centers ( name, latitude, longitude )
            `)
            .eq('driver_id', ctx.driverId)
            .eq('is_deleted', false)
            .in('status', ['in_progress', 'confirmed'])
            .order('updated_at', { ascending: false })
            .limit(50)

        const route = (routeCandidates || [])
            .filter((candidate) => toDateKey(candidate.planned_date) === todayDateKey)
            .sort((a, b) => {
                if (a.status === b.status) return 0
                if (a.status === 'in_progress') return -1
                if (b.status === 'in_progress') return 1
                return 0
            })[0]

        if (!route) return { data: null }

        // Get stops with coordinates
        const { data: stops } = await supabase
            .from('delivery_route_stops')
            .select('id, stop_position, latitude, longitude, customer_name, status, address_snapshot, estimated_arrival_min, estimated_distance_km')
            .eq('route_id', route.id)
            .order('stop_position', { ascending: true })

        // Build center from route_centers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rc = route.route_centers as any
        const center = rc?.latitude && rc?.longitude
            ? { lat: Number(rc.latitude), lng: Number(rc.longitude), name: rc.name }
            : null

        return {
            data: {
                routeId: route.id,
                routeNumber: route.route_number,
                status: route.status,
                polyline: route.route_polyline,
                totalDistance: route.total_distance_km,
                totalDuration: route.total_duration_min,
                engine: route.optimization_engine || route.optimization_result?.engine,
                center,
                stops: (stops || []).map((s) => ({
                    id: s.id,
                    position: s.stop_position || 0,
                    latitude: s.latitude ? Number(s.latitude) : null,
                    longitude: s.longitude ? Number(s.longitude) : null,
                    customer_name: s.customer_name || '',
                    status: s.status || 'pending',
                    address_snapshot: s.address_snapshot,
                    estimated_arrival_min: s.estimated_arrival_min,
                    estimated_distance_km: s.estimated_distance_km,
                })),
            },
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}
