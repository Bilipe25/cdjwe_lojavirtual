import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ORS_API_KEY = process.env.ORS_API_KEY || ''
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'

/**
 * POST /api/logistics/geocode
 * 
 * Geocodes an address and caches the result in store_addresses.
 * If the address already has coordinates, returns them from cache.
 *
 * Body: { addressId: string } | { address: string, city: string, state: string, zipCode?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
        }

        const body = await request.json()
        const { addressId, address, city, state, zipCode } = body

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
                return NextResponse.json({ error: 'Endereço não encontrado.' }, { status: 404 })
            }

            const searchText = buildSearchText(addr.address, addr.number, addr.neighborhood, addr.city, addr.state, addr.zip_code)
            const coords = await geocodeWithORS(searchText)

            if (!coords) {
                return NextResponse.json({ error: 'Não foi possível geocodificar este endereço.' }, { status: 422 })
            }

            // Save to cache
            await supabase
                .from('store_addresses')
                .update({
                    latitude: coords.lat,
                    longitude: coords.lng,
                    geocoded_at: new Date().toISOString(),
                    geocoding_source: 'openrouteservice',
                })
                .eq('id', addressId)

            return NextResponse.json({ lat: coords.lat, lng: coords.lng, cached: false })
        }

        // Freeform geocoding (no caching)
        if (!address || !city) {
            return NextResponse.json({ error: 'Informe addressId ou address + city.' }, { status: 400 })
        }

        const searchText = buildSearchText(address, undefined, undefined, city, state, zipCode)
        const coords = await geocodeWithORS(searchText)

        if (!coords) {
            return NextResponse.json({ error: 'Não foi possível geocodificar este endereço.' }, { status: 422 })
        }

        return NextResponse.json({ lat: coords.lat, lng: coords.lng, cached: false })
    } catch (error) {
        console.error('[GEOCODE API] Error:', error)
        return NextResponse.json({ error: 'Erro interno no geocoding.' }, { status: 500 })
    }
}

// ==================== Helpers ====================

function buildSearchText(
    address?: string | null,
    number?: string | null,
    neighborhood?: string | null,
    city?: string | null,
    state?: string | null,
    zipCode?: string | null,
): string {
    const parts = [address, number, neighborhood, city, state, zipCode].filter(Boolean)
    return parts.join(', ') + ', Brasil'
}

async function geocodeWithORS(searchText: string): Promise<{ lat: number; lng: number } | null> {
    const url = `${ORS_BASE_URL}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(searchText)}&boundary.country=BR&size=1`

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
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
}
