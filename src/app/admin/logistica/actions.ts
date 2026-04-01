'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { getRemovedEntityLabel, isUuidLike } from '@/lib/logistics/filter-display'

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
    region_label?: string | null
    total: number
    status: string
    created_at: string
    shipping_address: string | null
    shipping_address_id: string | null
    address_lat: number | null
    address_lng: number | null
}

export type ClientMapScope = 'routable' | 'global'

export interface ClientMapItem {
    store_id: string
    company_name: string
    client_name: string
    cnpj: string | null
    city: string
    state: string
    region: string | null
    region_label?: string | null
    primary_address_id: string | null
    primary_address_label: string | null
    geocode_query: string | null
    latitude: number | null
    longitude: number | null
    coordinates_source: string | null
    has_valid_coordinates: boolean
    routable_orders_count: number
    has_routable_orders: boolean
}

export interface ClientMapDatasetResponse {
    scope: ClientMapScope
    items: ClientMapItem[]
    total_clients: number
    loaded_clients: number
    truncated: boolean
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

export interface LogisticsPdfBranding {
    system_name: string
    logo_url: string | null
    cnpj: string | null
    city: string | null
    state: string | null
    address: string | null
    phone: string | null
    email: string | null
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

type ActiveRouteAssignmentRow = {
    order_id: string | null
}

async function fetchBlockedOrderIds(supabase: Awaited<ReturnType<typeof createServerClient>>) {
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
        return { error: assignmentErr.message, blockedOrderIds }
    }

    for (const assignment of (activeAssignments || []) as ActiveRouteAssignmentRow[]) {
        if (assignment.order_id) {
            blockedOrderIds.add(assignment.order_id)
        }
    }

    return { blockedOrderIds }
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] || null) : value
}

