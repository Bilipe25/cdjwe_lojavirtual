'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'

// ==================== Types ====================

export interface RoutableOrder {
    order_id: string
    order_number: string
    store_id: string
    company_name: string
    client_name: string
    city: string
    state: string
    region: string | null
    total: number
    status: string
    created_at: string
    shipping_address: string | null
    shipping_address_id: string | null
    address_lat: number | null
    address_lng: number | null
}

export interface RouteListItem {
    id: string
    route_number: string
    status: string
    planned_date: string
    total_stops: number
    total_distance_km: number | null
    total_duration_min: number | null
    driver_name: string | null
    vehicle_name: string | null
    vehicle_plate: string | null
    center_name: string | null
    created_at: string
}

export interface VehicleItem {
    id: string
    plate: string
    name: string
    type: string
    capacity_kg: number | null
    capacity_m3: number | null
    max_stops: number | null
    status: string
    notes: string | null
}

export interface DriverItem {
    id: string
    profile_id: string
    phone: string | null
    license_number: string | null
    default_vehicle_id: string | null
    status: string
    notes: string | null
    profile_name: string
    profile_email: string
}

export interface RegionItem {
    id: string
    name: string
    description: string | null
    cities: string[]
    states: string[]
    default_center_id: string | null
    center_name: string | null
    color: string
    is_active: boolean
}

export interface CenterItem {
    id: string
    name: string
    address: string
    city: string
    state: string | null
    zip_code: string | null
    latitude: number | null
    longitude: number | null
    is_default: boolean
    is_active: boolean
}

// ==================== Helper: verify admin ====================
async function requireAdmin() {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado.')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') throw new Error('Permissão negada.')
    return { supabase, userId: user.id }
}

// ==================== ROUTABLE ORDERS ====================

