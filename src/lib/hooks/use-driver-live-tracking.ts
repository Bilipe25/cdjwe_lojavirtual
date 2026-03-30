'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNetworkStatus } from './use-network-status'
import {
    TRACKING_HEARTBEAT_INTERVAL_MS,
    TRACKING_MIN_DISTANCE_METERS,
    TRACKING_MIN_SEND_INTERVAL_MS,
    haversineDistanceMeters,
    type LiveTrackingStatus,
} from '@/lib/logistics/live-tracking'

type PermissionStateLike = PermissionState | 'unknown'
type TrackingState = LiveTrackingStatus | 'idle'

type DriverTrackingPosition = {
    latitude: number
    longitude: number
    accuracy: number | null
    speedKmh: number | null
    headingDeg: number | null
    capturedAt: string
}

type UseDriverLiveTrackingOptions = {
    routeId: string | null
    enabled: boolean
    inactiveStatus?: 'idle' | 'paused'
}

export type UseDriverLiveTrackingResult = {
    trackingStatus: TrackingState
    permissionState: PermissionStateLike
    lastSentAt: string | null
    lastError: string | null
    isSending: boolean
    isOnline: boolean
    lastPosition: DriverTrackingPosition | null
}

function normalizeGeoErrorMessage(error: GeolocationPositionError) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            return 'Permissao de localizacao negada.'
        case error.POSITION_UNAVAILABLE:
            return 'Localizacao indisponivel no dispositivo.'
        case error.TIMEOUT:
            return 'Tempo limite para obter localizacao.'
        default:
            return 'Nao foi possivel capturar a localizacao.'
    }
}

function resolveBrowserPermissionState(): Promise<PermissionStateLike> {
    if (typeof navigator === 'undefined' || !('permissions' in navigator) || !navigator.permissions?.query) {
        return Promise.resolve('unknown')
    }

    return navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((state) => state.state)
        .catch(() => 'unknown')
}

