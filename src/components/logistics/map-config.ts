/**
 * Centralized map configuration for the logistics module.
 * All map components should import their tile layer config from here.
 */

// ==================== Tile Layer Providers ====================

const STADIA_API_KEY = process.env.NEXT_PUBLIC_STADIA_MAPS_API_KEY?.trim()
const STADIA_QUERY = STADIA_API_KEY ? `?api_key=${encodeURIComponent(STADIA_API_KEY)}` : ''

export const MAP_TILE_LAYERS = {
    // CARTO Voyager: clean and reliable default for logistics
    cartoVoyager: {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
    },
    // CARTO Light: minimal style
    cartoLight: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
    },
    // CARTO Dark: dark mode
    cartoDark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
    },
    // OpenStreetMap fallback
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    },
    // Stadia optional (requires key on most plans/deploy contexts)
    stadiaOsmBright: {
        url: `https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png${STADIA_QUERY}`,
        attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 20,
    },
} as const

export type MapTileLayerKey = keyof typeof MAP_TILE_LAYERS

function resolveActiveBasemap() {
    const fallback = MAP_TILE_LAYERS.cartoVoyager
    const requested = process.env.NEXT_PUBLIC_LOGISTICS_BASEMAP

    if (!requested) return fallback
    if (!(requested in MAP_TILE_LAYERS)) return fallback

    if (requested === 'stadiaOsmBright' && !STADIA_API_KEY) {
        return fallback
    }

    return MAP_TILE_LAYERS[requested as MapTileLayerKey]
}

// Default: Carto Voyager. To use Stadia in production, set:
// NEXT_PUBLIC_LOGISTICS_BASEMAP=stadiaOsmBright
// NEXT_PUBLIC_STADIA_MAPS_API_KEY=<your_key>
export const ACTIVE_BASEMAP = resolveActiveBasemap()

// ==================== Route Styling ====================

export const ROUTE_STYLE = {
    // Main route polyline
    main: {
        color: '#4f46e5',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
    },
    // Outer glow
    glow: {
        color: '#4f46e5',
        weight: 10,
        opacity: 0.15,
        smoothFactor: 1,
    },
} as const

// ==================== Default Map Options ====================

export const DEFAULT_MAP_CENTER: [number, number] = [-14.235, -51.925] // Brazil center
export const DEFAULT_MAP_ZOOM = 4
