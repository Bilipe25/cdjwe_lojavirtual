import type { SupabaseClient } from '@supabase/supabase-js'
import type { MarketingTargetAudience, MarketingTargetSegment } from '@/lib/marketing/types'

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sanitizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
}

function sanitizeUuidArray(value: unknown): string[] {
    return sanitizeStringArray(value).filter((entry) => UUID_REGEX.test(entry))
}

export function normalizeTargetAudience(value: unknown): MarketingTargetAudience {
    if (value === 'segment' || value === 'specific') return value
    return 'all'
}

export function normalizeTargetSegment(value: unknown): MarketingTargetSegment {
    if (!value || typeof value !== 'object') return {}
    const segment = value as Record<string, unknown>

    return {
        states: sanitizeStringArray(segment.states),
        cities: sanitizeStringArray(segment.cities),
        clientIds: sanitizeUuidArray(segment.clientIds),
    }
}

export async function resolveAudienceClientIds(
    supabase: SupabaseClient,
    targetAudience: MarketingTargetAudience,
    targetSegment: MarketingTargetSegment | null | undefined,
): Promise<string[]> {
    let clientQuery = supabase
        .from('profiles')
        .select('id')
        .eq('role', 'client')
        .eq('status', 'approved')

    if (targetAudience === 'specific') {
        const selectedClientIds = sanitizeUuidArray(targetSegment?.clientIds)
        if (selectedClientIds.length === 0) return []
        clientQuery = clientQuery.in('id', selectedClientIds)
    }

    if (targetAudience === 'segment') {
        const states = sanitizeStringArray(targetSegment?.states)
        const cities = sanitizeStringArray(targetSegment?.cities)

        if (states.length > 0) {
            let storeQuery = supabase.from('stores').select('profile_id').in('state', states)

            if (cities.length > 0) {
                storeQuery = storeQuery.in('city', cities)
            }

            const { data: storeData, error: storeError } = await storeQuery
            if (storeError) throw storeError

            const profileIds = Array.from(
                new Set((storeData ?? []).map((store) => store.profile_id).filter(Boolean)),
            ) as string[]

            if (profileIds.length === 0) return []
            clientQuery = clientQuery.in('id', profileIds)
        }
    }

    const { data: clients, error: clientsError } = await clientQuery
    if (clientsError) throw clientsError

    return Array.from(new Set((clients ?? []).map((client) => client.id)))
}