export function useDriverLiveTracking({
    routeId,
    enabled,
    inactiveStatus = 'idle',
}: UseDriverLiveTrackingOptions): UseDriverLiveTrackingResult {
    const { isOnline } = useNetworkStatus()

    const [trackingStatus, setTrackingStatus] = useState<TrackingState>('idle')
    const [permissionState, setPermissionState] = useState<PermissionStateLike>('unknown')
    const [lastSentAt, setLastSentAt] = useState<string | null>(null)
    const [lastError, setLastError] = useState<string | null>(null)
    const [isSending, setIsSending] = useState(false)
    const [lastPosition, setLastPosition] = useState<DriverTrackingPosition | null>(null)

    const watchIdRef = useRef<number | null>(null)
    const latestPositionRef = useRef<DriverTrackingPosition | null>(null)
    const lastSentRef = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null)
    const sendingRef = useRef(false)

    const stopWatch = useCallback(() => {
        if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current)
            watchIdRef.current = null
        }
    }, [])

    const sendPosition = useCallback(async (
        position: DriverTrackingPosition,
        statusOverride?: LiveTrackingStatus,
    ) => {
        if (!routeId || !enabled) return

        if (!isOnline) {
            setTrackingStatus('offline')
            return
        }

        if (sendingRef.current) return
        sendingRef.current = true
        setIsSending(true)

        try {
            const trackingStateToSend = statusOverride || 'active'
            const response = await fetch('/api/logistics/live-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    routeId,
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    speedKmh: position.speedKmh,
                    headingDeg: position.headingDeg,
                    capturedAt: position.capturedAt,
                    trackingStatus: trackingStateToSend,
                }),
            })

            if (!response.ok) {
                const body = await response.json().catch(() => ({}))
                throw new Error(
                    typeof body?.error === 'string'
                        ? body.error
                        : 'Falha ao enviar localizacao.',
                )
            }

            lastSentRef.current = {
                latitude: position.latitude,
                longitude: position.longitude,
                sentAt: Date.now(),
            }
            setLastSentAt(new Date().toISOString())
            setLastError(null)
            setTrackingStatus(trackingStateToSend)
        } catch (error) {
            setLastError(error instanceof Error ? error.message : 'Falha ao enviar localizacao.')
            if (!isOnline) {
                setTrackingStatus('offline')
            } else {
                setTrackingStatus('paused')
            }
        } finally {
            sendingRef.current = false
            setIsSending(false)
        }
    }, [enabled, isOnline, routeId])

    const handleGeoPosition = useCallback((geoPosition: GeolocationPosition) => {
        const nextPosition: DriverTrackingPosition = {
            latitude: geoPosition.coords.latitude,
            longitude: geoPosition.coords.longitude,
            accuracy: Number.isFinite(geoPosition.coords.accuracy) ? geoPosition.coords.accuracy : null,
            speedKmh: Number.isFinite(geoPosition.coords.speed) && geoPosition.coords.speed !== null
                ? geoPosition.coords.speed * 3.6
                : null,
            headingDeg: Number.isFinite(geoPosition.coords.heading) && geoPosition.coords.heading !== null
                ? geoPosition.coords.heading
                : null,
            capturedAt: new Date(geoPosition.timestamp).toISOString(),
        }

        latestPositionRef.current = nextPosition
        setLastPosition(nextPosition)

        if (!enabled || !routeId) return

        const previous = lastSentRef.current
        if (!previous) {
            void sendPosition(nextPosition, 'active')
            return
        }

        const distanceMeters = haversineDistanceMeters(
            previous.latitude,
            previous.longitude,
            nextPosition.latitude,
            nextPosition.longitude,
        )
        const elapsedMs = Date.now() - previous.sentAt

        if (
            distanceMeters >= TRACKING_MIN_DISTANCE_METERS
            && elapsedMs >= TRACKING_MIN_SEND_INTERVAL_MS
        ) {
            void sendPosition(nextPosition, 'active')
        }
    }, [enabled, routeId, sendPosition])

    const handleGeoError = useCallback((geoError: GeolocationPositionError) => {
        setLastError(normalizeGeoErrorMessage(geoError))

        if (geoError.code === geoError.PERMISSION_DENIED) {
            setPermissionState('denied')
            setTrackingStatus('unavailable')
            return
        }

        if (!isOnline) {
            setTrackingStatus('offline')
            return
        }

        setTrackingStatus('paused')
    }, [isOnline])

    useEffect(() => {
        let cancelled = false

        if (!enabled || !routeId) {
            stopWatch()
            setTrackingStatus(inactiveStatus)
            return () => { cancelled = true }
        }

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setTrackingStatus('unavailable')
            setLastError('Geolocalizacao nao suportada neste navegador.')
            return () => { cancelled = true }
        }

        void resolveBrowserPermissionState().then((state) => {
            if (cancelled) return
            setPermissionState(state)

            if (state === 'denied') {
                setTrackingStatus('unavailable')
                setLastError('Permissao de localizacao negada.')
                return
            }

            if (state === 'granted') {
                setTrackingStatus(isOnline ? 'active' : 'offline')
            } else {
                setTrackingStatus('awaiting_permission')
            }
        })

        watchIdRef.current = navigator.geolocation.watchPosition(
            handleGeoPosition,
            handleGeoError,
            {
                enableHighAccuracy: false,
                timeout: 15_000,
                maximumAge: 10_000,
            },
        )

        return () => {
            cancelled = true
            stopWatch()
        }
    }, [enabled, handleGeoError, handleGeoPosition, inactiveStatus, isOnline, routeId, stopWatch])

    useEffect(() => {
        if (!enabled || !routeId) return

        const timer = window.setInterval(() => {
            const latest = latestPositionRef.current
            if (!latest) return

            const previous = lastSentRef.current
            const elapsedMs = previous ? Date.now() - previous.sentAt : Number.POSITIVE_INFINITY
            if (elapsedMs >= TRACKING_HEARTBEAT_INTERVAL_MS) {
                void sendPosition(latest, isOnline ? 'active' : 'offline')
            }
        }, TRACKING_HEARTBEAT_INTERVAL_MS)

        return () => {
            window.clearInterval(timer)
        }
    }, [enabled, isOnline, routeId, sendPosition])

    useEffect(() => {
        if (!enabled || !routeId) return

        if (!isOnline) {
            setTrackingStatus('offline')
            return
        }

        if (trackingStatus === 'offline' && latestPositionRef.current) {
            void sendPosition(latestPositionRef.current, 'active')
        }
    }, [enabled, isOnline, routeId, sendPosition, trackingStatus])

    return {
        trackingStatus,
        permissionState,
        lastSentAt,
        lastError,
        isSending,
        isOnline,
        lastPosition,
    }
}
