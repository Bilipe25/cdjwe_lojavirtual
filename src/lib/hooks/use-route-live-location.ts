'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
    isLiveLocationOnline,
    normalizeTrackingStatus,
    parseFiniteNumber,
    type DriverLiveLocationRecord,
} from '@/lib/logistics/live-tracking'

export type RouteLiveLocation = DriverLiveLocationRecord & {
    driver_name?: string | null
    is_online: boolean
}

type UseRouteLiveLocationOptions = {
    routeId: string | null
    enabled?: boolean
}

function normalizeLiveLocationRow(
    row: Record<string, unknown> | null,
    fallbackDriverName?: string | null,
): RouteLiveLocation | null {
    if (!row) return null

    const latitude = parseFiniteNumber(row.latitude)
    const longitude = parseFiniteNumber(row.longitude)
    if (latitude === null || longitude === null) return null

    const lastSeenAt = typeof row.last_seen_at === 'string'
        ? row.last_seen_at
        : new Date().toISOString()

    return {
        route_id: String(row.route_id || ''),
        driver_id: String(row.driver_id || ''),
        vehicle_id: typeof row.vehicle_id === 'string' ? row.vehicle_id : null,
        latitude,
        longitude,
        accuracy_m: parseFiniteNumber(row.accuracy_m),
        speed_kmh: parseFiniteNumber(row.speed_kmh),
        heading_deg: parseFiniteNumber(row.heading_deg),
        tracking_status: normalizeTrackingStatus(row.tracking_status),
        captured_at: typeof row.captured_at === 'string' ? row.captured_at : lastSeenAt,
        last_seen_at: lastSeenAt,
        created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        driver_name: typeof row.driver_name === 'string' ? row.driver_name : fallbackDriverName || null,
        is_online: isLiveLocationOnline(lastSeenAt),
    }
}

export function useRouteLiveLocation({
    routeId,
    enabled = true,
}: UseRouteLiveLocationOptions) {
    const [location, setLocation] = useState<RouteLiveLocation | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshSeed, setRefreshSeed] = useState(0)
    const [nowMs, setNowMs] = useState(() => Date.now())

    const refresh = useCallback(() => {
        setRefreshSeed((value) => value + 1)
    }, [])

    useEffect(() => {
        if (!routeId || !enabled) {
            setLocation(null)
            setError(null)
            setIsLoading(false)
            return
        }

        const supabase = createClient()
        let active = true
        let channel: RealtimeChannel | null = null

        const fetchInitial = async () => {
            setIsLoading(true)
            setError(null)

            try {
                const response = await fetch(`/api/logistics/live-location?routeId=${encodeURIComponent(routeId)}`, {
                    method: 'GET',
                    cache: 'no-store',
                })
                const body = await response.json().catch(() => ({}))

                if (!response.ok) {
                    throw new Error(typeof body?.error === 'string' ? body.error : 'Falha ao carregar tracking ao vivo.')
                }

                if (!active) return
                const normalized = normalizeLiveLocationRow(
                    (body?.data as Record<string, unknown> | null) || null,
                )
                setLocation(normalized)
            } catch (requestError) {
                if (!active) return
                setError(
                    requestError instanceof Error
                        ? requestError.message
                        : 'Falha ao carregar tracking ao vivo.',
                )
            } finally {
                if (active) {
                    setIsLoading(false)
                }
            }
        }

        const handleRealtimePayload = (
            payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
        ) => {
            if (!active) return

            if (payload.eventType === 'DELETE') {
                setLocation(null)
                return
            }

            setLocation((current) => (
                normalizeLiveLocationRow(
                    (payload.new as Record<string, unknown> | null) || null,
                    current?.driver_name || null,
                ) || current
            ))
            setError(null)
        }

        void fetchInitial()

        channel = supabase
            .channel(`route-live-location-${routeId}-${Date.now()}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'driver_live_locations',
                    filter: `route_id=eq.${routeId}`,
                },
                handleRealtimePayload,
            )
            .subscribe((status) => {
                if (!active) return
                if (status === 'CHANNEL_ERROR') {
                    setError('Falha no canal realtime do rastreamento.')
                }
            })

        return () => {
            active = false
            if (channel) {
                void supabase.removeChannel(channel)
            }
        }
    }, [enabled, refreshSeed, routeId])

    useEffect(() => {
        if (!location?.last_seen_at) return
        const timer = window.setInterval(() => {
            setNowMs(Date.now())
        }, 10_000)
        return () => {
            window.clearInterval(timer)
        }
    }, [location?.last_seen_at])

    const hydratedLocation = useMemo(() => {
        if (!location) return null
        return {
            ...location,
            is_online: isLiveLocationOnline(location.last_seen_at, nowMs),
        }
    }, [location, nowMs])

    return {
        location: hydratedLocation,
        isLoading,
        error,
        refresh,
    }
}
