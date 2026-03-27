/**
 * Centralized map configuration for the logistics module.
 * All map components should import their tile layer config from here
 * to ensure visual consistency and easy future provider swaps.
 */

// ==================== Tile Layer Providers ====================

export const MAP_TILE_LAYERS = {
    /** CARTO Voyager — clean, professional, great for logistics */
    cartoVoyager: {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
    },
    /** CARTO Light — minimal, ideal for data-heavy overlays */
    cartoLight: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
    },
    /** CARTO Dark — dark mode, good for dashboards */
    cartoDark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
    },
    /** OpenStreetMap default — fallback */
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    },
    /** Stadia OSM Bright — rich urban context, POIs, professional look */
    stadiaOsmBright: {
        url: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 20,
    },
} as const

// ==================== Active Basemap ====================

/** The active basemap used across all logistics maps. Change this to swap providers. */
export const ACTIVE_BASEMAP = MAP_TILE_LAYERS.stadiaOsmBright

// ==================== Route Styling ====================

export const ROUTE_STYLE = {
    /** Main route polyline */
    main: {
        color: '#4f46e5',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
    },
    /** Outer glow effect */
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
