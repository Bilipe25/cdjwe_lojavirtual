import { createHash } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type LogisticsCacheNamespace = 'directions' | 'matrix' | 'optimize'

const DEFAULT_TTL_SECONDS: Record<LogisticsCacheNamespace, number> = {
    directions: 60 * 60 * 6, // 6h
    matrix: 60 * 60 * 2, // 2h
    optimize: 60 * 30, // 30min
}

function hasServiceRoleConfig() {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function stableStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null'
    if (typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    return `{${pairs.join(',')}}`
}

function hashSignature(signature: string) {
    return createHash('sha256').update(signature).digest('hex')
}

export async function readLogisticsApiCache<T>(
    namespace: LogisticsCacheNamespace,
    signatureInput: unknown,
): Promise<T | null> {
    if (!hasServiceRoleConfig()) return null

    const signature = stableStringify(signatureInput)
    const signatureHash = hashSignature(signature)

    try {
        const supabase = createServiceRoleClient()
        const now = new Date().toISOString()

        const { data, error } = await supabase
            .from('logistics_api_cache')
            .select('id, response_payload, hit_count')
            .eq('cache_namespace', namespace)
            .eq('signature_hash', signatureHash)
            .gt('expires_at', now)
            .maybeSingle()

        if (error || !data) return null

        // Best-effort observability bump; non-blocking for request path.
        await supabase
            .from('logistics_api_cache')
            .update({
                hit_count: Number(data.hit_count || 0) + 1,
                last_hit_at: now,
            })
            .eq('id', data.id)

        return (data.response_payload as T) || null
    } catch {
        return null
    }
}

export async function writeLogisticsApiCache(
    namespace: LogisticsCacheNamespace,
    signatureInput: unknown,
    responsePayload: unknown,
    options?: {
        ttlSeconds?: number
        createdBy?: string | null
    },
) {
    if (!hasServiceRoleConfig()) return

    const signature = stableStringify(signatureInput)
    const signatureHash = hashSignature(signature)
    const now = Date.now()
    const ttlSeconds = Math.max(1, Math.floor(options?.ttlSeconds || DEFAULT_TTL_SECONDS[namespace]))
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString()

    try {
        const supabase = createServiceRoleClient()
        await supabase
            .from('logistics_api_cache')
            .upsert(
                {
                    cache_namespace: namespace,
                    signature_hash: signatureHash,
                    request_signature: signatureInput,
                    response_payload: responsePayload,
                    ttl_seconds: ttlSeconds,
                    expires_at: expiresAt,
                    created_by: options?.createdBy || null,
                    last_hit_at: new Date(now).toISOString(),
                },
                {
                    onConflict: 'cache_namespace,signature_hash',
                },
            )
    } catch {
        // Cache failures are intentionally non-blocking.
    }
}
