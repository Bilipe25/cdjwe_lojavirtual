export type ClientMapScope = 'routable' | 'global'

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
