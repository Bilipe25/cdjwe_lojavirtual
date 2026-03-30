import maplibregl from 'maplibre-gl'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './map-config'
import { createOfflineMapStyle, createRasterStyle, resolveBasemapCandidates } from './map-styles'

type CreateLogisticsMapParams = {
    container: HTMLElement
    center?: [number, number]
    zoom?: number
    interactive?: boolean
}

function extractTileHost(urlTemplate: string) {
    try {
        const sampleUrl = urlTemplate
            .replace('{s}', 'a')
            .replace('{z}', '0')
            .replace('{x}', '0')
            .replace('{y}', '0')
            .replace('{r}', '')
        return new URL(sampleUrl).host
    } catch {
        return null
    }
}

function isLikelyTileLoadFailure(message: string) {
    const normalized = message.toLowerCase()
    return normalized.includes('401')
        || normalized.includes('403')
        || normalized.includes('unauthorized')
        || normalized.includes('forbidden')
        || normalized.includes('failed to fetch')
        || normalized.includes('failed to load')
}

export function createLogisticsMap({
    container,
    center,
    zoom,
    interactive = true,
}: CreateLogisticsMapParams) {
    const basemapCandidates = resolveBasemapCandidates()
    let activeBasemapIndex = 0
    let basemapErrorCount = 0
    let usingOfflineStyle = false

    const getActiveBasemap = () => basemapCandidates[activeBasemapIndex]

    const map = new maplibregl.Map({
        container,
        style: createRasterStyle(getActiveBasemap()),
        center: center ?? [DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]],
        zoom: zoom ?? DEFAULT_MAP_ZOOM,
        attributionControl: { compact: true },
        dragRotate: false,
        touchPitch: false,
        interactive,
    })

    map.on('error', (event) => {
        if (usingOfflineStyle) return
        if (activeBasemapIndex >= basemapCandidates.length - 1) return
        const activeBasemap = getActiveBasemap()
        const activeHost = extractTileHost(activeBasemap.url)
        if (!activeHost) return

        const message = String((event as { error?: { message?: string } }).error?.message || '')
        if (!message.includes(activeHost)) return
        if (!isLikelyTileLoadFailure(message)) return

        basemapErrorCount += 1
        if (basemapErrorCount < 3) return

        activeBasemapIndex += 1
        basemapErrorCount = 0
        map.setStyle(createRasterStyle(getActiveBasemap()))
    })

    map.on('error', (event) => {
        if (usingOfflineStyle) return
        if (activeBasemapIndex < basemapCandidates.length - 1) return

        const activeBasemap = getActiveBasemap()
        const activeHost = extractTileHost(activeBasemap.url)
        if (!activeHost) return

        const message = String((event as { error?: { message?: string } }).error?.message || '')
        if (!message.includes(activeHost)) return
        if (!isLikelyTileLoadFailure(message)) return

        basemapErrorCount += 1
        if (basemapErrorCount < 3) return

        usingOfflineStyle = true
        basemapErrorCount = 0
        map.setStyle(createOfflineMapStyle())
    })

    return { map, basemap: getActiveBasemap() }
}

export function attachResizeObserver(map: maplibregl.Map, container: HTMLElement) {
    let frame: number | null = null

    const scheduleResize = () => {
        if (frame !== null) {
            cancelAnimationFrame(frame)
        }

        frame = requestAnimationFrame(() => {
            map.resize()
        })
    }

    const resizeObserver = new ResizeObserver(() => {
        scheduleResize()
    })
    resizeObserver.observe(container)

    const handleWindowResize = () => scheduleResize()
    const handleFullScreen = () => scheduleResize()

    window.addEventListener('resize', handleWindowResize)
    window.addEventListener('orientationchange', handleWindowResize)
    document.addEventListener('fullscreenchange', handleFullScreen)

    scheduleResize()

    return {
        scheduleResize,
        destroy() {
            resizeObserver.disconnect()
            window.removeEventListener('resize', handleWindowResize)
            window.removeEventListener('orientationchange', handleWindowResize)
            document.removeEventListener('fullscreenchange', handleFullScreen)

            if (frame !== null) {
                cancelAnimationFrame(frame)
            }
        },
    }
}
