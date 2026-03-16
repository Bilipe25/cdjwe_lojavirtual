import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAudienceClientIds } from '@/lib/marketing/audience'
import type { MarketingTargetAudience, MarketingTargetSegment } from '@/lib/marketing/types'

type PushSubscriptionRow = {
    id: string
    endpoint: string
    p256dh: string
    auth: string
}

type SendPushParams = {
    supabase: SupabaseClient
    title: string
    message?: string | null
    url?: string | null
    targetAudience: MarketingTargetAudience
    targetSegment?: MarketingTargetSegment | null
}

export type SendPushResult = {
    sent: number
    total: number
    cleaned: number
    message?: string
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }
    return chunks
}

async function loadSubscriptionsByProfileIds(
    supabase: SupabaseClient,
    profileIds: string[],
): Promise<PushSubscriptionRow[]> {
    const rows: PushSubscriptionRow[] = []
    const chunks = chunkArray(profileIds, 500)

    for (const chunk of chunks) {
        const { data, error } = await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .in('profile_id', chunk)

        if (error) throw error
        rows.push(...((data ?? []) as PushSubscriptionRow[]))
    }

    return rows
}

async function processInChunks<T>(
    items: T[],
    chunkSize: number,
    processor: (item: T) => Promise<void>,
) {
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize)
        await Promise.allSettled(chunk.map((item) => processor(item)))
    }
}

export async function sendMarketingPush({
    supabase,
    title,
    message,
    url,
    targetAudience,
    targetSegment,
}: SendPushParams): Promise<SendPushResult> {
    const audienceProfileIds = await resolveAudienceClientIds(supabase, targetAudience, targetSegment)
    if (audienceProfileIds.length === 0) {
        return { sent: 0, total: 0, cleaned: 0, message: 'Nenhum cliente encontrado para o publico selecionado.' }
    }

    const subscriptions = await loadSubscriptionsByProfileIds(supabase, audienceProfileIds)
    if (subscriptions.length === 0) {
        return { sent: 0, total: 0, cleaned: 0, message: 'Nenhuma inscricao push encontrada para o publico selecionado.' }
    }

    let webPush: typeof import('web-push')
    try {
        webPush = await import('web-push')
    } catch {
        throw new Error('web-push nao instalado. Execute: npm install web-push')
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com'

    if (!vapidPublicKey || !vapidPrivateKey) {
        throw new Error('VAPID keys nao configuradas. Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.')
    }

    webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)

    const payload = JSON.stringify({
        title,
        body: message || '',
        url: url || '/',
        icon: '/icon-192x192.png',
    })

    let sent = 0
    const failedIds: string[] = []

    await processInChunks(subscriptions, 50, async (subscription) => {
        try {
            await webPush.sendNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.p256dh,
                        auth: subscription.auth,
                    },
                },
                payload,
            )
            sent++
        } catch (error: unknown) {
            const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
                ? (error as { statusCode?: number }).statusCode
                : undefined

            if (statusCode === 404 || statusCode === 410) {
                failedIds.push(subscription.id)
            }
        }
    })

    if (failedIds.length > 0) {
        const { error: cleanupError } = await supabase.from('push_subscriptions').delete().in('id', failedIds)
        if (cleanupError) {
            console.warn('[marketing/push] failed to cleanup invalid subscriptions', cleanupError.message)
        }
    }

    return {
        sent,
        total: subscriptions.length,
        cleaned: failedIds.length,
    }
}
