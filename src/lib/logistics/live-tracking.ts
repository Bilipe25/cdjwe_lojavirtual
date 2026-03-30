export const TRACKING_MIN_DISTANCE_METERS = 25
export const TRACKING_MIN_SEND_INTERVAL_MS = 10_000
export const TRACKING_HEARTBEAT_INTERVAL_MS = 30_000
export const TRACKING_ONLINE_WINDOW_MS = 45_000

export const LIVE_TRACKING_STATUSES = [
    'awaiting_permission',
    'active',
    'paused',
    'unavailable',
    'offline',
    'stopped',
] as const

export type LiveTrackingStatus = (typeof LIVE_TRACKING_STATUSES)[number]

export type DriverLiveLocationRecord = {
    route_id: string
    driver_id: string
    vehicle_id: string | null
    latitude: number
    longitude: number
    accuracy_m: number | null
    speed_kmh: number | null
    heading_deg: number | null
    tracking_status: LiveTrackingStatus
    captured_at: string
    last_seen_at: string
    updated_at?: string
    created_at?: string
}

export type LiveVehicleMarker = {
    latitude: number
    longitude: number
    label?: string
    trackingStatus?: LiveTrackingStatus | null
    updatedAt?: string | null
    isOnline?: boolean
}

export function isValidTrackingStatus(value: string): value is LiveTrackingStatus {
    return LIVE_TRACKING_STATUSES.includes(value as LiveTrackingStatus)
}

export function parseFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null
    }

    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }

    return null
}

export function normalizeTrackingStatus(value: unknown): LiveTrackingStatus {
    if (typeof value === 'string' && isValidTrackingStatus(value)) {
        return value
    }
    return 'active'
}

export function haversineDistanceMeters(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
) {
    const earthRadiusMeters = 6371000
    const toRadians = (value: number) => (value * Math.PI) / 180

    const dLat = toRadians(toLat - fromLat)
    const dLng = toRadians(toLng - fromLng)
    const lat1 = toRadians(fromLat)
    const lat2 = toRadians(toLat)

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return earthRadiusMeters * c
}

export function isLiveLocationOnline(
    lastSeenAt: string | null | undefined,
    nowMs = Date.now(),
) {
    if (!lastSeenAt) return false
    const seenAtMs = new Date(lastSeenAt).getTime()
    if (Number.isNaN(seenAtMs)) return false
    return nowMs - seenAtMs <= TRACKING_ONLINE_WINDOW_MS
}

export function getTrackingStatusLabel(status: LiveTrackingStatus) {
    switch (status) {
        case 'awaiting_permission':
            return 'Aguardando permissao'
        case 'active':
            return 'Localizacao ativa'
        case 'paused':
            return 'Rastreamento pausado'
        case 'unavailable':
            return 'Localizacao indisponivel'
        case 'offline':
            return 'Conexao indisponivel'
        case 'stopped':
            return 'Rastreamento encerrado'
        default:
            return 'Status desconhecido'
    }
}

export function getTrackingStatusTone(status: LiveTrackingStatus, online = true) {
    if (!online && status === 'active') {
        return {
            dot: '#94a3b8',
            textClass: 'text-slate-600',
            badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
        }
    }

    switch (status) {
        case 'active':
            return {
                dot: '#10b981',
                textClass: 'text-emerald-700',
                badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            }
        case 'awaiting_permission':
            return {
                dot: '#f59e0b',
                textClass: 'text-amber-700',
                badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
            }
        case 'paused':
            return {
                dot: '#475569',
                textClass: 'text-slate-700',
                badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
            }
        case 'unavailable':
        case 'offline':
        case 'stopped':
            return {
                dot: '#ef4444',
                textClass: 'text-red-700',
                badgeClass: 'border-red-200 bg-red-50 text-red-700',
            }
        default:
            return {
                dot: '#64748b',
                textClass: 'text-slate-700',
                badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
            }
    }
}
