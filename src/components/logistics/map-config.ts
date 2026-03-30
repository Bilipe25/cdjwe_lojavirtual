/**
 * Centralized map configuration for the logistics module.
 * Map providers, defaults and style values should be managed here.
 */

const STADIA_API_KEY = process.env.NEXT_PUBLIC_STADIA_MAPS_API_KEY?.trim()
const STADIA_QUERY = STADIA_API_KEY ? `?api_key=${encodeURIComponent(STADIA_API_KEY)}` : ''

export type MapTileLayerConfig = {
    id: string
    url: string
    attribution: string
    maxZoom: number
    subdomains?: string[]
}

export const MAP_TILE_LAYERS = {
    cartoVoyager: {
        id: 'cartoVoyager',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        subdomains: ['a', 'b', 'c', 'd'],
    },
    cartoLight: {
        id: 'cartoLight',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        subdomains: ['a', 'b', 'c', 'd'],
    },
    cartoDark: {
        id: 'cartoDark',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        subdomains: ['a', 'b', 'c', 'd'],
    },
    osm: {
        id: 'osm',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    },
    stadiaOsmBright: {
        id: 'stadiaOsmBright',
        url: `https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png${STADIA_QUERY}`,
        attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 20,
    },
} as const satisfies Record<string, MapTileLayerConfig>

export type MapTileLayerKey = keyof typeof MAP_TILE_LAYERS

function resolveActiveBasemap(): MapTileLayerConfig {
    const fallback = MAP_TILE_LAYERS.osm
    const requested = process.env.NEXT_PUBLIC_LOGISTICS_BASEMAP

    if (!requested) return fallback
    if (!(requested in MAP_TILE_LAYERS)) return fallback

    if (requested === 'stadiaOsmBright' && !STADIA_API_KEY) {
        return fallback
    }

    return MAP_TILE_LAYERS[requested as MapTileLayerKey]
}

export const ACTIVE_BASEMAP = resolveActiveBasemap()

export const ROUTE_STYLE = {
    main: {
        color: '#4f46e5',
        width: 4,
        opacity: 0.9,
    },
    glow: {
        color: '#4f46e5',
        width: 11,
        opacity: 0.18,
    },
    dashedFallback: {
        color: '#6366f1',
        width: 3,
        opacity: 0.45,
        dashArray: [8, 6] as [number, number],
    },
} as const

export const DEFAULT_MAP_CENTER: [number, number] = [-14.235, -51.925]
export const DEFAULT_MAP_ZOOM = 4
