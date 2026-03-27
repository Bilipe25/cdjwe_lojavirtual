import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLogisticsOperatorSession } from '../_auth'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

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

            if (existing?.latitude && existing?.longitude) {
                return NextResponse.json({
                    lat: existing.latitude,
                    lng: existing.longitude,
                    cached: true,
                    geocoded_at: existing.geocoded_at,
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
            const coords = await geocode(searchText)

            if (!coords) {
                return NextResponse.json({ error: 'Nao foi possivel geocodificar este endereco.' }, { status: 422 })
            }

            // Save to cache
            const source = ORS_API_KEY ? 'openrouteservice' : 'nominatim'
            await supabase
                .from('store_addresses')
                .update({
                    latitude: coords.lat,
                    longitude: coords.lng,
                    geocoded_at: new Date().toISOString(),
                    geocoding_source: source,
                })
                .eq('id', addressId)

            return NextResponse.json({ lat: coords.lat, lng: coords.lng, cached: false })
        }

        // Freeform geocoding (no caching)
        if (!address) {
            return NextResponse.json({ error: 'Informe addressId ou address.' }, { status: 400 })
        }

        const searchText = buildSearchText(address, undefined, undefined, city, state, zipCode)
        const coords = await geocode(searchText)

        if (!coords) {
            return NextResponse.json({ error: 'Nao foi possivel geocodificar este endereco.' }, { status: 422 })
        }

        return NextResponse.json({ lat: coords.lat, lng: coords.lng, cached: false })
    } catch (error) {
        console.error('[GEOCODE API] Error:', error)
        return NextResponse.json({ error: 'Erro interno no geocoding.' }, { status: 500 })
    }
}

// ==================== Helpers ====================

function cleanSearchText(text: string): string {
    return text
        .replace(/\[.*?\]\s*/g, '')       // Remove [Endereco Principal] etc
        .replace(/CEP:\s*/gi, '')          // Remove "CEP:" prefix
        .replace(/,\s*,/g, ',')            // Remove double commas
        .replace(/,\s*$/g, '')             // Remove trailing comma
        .replace(/\s+/g, ' ')             // Normalize whitespace
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

/**
 * Smart geocoder: uses ORS when API key is configured,
 * otherwise falls back to Nominatim (free, no key).
 */
async function geocode(searchText: string): Promise<{ lat: number; lng: number } | null> {
    if (ORS_API_KEY) {
        const result = await geocodeWithORS(searchText)
        if (result) return result
        // If ORS fails, try Nominatim as fallback
    }
    return geocodeWithNominatim(searchText)
}

// ==================== ORS Geocoder ====================

async function geocodeWithORS(searchText: string): Promise<{ lat: number; lng: number } | null> {
    try {
        const url = `${ORS_BASE_URL}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(searchText)}&boundary.country=BR&size=1`

        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
            console.error('[ORS GEOCODE] HTTP error:', response.status, await response.text())
            return null
        }

        const data = await response.json()
        const feature = data?.features?.[0]

        if (!feature?.geometry?.coordinates) {
            return null
        }

        // ORS returns [lng, lat]
        const [lng, lat] = feature.geometry.coordinates
        return { lat, lng }
    } catch (e) {
        console.error('[ORS GEOCODE] Exception:', e)
        return null
    }
}

// ==================== Nominatim Geocoder (Free OSM) ====================

async function geocodeWithNominatim(searchText: string): Promise<{ lat: number; lng: number } | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}&countrycodes=BR&limit=1&addressdetails=0`

        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'CDJWE-Logistics/1.0',
            },
        })

        if (!response.ok) {
            console.error('[NOMINATIM] HTTP error:', response.status)
            return null
        }

        const data = await response.json()

        if (!Array.isArray(data) || data.length === 0) {
            console.error('[NOMINATIM] No results for:', searchText)
            return null
        }

        const result = data[0]
        const lat = parseFloat(result.lat)
        const lng = parseFloat(result.lon)

        if (isNaN(lat) || isNaN(lng)) {
            return null
        }

        return { lat, lng }
    } catch (e) {
        console.error('[NOMINATIM] Exception:', e)
        return null
    }
}
