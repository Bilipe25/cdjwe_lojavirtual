import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireAdminSession } from '@/lib/marketing/auth'
import { dispatchCampaign, type CampaignDispatchResult } from '@/lib/marketing/campaign-dispatch'
import { MARKETING_CHANNELS, type MarketingChannel } from '@/lib/marketing/types'

type CampaignRow = {
    id: string
    title: string
    message: string | null
    image_url: string | null
    channels: string[] | null
    status: string
}

type FailedHistoryRow = {
    channel: string
    recipient_id: string | null
}

function isChannelAllowed(channel: string): channel is MarketingChannel {
    return (MARKETING_CHANNELS as readonly string[]).includes(channel)
}

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    let claimedCampaignId: string | null = null
    let previousStatus: string | null = null

    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const requestBody = await req.json().catch(() => ({}))
        const requestedChannel =
            typeof requestBody?.channel === 'string' ? requestBody.channel : null

        if (requestedChannel && !isChannelAllowed(requestedChannel)) {
            return NextResponse.json({ error: 'Canal invalido para reprocessamento.' }, { status: 400 })
        }

        const { id: campaignId } = await context.params
        const supabase = createServiceRoleClient()

        const { data: campaign, error: campaignError } = await supabase
            .from('campaigns')
            .select('id, title, message, image_url, channels, status')
            .eq('id', campaignId)
            .maybeSingle()

        if (campaignError) throw campaignError
        if (!campaign) {
            return NextResponse.json({ error: 'Campanha nao encontrada.' }, { status: 404 })
        }

        const typedCampaign = campaign as CampaignRow
        if (typedCampaign.status === 'processing') {
            return NextResponse.json({ error: 'Campanha em processamento.' }, { status: 409 })
        }

        const { data: failedHistory, error: failedHistoryError } = await supabase
            .from('campaign_send_history')
            .select('channel, recipient_id')
            .eq('campaign_id', campaignId)
            .eq('status', 'failed')
            .not('recipient_id', 'is', null)

        if (failedHistoryError) throw failedHistoryError

        const failedRows = (failedHistory ?? []) as FailedHistoryRow[]
        const recipientsByChannel = new Map<MarketingChannel, Set<string>>()

        for (const row of failedRows) {
            if (!row.recipient_id || !isChannelAllowed(row.channel)) continue
            const existing = recipientsByChannel.get(row.channel) ?? new Set<string>()
            existing.add(row.recipient_id)
            recipientsByChannel.set(row.channel, existing)
        }

        const channelEntries = Array.from(recipientsByChannel.entries()).filter((entry) => {
            const [channel, recipients] = entry
            const campaignSupportsChannel = (typedCampaign.channels ?? []).includes(channel)
            const matchesRequestedChannel = requestedChannel ? channel === requestedChannel : true
            return campaignSupportsChannel && matchesRequestedChannel && recipients.size > 0
        })

        if (channelEntries.length === 0) {
            return NextResponse.json(
                { error: 'Nao ha destinatarios com falha para reprocessar nesta campanha.' },
                { status: 400 },
            )
        }

        previousStatus = typedCampaign.status
        const { data: claimData, error: claimError } = await supabase
            .from('campaigns')
            .update({ status: 'processing' })
            .eq('id', campaignId)
            .eq('status', previousStatus)
            .select('id')
            .maybeSingle()

        if (claimError) throw claimError
        if (!claimData) {
            return NextResponse.json({ error: 'Campanha bloqueada para reprocessamento concorrente.' }, { status: 409 })
        }

        claimedCampaignId = campaignId

        const aggregate: CampaignDispatchResult = {
            email: 0,
            notification: 0,
            push: 0,
            errors: 0,
            recipients: 0,
        }

        for (const [channel, recipients] of channelEntries) {
            const dispatchResult = await dispatchCampaign({
                supabase,
                title: typedCampaign.title,
                message: typedCampaign.message,
                imageUrl: typedCampaign.image_url,
                channels: [channel],
                campaignId,
                targetAudience: 'specific',
                targetSegment: { clientIds: Array.from(recipients) },
            })

            aggregate.email += dispatchResult.email
            aggregate.notification += dispatchResult.notification
            aggregate.push += dispatchResult.push
            aggregate.errors += dispatchResult.errors
            aggregate.recipients += dispatchResult.recipients
        }

        await supabase
            .from('campaigns')
            .update({ status: 'sent' })
            .eq('id', campaignId)

        return NextResponse.json({
            success: true,
            retriedChannels: channelEntries.map(([channel]) => channel),
            results: aggregate,
        })
    } catch (err: unknown) {
        if (claimedCampaignId && previousStatus) {
            const supabase = createServiceRoleClient()
            await supabase
                .from('campaigns')
                .update({ status: previousStatus })
                .eq('id', claimedCampaignId)
        }

        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
