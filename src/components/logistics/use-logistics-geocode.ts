'use client'

import { useCallback, useMemo, useState } from 'react'

export type GeocodeFlowState =
    | 'idle'
    | 'resolving_address'
    | 'geocoding'
    | 'map_ready'
    | 'map_error'
    | 'saving'
    | 'saved'
    | 'failed'

export type LogisticsGeocodeCandidate = {
    lat: number
    lng: number
    label: string
    source: 'openrouteservice' | 'nominatim' | 'resolved'
    score?: number
}

type GeocodeHints = {
    addressId?: string | null
    defaultAddress?: string | null
    cityHint?: string | null
    stateHint?: string | null
    zipCodeHint?: string | null
}

type GeocodeOptions = {
    mode?: 'auto' | 'manual'
    timeoutMs?: number
}

function logGeocode(event: string, payload: Record<string, unknown>) {
    console.info('[LOGISTICS GEOCODE]', { event, ...payload })
}

export function normalizeAddressText(text: string): string {
    return text
        .replace(/\[.*?\]\s*/g, '')
        .replace(/CEP:\s*/gi, '')
        .replace(/\s-\s/g, ', ')
        .replace(/,\s*,/g, ',')
        .replace(/,\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

export function buildGeocodeQuery(baseAddress: string, hints?: Omit<GeocodeHints, 'addressId' | 'defaultAddress'>): string {
    const parts = [
        normalizeAddressText(baseAddress || ''),
        hints?.cityHint?.trim() || '',
        hints?.stateHint?.trim() || '',
        hints?.zipCodeHint?.trim() || '',
    ].filter(Boolean)
    return normalizeAddressText(parts.join(', '))
}

export function useLogisticsGeocode(hints: GeocodeHints) {
    const [status, setStatus] = useState<GeocodeFlowState>('idle')
    const [error, setError] = useState<string | null>(null)
    const [candidates, setCandidates] = useState<LogisticsGeocodeCandidate[]>([])

    const addressId = hints.addressId?.trim() || ''
    const cityHint = hints.cityHint?.trim() || ''
    const stateHint = hints.stateHint?.trim() || ''
    const zipCodeHint = hints.zipCodeHint?.trim() || ''
    const defaultAddress = hints.defaultAddress || ''

    const normalizedDefaultAddress = useMemo(() => (
        buildGeocodeQuery(defaultAddress, { cityHint, stateHint, zipCodeHint })
    ), [cityHint, defaultAddress, stateHint, zipCodeHint])

    const setMapReady = useCallback(() => {
        setStatus((prev) => (prev === 'saving' || prev === 'saved' ? prev : 'map_ready'))
    }, [])

    const setMapError = useCallback((message?: string) => {
        if (message) {
            setError(message)
        }
        setStatus('map_error')
        logGeocode('map_error', { message: message || null })
    }, [])

    const setSaving = useCallback(() => {
        setError(null)
        setStatus('saving')
    }, [])

    const setSaved = useCallback(() => {
        setError(null)
        setStatus('saved')
    }, [])

    const reset = useCallback(() => {
        setError(null)
        setStatus('idle')
        setCandidates([])
    }, [])

    const geocode = useCallback(async (
        rawInput: string,
        options?: GeocodeOptions,
    ): Promise<{ lat: number; lng: number; candidates: LogisticsGeocodeCandidate[] } | { error: string }> => {
        const timeoutMs = options?.timeoutMs ?? 15000
        const mode = options?.mode ?? 'manual'

        setError(null)
        setCandidates([])
        setStatus('resolving_address')

        const query = buildGeocodeQuery(rawInput, { cityHint, stateHint, zipCodeHint })
        if (!query && !addressId) {
            const message = 'Endereco insuficiente para geocodificar. Informe endereco, cidade e estado.'
            setError(message)
            setCandidates([])
            setStatus('failed')
            logGeocode('resolve_failed', { reason: 'empty_query', mode })
            return { error: message }
        }

        setStatus('geocoding')
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

        try {
            const body: Record<string, string> = {
                address: query,
                city: cityHint,
                state: stateHint,
                zipCode: zipCodeHint,
            }

            const shouldUseAddressIdCache = Boolean(
                addressId
                && mode === 'auto'
                && query
                && query === normalizedDefaultAddress,
            )

            if (shouldUseAddressIdCache && addressId) {
                body.addressId = addressId
            }

            logGeocode('request_started', {
                mode,
                hasAddressId: Boolean(body.addressId),
                queryLength: query.length,
            })

            const response = await fetch('/api/logistics/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            const data = await response.json().catch(() => null)
            if (!response.ok || !data || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
                const backendError = data && typeof data.error === 'string' ? data.error : null
                const message = backendError || 'Endereco nao encontrado. Ajuste o texto e tente novamente.'
                setError(message)
                setCandidates([])
                setStatus('failed')
                logGeocode('request_failed', {
                    mode,
                    status: response.status,
                    backendError: backendError || null,
                })
                return { error: message }
            }

            const rawCandidates = Array.isArray(data.candidates) ? data.candidates as unknown[] : []
            const parsedCandidates = rawCandidates
                .map((item: unknown) => {
                        const candidate = item as Record<string, unknown>
                        const lat = Number(candidate.lat)
                        const lng = Number(candidate.lng)
                        const label = typeof candidate.label === 'string' ? candidate.label.trim() : ''
                        const source = typeof candidate.source === 'string'
                            ? candidate.source
                            : 'resolved'
                        const score = Number(candidate.score)
                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
                        return {
                            lat,
                            lng,
                            label: label || query,
                            source: source === 'openrouteservice' || source === 'nominatim' ? source : 'resolved',
                            score: Number.isFinite(score) ? score : undefined,
                        } as LogisticsGeocodeCandidate
                    })
                .filter((item): item is LogisticsGeocodeCandidate => Boolean(item))

            const topCandidates = parsedCandidates.length > 0
                ? parsedCandidates.slice(0, 3)
                : [{
                    lat: Number(data.lat),
                    lng: Number(data.lng),
                    label: query,
                    source: 'resolved' as const,
                }]

            setStatus('idle')
            setCandidates(topCandidates)
            logGeocode('request_succeeded', {
                mode,
                lat: data.lat,
                lng: data.lng,
                candidates: topCandidates.length,
            })
            return {
                lat: Number(data.lat),
                lng: Number(data.lng),
                candidates: topCandidates,
            }
        } catch (e) {
            const isAbort = e instanceof Error && e.name === 'AbortError'
            const message = isAbort
                ? 'Tempo limite ao geocodificar. Tente novamente.'
                : 'Erro de conexao ao geocodificar.'
            setError(message)
            setCandidates([])
            setStatus('failed')
            logGeocode('request_exception', {
                mode,
                abort: isAbort,
                message: e instanceof Error ? e.message : 'unknown',
            })
            return { error: message }
        } finally {
            window.clearTimeout(timeoutId)
        }
    }, [
        addressId,
        cityHint,
        stateHint,
        zipCodeHint,
        normalizedDefaultAddress,
    ])

    return {
        status,
        error,
        candidates,
        normalizedDefaultAddress,
        geocode,
        setMapReady,
        setMapError,
        setSaving,
        setSaved,
        reset,
        setError,
        setCandidates,
        setStatus,
    }
}