export async function getRoutableOrders(filters?: {
    status?: string
    city?: string
    region?: string
    search?: string
}) {
    try {
        const { supabase } = await requireAdmin()

        let query = supabase.from('orders').select(`
            id,
            order_number,
            store_id,
            status,
            total,
            created_at,
            shipping_address,
            shipping_address_id,
            stores!inner (
                company_name,
                city,
                state,
                region,
                profiles!stores_profile_id_fkey!inner ( full_name )
            )
        `)

        // Only orders ready for routing (approved or in_production)
        if (filters?.status && filters.status !== 'all') {
            query = query.eq('status', filters.status)
        } else {
            query = query.in('status', ['approved', 'in_production'])
        }

        if (filters?.city) {
            query = query.ilike('stores.city', `%${filters.city}%`)
        }
        if (filters?.region) {
            query = query.ilike('stores.region', `%${filters.region}%`)
        }
        if (filters?.search) {
            query = query.or(
                `order_number.ilike.%${filters.search}%,stores.company_name.ilike.%${filters.search}%`
            )
        }

        query = query.order('created_at', { ascending: false }).limit(200)

        const { data, error } = await query

        if (error) {
            console.error('[ROUTABLE ORDERS] Error:', error)
            return { error: 'Erro ao carregar pedidos.' }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: RoutableOrder[] = (data || []).map((row: any) => ({
            order_id: row.id,
            order_number: row.order_number,
            store_id: row.store_id,
            company_name: row.stores?.company_name || '',
            client_name: row.stores?.profiles?.full_name || '',
            city: row.stores?.city || '',
            state: row.stores?.state || '',
            region: row.stores?.region || null,
            total: Number(row.total || 0),
            status: row.status,
            created_at: row.created_at,
            shipping_address: row.shipping_address,
            shipping_address_id: row.shipping_address_id,
            address_lat: null,
            address_lng: null,
        }))

        return { data: result }
    } catch (e) {
        console.error('[ROUTABLE ORDERS] Unexpected:', e)
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== VEHICLES CRUD ====================

export async function getVehicles() {
    try {
        const { supabase } = await requireAdmin()
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .order('name')

        if (error) return { error: 'Erro ao carregar veículos.' }
        return { data: (data || []) as VehicleItem[] }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function upsertVehicle(vehicle: {
    id?: string
    plate: string
    name: string
    type: string
    capacity_kg?: number | null
    capacity_m3?: number | null
    max_stops?: number | null
    status: string
    notes?: string | null
}) {
    try {
        const { supabase } = await requireAdmin()

        if (vehicle.id) {
            const { error } = await supabase
                .from('vehicles')
                .update({
                    plate: vehicle.plate,
                    name: vehicle.name,
                    type: vehicle.type,
                    capacity_kg: vehicle.capacity_kg,
                    capacity_m3: vehicle.capacity_m3,
                    max_stops: vehicle.max_stops,
                    status: vehicle.status,
                    notes: vehicle.notes,
                })
                .eq('id', vehicle.id)

            if (error) return { error: 'Erro ao atualizar veículo.' }
        } else {
            const { error } = await supabase
                .from('vehicles')
                .insert({
                    plate: vehicle.plate,
                    name: vehicle.name,
                    type: vehicle.type,
                    capacity_kg: vehicle.capacity_kg,
                    capacity_m3: vehicle.capacity_m3,
                    max_stops: vehicle.max_stops,
                    status: vehicle.status,
                    notes: vehicle.notes,
                })

            if (error) {
                if (error.message?.includes('duplicate')) {
                    return { error: 'Já existe um veículo com esta placa.' }
                }
                return { error: 'Erro ao criar veículo.' }
            }
        }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function deleteVehicle(vehicleId: string) {
    try {
        const { supabase } = await requireAdmin()
        const { error } = await supabase
            .from('vehicles')
            .delete()
            .eq('id', vehicleId)

        if (error) return { error: 'Erro ao excluir veículo.' }
        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== DRIVERS CRUD ====================

export async function getDrivers() {
    try {
        const { supabase } = await requireAdmin()
        const { data, error } = await supabase
            .from('drivers')
            .select(`
                *,
                profiles!inner ( full_name, email )
            `)
            .order('created_at', { ascending: false })

        if (error) return { error: 'Erro ao carregar motoristas.' }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: DriverItem[] = (data || []).map((row: any) => ({
            id: row.id,
            profile_id: row.profile_id,
            phone: row.phone,
            license_number: row.license_number,
            default_vehicle_id: row.default_vehicle_id,
            status: row.status,
            notes: row.notes,
            profile_name: row.profiles?.full_name || '',
            profile_email: row.profiles?.email || '',
        }))

        return { data: result }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function upsertDriver(driver: {
    id?: string
    profile_id: string
    phone?: string | null
    license_number?: string | null
    default_vehicle_id?: string | null
    status: string
    notes?: string | null
}) {
    try {
        const { supabase } = await requireAdmin()

        if (driver.id) {
            const { error } = await supabase
                .from('drivers')
                .update({
                    phone: driver.phone,
                    license_number: driver.license_number,
                    default_vehicle_id: driver.default_vehicle_id,
                    status: driver.status,
                    notes: driver.notes,
                })
                .eq('id', driver.id)

            if (error) return { error: 'Erro ao atualizar motorista.' }
        } else {
            const { error } = await supabase
                .from('drivers')
                .insert({
                    profile_id: driver.profile_id,
                    phone: driver.phone,
                    license_number: driver.license_number,
                    default_vehicle_id: driver.default_vehicle_id,
                    status: driver.status,
                    notes: driver.notes,
                })

            if (error) {
                if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
                    return { error: 'Este usuário já está cadastrado como motorista.' }
                }
                return { error: 'Erro ao criar motorista.' }
            }
        }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function deleteDriver(driverId: string) {
    try {
        const { supabase } = await requireAdmin()
        const { error } = await supabase
            .from('drivers')
            .delete()
            .eq('id', driverId)

        if (error) return { error: 'Erro ao excluir motorista.' }
        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== REGIONS CRUD ====================

export async function getRegions() {
    try {
        const { supabase } = await requireAdmin()
        const { data, error } = await supabase
            .from('delivery_regions')
            .select(`
                *,
                route_centers ( name )
            `)
            .order('name')

        if (error) return { error: 'Erro ao carregar regiões.' }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: RegionItem[] = (data || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            cities: row.cities || [],
            states: row.states || [],
            default_center_id: row.default_center_id,
            center_name: row.route_centers?.name || null,
            color: row.color || '#3B82F6',
            is_active: row.is_active,
        }))

        return { data: result }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function upsertRegion(region: {
    id?: string
    name: string
    description?: string | null
    cities: string[]
    states: string[]
    default_center_id?: string | null
    color?: string
    is_active: boolean
}) {
    try {
        const { supabase } = await requireAdmin()

        const payload = {
            name: region.name,
            description: region.description,
            cities: JSON.stringify(region.cities),
            states: JSON.stringify(region.states),
            default_center_id: region.default_center_id,
            color: region.color || '#3B82F6',
            is_active: region.is_active,
        }

        if (region.id) {
            const { error } = await supabase
                .from('delivery_regions')
                .update(payload)
                .eq('id', region.id)

            if (error) return { error: 'Erro ao atualizar região.' }
        } else {
            const { error } = await supabase
                .from('delivery_regions')
                .insert(payload)

            if (error) return { error: 'Erro ao criar região.' }
        }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function deleteRegion(regionId: string) {
    try {
        const { supabase } = await requireAdmin()
        const { error } = await supabase
            .from('delivery_regions')
            .delete()
            .eq('id', regionId)

        if (error) return { error: 'Erro ao excluir região.' }
        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== CENTERS CRUD ====================

export async function getCenters() {
    try {
        const { supabase } = await requireAdmin()
        const { data, error } = await supabase
            .from('route_centers')
            .select('*')
            .order('name')

        if (error) return { error: 'Erro ao carregar centros.' }
        return { data: (data || []) as CenterItem[] }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function upsertCenter(center: {
    id?: string
    name: string
    address: string
    city: string
    state?: string | null
    zip_code?: string | null
    latitude?: number | null
    longitude?: number | null
    is_default: boolean
    is_active: boolean
}) {
    try {
        const { supabase } = await requireAdmin()

        if (center.id) {
            const { error } = await supabase
                .from('route_centers')
                .update(center)
                .eq('id', center.id)

            if (error) return { error: 'Erro ao atualizar centro.' }
        } else {
            const { error } = await supabase
                .from('route_centers')
                .insert(center)

            if (error) return { error: 'Erro ao criar centro.' }
        }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== ROUTE MANAGEMENT ====================

export async function getRoutes(filters?: { status?: string }) {
    try {
        const { supabase } = await requireAdmin()

        let query = supabase.from('delivery_routes').select(`
            id,
            route_number,
            status,
            planned_date,
            total_stops,
            total_distance_km,
            total_duration_min,
            created_at,
            drivers ( profiles ( full_name ) ),
            vehicles ( name, plate ),
            route_centers ( name )
        `)

        if (filters?.status && filters.status !== 'all') {
            query = query.eq('status', filters.status)
        }

        query = query.order('planned_date', { ascending: false }).limit(100)

        const { data, error } = await query

        if (error) {
            console.error('[GET ROUTES] Error:', error)
            return { error: 'Erro ao carregar rotas.' }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: RouteListItem[] = (data || []).map((row: any) => ({
            id: row.id,
            route_number: row.route_number,
            status: row.status,
            planned_date: row.planned_date,
            total_stops: row.total_stops,
            total_distance_km: row.total_distance_km,
            total_duration_min: row.total_duration_min,
            driver_name: row.drivers?.profiles?.full_name || null,
            vehicle_name: row.vehicles?.name || null,
            vehicle_plate: row.vehicles?.plate || null,
            center_name: row.route_centers?.name || null,
            created_at: row.created_at,
        }))

        return { data: result }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function createRoute(input: {
    orderIds: string[]
    vehicleId?: string | null
    driverId?: string | null
    centerId?: string | null
    regionId?: string | null
    plannedDate: string
    notes?: string | null
}) {
    try {
        const { supabase, userId } = await requireAdmin()

        // Create route
        const { data: route, error: routeErr } = await supabase
            .from('delivery_routes')
            .insert({
                route_number: '', // trigger will set it
                status: 'draft',
                driver_id: input.driverId,
                vehicle_id: input.vehicleId,
                center_id: input.centerId,
                region_id: input.regionId,
                planned_date: input.plannedDate,
                total_stops: input.orderIds.length,
                notes: input.notes,
                created_by: userId,
            })
            .select('id, route_number')
            .single()

        if (routeErr || !route) {
            console.error('[CREATE ROUTE] Error:', routeErr)
            return { error: 'Erro ao criar rota.' }
        }

        // Create stops (initial order = order of selection)
        const stops = []
        for (let i = 0; i < input.orderIds.length; i++) {
            const orderId = input.orderIds[i]

            // Fetch order + store data for snapshot
            const { data: order } = await supabase
                .from('orders')
                .select(`
                    store_id,
                    shipping_address,
                    shipping_address_id,
                    stores ( company_name, city, state )
                `)
                .eq('id', orderId)
                .single()

            let lat: number | null = null
            let lng: number | null = null
            let addressId: string | null = null

            if (order?.shipping_address_id) {
                addressId = order.shipping_address_id
                const { data: addr } = await supabase
                    .from('store_addresses')
                    .select('latitude, longitude')
                    .eq('id', order.shipping_address_id)
                    .single()

                lat = addr?.latitude || null
                lng = addr?.longitude || null
            }

            stops.push({
                route_id: route.id,
                order_id: orderId,
                store_id: order?.store_id || '',
                address_id: addressId,
                stop_position: i,
                latitude: lat,
                longitude: lng,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                address_snapshot: order?.shipping_address || `${(order?.stores as any)?.city || ''}, ${(order?.stores as any)?.state || ''}`,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                customer_name: (order?.stores as any)?.company_name || '',
            })
        }

        if (stops.length > 0) {
            const { error: stopsErr } = await supabase
                .from('delivery_route_stops')
                .insert(stops)

            if (stopsErr) {
                console.error('[CREATE ROUTE STOPS] Error:', stopsErr)
                // Cleanup the route
                await supabase.from('delivery_routes').delete().eq('id', route.id)
                return { error: 'Erro ao criar paradas da rota.' }
            }
        }

        // Insert audit event
        await supabase.from('route_events').insert({
            route_id: route.id,
            event_type: 'route_created',
            actor_id: userId,
            metadata: { order_count: input.orderIds.length },
        })

        return { data: { routeId: route.id, routeNumber: route.route_number } }
    } catch (e) {
        console.error('[CREATE ROUTE] Unexpected:', e)
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function getRouteDetail(routeId: string) {
    try {
        const { supabase } = await requireAdmin()

        const { data: route, error } = await supabase
            .from('delivery_routes')
            .select(`
                *,
                drivers ( id, phone, profiles ( full_name ) ),
                vehicles ( name, plate, type, capacity_kg ),
                route_centers ( name, address, city, latitude, longitude ),
                delivery_regions ( name, color )
            `)
            .eq('id', routeId)
            .single()

        if (error || !route) {
            return { error: 'Rota não encontrada.' }
        }

        const { data: stops } = await supabase
            .from('delivery_route_stops')
            .select(`
                *,
                orders ( order_number, total, status )
            `)
            .eq('route_id', routeId)
            .order('stop_position', { ascending: true })

        const { data: events } = await supabase
            .from('route_events')
            .select(`
                *,
                profiles ( full_name )
            `)
            .eq('route_id', routeId)
            .order('created_at', { ascending: false })
            .limit(50)

        return { data: { route, stops: stops || [], events: events || [] } }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function updateRouteStatus(routeId: string, newStatus: string, reason?: string) {
    try {
        const { supabase, userId } = await requireAdmin()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {
            status: newStatus,
            updated_by: userId,
        }

        if (newStatus === 'in_progress') {
            updates.started_at = new Date().toISOString()
        } else if (newStatus === 'completed') {
            updates.completed_at = new Date().toISOString()
        } else if (newStatus === 'cancelled') {
            updates.cancellation_reason = reason || null
        }

        const { error } = await supabase
            .from('delivery_routes')
            .update(updates)
            .eq('id', routeId)

        if (error) return { error: 'Erro ao atualizar status da rota.' }

        // Audit event
        const eventTypeMap: Record<string, string> = {
            optimized: 'route_optimized',
            confirmed: 'route_confirmed',
            in_progress: 'route_started',
            completed: 'route_completed',
            cancelled: 'route_cancelled',
        }

        await supabase.from('route_events').insert({
            route_id: routeId,
            event_type: eventTypeMap[newStatus] || 'notes_updated',
            actor_id: userId,
            metadata: reason ? { reason } : null,
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function updateStopStatus(
    stopId: string,
    newStatus: 'arrived' | 'delivered' | 'failed' | 'skipped',
    data?: { failureReason?: string; notes?: string }
) {
    try {
        const { supabase, userId } = await requireAdmin()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {
            status: newStatus,
        }

        if (newStatus === 'delivered') {
            updates.delivered_at = new Date().toISOString()
        }
        if (newStatus === 'failed' && data?.failureReason) {
            updates.failure_reason = data.failureReason
        }
        if (data?.notes) {
            updates.notes = data.notes
        }

        const { data: stop, error } = await supabase
            .from('delivery_route_stops')
            .update(updates)
            .eq('id', stopId)
            .select('route_id')
            .single()

        if (error || !stop) return { error: 'Erro ao atualizar status da parada.' }

        // Audit event
        await supabase.from('route_events').insert({
            route_id: stop.route_id,
            stop_id: stopId,
            event_type: `stop_${newStatus}`,
            actor_id: userId,
            metadata: data || null,
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function deleteRoute(routeId: string) {
    try {
        const { supabase } = await requireAdmin()

        // Only allow deleting draft/cancelled routes
        const { data: route } = await supabase
            .from('delivery_routes')
            .select('status')
            .eq('id', routeId)
            .single()

        if (!route) return { error: 'Rota não encontrada.' }
        if (!['draft', 'cancelled'].includes(route.status)) {
            return { error: 'Somente rotas em rascunho ou canceladas podem ser excluídas.' }
        }

        const { error } = await supabase
            .from('delivery_routes')
            .delete()
            .eq('id', routeId)

        if (error) return { error: 'Erro ao excluir rota.' }
        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== DELETE CENTER ====================

export async function deleteCenter(centerId: string) {
    try {
        const { supabase } = await requireAdmin()
        const { error } = await supabase
            .from('route_centers')
            .delete()
            .eq('id', centerId)

        if (error) return { error: 'Erro ao excluir centro. Verifique se não há rotas vinculadas.' }
        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== APPLY OPTIMIZATION RESULT ====================

export async function applyOptimizationResult(
    routeId: string,
    result: {
        orderedStops: Array<{ id: string; position: number; arrival: number; distance: number }>
        summary: { totalDistance: number; totalDuration: number; totalStops: number }
        engine?: string
        polyline?: string
    }
) {
    try {
        const { supabase, userId } = await requireAdmin()

        // Update each stop's position, ETA and cumulative distance
        for (const stop of result.orderedStops) {
            await supabase
                .from('delivery_route_stops')
                .update({
                    stop_position: stop.position + 1,
                    estimated_arrival_min: Math.round(stop.arrival / 60),
                    estimated_distance_km: stop.distance,
                })
                .eq('id', stop.id)
        }

        // Update route totals + polyline + engine
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routeUpdate: any = {
            total_distance_km: result.summary.totalDistance,
            total_duration_min: result.summary.totalDuration,
            total_stops: result.summary.totalStops,
            optimization_result: result,
            optimization_engine: result.engine || 'unknown',
            status: 'optimized',
            updated_by: userId,
        }

        if (result.polyline) {
            routeUpdate.route_polyline = result.polyline
        }

        const { error } = await supabase
            .from('delivery_routes')
            .update(routeUpdate)
            .eq('id', routeId)

        if (error) return { error: 'Erro ao salvar resultado da otimização.' }

        // Audit
        await supabase.from('route_events').insert({
            route_id: routeId,
            event_type: 'route_optimized',
            actor_id: userId,
            metadata: {
                engine: result.engine,
                totalDistance: result.summary.totalDistance,
                totalDuration: result.summary.totalDuration,
                stopsOptimized: result.summary.totalStops,
            },
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== UPDATE ROUTE POLYLINE ====================

export async function updateRoutePolyline(
    routeId: string,
    polyline: string,
    directionsEngine?: string,
) {
    try {
        const { supabase, userId } = await requireAdmin()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {
            route_polyline: polyline,
            updated_by: userId,
        }

        // Only set optimization_engine if the column exists (post-migration 043)
        if (directionsEngine) {
            update.optimization_engine = directionsEngine
        }

        const { error } = await supabase
            .from('delivery_routes')
            .update(update)
            .eq('id', routeId)

        if (error) return { error: 'Erro ao salvar trajeto da rota.' }
        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== UPDATE ROUTE ASSIGNMENT ====================

export async function updateRouteAssignment(
    routeId: string,
    updates: {
        driver_id?: string | null
        vehicle_id?: string | null
        center_id?: string | null
        region_id?: string | null
    }
) {
    try {
        const { supabase, userId } = await requireAdmin()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = { updated_by: userId }
        if ('driver_id' in updates) payload.driver_id = updates.driver_id || null
        if ('vehicle_id' in updates) payload.vehicle_id = updates.vehicle_id || null
        if ('center_id' in updates) payload.center_id = updates.center_id || null
        if ('region_id' in updates) payload.region_id = updates.region_id || null

        const { error } = await supabase
            .from('delivery_routes')
            .update(payload)
            .eq('id', routeId)

        if (error) return { error: 'Erro ao atualizar atribuição.' }

        // Audit events
        if ('driver_id' in updates) {
            await supabase.from('route_events').insert({
                route_id: routeId, event_type: 'driver_assigned', actor_id: userId,
                metadata: { driver_id: updates.driver_id },
            })
        }
        if ('vehicle_id' in updates) {
            await supabase.from('route_events').insert({
                route_id: routeId, event_type: 'vehicle_assigned', actor_id: userId,
                metadata: { vehicle_id: updates.vehicle_id },
            })
        }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== ROUTE HISTORY ====================

export interface RouteHistoryItem extends RouteListItem {
    delivered_stops: number
    failed_stops: number
    region_name: string | null
}

export async function getRouteHistory(filters?: {
    status?: string
    dateFrom?: string
    dateTo?: string
    driverId?: string
    vehicleId?: string
}) {
    try {
        const { supabase } = await requireAdmin()

        let query = supabase.from('delivery_routes').select(`
            id,
            route_number,
            status,
            planned_date,
            total_stops,
            total_distance_km,
            total_duration_min,
            created_at,
            started_at,
            completed_at,
            drivers ( profiles ( full_name ) ),
            vehicles ( name, plate ),
            route_centers ( name ),
            delivery_regions ( name ),
            delivery_route_stops ( status )
        `)

        if (filters?.status && filters.status !== 'all') {
            query = query.eq('status', filters.status)
        }
        if (filters?.dateFrom) {
            query = query.gte('planned_date', filters.dateFrom)
        }
        if (filters?.dateTo) {
            query = query.lte('planned_date', filters.dateTo)
        }
        if (filters?.driverId && filters.driverId !== 'all') {
            query = query.eq('driver_id', filters.driverId)
        }
        if (filters?.vehicleId && filters.vehicleId !== 'all') {
            query = query.eq('vehicle_id', filters.vehicleId)
        }

        query = query.order('planned_date', { ascending: false }).limit(200)

        const { data, error } = await query

        if (error) {
            console.error('[ROUTE HISTORY]', error)
            return { error: 'Erro ao carregar histórico.' }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: RouteHistoryItem[] = (data || []).map((row: any) => {
            const stops = row.delivery_route_stops || []
            return {
                id: row.id,
                route_number: row.route_number,
                status: row.status,
                planned_date: row.planned_date,
                total_stops: row.total_stops,
                total_distance_km: row.total_distance_km,
                total_duration_min: row.total_duration_min,
                driver_name: row.drivers?.profiles?.full_name || null,
                vehicle_name: row.vehicles?.name || null,
                vehicle_plate: row.vehicles?.plate || null,
                center_name: row.route_centers?.name || null,
                region_name: row.delivery_regions?.name || null,
                created_at: row.created_at,
                delivered_stops: stops.filter((s: { status: string }) => s.status === 'delivered').length,
                failed_stops: stops.filter((s: { status: string }) => s.status === 'failed').length,
            }
        })

        // Aggregate metrics
        const metrics = {
            totalRoutes: result.length,
            completedRoutes: result.filter(r => r.status === 'completed').length,
            totalDeliveries: result.reduce((acc, r) => acc + r.delivered_stops, 0),
            totalFailures: result.reduce((acc, r) => acc + r.failed_stops, 0),
            totalKm: result.reduce((acc, r) => acc + (r.total_distance_km || 0), 0),
        }

        return { data: result, metrics }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== DISTINCT CITIES (for filters) ====================

export async function getDistinctCities() {
    try {
        const { supabase } = await requireAdmin()
        const { data, error } = await supabase
            .from('stores')
            .select('city')
            .not('city', 'is', null)
            .order('city')

        if (error) return { data: [] }

        const unique = [...new Set((data || []).map((r: { city: string }) => r.city).filter(Boolean))]
        return { data: unique }
    } catch (e) {
        return { data: [] }
    }
}

// ==================== UPDATE STOP COORDINATES ====================

export async function updateStopCoordinates(
    stopId: string,
    lat: number,
    lng: number,
) {
    try {
        const { supabase, userId } = await requireAdmin()

        // Update the stop itself
        const { data: stop, error } = await supabase
            .from('delivery_route_stops')
            .update({ latitude: lat, longitude: lng })
            .eq('id', stopId)
            .select('route_id, address_id')
            .single()

        if (error || !stop) return { error: 'Erro ao atualizar coordenadas da parada.' }

        // Also cache coordinates in store_addresses if linked
        if (stop.address_id) {
            await supabase
                .from('store_addresses')
                .update({
                    latitude: lat,
                    longitude: lng,
                    geocoded_at: new Date().toISOString(),
                    geocoding_source: 'manual_adjustment',
                })
                .eq('id', stop.address_id)
        }

        // Audit
        await supabase.from('route_events').insert({
            route_id: stop.route_id,
            stop_id: stopId,
            event_type: 'stop_arrived', // reuse existing type for geo update
            actor_id: userId,
            metadata: { action: 'geocoded', lat, lng },
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}


