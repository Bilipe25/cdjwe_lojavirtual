import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTargetAudience, normalizeTargetSegment } from '@/lib/marketing/audience'
import { requireAdminSession } from '@/lib/marketing/auth'
import { dispatchCampaign } from '@/lib/marketing/campaign-dispatch'
import type { MarketingChannel } from '@/lib/marketing/types'

type ScheduledCampaignRow = {
    id: string
    title: string
    message: string | null
    image_url: string | null
    channels: string[] | null
    target_audience: 'all' | 'segment' | 'specific'
    target_segment: unknown
}

function hasCronAuthorization(request: NextRequest): boolean {
    const configuredSecret = process.env.MARKETING_CRON_SECRET
    if (!configuredSecret) return false

    const headerSecret = request.headers.get('x-marketing-cron-secret')
    const bearerToken = request.headers
        .get('authorization')
        ?.replace('Bearer ', '')
        .trim()

    return headerSecret === configuredSecret || bearerToken === configuredSecret
}

function normalizeCampaignChannels(value: unknown): MarketingChannel[] {
    if (!Array.isArray(value)) return []
    const allowed = new Set<MarketingChannel>(['email', 'notification', 'push', 'popup'])
    return value
        .map((channel) => (typeof channel === 'string' ? channel : ''))
        .filter((channel): channel is MarketingChannel => allowed.has(channel as MarketingChannel))
}

export async function POST(req: NextRequest) {
    try {
        const cronCall = hasCronAuthorization(req)
        if (!cronCall) {
            const authResult = await requireAdminSession()
            if (!authResult.ok) return authResult.response
        }

        const supabase = createServiceRoleClient()
        const nowIso = new Date().toISOString()

        const { data: dueCampaigns, error: dueError } = await supabase
            .from('campaigns')
            .select('id, title, message, image_url, channels, target_audience, target_segment')
            .eq('status', 'scheduled')
            .eq('send_type', 'scheduled')
            .lte('scheduled_at', nowIso)
            .order('scheduled_at', { ascending: true })
            .limit(25)

        if (dueError) throw dueError

        const queue = (dueCampaigns ?? []) as ScheduledCampaignRow[]

        if (queue.length === 0) {
            return NextResponse.json({ success: true, processed: 0, sent: 0, errors: 0 })
        }

        let processed = 0
        let sent = 0
        let errors = 0

        for (const campaign of queue) {
            const { data: claimedCampaign, error: claimError } = await supabase
                .from('campaigns')
                .update({ status: 'processing' })
                .eq('id', campaign.id)
                .eq('status', 'scheduled')
                .select('id')
                .maybeSingle()

            if (claimError || !claimedCampaign) continue

            processed++

            try {
                const channels = normalizeCampaignChannels(campaign.channels)
                if (channels.length === 0) {
                    await supabase
                        .from('campaigns')
                        .update({ status: 'cancelled' })
                        .eq('id', campaign.id)
                    continue
                }

                const result = await dispatchCampaign({
                    supabase,
                    title: campaign.title,
                    message: campaign.message,
                    imageUrl: campaign.image_url,
                    channels,
                    campaignId: campaign.id,
                    targetAudience: normalizeTargetAudience(campaign.target_audience),
                    targetSegment: normalizeTargetSegment(campaign.target_segment),
                })

                await supabase
                    .from('campaigns')
                    .update({ status: 'sent' })
                    .eq('id', campaign.id)

                sent += result.recipients > 0 ? 1 : 0
                errors += result.errors
            } catch (dispatchError: unknown) {
                errors++
                const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
                await supabase
                    .from('campaigns')
                    .update({ status: 'scheduled', scheduled_at: retryAt })
                    .eq('id', campaign.id)

                const message = dispatchError instanceof Error ? dispatchError.message : 'Erro desconhecido'
                console.error('[marketing/dispatch-scheduled]', campaign.id, message)
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            sent,
            errors,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
