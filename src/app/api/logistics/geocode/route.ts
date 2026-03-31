import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLogisticsOperatorSession } from '../_auth'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'
const GEOCODE_FETCH_TIMEOUT_MS = 12000

function logGeocodeApi(event: string, payload: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
    const data = { event, ...payload }
    if (level === 'warn') {
        console.warn('[GEOCODE API]', data)
        return
    }
    if (level === 'error') {
        console.error('[GEOCODE API]', data)
        return
    }
    console.info('[GEOCODE API]', data)
}

type GeocodeHints = {
    addressLine?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
}

/**
 * POST /api/logistics/geocode
 *
 * Geocodes an address and caches the result in store_addresses.
 * If the address already has coordinates, returns them from cache.
 *
 * Uses OpenRouteService when ORS_API_KEY is configured,
 * otherwise falls back to Nominatim (OpenStreetMap) - free, no key required.
 *
 * Body: { addressId: string } | { address: string, city?: string, state?: string, zipCode?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireLogisticsOperatorSession()
        if (!auth.ok) {
            return auth.response
        }

        let body: unknown
        try {
            body = await request.json()
        } catch {
            return NextResponse.json({ error: 'Body JSON invalido.' }, { status: 400 })
        }

        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
        }

        const payload = body as Record<string, unknown>
        const addressId = typeof payload.addressId === 'string' ? payload.addressId.trim() : ''
        const address = typeof payload.address === 'string' ? payload.address.trim() : ''
        const city = typeof payload.city === 'string' ? payload.city.trim() : undefined
        const state = typeof payload.state === 'string' ? payload.state.trim() : undefined
        const zipCode = typeof payload.zipCode === 'string' ? payload.zipCode.trim() : undefined
        logGeocodeApi('request_received', {
            hasAddressId: Boolean(addressId),
            hasAddress: Boolean(address),
            city: city || null,
            state: state || null,
        })

        if (addressId && !/^[0-9a-fA-F-]{36}$/.test(addressId)) {
            return NextResponse.json({ error: 'addressId invalido.' }, { status: 400 })
        }

        const supabase = await createClient()

        // If addressId provided, check cache first
        if (addressId) {
            const { data: existing } = await supabase
                .from('store_addresses')
                .select('latitude, longitude, geocoded_at')
                .eq('id', addressId)
                .single()

            if (existing?.latitude !== null && existing?.latitude !== undefined && existing?.longitude !== null && existing?.longitude !== undefined) {
                logGeocodeApi('cache_hit', { addressId })
                return NextResponse.json({
                    lat: existing.latitude,
                    lng: existing.longitude,
                    cached: true,
                    geocoded_at: existing.geocoded_at,
                    candidates: [],
                })
            }

            // Fetch address details to geocode
            const { data: addr } = await supabase
                .from('store_addresses')
                .select('address, number, neighborhood, city, state, zip_code')
                .eq('id', addressId)
                .single()

            if (!addr) {
                return NextResponse.json({ error: 'Endereco nao encontrado.' }, { status: 404 })
            }

            const searchText = buildSearchText(addr.address, addr.number, addr.neighborhood, addr.city, addr.state, addr.zip_code)
            const coords = await geocode(searchText, {
                addressLine: [addr.address, addr.number].filter(Boolean).join(', '),
                city: addr.city,
                state: addr.state,
                zipCode: addr.zip_code,
            })

            if (!coords) {
                logGeocodeApi('cache_miss_geocode_failed', { addressId }, 'warn')
                return NextResponse.json({ error: 'Nao foi possivel geocodificar este endereco.' }, { status: 422 })
            }

            // Save to cache
            const source = coords.source
            await supabase
                .from('store_addresses')
                .update({
                    latitude: coords.lat,
                    longitude: coords.lng,
                    geocoded_at: new Date().toISOString(),
                    geocoding_source: source,
                })
                .eq('id', addressId)

            logGeocodeApi('cache_updated', { addressId, source })

            return NextResponse.json({
                lat: coords.lat,
                lng: coords.lng,
                cached: false,
                candidates: coords.candidates,
            })
        }

        // Freeform geocoding (no caching)
        if (!address) {
            return NextResponse.json({ error: 'Informe addressId ou address.' }, { status: 400 })
        }

        const searchText = buildSearchText(address, undefined, undefined, city, state, zipCode)
        const coords = await geocode(searchText, {
            addressLine: address,
            city,
            state,
            zipCode,
        })

        if (!coords) {
            logGeocodeApi('freeform_geocode_failed', { city: city || null, state: state || null }, 'warn')
            return NextResponse.json({ error: 'Nao foi possivel geocodificar este endereco.' }, { status: 422 })
        }

        logGeocodeApi('freeform_geocode_succeeded', { city: city || null, state: state || null })
        return NextResponse.json({
            lat: coords.lat,
            lng: coords.lng,
            cached: false,
            candidates: coords.candidates,
        })
    } catch (error) {
        logGeocodeApi('unexpected_exception', {
            message: error instanceof Error ? error.message : 'unknown',
        }, 'error')
        return NextResponse.json({ error: 'Erro interno no geocoding.' }, { status: 500 })
    }
}

// ==================== Helpers ====================

type GeocodeCandidate = {
    lat: number
    lng: number
    label: string
    source: 'openrouteservice' | 'nominatim'
    city?: string | null
    state?: string | null
    zipCode?: string | null
}

type GeocodeSuggestion = GeocodeCandidate & {
    score: number
}

type GeocodeResolved = {
    lat: number
    lng: number
    source: 'openrouteservice' | 'nominatim'
    candidates: GeocodeSuggestion[]
}

const BR_STATE_BY_UF: Record<string, string> = {
    AC: 'acre',
    AL: 'alagoas',
    AP: 'amapa',
    AM: 'amazonas',
    BA: 'bahia',
    CE: 'ceara',
    DF: 'distrito federal',
    ES: 'espirito santo',
    GO: 'goias',
    MA: 'maranhao',
    MT: 'mato grosso',
    MS: 'mato grosso do sul',
    MG: 'minas gerais',
    PA: 'para',
    PB: 'paraiba',
    PR: 'parana',
    PE: 'pernambuco',
    PI: 'piaui',
    RJ: 'rio de janeiro',
    RN: 'rio grande do norte',
    RS: 'rio grande do sul',
    RO: 'rondonia',
    RR: 'roraima',
    SC: 'santa catarina',
    SP: 'sao paulo',
    SE: 'sergipe',
    TO: 'tocantins',
}

function cleanSearchText(text: string): string {
    return text
        .replace(/\[.*?\]\s*/g, '')
        .replace(/CEP:\s*/gi, '')
        .replace(/,\s*,+/g, ', ')
        .replace(/\s+,/g, ',')
        .replace(/,\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function buildSearchText(
    address?: string | null,
    number?: string | null,
    neighborhood?: string | null,
    city?: string | null,
    state?: string | null,
    zipCode?: string | null,
): string {
    const parts = [address, number, neighborhood, city, state, zipCode].filter(Boolean)
    const raw = parts.join(', ') + ', Brasil'
    return cleanSearchText(raw)
}

function normalizeForCompare(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function compactDigits(text?: string | null): string {
    return (text || '').replace(/\D+/g, '')
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasToken(text: string, token: string): boolean {
    if (!text || !token) return false
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`)
    return pattern.test(text)
}

function extractHouseNumber(text: string): string {
    const match = normalizeForCompare(text).match(/\b\d{1,6}\b/)
    return match?.[0] || ''
}

function extractStreetHint(text: string): string {
    const normalized = cleanSearchText(text)
    const firstSegment = normalized.split(',').map((part) => part.trim()).find(Boolean) || normalized
    return normalizeForCompare(firstSegment)
}

function resolveStateVariants(state?: string | null): string[] {
    if (!state) return []
    const normalizedState = normalizeForCompare(state)
    if (!normalizedState) return []

    if (normalizedState.length === 2) {
        const uf = normalizedState.toUpperCase()
        const fullName = BR_STATE_BY_UF[uf] || ''
        return [normalizedState, fullName].filter(Boolean)
    }

    const ufMatch = Object.entries(BR_STATE_BY_UF)
        .find(([, fullName]) => normalizeForCompare(fullName) === normalizedState)?.[0]

    if (ufMatch) {
        return [normalizeForCompare(ufMatch), normalizedState]
    }

    return [normalizedState]
}

function resolveStateUf(state?: string | null): string | null {
    if (!state) return null
    const normalized = normalizeForCompare(state)
    if (!normalized) return null

    if (normalized.length === 2 && BR_STATE_BY_UF[normalized.toUpperCase()]) {
        return normalized
    }

    const found = Object.entries(BR_STATE_BY_UF)
        .find(([, fullName]) => normalizeForCompare(fullName) === normalized)?.[0]
    return found ? normalizeForCompare(found) : null
}

function detectCandidateUf(candidate: GeocodeCandidate): string | null {
    const fromState = resolveStateUf(candidate.state || null)
    if (fromState) return fromState

    const ufRegex = /,\s([A-Z]{2})(?:,|\s|$)/
    const byLabelUf = candidate.label.match(ufRegex)?.[1]
    if (byLabelUf && BR_STATE_BY_UF[byLabelUf]) {
        return normalizeForCompare(byLabelUf)
    }

    const normalizedLabel = normalizeForCompare(candidate.label)
    for (const [uf, fullName] of Object.entries(BR_STATE_BY_UF)) {
        const full = normalizeForCompare(fullName)
        if (hasToken(normalizedLabel, full)) return normalizeForCompare(uf)
    }

    return null
}

function scoreCandidate(
    candidate: GeocodeCandidate,
    searchText: string,
    hints: GeocodeHints,
): number {
    const candidateLabel = candidate.label
    const normalizedLabel = normalizeForCompare(candidateLabel)
    if (!normalizedLabel) return -1

    const streetHint = extractStreetHint(hints.addressLine || searchText)
    const houseNumber = extractHouseNumber(hints.addressLine || searchText)
    const cityHint = normalizeForCompare(hints.city || '')
    const expectedUf = resolveStateUf(hints.state)
    const zipDigits = compactDigits(hints.zipCode)

    let score = 0

    if (streetHint) {
        if (normalizedLabel.includes(streetHint)) {
            score += 56
        } else {
            const tokens = streetHint.split(' ').filter((token) => token.length > 2)
            const matched = tokens.filter((token) => normalizedLabel.includes(token)).length
            if (tokens.length > 0) {
                score += Math.round((matched / tokens.length) * 34)
            }
        }
    }

    if (houseNumber && new RegExp(`\\b${houseNumber}\\b`).test(normalizedLabel)) {
        score += 30
    }

    if (cityHint) {
        const candidateCity = normalizeForCompare(candidate.city || '')
        if ((candidateCity && hasToken(candidateCity, cityHint)) || hasToken(normalizedLabel, cityHint)) {
            score += 24
        } else if (candidateCity) {
            score -= 70
        } else {
            score -= 20
        }
    }

    if (expectedUf) {
        const candidateUf = detectCandidateUf(candidate)
        if (candidateUf && candidateUf === expectedUf) {
            score += 28
        } else if (candidateUf && candidateUf !== expectedUf) {
            score -= 260
        } else {
            const stateVariants = resolveStateVariants(hints.state)
            if (stateVariants.some((variant) => variant && hasToken(normalizedLabel, variant))) {
                score += 18
            } else {
                score -= 45
            }
        }
    }

    if (zipDigits) {
        const zipPrefix = zipDigits.slice(0, 5)
        const candidateDigits = compactDigits(candidate.zipCode || candidateLabel)
        if (zipPrefix && candidateDigits.includes(zipPrefix)) {
            score += 14
        } else if (candidate.zipCode) {
            score -= 35
        }
    }

    return score
}

function rankCandidates(
    candidates: GeocodeCandidate[],
    searchText: string,
    hints: GeocodeHints,
): GeocodeSuggestion[] {
    return candidates
        .map((candidate) => ({
            ...candidate,
            score: scoreCandidate(candidate, searchText, hints),
        }))
        .sort((a, b) => b.score - a.score)
}

function pickBestCandidate(
    candidates: GeocodeCandidate[],
    searchText: string,
    hints: GeocodeHints,
): { winner: GeocodeCandidate | null; topSuggestions: GeocodeSuggestion[] } {
    if (candidates.length === 0) {
        return { winner: null, topSuggestions: [] }
    }

    const ranked = rankCandidates(candidates, searchText, hints)

    const winner = ranked[0] || null
    const topSuggestions = ranked.slice(0, 3)

    if (!winner) {
        return { winner: null, topSuggestions }
    }

    if (winner.score < 24) {
        logGeocodeApi('candidate_rejected_low_confidence', {
            score: winner.score,
            label: winner.label,
            source: winner.source,
        }, 'warn')
        return { winner: null, topSuggestions }
    }

    logGeocodeApi('candidate_selected', {
        source: winner.source,
        score: winner.score,
        label: winner.label,
        candidates: ranked.length,
    })
    return {
        winner: {
            lat: winner.lat,
            lng: winner.lng,
            label: winner.label,
            source: winner.source,
        },
        topSuggestions,
    }
}

/**
 * Smart geocoder: uses ORS when API key is configured,
 * otherwise falls back to Nominatim (free, no key).
 */
async function geocode(
    searchText: string,
    hints: GeocodeHints,
): Promise<GeocodeResolved | null> {
    if (ORS_API_KEY) {
        const result = await geocodeWithORS(searchText, hints)
        if (result) return result
        // If ORS fails, try Nominatim as fallback
    }
    return geocodeWithNominatim(searchText, hints)
}

// ==================== ORS Geocoder ====================

async function geocodeWithORS(
    searchText: string,
    hints: GeocodeHints,
): Promise<GeocodeResolved | null> {
    try {
        const url = `${ORS_BASE_URL}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(searchText)}&boundary.country=BR&size=6`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), GEOCODE_FETCH_TIMEOUT_MS)

        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId))

        if (!response.ok) {
            logGeocodeApi('ors_http_error', { status: response.status }, 'warn')
            return null
        }

        const data = await response.json()
        const features = Array.isArray(data?.features) ? data.features as Array<Record<string, unknown>> : []
        if (features.length === 0) {
            logGeocodeApi('ors_no_result', {}, 'warn')
            return null
        }

        const rawCandidates = features
            .map((feature): GeocodeCandidate | null => {
                const geometry = feature.geometry as { coordinates?: unknown } | undefined
                const coordinates = geometry?.coordinates
                if (!Array.isArray(coordinates) || coordinates.length < 2) return null

                const [lng, lat] = coordinates
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

                const props = (feature?.properties || {}) as Record<string, unknown>
                const label = String(
                    props.label
                    || props.name
                    || [props.street, props.housenumber, props.locality, props.region]
                        .filter(Boolean)
                        .join(', '),
                )
                return {
                    lat: Number(lat),
                    lng: Number(lng),
                    label: cleanSearchText(label),
                    source: 'openrouteservice' as const,
                    city: typeof props.locality === 'string'
                        ? props.locality
                        : typeof props.localadmin === 'string'
                            ? props.localadmin
                            : null,
                    state: typeof props.region === 'string'
                        ? props.region
                        : typeof props.macroregion === 'string'
                            ? props.macroregion
                            : null,
                    zipCode: typeof props.postalcode === 'string' ? props.postalcode : null,
                }
            })
        const candidates: GeocodeCandidate[] = rawCandidates.filter((candidate): candidate is GeocodeCandidate => candidate !== null)

        const { winner, topSuggestions } = pickBestCandidate(candidates, searchText, hints)
        if (!winner) {
            logGeocodeApi('ors_no_ranked_candidate', { candidates: candidates.length }, 'warn')
            return null
        }

        return {
            lat: winner.lat,
            lng: winner.lng,
            source: winner.source,
            candidates: topSuggestions,
        }
    } catch (e) {
        const isAbort = e instanceof Error && e.name === 'AbortError'
        logGeocodeApi('ors_exception', {
            abort: isAbort,
            message: e instanceof Error ? e.message : 'unknown',
        }, 'warn')
        return null
    }
}

// ==================== Nominatim Geocoder (Free OSM) ====================

async function geocodeWithNominatim(
    searchText: string,
    hints: GeocodeHints,
): Promise<GeocodeResolved | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}&countrycodes=BR&limit=8&addressdetails=1`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), GEOCODE_FETCH_TIMEOUT_MS)

        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'CDJWE-Logistics/1.0',
            },
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId))

        if (!response.ok) {
            logGeocodeApi('nominatim_http_error', { status: response.status }, 'warn')
            return null
        }

        const data = await response.json()

        if (!Array.isArray(data) || data.length === 0) {
            logGeocodeApi('nominatim_no_result', { queryLength: searchText.length }, 'warn')
            return null
        }

        const rawCandidates = data
            .map((result): GeocodeCandidate | null => {
                const lat = Number.parseFloat(result?.lat)
                const lng = Number.parseFloat(result?.lon)
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

                const address = result?.address || {}
                const label = String(
                    result?.display_name
                    || [address.road, address.house_number, address.suburb, address.city, address.state]
                        .filter(Boolean)
                        .join(', '),
                )
                return {
                    lat,
                    lng,
                    label: cleanSearchText(label),
                    source: 'nominatim' as const,
                    city: String(address.city || address.town || address.village || address.municipality || ''),
                    state: String(address.state || address.state_code || ''),
                    zipCode: String(address.postcode || ''),
                }
            })
        const candidates: GeocodeCandidate[] = rawCandidates.filter((candidate): candidate is GeocodeCandidate => candidate !== null)

        if (candidates.length === 0) {
            logGeocodeApi('nominatim_invalid_coordinates', { results: data.length }, 'warn')
            return null
        }

        const { winner, topSuggestions } = pickBestCandidate(candidates, searchText, hints)
        if (!winner) {
            logGeocodeApi('nominatim_no_ranked_candidate', { candidates: candidates.length }, 'warn')
            return null
        }

        return {
            lat: winner.lat,
            lng: winner.lng,
            source: winner.source,
            candidates: topSuggestions,
        }
    } catch (e) {
        const isAbort = e instanceof Error && e.name === 'AbortError'
        logGeocodeApi('nominatim_exception', {
            abort: isAbort,
            message: e instanceof Error ? e.message : 'unknown',
        }, 'warn')
        return null
    }
}
