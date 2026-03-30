import type { StyleSpecification } from 'maplibre-gl'
import {
    ACTIVE_BASEMAP,
    MAP_TILE_LAYERS,
    type MapTileLayerConfig,
} from './map-config'

function normalizeTileTemplate(template: string) {
    return template.replace('{r}', '')
}

function expandSubdomains(urlTemplate: string, layerSubdomains?: string[]): string[] {
    const normalized = normalizeTileTemplate(urlTemplate)
    if (!normalized.includes('{s}')) return [normalized]
    const subdomains = layerSubdomains && layerSubdomains.length > 0
        ? layerSubdomains
        : ['a', 'b', 'c']
    return subdomains.map((subdomain) => normalized.replace('{s}', subdomain))
}

export function resolveBasemapCandidates(preferred: MapTileLayerConfig = ACTIVE_BASEMAP) {
    const ordered = [preferred, MAP_TILE_LAYERS.osm, MAP_TILE_LAYERS.cartoVoyager]

    return ordered.filter((layer, index, list) => (
        list.findIndex((entry) => entry.url === layer.url) === index
    ))
}

export function createRasterStyle(layer: MapTileLayerConfig): StyleSpecification {
    return {
        version: 8,
        name: `logistics-${layer.id}`,
        sources: {
            basemap: {
                type: 'raster',
                tiles: expandSubdomains(layer.url, layer.subdomains),
                tileSize: 256,
                maxzoom: layer.maxZoom,
                attribution: layer.attribution,
            },
        },
        layers: [
            {
                id: 'basemap-layer',
                type: 'raster',
                source: 'basemap',
                minzoom: 0,
                maxzoom: layer.maxZoom,
            },
        ],
    }
}

export function createOfflineMapStyle(): StyleSpecification {
    return {
        version: 8,
        name: 'logistics-offline-style',
        sources: {},
        layers: [
            {
                id: 'offline-background',
                type: 'background',
                paint: {
                    'background-color': '#e2e8f0',
                },
            },
        ],
    }
}