function cleanAddressSnapshot(value: string | null | undefined) {
    if (!value) return ''
    return value
        .replace(/\[.*?\]\s*/g, '')
        .replace(/CEP:\s*/gi, '')
        .replace(/,\s*,+/g, ', ')
        .replace(/\s+,/g, ',')
        .replace(/,\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function buildPrimaryAddressLabel(address: {
    address?: string | null
    number?: string | null
    city?: string | null
    state?: string | null
    zip_code?: string | null
    title?: string | null
}) {
    const street = [address.address, address.number].filter(Boolean).join(', ')
    const cityState = [address.city, address.state].filter(Boolean).join(' / ')
    const zip = address.zip_code ? `CEP ${address.zip_code}` : ''
    const title = address.title ? `[${address.title}]` : ''
    return [title, street, cityState, zip].filter(Boolean).join(' - ')
}

function buildClientGeocodeQuery(input: {
    primaryAddress?: {
        address?: string | null
        number?: string | null
        neighborhood?: string | null
        city?: string | null
        state?: string | null
        zip_code?: string | null
    } | null
    storeAddress?: string | null
    storeCity?: string | null
    storeState?: string | null
    storeZipCode?: string | null
}) {
    const baseAddress = input.primaryAddress?.address || input.storeAddress || null
    const parts = [
        cleanAddressSnapshot(baseAddress || ''),
        input.primaryAddress?.number || null,
        input.primaryAddress?.neighborhood || null,
        input.primaryAddress?.city || input.storeCity || null,
        input.primaryAddress?.state || input.storeState || null,
        input.primaryAddress?.zip_code || input.storeZipCode || null,
    ]
        .map((value) => (value || '').trim())
        .filter(Boolean)

    const text = parts
        .join(', ')
        .replace(/,\s*,+/g, ', ')
        .replace(/\s+,/g, ',')
        .replace(/,\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    return text || null
}

function parseCoordinate(value: unknown, axis: 'lat' | 'lng'): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    if (axis === 'lat' && (parsed < -90 || parsed > 90)) return null
    if (axis === 'lng' && (parsed < -180 || parsed > 180)) return null
    return parsed
}

type DeliveryRegionRow = {
    id: string
    name: string | null
}

async function loadDeliveryRegionLabelById(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
) {
    const labelById = new Map<string, string>()
    const { data, error } = await supabase
        .from('delivery_regions')
        .select('id, name')

    if (error) {
        return labelById
    }

    for (const row of (data || []) as DeliveryRegionRow[]) {
        const id = String(row.id || '').trim()
        const name = String(row.name || '').trim()
        if (!id || !name || labelById.has(id)) continue
        labelById.set(id, name)
    }

    return labelById
}

function resolveRegionLabel(
    regionValue: string | null | undefined,
    labelByRegionId: Map<string, string>,
) {
    const normalized = String(regionValue || '').trim()
    if (!normalized) return null
    if (!isUuidLike(normalized)) return normalized
    return labelByRegionId.get(normalized) || getRemovedEntityLabel('region')
}

export async function getRoutableOrders(filters?: {
    status?: string
    city?: string
    region?: string
    search?: string
    date?: string
    storeIds?: string[]
    page?: number
    pageSize?: number
}) {
    try {
        const { supabase } = await requireAdmin()
        const basePagination = normalizePagination({ page: filters?.page, pageSize: filters?.pageSize })

        const blockedOrdersRes = await fetchBlockedOrderIds(supabase)
        if ('error' in blockedOrdersRes) {
            console.error('[ROUTABLE ORDERS] Active assignment lookup error:', blockedOrdersRes.error)
            return { error: 'Erro ao validar pedidos ja roteirizados.' }
        }
        const blockedOrderIds = blockedOrdersRes.blockedOrderIds
        const deliveryRegionLabelById = await loadDeliveryRegionLabelById(supabase)

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
        if (filters?.storeIds && filters.storeIds.length > 0) {
            const uniqueStoreIds = [...new Set(filters.storeIds.map((id) => id.trim()).filter(Boolean))]
            if (uniqueStoreIds.length === 0) {
                return { data: [], pagination: withTotal(basePagination, 0) }
            }
            query = query.in('store_id', uniqueStoreIds)
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

        const result: RoutableOrder[] = (data || []).map((row) => {
            const store = pickFirst(row.stores)
            const profile = store ? pickFirst(store.profiles) : null
            const shippingAddress = pickFirst(row.store_addresses)
            const rawRegion = store?.region ? String(store.region) : null

            return {
                order_id: row.id,
                order_number: row.order_number,
                store_id: row.store_id,
                company_name: store?.company_name || '',
                client_name: profile?.full_name || '',
                city: store?.city || '',
                state: store?.state || '',
                region: rawRegion,
                region_label: resolveRegionLabel(rawRegion, deliveryRegionLabelById),
                total: Number(row.total || 0),
                status: row.status,
                created_at: row.created_at,
                shipping_address: row.shipping_address,
                shipping_address_id: row.shipping_address_id,
                address_lat: parseCoordinate(shippingAddress?.latitude, 'lat'),
                address_lng: parseCoordinate(shippingAddress?.longitude, 'lng'),
            }
        })

        const pagination = withTotal(basePagination, count || 0)
        return { data: result, pagination }
    } catch (e) {
        console.error('[ROUTABLE ORDERS] Unexpected:', e)
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function getClientMapDataset(input?: {
    scope?: ClientMapScope
    search?: string
    city?: string
    region?: string
    onlyWithOrders?: boolean
    onlyWithoutOrders?: boolean
    onlyWithCoordinates?: boolean
    onlyWithoutCoordinates?: boolean
    onlySelectedIds?: string[]
    limit?: number
}) {
    try {
        const { supabase } = await requireAdmin()
        const scope: ClientMapScope = input?.scope === 'global' ? 'global' : 'routable'
        const safeLimit = Math.min(5000, Math.max(100, Math.floor(Number(input?.limit || 1500))))
        const maxRawFetch = 10000
        const searchTerm = input?.search?.trim().toLowerCase() || ''
        const cityFilter = input?.city?.trim() || ''
        const regionFilter = input?.region?.trim() || ''
        const selectedFilterIds = [...new Set((input?.onlySelectedIds || []).map((id) => id.trim()).filter(Boolean))]

        const blockedOrdersRes = await fetchBlockedOrderIds(supabase)
        if ('error' in blockedOrdersRes) {
            console.error('[CLIENT MAP DATASET] Active assignment lookup error:', blockedOrdersRes.error)
            return { error: 'Erro ao validar pedidos ja roteirizados.' }
        }
        const blockedOrderIds = blockedOrdersRes.blockedOrderIds
        const deliveryRegionLabelById = await loadDeliveryRegionLabelById(supabase)

        let routableOrdersQuery = supabase
            .from('orders')
            .select(`
                id,
                store_id,
                store_addresses!orders_shipping_address_id_fkey (
                    latitude,
                    longitude
                )
            `)
            .in('status', ['approved', 'in_production'])

        if (blockedOrderIds.size > 0) {
            const blockedFilter = `(${Array.from(blockedOrderIds).map((id) => `"${id}"`).join(',')})`
            routableOrdersQuery = routableOrdersQuery.not('id', 'in', blockedFilter)
        }

        const { data: routableOrders, error: routableErr } = await routableOrdersQuery
        if (routableErr) {
            console.error('[CLIENT MAP DATASET] Routable orders error:', routableErr)
            return { error: 'Erro ao carregar pedidos aptos para mapa.' }
        }

        const routableCountByStore = new Map<string, number>()
        const routableCoordsByStore = new Map<string, { latitude: number; longitude: number }>()

        for (const row of routableOrders || []) {
            const storeId = row.store_id ? String(row.store_id) : ''
            if (!storeId) continue

            const previous = routableCountByStore.get(storeId) || 0
            routableCountByStore.set(storeId, previous + 1)

            if (!routableCoordsByStore.has(storeId)) {
                const shippingAddress = pickFirst(row.store_addresses)
                const lat = parseCoordinate(shippingAddress?.latitude, 'lat')
                const lng = parseCoordinate(shippingAddress?.longitude, 'lng')
                if (lat !== null && lng !== null) {
                    routableCoordsByStore.set(storeId, { latitude: lat, longitude: lng })
                }
            }
        }

        let storesQuery = supabase
            .from('stores')
            .select(`
                id,
                company_name,
                cnpj,
                address,
                city,
                state,
                zip_code,
                region,
                profiles!stores_profile_id_fkey (
                    full_name
                )
            `, { count: 'exact' })

        if (scope === 'routable') {
            const routableStoreIds = Array.from(routableCountByStore.keys())
            if (routableStoreIds.length === 0) {
                const emptyResult: ClientMapDatasetResponse = {
                    scope,
                    items: [],
                    total_clients: 0,
                    loaded_clients: 0,
                    truncated: false,
                }
                return { data: emptyResult }
            }
            storesQuery = storesQuery.in('id', routableStoreIds)
        }

        if (selectedFilterIds.length > 0) {
            storesQuery = storesQuery.in('id', selectedFilterIds)
        }
        if (cityFilter) {
            storesQuery = storesQuery.ilike('city', `%${cityFilter}%`)
        }
        if (regionFilter) {
            storesQuery = storesQuery.ilike('region', `%${regionFilter}%`)
        }
        if (searchTerm) {
            const escapedSearch = searchTerm.replace(/[%_]/g, '')
            if (escapedSearch) {
                storesQuery = storesQuery.or(
                    `company_name.ilike.%${escapedSearch}%,cnpj.ilike.%${escapedSearch}%,city.ilike.%${escapedSearch}%`
                )
            }
        }

        storesQuery = storesQuery
            .order('company_name', { ascending: true })
            .range(0, maxRawFetch - 1)

        const { data: stores, error: storesErr, count: storesCount } = await storesQuery
        if (storesErr) {
            console.error('[CLIENT MAP DATASET] Stores error:', storesErr)
            return { error: 'Erro ao carregar clientes para o mapa.' }
        }

        const storeIds = (stores || [])
            .map((store) => String(store.id || ''))
            .filter(Boolean)

        const primaryAddressByStore = new Map<string, {
            id: string
            title: string | null
            address: string | null
            number: string | null
            neighborhood: string | null
            city: string | null
            state: string | null
            zip_code: string | null
            latitude: number | null
            longitude: number | null
        }>()
        const fallbackAddressCoordsByStore = new Map<string, { latitude: number; longitude: number }>()
        if (storeIds.length > 0) {
            const { data: addresses } = await supabase
                .from('store_addresses')
                .select('id, store_id, title, address, number, neighborhood, city, state, zip_code, latitude, longitude, is_main, updated_at, created_at')
                .in('store_id', storeIds)
                .order('is_main', { ascending: false })
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false })

            for (const addr of addresses || []) {
                const storeId = String(addr.store_id || '')
                if (!storeId) continue

                if (!primaryAddressByStore.has(storeId)) {
                    primaryAddressByStore.set(storeId, {
                        id: String(addr.id || ''),
                        title: addr.title ? String(addr.title) : null,
                        address: addr.address ? String(addr.address) : null,
                        number: addr.number ? String(addr.number) : null,
                        neighborhood: addr.neighborhood ? String(addr.neighborhood) : null,
                        city: addr.city ? String(addr.city) : null,
                        state: addr.state ? String(addr.state) : null,
                        zip_code: addr.zip_code ? String(addr.zip_code) : null,
                        latitude: parseCoordinate(addr.latitude, 'lat'),
                        longitude: parseCoordinate(addr.longitude, 'lng'),
                    })
                }

                const lat = parseCoordinate(addr.latitude, 'lat')
                const lng = parseCoordinate(addr.longitude, 'lng')
                if (!fallbackAddressCoordsByStore.has(storeId) && lat !== null && lng !== null) {
                    fallbackAddressCoordsByStore.set(storeId, { latitude: lat, longitude: lng })
                }
            }
        }

        const needsStopFallbackStoreIds = storeIds.filter((storeId) => {
            const primaryAddress = primaryAddressByStore.get(storeId) || null
            const hasPrimaryCoords = Boolean(
                primaryAddress
                && primaryAddress.latitude !== null
                && primaryAddress.longitude !== null,
            )
            return !hasPrimaryCoords && !routableCoordsByStore.has(storeId)
        })

        const latestStopCoordsByStore = new Map<string, { latitude: number; longitude: number }>()
        if (needsStopFallbackStoreIds.length > 0) {
            const { data: stopCoords } = await supabase
                .from('delivery_route_stops')
                .select('store_id, latitude, longitude, updated_at, created_at')
                .in('store_id', needsStopFallbackStoreIds)
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(25000)

            for (const row of stopCoords || []) {
                const storeId = String(row.store_id || '')
                if (!storeId || latestStopCoordsByStore.has(storeId)) continue
                const lat = parseCoordinate(row.latitude, 'lat')
                const lng = parseCoordinate(row.longitude, 'lng')
                if (lat !== null && lng !== null) {
                    latestStopCoordsByStore.set(storeId, { latitude: lat, longitude: lng })
                }
            }
        }

        let items: ClientMapItem[] = (stores || []).map((store) => {
            const storeId = String(store.id || '')
            const profile = pickFirst(store.profiles)
            const routableOrdersCount = routableCountByStore.get(storeId) || 0
            const primaryAddress = primaryAddressByStore.get(storeId) || null
            const rawRegion = store.region ? String(store.region) : null

            const primaryCoords = (
                primaryAddress
                && primaryAddress.latitude !== null
                && primaryAddress.longitude !== null
            )
                ? { latitude: primaryAddress.latitude, longitude: primaryAddress.longitude }
                : null

            let preferredCoords: { latitude: number; longitude: number } | null = null
            let coordinatesSource: string | null = null

            if (primaryCoords) {
                preferredCoords = primaryCoords
                coordinatesSource = 'primary_address'
            } else if (routableCoordsByStore.has(storeId)) {
                preferredCoords = routableCoordsByStore.get(storeId) || null
                coordinatesSource = 'routable_order_address'
            } else if (latestStopCoordsByStore.has(storeId)) {
                preferredCoords = latestStopCoordsByStore.get(storeId) || null
                coordinatesSource = 'latest_route_stop'
            } else if (fallbackAddressCoordsByStore.has(storeId)) {
                preferredCoords = fallbackAddressCoordsByStore.get(storeId) || null
                coordinatesSource = 'store_address'
            }

            const latitude = preferredCoords?.latitude ?? null
            const longitude = preferredCoords?.longitude ?? null
            const hasValidCoordinates = (
                coordinatesSource === 'primary_address'
                && latitude !== null
                && longitude !== null
            )

            return {
                store_id: storeId,
                company_name: String(store.company_name || ''),
                client_name: String(profile?.full_name || ''),
                cnpj: store.cnpj ? String(store.cnpj) : null,
                city: String(store.city || ''),
                state: String(store.state || ''),
                region: rawRegion,
                region_label: resolveRegionLabel(rawRegion, deliveryRegionLabelById),
                primary_address_id: primaryAddress?.id || null,
                primary_address_label: primaryAddress ? buildPrimaryAddressLabel(primaryAddress) : null,
                geocode_query: buildClientGeocodeQuery({
                    primaryAddress,
                    storeAddress: typeof store.address === 'string' ? store.address : null,
                    storeCity: typeof store.city === 'string' ? store.city : null,
                    storeState: typeof store.state === 'string' ? store.state : null,
                    storeZipCode: typeof store.zip_code === 'string' ? store.zip_code : null,
                }),
                latitude,
                longitude,
                coordinates_source: coordinatesSource,
                has_valid_coordinates: hasValidCoordinates,
                routable_orders_count: routableOrdersCount,
                has_routable_orders: routableOrdersCount > 0,
            }
        })

        if (searchTerm) {
            items = items.filter((item) => (
                item.company_name.toLowerCase().includes(searchTerm)
                || item.client_name.toLowerCase().includes(searchTerm)
                || (item.cnpj || '').toLowerCase().includes(searchTerm)
                || item.city.toLowerCase().includes(searchTerm)
                || (item.region || '').toLowerCase().includes(searchTerm)
                || (item.region_label || '').toLowerCase().includes(searchTerm)
            ))
        }

        if (input?.onlyWithOrders) {
            items = items.filter((item) => item.has_routable_orders)
        }
        if (input?.onlyWithoutOrders) {
            items = items.filter((item) => !item.has_routable_orders)
        }
        if (input?.onlyWithCoordinates) {
            items = items.filter((item) => item.has_valid_coordinates)
        }
        if (input?.onlyWithoutCoordinates) {
            items = items.filter((item) => !item.has_valid_coordinates)
        }

        const totalClients = items.length
        const loadedItems = items.slice(0, safeLimit)
        const sourceWasTruncated = Number(storesCount || 0) > (stores || []).length
        const truncated = sourceWasTruncated || totalClients > loadedItems.length

        const response: ClientMapDatasetResponse = {
            scope,
            items: loadedItems,
            total_clients: totalClients,
            loaded_clients: loadedItems.length,
            truncated,
        }

        return { data: response }
    } catch (e) {
        console.error('[CLIENT MAP DATASET] Unexpected:', e)
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
            .eq('is_deleted', false)

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
            .eq('is_deleted', false)
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

export async function getLogisticsPdfBranding() {
    try {
        const { supabase } = await requireAdmin()

        const { data, error } = await supabase
            .from('system_settings')
            .select('system_name, logo_url, cnpj, city, state, address, phone, email')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

        if (error) {
            return { error: 'Erro ao carregar identidade visual para o PDF.' }
        }

        const branding: LogisticsPdfBranding = {
            system_name: data?.system_name || 'CDJWE Estofados',
            logo_url: data?.logo_url || null,
            cnpj: data?.cnpj || null,
            city: data?.city || null,
            state: data?.state || null,
            address: data?.address || null,
            phone: data?.phone || null,
            email: data?.email || null,
        }

        return { data: branding }
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
                is_deleted,
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
        if (route.is_deleted) {
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
        const { supabase, userId } = await requireAdmin()

        const { data: route, error: routeErr } = await supabase
            .from('delivery_routes')
            .select('id, route_number, status, is_deleted')
            .eq('id', routeId)
            .maybeSingle()

        if (routeErr) return { error: 'Erro ao localizar rota para exclusao.' }
        if (!route) return { error: 'Rota nao encontrada.' }

        if (route.is_deleted) {
            return { success: true }
        }

        const deletedAt = new Date().toISOString()

        const { error } = await supabase
            .from('delivery_routes')
            .update({
                is_deleted: true,
                deleted_at: deletedAt,
                deleted_by: userId,
                updated_by: userId,
            })
            .eq('id', routeId)

        if (error) return { error: 'Erro ao excluir rota logicamente.' }

        await supabase.from('route_events').insert({
            route_id: routeId,
            event_type: 'notes_updated',
            actor_id: userId,
            metadata: {
                action: 'route_soft_deleted',
                previous_status: route.status,
                route_number: route.route_number,
                deleted_at: deletedAt,
            },
        })

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

export async function saveRouteStopsOrder(
    routeId: string,
    orderedStopIds: string[],
    reason?: string,
) {
    try {
        const { supabase } = await requireAdmin()

        const normalizedRouteId = String(routeId || '').trim()
        if (!normalizedRouteId) {
            return { error: 'Rota invalida para salvar sequencia.' }
        }

        const normalizedStopIds = (orderedStopIds || [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)

        if (normalizedStopIds.length === 0) {
            return { error: 'Informe ao menos uma parada para salvar a sequencia.' }
        }

        const uniqueStopIds = new Set(normalizedStopIds)
        if (uniqueStopIds.size !== normalizedStopIds.length) {
            return { error: 'A sequencia enviada contem paradas duplicadas.' }
        }

        const { data, error } = await supabase.rpc('logistics_reorder_route_stops_atomic', {
            p_route_id: normalizedRouteId,
            p_ordered_stop_ids: normalizedStopIds,
            p_reason: reason?.trim() || null,
        })

        if (error) {
            console.error('[SAVE ROUTE STOPS ORDER] RPC error:', error)
            if (String(error.message || '').includes('idx_delivery_route_stops_route_position_unique')) {
                return { error: 'Conflito temporario ao reorganizar as paradas. Atualize para a migration 058 e tente novamente.' }
            }
            return { error: error.message || 'Erro ao salvar nova ordem das paradas.' }
        }

        const row = Array.isArray(data) ? data[0] : null
        return {
            success: true,
            data: {
                route_id: row?.route_id || normalizedRouteId,
                updated_stops: Number(row?.updated_stops || normalizedStopIds.length),
                route_status: row?.route_status || null,
            },
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function addRouteStop(
    routeId: string,
    orderId: string,
    reason?: string,
) {
    try {
        const { supabase } = await requireAdmin()

        const normalizedRouteId = String(routeId || '').trim()
        const normalizedOrderId = String(orderId || '').trim()

        if (!normalizedRouteId) {
            return { error: 'Rota invalida para adicionar parada.' }
        }
        if (!normalizedOrderId) {
            return { error: 'Pedido invalido para adicionar parada.' }
        }

        const { data, error } = await supabase.rpc('logistics_add_route_stop_atomic', {
            p_route_id: normalizedRouteId,
            p_order_id: normalizedOrderId,
            p_reason: reason?.trim() || null,
        })

        if (error) {
            console.error('[ADD ROUTE STOP] RPC error:', error)
            return { error: error.message || 'Erro ao adicionar parada na rota.' }
        }

        const row = Array.isArray(data) ? data[0] : null
        return {
            success: true,
            data: {
                route_id: row?.route_id || normalizedRouteId,
                added_stop_id: row?.added_stop_id || null,
                stop_position: Number(row?.stop_position || 0),
                total_stops: Number(row?.total_stops || 0),
                route_status: row?.route_status || null,
                order_number: row?.order_number || null,
                customer_name: row?.customer_name || null,
                address_snapshot: row?.address_snapshot || null,
                latitude: parseCoordinate(row?.latitude, 'lat'),
                longitude: parseCoordinate(row?.longitude, 'lng'),
            },
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function removeRouteStop(
    routeId: string,
    stopId: string,
    reason?: string,
) {
    try {
        const { supabase } = await requireAdmin()

        const normalizedRouteId = String(routeId || '').trim()
        const normalizedStopId = String(stopId || '').trim()

        if (!normalizedRouteId) {
            return { error: 'Rota invalida para remover parada.' }
        }
        if (!normalizedStopId) {
            return { error: 'Parada invalida para remocao.' }
        }

        const { data, error } = await supabase.rpc('logistics_remove_route_stop_atomic', {
            p_route_id: normalizedRouteId,
            p_stop_id: normalizedStopId,
            p_reason: reason?.trim() || null,
        })

        if (error) {
            console.error('[REMOVE ROUTE STOP] RPC error:', error)
            return { error: error.message || 'Erro ao remover parada da rota.' }
        }

        const row = Array.isArray(data) ? data[0] : null
        return {
            success: true,
            data: {
                route_id: row?.route_id || normalizedRouteId,
                removed_stop_id: row?.removed_stop_id || normalizedStopId,
                remaining_stops: Number(row?.remaining_stops || 0),
                route_status: row?.route_status || null,
            },
        }
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
                .eq('is_deleted', false)
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
            .eq('is_deleted', false)

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
            .select('id, status, is_deleted')
            .eq('id', routeId)
            .single()

        if (routeErr || !route) {
            return { error: 'Rota nao encontrada.' }
        }
        if (route.is_deleted) {
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
            .eq('is_deleted', false)

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
            .eq('is_deleted', false)

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

type PrimaryAddressResolution = {
    addressId: string
    addressLabel: string
}

type StoreSnapshot = {
    id: string
    company_name: string | null
    address: string | null
    city: string | null
    state: string | null
    zip_code: string | null
}

async function resolveOrCreatePrimaryAddress(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    storeId: string,
    fallbackAddressText?: string | null,
) {
    const { data: store, error: storeErr } = await supabase
        .from('stores')
        .select('id, company_name, address, city, state, zip_code')
        .eq('id', storeId)
        .single()

    if (storeErr || !store) {
        return { error: 'Loja da parada nao encontrada para atualizar coordenadas.' }
    }

    const { data: addresses, error: addressesErr } = await supabase
        .from('store_addresses')
        .select('id, title, is_main, address, number, city, state, zip_code, created_at')
        .eq('store_id', storeId)
        .order('is_main', { ascending: false })
        .order('created_at', { ascending: true })

    if (addressesErr) {
        return { error: 'Erro ao localizar enderecos do cliente.' }
    }

    const addressList = addresses || []
    const mainAddress = addressList.find((row) => row.is_main)

    if (mainAddress) {
        const label = buildPrimaryAddressLabel({
            title: mainAddress.title,
            address: mainAddress.address,
            number: mainAddress.number,
            city: mainAddress.city,
            state: mainAddress.state,
            zip_code: mainAddress.zip_code,
        })
        return {
            data: {
                addressId: String(mainAddress.id),
                addressLabel: label || 'Endereco Principal',
            } as PrimaryAddressResolution,
        }
    }

    if (addressList.length > 0) {
        const promoted = addressList[0]
        const { error: promoteErr } = await supabase
            .from('store_addresses')
            .update({ is_main: true })
            .eq('id', promoted.id)

        if (promoteErr) {
            return { error: 'Erro ao promover endereco principal do cliente.' }
        }

        const label = buildPrimaryAddressLabel({
            title: promoted.title,
            address: promoted.address,
            number: promoted.number,
            city: promoted.city,
            state: promoted.state,
            zip_code: promoted.zip_code,
        })
        return {
            data: {
                addressId: String(promoted.id),
                addressLabel: label || 'Endereco Principal',
            } as PrimaryAddressResolution,
        }
    }

    const storeSnapshot = store as StoreSnapshot
    const snapshotAddress = cleanAddressSnapshot(fallbackAddressText || '')
    const baseAddress = (storeSnapshot.address || '').trim() || snapshotAddress
    const baseCity = (storeSnapshot.city || '').trim()
    const baseState = (storeSnapshot.state || '').trim()

    if (!baseAddress || !baseCity || !baseState) {
        return {
            error: 'Nao foi possivel criar endereco principal automaticamente. Complete endereco, cidade e estado do cliente.',
        }
    }

    const { data: created, error: createErr } = await supabase
        .from('store_addresses')
        .insert({
            store_id: storeId,
            title: 'Endereco Principal',
            is_main: true,
            zip_code: (storeSnapshot.zip_code || '').trim() || '00000000',
            address: baseAddress,
            city: baseCity,
            state: baseState,
        })
        .select('id, title, address, city, state, zip_code')
        .single()

    if (createErr || !created) {
        return { error: 'Erro ao criar endereco principal para persistir coordenadas.' }
    }

    return {
        data: {
            addressId: String(created.id),
            addressLabel: buildPrimaryAddressLabel({
                title: created.title,
                address: created.address,
                city: created.city,
                state: created.state,
                zip_code: created.zip_code,
            }) || 'Endereco Principal',
        } as PrimaryAddressResolution,
    }
}

async function syncStoreCoordinatesAcrossOperationalStops(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    params: { storeId: string; addressId: string; lat: number; lng: number },
) {
    const { data: routes, error: routesErr } = await supabase
        .from('delivery_routes')
        .select('id')
        .in('status', ['draft', 'optimized', 'confirmed', 'in_progress'])
        .eq('is_deleted', false)

    if (routesErr) {
        return { error: 'Erro ao localizar rotas operacionais para sincronizacao.' }
    }

    const routeIds = (routes || []).map((row) => String(row.id)).filter(Boolean)
    if (routeIds.length === 0) {
        return { data: { updatedRouteIds: [] as string[], updatedStops: 0 } }
    }

    const { data: updatedStops, error: syncErr } = await supabase
        .from('delivery_route_stops')
        .update({
            latitude: params.lat,
            longitude: params.lng,
            address_id: params.addressId,
        })
        .eq('store_id', params.storeId)
        .in('route_id', routeIds)
        .select('id, route_id')

    if (syncErr) {
        return { error: 'Erro ao sincronizar coordenadas nas paradas operacionais.' }
    }

    const updatedRouteIds = [...new Set((updatedStops || []).map((row) => String(row.route_id || '')).filter(Boolean))]
    return {
        data: {
            updatedRouteIds,
            updatedStops: (updatedStops || []).length,
        },
    }
}

export async function updateClientCoordinates(
    input: { storeId: string; lat: number; lng: number },
) {
    try {
        const { supabase, userId } = await requireAdmin()
        const storeId = input.storeId?.trim()
        const lat = Number(input.lat)
        const lng = Number(input.lng)

        if (!storeId) return { error: 'Cliente invalido.' }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return { error: 'Latitude e longitude invalidas.' }
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return { error: 'Coordenadas fora dos limites geograficos.' }
        }

        const primaryAddressRes = await resolveOrCreatePrimaryAddress(supabase, storeId, null)
        if ('error' in primaryAddressRes && primaryAddressRes.error) {
            return { error: primaryAddressRes.error }
        }
        const primaryAddress = primaryAddressRes.data!

        const { error: updateAddressErr } = await supabase
            .from('store_addresses')
            .update({
                latitude: lat,
                longitude: lng,
                geocoded_at: new Date().toISOString(),
                geocoding_source: 'manual_adjustment',
                is_main: true,
            })
            .eq('id', primaryAddress.addressId)

        if (updateAddressErr) {
            return { error: 'Erro ao atualizar coordenadas no endereco principal.' }
        }

        const syncRes = await syncStoreCoordinatesAcrossOperationalStops(supabase, {
            storeId,
            addressId: primaryAddress.addressId,
            lat,
            lng,
        })

        if ('error' in syncRes && syncRes.error) {
            return { error: syncRes.error }
        }

        const routeIds = syncRes.data?.updatedRouteIds || []
        if (routeIds.length > 0) {
            await supabase.from('route_events').insert(
                routeIds.map((routeId) => ({
                    route_id: routeId,
                    event_type: 'notes_updated',
                    actor_id: userId,
                    metadata: {
                        action: 'client_geocoded_from_client_map',
                        store_id: storeId,
                        address_id: primaryAddress.addressId,
                        lat,
                        lng,
                    },
                })),
            )
        }

        return {
            data: {
                store_id: storeId,
                primary_address_id: primaryAddress.addressId,
                primary_address_label: primaryAddress.addressLabel,
                latitude: lat,
                longitude: lng,
                coordinates_source: 'primary_address',
            },
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function updateStopCoordinates(
    stopId: string,
    lat: number,
    lng: number,
) {
    try {
        const { supabase, userId } = await requireAdmin()

        const normalizedLat = Number(lat)
        const normalizedLng = Number(lng)
        if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) {
            return { error: 'Latitude e longitude invalidas.' }
        }

        const { data: stop, error } = await supabase
            .from('delivery_route_stops')
            .select('route_id, address_id, store_id, address_snapshot')
            .eq('id', stopId)
            .single()

        if (error || !stop) return { error: 'Parada nao encontrada para atualizar coordenadas.' }

        const storeId = String(stop.store_id || '')
        if (!storeId) {
            return { error: 'Parada sem cliente vinculado para persistir coordenadas.' }
        }

        const primaryAddressRes = await resolveOrCreatePrimaryAddress(
            supabase,
            storeId,
            typeof stop.address_snapshot === 'string' ? stop.address_snapshot : null,
        )
        if ('error' in primaryAddressRes && primaryAddressRes.error) {
            return { error: primaryAddressRes.error }
        }
        const primaryAddress = primaryAddressRes.data!

        const { error: updateAddressErr } = await supabase
            .from('store_addresses')
            .update({
                latitude: normalizedLat,
                longitude: normalizedLng,
                geocoded_at: new Date().toISOString(),
                geocoding_source: 'manual_adjustment',
                is_main: true,
            })
            .eq('id', primaryAddress.addressId)

        if (updateAddressErr) {
            return { error: 'Erro ao atualizar endereco principal com as coordenadas da parada.' }
        }

        const { error: stopUpdateErr } = await supabase
            .from('delivery_route_stops')
            .update({
                latitude: normalizedLat,
                longitude: normalizedLng,
                address_id: primaryAddress.addressId,
            })
            .eq('id', stopId)
            .select('id')
            .single()

        if (stopUpdateErr) {
            return { error: 'Erro ao atualizar coordenadas da parada atual.' }
        }

        const syncRes = await syncStoreCoordinatesAcrossOperationalStops(supabase, {
            storeId,
            addressId: primaryAddress.addressId,
            lat: normalizedLat,
            lng: normalizedLng,
        })
        if ('error' in syncRes && syncRes.error) {
            return { error: syncRes.error }
        }

        const routeIdsToAudit = new Set<string>([
            String(stop.route_id || ''),
            ...(syncRes.data?.updatedRouteIds || []),
        ])
        routeIdsToAudit.delete('')

        if (routeIdsToAudit.size > 0) {
            await supabase.from('route_events').insert(
                Array.from(routeIdsToAudit).map((routeId) => ({
                    route_id: routeId,
                    stop_id: routeId === String(stop.route_id || '') ? stopId : null,
                    event_type: 'notes_updated',
                    actor_id: userId,
                    metadata: {
                        action: 'geocoded',
                        store_id: storeId,
                        address_id: primaryAddress.addressId,
                        lat: normalizedLat,
                        lng: normalizedLng,
                    },
                })),
            )
        }

        return {
            data: {
                store_id: storeId,
                primary_address_id: primaryAddress.addressId,
                primary_address_label: primaryAddress.addressLabel,
                latitude: normalizedLat,
                longitude: normalizedLng,
                synced_routes_count: syncRes.data?.updatedRouteIds.length || 0,
                synced_stops_count: syncRes.data?.updatedStops || 0,
            },
        }
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

export interface RouteCostOverrideSettings {
    fuel_price_per_liter: number | null
    fuel_tax_pct: number | null
    additional_tax: number | null
    daily_rate: number | null
    consumption_km_l: number | null
    notes: string | null
    updated_at?: string | null
}

export interface RouteCostEffectiveSettings {
    fuel_price_per_liter: number
    fuel_tax_pct: number
    additional_tax: number
    daily_rate: number
    consumption_km_l: number
    notes: string | null
}

export interface RouteCostEstimate {
    distance_km: number
    consumption_km_l: number
    fuel_type: string
    liters_used: number
    fuel_price_per_liter: number
    fuel_cost: number
    fuel_tax_pct: number
    fuel_tax_value: number
    additional_tax: number
    daily_rate: number
    total_cost: number
    can_calculate_fuel: boolean
}

export interface RouteCostProfile {
    route_id: string
    route_status: string
    can_edit: boolean
    is_custom: boolean
    base_settings: CostSettings
    override_settings: RouteCostOverrideSettings | null
    effective_settings: RouteCostEffectiveSettings
    estimate: RouteCostEstimate
}

function toSafeNumber(value: unknown, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function computeRouteCostEstimate(input: {
    distanceKm: number
    consumptionKmL: number
    fuelType: string
    fuelPricePerLiter: number
    fuelTaxPct: number
    additionalTax: number
    dailyRate: number
}): RouteCostEstimate {
    const distanceKm = Math.max(0, toSafeNumber(input.distanceKm, 0))
    const consumptionKmL = Math.max(0, toSafeNumber(input.consumptionKmL, 0))
    const fuelPricePerLiter = Math.max(0, toSafeNumber(input.fuelPricePerLiter, 0))
    const fuelTaxPct = Math.max(0, toSafeNumber(input.fuelTaxPct, 0))
    const additionalTax = Math.max(0, toSafeNumber(input.additionalTax, 0))
    const dailyRate = Math.max(0, toSafeNumber(input.dailyRate, 0))
    const canCalculateFuel = consumptionKmL > 0
    const litersUsed = canCalculateFuel ? distanceKm / consumptionKmL : 0
    const fuelCost = litersUsed * fuelPricePerLiter
    const fuelTax = fuelCost * (fuelTaxPct / 100)
    const totalCost = fuelCost + fuelTax + additionalTax + dailyRate

    return {
        distance_km: Math.round(distanceKm * 100) / 100,
        consumption_km_l: Math.round(consumptionKmL * 100) / 100,
        fuel_type: input.fuelType || 'diesel',
        liters_used: Math.round(litersUsed * 100) / 100,
        fuel_price_per_liter: Math.round(fuelPricePerLiter * 100) / 100,
        fuel_cost: Math.round(fuelCost * 100) / 100,
        fuel_tax_pct: Math.round(fuelTaxPct * 100) / 100,
        fuel_tax_value: Math.round(fuelTax * 100) / 100,
        additional_tax: Math.round(additionalTax * 100) / 100,
        daily_rate: Math.round(dailyRate * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        can_calculate_fuel: canCalculateFuel,
    }
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

export async function getRouteCostProfile(routeId: string) {
    try {
        const { supabase } = await requireAdmin()

        const [routeRes, settingsRes, overrideRes] = await Promise.all([
            supabase
                .from('delivery_routes')
                .select('id, status, total_distance_km, vehicles(fuel_consumption_km_l, fuel_type)')
                .eq('id', routeId)
                .eq('is_deleted', false)
                .single(),
            supabase
                .from('logistics_cost_settings')
                .select('*')
                .limit(1)
                .single(),
            supabase
                .from('delivery_route_cost_overrides')
                .select('*')
                .eq('route_id', routeId)
                .maybeSingle(),
        ])

        if (routeRes.error || !routeRes.data) {
            return { error: 'Rota nao encontrada.' }
        }

        if (settingsRes.error && settingsRes.error.code !== 'PGRST116') {
            return { error: 'Erro ao carregar configuracoes globais de custo.' }
        }

        if (overrideRes.error && overrideRes.error.code !== 'PGRST116' && overrideRes.error.code !== '42P01') {
            return { error: 'Erro ao carregar customizacao de custos da rota.' }
        }

        const baseSettings: CostSettings = {
            id: settingsRes.data?.id || 'default',
            fuel_price_per_liter: toSafeNumber(settingsRes.data?.fuel_price_per_liter, 5.5),
            fuel_tax_pct: toSafeNumber(settingsRes.data?.fuel_tax_pct, 0),
            additional_tax: toSafeNumber(settingsRes.data?.additional_tax, 0),
            daily_rate: toSafeNumber(settingsRes.data?.daily_rate, 150),
            notes: settingsRes.data?.notes || null,
            updated_at: settingsRes.data?.updated_at || new Date().toISOString(),
        }

        const route = routeRes.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vehicle = route.vehicles as any
        const override = overrideRes.error?.code === '42P01' ? null : overrideRes.data

        const overrideSettings: RouteCostOverrideSettings | null = override
            ? {
                fuel_price_per_liter: override.fuel_price_per_liter,
                fuel_tax_pct: override.fuel_tax_pct,
                additional_tax: override.additional_tax,
                daily_rate: override.daily_rate,
                consumption_km_l: override.consumption_km_l,
                notes: override.notes || null,
                updated_at: override.updated_at || null,
            }
            : null

        const effectiveSettings: RouteCostEffectiveSettings = {
            fuel_price_per_liter: override?.fuel_price_per_liter ?? baseSettings.fuel_price_per_liter,
            fuel_tax_pct: override?.fuel_tax_pct ?? baseSettings.fuel_tax_pct,
            additional_tax: override?.additional_tax ?? baseSettings.additional_tax,
            daily_rate: override?.daily_rate ?? baseSettings.daily_rate,
            consumption_km_l: override?.consumption_km_l ?? toSafeNumber(vehicle?.fuel_consumption_km_l, 0),
            notes: override?.notes ?? baseSettings.notes ?? null,
        }

        const estimate = computeRouteCostEstimate({
            distanceKm: toSafeNumber(route.total_distance_km, 0),
            consumptionKmL: effectiveSettings.consumption_km_l,
            fuelType: vehicle?.fuel_type || 'diesel',
            fuelPricePerLiter: effectiveSettings.fuel_price_per_liter,
            fuelTaxPct: effectiveSettings.fuel_tax_pct,
            additionalTax: effectiveSettings.additional_tax,
            dailyRate: effectiveSettings.daily_rate,
        })

        const isCustom = Boolean(
            override && (
                override.fuel_price_per_liter !== null
                || override.fuel_tax_pct !== null
                || override.additional_tax !== null
                || override.daily_rate !== null
                || override.consumption_km_l !== null
                || (override.notes && override.notes.trim().length > 0)
            )
        )

        const canEdit = ['draft', 'optimized', 'confirmed'].includes(route.status)

        const profile: RouteCostProfile = {
            route_id: route.id,
            route_status: route.status,
            can_edit: canEdit,
            is_custom: isCustom,
            base_settings: baseSettings,
            override_settings: overrideSettings,
            effective_settings: effectiveSettings,
            estimate,
        }

        return { data: profile }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function saveRouteCostOverride(routeId: string, payload: {
    fuel_price_per_liter?: number | null
    fuel_tax_pct?: number | null
    additional_tax?: number | null
    daily_rate?: number | null
    consumption_km_l?: number | null
    notes?: string | null
}) {
    try {
        const { supabase, userId } = await requireAdmin()

        const { data: route, error: routeErr } = await supabase
            .from('delivery_routes')
            .select('id, status, route_number')
            .eq('id', routeId)
            .eq('is_deleted', false)
            .single()

        if (routeErr || !route) return { error: 'Rota nao encontrada.' }
        if (!['draft', 'optimized', 'confirmed'].includes(route.status)) {
            return { error: 'A customizacao de custos so pode ser alterada ate o status confirmado.' }
        }

        const normalizeNullable = (value: unknown) => {
            if (value === null || value === undefined || value === '') return null
            const parsed = Number(value)
            return Number.isFinite(parsed) ? parsed : null
        }

        const fuelPrice = normalizeNullable(payload.fuel_price_per_liter)
        const fuelTax = normalizeNullable(payload.fuel_tax_pct)
        const additionalTax = normalizeNullable(payload.additional_tax)
        const dailyRate = normalizeNullable(payload.daily_rate)
        const consumption = normalizeNullable(payload.consumption_km_l)

        const invalidNumeric = [fuelPrice, fuelTax, additionalTax, dailyRate, consumption]
            .some((value) => value !== null && value < 0)
        if (invalidNumeric) {
            return { error: 'Valores numericos de custo nao podem ser negativos.' }
        }

        const notes = payload.notes?.trim() ? payload.notes.trim() : null

        const { error } = await supabase
            .from('delivery_route_cost_overrides')
            .upsert({
                route_id: routeId,
                fuel_price_per_liter: fuelPrice,
                fuel_tax_pct: fuelTax,
                additional_tax: additionalTax,
                daily_rate: dailyRate,
                consumption_km_l: consumption,
                notes,
                updated_by: userId,
            }, { onConflict: 'route_id' })

        if (error) {
            if (error.code === '42P01') return { error: 'Estrutura de custos por rota indisponivel. Execute a migration 052.' }
            return { error: 'Erro ao salvar customizacao de custos da rota.' }
        }

        await supabase.from('route_events').insert({
            route_id: routeId,
            event_type: 'notes_updated',
            actor_id: userId,
            metadata: {
                action: 'route_cost_override_updated',
                route_number: route.route_number,
            },
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function clearRouteCostOverride(routeId: string) {
    try {
        const { supabase, userId } = await requireAdmin()

        const { data: route, error: routeErr } = await supabase
            .from('delivery_routes')
            .select('id, status, route_number')
            .eq('id', routeId)
            .eq('is_deleted', false)
            .single()

        if (routeErr || !route) return { error: 'Rota nao encontrada.' }
        if (!['draft', 'optimized', 'confirmed'].includes(route.status)) {
            return { error: 'O reset de custos so pode ser feito ate o status confirmado.' }
        }

        const { error } = await supabase
            .from('delivery_route_cost_overrides')
            .delete()
            .eq('route_id', routeId)

        if (error) {
            if (error.code === '42P01') return { error: 'Estrutura de custos por rota indisponivel. Execute a migration 052.' }
            return { error: 'Erro ao restaurar custos padrao da rota.' }
        }

        await supabase.from('route_events').insert({
            route_id: routeId,
            event_type: 'notes_updated',
            actor_id: userId,
            metadata: {
                action: 'route_cost_override_cleared',
                route_number: route.route_number,
            },
        })

        return { success: true }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}

export async function getRouteCostEstimate(routeId: string) {
    try {
        const profileRes = await getRouteCostProfile(routeId)
        if ('error' in profileRes && profileRes.error) return { error: profileRes.error }
        if (!('data' in profileRes) || !profileRes.data) return { data: null }
        return { data: profileRes.data.estimate }
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
    }
}
