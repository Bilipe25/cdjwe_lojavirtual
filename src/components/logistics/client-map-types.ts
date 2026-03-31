export type ClientMapScope = 'routable' | 'global'
export type ClientMapMode = 'browse' | 'geocode'
export type ClientMapBootState =
    | 'boot_start'
    | 'style_ready'
    | 'render_ready'
    | 'ready'
    | 'map_error'

export interface ClientMapItem {
    store_id: string
    company_name: string
    client_name: string
    cnpj: string | null
    city: string
    state: string
    region: string | null
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

export interface ClientMapFilters {
    search: string
    city: string
    region: string
    onlyWithOrders: boolean
    onlyWithoutOrders: boolean
    onlyWithCoordinates: boolean
    onlyWithoutCoordinates: boolean
    onlySelected: boolean
}
