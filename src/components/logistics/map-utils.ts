import maplibregl from 'maplibre-gl'

export type MapLngLat = [number, number]

export function decodePolyline(encoded: string): MapLngLat[] {
    const points: MapLngLat[] = []
    let index = 0
    let lat = 0
    let lng = 0

    while (index < encoded.length) {
        let shift = 0
        let result = 0
        let byte: number

        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)

        lat += result & 1 ? ~(result >> 1) : result >> 1

        shift = 0
        result = 0
        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)

        lng += result & 1 ? ~(result >> 1) : result >> 1
        points.push([lng / 1e5, lat / 1e5])
    }

    return points
}

export function buildBounds(points: MapLngLat[]) {
    if (points.length === 0) return null
    const bounds = new maplibregl.LngLatBounds(points[0], points[0])
    for (let index = 1; index < points.length; index += 1) {
        bounds.extend(points[index])
    }
    return bounds
}
