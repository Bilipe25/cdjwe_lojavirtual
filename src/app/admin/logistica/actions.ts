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
    fuel_consumption_km_l: number | null
    fuel_type: string | null
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

export interface PaginationMeta {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
}

function normalizePagination(input?: { page?: number; pageSize?: number }): PaginationMeta {
    const page = Math.max(1, Math.floor(Number(input?.page || 1)))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input?.pageSize || 25))))
    return {
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: page > 1,
    }
}

function withTotal(meta: PaginationMeta, total: number): PaginationMeta {
    const safeTotal = Math.max(0, Number(total || 0))
    const totalPages = Math.max(1, Math.ceil(safeTotal / meta.pageSize))
    const safePage = Math.min(meta.page, totalPages)
    return {
        page: safePage,
        pageSize: meta.pageSize,
        total: safeTotal,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
    }
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

const ROUTE_STATUSES = ['draft', 'optimized', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const
type RouteStatus = typeof ROUTE_STATUSES[number]

const STOP_STATUSES = ['pending', 'arrived', 'delivered', 'failed', 'skipped'] as const
type StopStatus = typeof STOP_STATUSES[number]

const ROUTE_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
    draft: ['optimized', 'confirmed', 'cancelled'],
    optimized: ['confirmed', 'cancelled'],
    confirmed: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
}

function isRouteStatus(value: string): value is RouteStatus {
    return ROUTE_STATUSES.includes(value as RouteStatus)
}

function isStopStatus(value: string): value is StopStatus {
    return STOP_STATUSES.includes(value as StopStatus)
}

// ==================== ROUTABLE ORDERS ====================

export async function getRoutableOrders(filters?: {
    status?: string
    city?: string
    region?: string
    search?: string
    date?: string
    page?: number
    pageSize?: number
}) {
    try {
        const { supabase } = await requireAdmin()
        const basePagination = normalizePagination({ page: filters?.page, pageSize: filters?.pageSize })

        const blockedOrderIds = new Set<string>()
        const { data: activeAssignments, error: assignmentErr } = await supabase
            .from('delivery_route_stops')
            .select(`
                order_id,
                delivery_routes!inner (
                    status
                )
            `)
            .in('delivery_routes.status', ['draft', 'optimized', 'confirmed', 'in_progress'])

        if (assignmentErr) {
            console.error('[ROUTABLE ORDERS] Active assignment lookup error:', assignmentErr)
            return { error: 'Erro ao validar pedidos ja roteirizados.' }
        }

        for (const assignment of activeAssignments || []) {
            if (assignment.order_id) {
                blockedOrderIds.add(assignment.order_id)
            }
        }

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
                ),
                store_addresses!orders_shipping_address_id_fkey (
                    latitude,
                    longitude
                )
        `, { count: 'exact' })

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

        if (filters?.date) {
            const dateValue = filters.date.trim()
            if (dateValue) {
                query = query
                    .gte('created_at', `${dateValue}T00:00:00`)
                    .lt('created_at', `${dateValue}T23:59:59.999`)
            }
        }

        if (blockedOrderIds.size > 0) {
            const blockedFilter = `(${Array.from(blockedOrderIds).map((id) => `"${id}"`).join(',')})`
            query = query.not('id', 'in', blockedFilter)
        }

        const start = (basePagination.page - 1) * basePagination.pageSize
        const end = start + basePagination.pageSize - 1
        query = query
            .order('created_at', { ascending: false })
            .range(start, end)

        const { data, error, count } = await query

        if (error) {
            console.error('[ROUTABLE ORDERS] Error:', error)
            return { error: 'Erro ao carregar pedidos.' }
        }

        const result: RoutableOrder[] = (data || [])
            .map((row) => ({
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
                address_lat: row.store_addresses?.latitude ? Number(row.store_addresses.latitude) : null,
                address_lng: row.store_addresses?.longitude ? Number(row.store_addresses.longitude) : null,
            }))

        const pagination = withTotal(basePagination, count || 0)
        return { data: result, pagination }
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
    fuel_consumption_km_l?: number | null
    fuel_type?: string | null
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
                    fuel_consumption_km_l: vehicle.fuel_consumption_km_l,
                    fuel_type: vehicle.fuel_type,
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
                    fuel_consumption_km_l: vehicle.fuel_consumption_km_l,
                    fuel_type: vehicle.fuel_type,
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

export async function getRoutes(filters?: { status?: string; page?: number; pageSize?: number }) {
    try {
        const { supabase } = await requireAdmin()
        const basePagination = normalizePagination({ page: filters?.page, pageSize: filters?.pageSize })

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
        `, { count: 'exact' })

        if (filters?.status && filters.status !== 'all') {
            query = query.eq('status', filters.status)
        }

        const start = (basePagination.page - 1) * basePagination.pageSize
        const end = start + basePagination.pageSize - 1

        query = query
            .order('planned_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(start, end)

        const { data, error, count } = await query

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

        const pagination = withTotal(basePagination, count || 0)
        return { data: result, pagination }
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
        const { supabase } = await requireAdmin()

        const uniqueOrderIds = [...new Set(input.orderIds.map((id) => id.trim()).filter(Boolean))]
        if (uniqueOrderIds.length === 0) {
            return { error: 'Selecione pelo menos um pedido para criar a rota.' }
        }

        const plannedDate = input.plannedDate?.trim()
        if (!plannedDate) {
            return { error: 'Informe a data planejada da rota.' }
        }

        const { data, error } = await supabase.rpc('admin_create_delivery_route_atomic', {
            p_order_ids: uniqueOrderIds,
            p_planned_date: plannedDate,
            p_vehicle_id: input.vehicleId || null,
            p_driver_id: input.driverId || null,
            p_center_id: input.centerId || null,
            p_region_id: input.regionId || null,
            p_notes: input.notes?.trim() || null,
        })

        if (error) {
            console.error('[CREATE ROUTE] RPC error:', error)
            return { error: error.message || 'Erro ao criar rota.' }
        }

        const row = Array.isArray(data) ? data[0] : data
        if (!row?.route_id || !row?.route_number) {
            return { error: 'Erro ao criar rota.' }
        }

        return { data: { routeId: row.route_id as string, routeNumber: row.route_number as string } }
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

        const normalizedStatus = newStatus.trim().toLowerCase()
        if (!isRouteStatus(normalizedStatus)) {
            return { error: 'Status de rota invalido.' }
        }

        const { data: route, error: routeErr } = await supabase
            .from('delivery_routes')
            .select(`
                id,
                status,
                driver_id,
                vehicle_id,
                center_id,
                route_centers ( latitude, longitude )
            `)
            .eq('id', routeId)
            .single()

        if (routeErr || !route) {
            return { error: 'Rota nao encontrada.' }
        }

        const currentStatus = route.status as RouteStatus
        if (!isRouteStatus(currentStatus)) {
            return { error: 'Status atual da rota invalido.' }
        }

        if (currentStatus === normalizedStatus) {
            return { success: true }
        }

        if (!ROUTE_TRANSITIONS[currentStatus].includes(normalizedStatus)) {
            return { error: `Transicao de status invalida: ${currentStatus} -> ${normalizedStatus}.` }
        }

        if (normalizedStatus === 'confirmed') {
            if (!route.driver_id || !route.vehicle_id || !route.center_id) {
                return { error: 'Para confirmar a rota, atribua motorista, veiculo e centro de saida.' }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const center = route.route_centers as any
            if (!center?.latitude || !center?.longitude) {
                return { error: 'Centro de saida sem coordenadas. Geocodifique o centro antes de confirmar.' }
            }

            const { count: ungeocodedStops, error: stopErr } = await supabase
                .from('delivery_route_stops')
                .select('id', { count: 'exact', head: true })
                .eq('route_id', routeId)
                .or('latitude.is.null,longitude.is.null')

            if (stopErr) {
                return { error: 'Erro ao validar geocodificacao das paradas.' }
            }
            if ((ungeocodedStops || 0) > 0) {
                return { error: 'Todas as paradas precisam de coordenadas antes de confirmar a rota.' }
            }
        }

        if (normalizedStatus === 'cancelled' && !reason?.trim()) {
            return { error: 'Informe o motivo do cancelamento da rota.' }
        }

        if (normalizedStatus === 'completed') {
            const { error: completeErr } = await supabase.rpc('logistics_complete_route_atomic', {
                p_route_id: routeId,
                p_close_open_stops_as: 'failed',
                p_close_reason: reason?.trim() || null,
            })

            if (completeErr) {
                console.error('[ROUTE COMPLETE] RPC error:', completeErr)
                return { error: completeErr.message || 'Erro ao concluir rota.' }
            }

            return { success: true }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {
            status: normalizedStatus,
            updated_by: userId,
        }

        if (normalizedStatus === 'in_progress') {
            updates.started_at = new Date().toISOString()
        } else if (normalizedStatus === 'cancelled') {
            updates.cancellation_reason = reason?.trim() || null
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
            event_type: eventTypeMap[normalizedStatus] || 'notes_updated',
            actor_id: userId,
            metadata: reason ? { reason: reason.trim() } : null,
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
        const { supabase } = await requireAdmin()

        if (!isStopStatus(newStatus)) {
            return { error: 'Status de parada invalido.' }
        }

        if (newStatus === 'failed' && !data?.failureReason?.trim()) {
            return { error: 'Informe o motivo do insucesso para marcar a parada como falha.' }
        }

        const { error } = await supabase.rpc('logistics_update_stop_status_atomic', {
            p_stop_id: stopId,
            p_new_status: newStatus,
            p_failure_reason: data?.failureReason?.trim() || null,
            p_notes: data?.notes?.trim() || null,
        })

        if (error) {
            console.error('[STOP STATUS] RPC error:', error)
            return { error: error.message || 'Erro ao atualizar status da parada.' }
        }

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
        const { supabase } = await requireAdmin()

        const orderedStopsPayload = result.orderedStops.map((stop) => ({
            id: stop.id,
            position: stop.position,
            arrival: stop.arrival,
            distance: stop.distance,
        }))

        const { error } = await supabase.rpc('logistics_apply_optimization_result_atomic', {
            p_route_id: routeId,
            p_ordered_stops: orderedStopsPayload,
            p_total_distance_km: result.summary.totalDistance,
            p_total_duration_min: result.summary.totalDuration,
            p_total_stops: result.summary.totalStops,
            p_engine: result.engine || 'unknown',
            p_polyline: result.polyline || null,
            p_optimization_result: result,
        })

        if (error) {
            console.error('[APPLY OPTIMIZATION] RPC error:', error)
            return { error: error.message || 'Erro ao salvar resultado da otimizacao.' }
        }

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
    distanceKm?: number,
    durationMin?: number,
    directionsStops?: Array<{ id: string; estimated_distance_km: number; estimated_arrival_min: number }>,
) {
    try {
        const { supabase, userId } = await requireAdmin()

        // First, read existing optimization_result to merge
        let existingResult = null
        if (directionsStops?.length) {
            const { data: routeData } = await supabase
                .from('delivery_routes')
                .select('optimization_result')
                .eq('id', routeId)
                .single()
            existingResult = routeData?.optimization_result || {}
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {
            route_polyline: polyline,
            updated_by: userId,
        }

        if (directionsEngine) {
            update.optimization_engine = directionsEngine
        }

        if (distanceKm && distanceKm > 0) {
            update.total_distance_km = distanceKm
        }
        if (durationMin && durationMin > 0) {
            update.total_duration_min = durationMin
        }

        // Merge directionsStops into optimization_result JSONB
        if (directionsStops?.length && existingResult) {
            update.optimization_result = {
                ...existingResult,
                directionsStops,
            }
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

// ==================== UPDATE STOP METRICS (per-stop distance/ETA) ====================

export async function updateStopMetrics(
    stopUpdates: Array<{ id: string; estimated_distance_km: number; estimated_arrival_min: number }>
) {
    try {
        const { supabase } = await requireAdmin()

        if (!Array.isArray(stopUpdates) || stopUpdates.length === 0) {
            return { success: true }
        }

        const sanitized = stopUpdates.map((stop) => ({
            id: stop.id,
            estimated_distance_km: Number(stop.estimated_distance_km || 0),
            estimated_arrival_min: Math.max(0, Math.round(Number(stop.estimated_arrival_min || 0))),
        }))

        const { error } = await supabase.rpc('logistics_batch_update_stop_metrics_atomic', {
            p_stop_updates: sanitized,
        })

        if (error) {
            console.error('[STOP METRICS] RPC error:', error)
            return { error: error.message || 'Erro ao atualizar metricas de parada.' }
        }

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

        const { data: route, error: routeErr } = await supabase
            .from('delivery_routes')
            .select('id, status')
            .eq('id', routeId)
            .single()

        if (routeErr || !route) {
            return { error: 'Rota nao encontrada.' }
        }

        if (!['draft', 'optimized', 'confirmed'].includes(route.status)) {
            return { error: 'Atribuicoes so podem ser alteradas em rotas nao iniciadas.' }
        }

        if (updates.driver_id) {
            const { data: driver } = await supabase
                .from('drivers')
                .select('id, status')
                .eq('id', updates.driver_id)
                .single()

            if (!driver) return { error: 'Motorista selecionado nao encontrado.' }
            if (driver.status === 'inactive') return { error: 'Motorista inativo nao pode ser atribuido a rota.' }
        }

        if (updates.vehicle_id) {
            const { data: vehicle } = await supabase
                .from('vehicles')
                .select('id, status')
                .eq('id', updates.vehicle_id)
                .single()

            if (!vehicle) return { error: 'Veiculo selecionado nao encontrado.' }
            if (vehicle.status === 'inactive' || vehicle.status === 'maintenance') {
                return { error: 'Veiculo indisponivel para atribuicao (inativo ou em manutencao).' }
            }
        }

        if (updates.center_id) {
            const { data: center } = await supabase
                .from('route_centers')
                .select('id, is_active')
                .eq('id', updates.center_id)
                .single()

            if (!center) return { error: 'Centro selecionado nao encontrado.' }
            if (!center.is_active) return { error: 'Centro inativo nao pode ser usado na rota.' }
        }

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
    page?: number
    pageSize?: number
}) {
    try {
        const { supabase } = await requireAdmin()
        const basePagination = normalizePagination({ page: filters?.page, pageSize: filters?.pageSize })

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
        `, { count: 'exact' })

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

        const start = (basePagination.page - 1) * basePagination.pageSize
        const end = start + basePagination.pageSize - 1

        query = query
            .order('planned_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(start, end)

        const { data, error, count } = await query

        if (error) {
            console.error('[ROUTE HISTORY]', error)
            return { error: 'Erro ao carregar historico.' }
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

        const pagination = withTotal(basePagination, count || 0)

        // Aggregate metrics (totals are based on the current filtered page, except totalRoutes)
        const metrics = {
            totalRoutes: pagination.total,
            completedRoutes: result.filter((r) => r.status === 'completed').length,
            totalDeliveries: result.reduce((acc, r) => acc + r.delivered_stops, 0),
            totalFailures: result.reduce((acc, r) => acc + r.failed_stops, 0),
            totalKm: result.reduce((acc, r) => acc + (r.total_distance_km || 0), 0),
        }

        return { data: result, metrics, pagination }
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
    } catch {
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
            event_type: 'notes_updated',
            actor_id: userId,
            metadata: { action: 'geocoded', lat, lng },
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

// ==================== COST SETTINGS ====================

export interface CostSettings {
    id: string
    fuel_price_per_liter: number
    fuel_tax_pct: number
    additional_tax: number
    daily_rate: number
    notes: string | null
    updated_at: string
}

export async function getCostSettings() {
    try {
        const { supabase } = await requireAdmin()
        const { data, error } = await supabase
            .from('logistics_cost_settings')
            .select('*')
            .limit(1)
            .single()

        if (error && error.code !== 'PGRST116') return { error: 'Erro ao carregar configurações de custo.' }
        return { data: (data || null) as CostSettings | null }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function saveCostSettings(settings: {
    fuel_price_per_liter: number
    fuel_tax_pct: number
    additional_tax: number
    daily_rate: number
    notes?: string | null
}) {
    try {
        const { supabase, userId } = await requireAdmin()

        // Try update first (singleton)
        const { data: existing } = await supabase
            .from('logistics_cost_settings')
            .select('id')
            .limit(1)
            .single()

        if (existing?.id) {
            const { error } = await supabase
                .from('logistics_cost_settings')
                .update({
                    ...settings,
                    updated_by: userId,
                })
                .eq('id', existing.id)
            if (error) return { error: 'Erro ao salvar configurações.' }
        } else {
            const { error } = await supabase
                .from('logistics_cost_settings')
                .insert({
                    ...settings,
                    updated_by: userId,
                })
            if (error) return { error: 'Erro ao criar configurações.' }
        }

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function getRouteCostEstimate(routeId: string) {
    try {
        const { supabase } = await requireAdmin()

        // Fetch route with vehicle info
        const { data: route } = await supabase
            .from('delivery_routes')
            .select('id, total_distance_km, vehicle_id, vehicles(fuel_consumption_km_l, fuel_type)')
            .eq('id', routeId)
            .single()

        // Fetch cost settings
        const { data: settings } = await supabase
            .from('logistics_cost_settings')
            .select('*')
            .limit(1)
            .single()

        if (!route || !settings) return { data: null }

        const distanceKm = route.total_distance_km || 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vehicle = route.vehicles as any
        const consumptionKmL = vehicle?.fuel_consumption_km_l || 0
        const fuelType = vehicle?.fuel_type || 'diesel'

        // Calculate
        const litersUsed = consumptionKmL > 0 ? distanceKm / consumptionKmL : 0
        const fuelCost = litersUsed * (settings.fuel_price_per_liter || 0)
        const fuelTax = fuelCost * ((settings.fuel_tax_pct || 0) / 100)
        const additionalTax = settings.additional_tax || 0
        const dailyRate = settings.daily_rate || 0
        const totalCost = fuelCost + fuelTax + additionalTax + dailyRate

        return {
            data: {
                distance_km: distanceKm,
                consumption_km_l: consumptionKmL,
                fuel_type: fuelType,
                liters_used: Math.round(litersUsed * 100) / 100,
                fuel_price_per_liter: settings.fuel_price_per_liter,
                fuel_cost: Math.round(fuelCost * 100) / 100,
                fuel_tax_pct: settings.fuel_tax_pct,
                fuel_tax_value: Math.round(fuelTax * 100) / 100,
                additional_tax: additionalTax,
                daily_rate: dailyRate,
                total_cost: Math.round(totalCost * 100) / 100,
            },
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}



