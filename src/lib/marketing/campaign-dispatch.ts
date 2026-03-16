import React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import CampaignEmail from '@/emails/CampaignEmail'
import { sendEmail } from '@/lib/email'
import { resolveAudienceClientIds } from '@/lib/marketing/audience'
import { sendMarketingPush } from '@/lib/marketing/push-dispatch'
import type { MarketingChannel, MarketingTargetAudience, MarketingTargetSegment } from '@/lib/marketing/types'

type CampaignDispatchInput = {
    supabase: SupabaseClient
    title: string
    message?: string | null
    imageUrl?: string | null
    channels: MarketingChannel[]
    campaignId?: string | null
    targetAudience: MarketingTargetAudience
    targetSegment?: MarketingTargetSegment | null
}

export type CampaignDispatchResult = {
    email: number
    notification: number
    push: number
    errors: number
    recipients: number
}

type ClientRow = { id: string; email: string | null }

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

async function loadClients(
    supabase: SupabaseClient,
    clientIds: string[],
): Promise<ClientRow[]> {
    const clients: ClientRow[] = []

    for (let i = 0; i < clientIds.length; i += 500) {
        const chunk = clientIds.slice(i, i + 500)
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', chunk)

        if (error) throw error
        clients.push(...((data ?? []) as ClientRow[]))
    }

    return clients
}

export async function dispatchCampaign({
    supabase,
    title,
    message,
    imageUrl,
    channels,
    campaignId,
    targetAudience,
    targetSegment,
}: CampaignDispatchInput): Promise<CampaignDispatchResult> {
    const results: CampaignDispatchResult = {
        email: 0,
        notification: 0,
        push: 0,
        errors: 0,
        recipients: 0,
    }

    const audienceClientIds = await resolveAudienceClientIds(supabase, targetAudience, targetSegment)
    if (audienceClientIds.length === 0) return results

    const clients = await loadClients(supabase, audienceClientIds)
    if (clients.length === 0) return results

    results.recipients = clients.length

    const { data: settings, error: settingsError } = await supabase
        .from('system_settings')
        .select('system_name')
        .limit(1)
        .maybeSingle()

    if (settingsError) throw settingsError
    const systemName = settings?.system_name || 'CDJWE Estofados'

    if (channels.includes('email')) {
        const emailElement = React.createElement(CampaignEmail, {
            systemName,
            title,
            message: message || '',
            imageUrl,
            buttonText: 'Ver mais',
            buttonUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app',
        })

        await processInChunks(clients, 20, async (client) => {
            if (!client.email) {
                results.errors++
                return
            }

            try {
                await sendEmail({
                    to: client.email,
                    subject: title,
                    react: emailElement,
                })

                results.email++

                if (campaignId) {
                    await supabase.from('campaign_send_history').insert({
                        campaign_id: campaignId,
                        channel: 'email',
                        recipient_id: client.id,
                        recipient_email: client.email,
                        status: 'sent',
                    })
                }
            } catch (error: unknown) {
                results.errors++
                if (campaignId) {
                    await supabase.from('campaign_send_history').insert({
                        campaign_id: campaignId,
                        channel: 'email',
                        recipient_id: client.id,
                        recipient_email: client.email,
                        status: 'failed',
                        error_message: error instanceof Error ? error.message : 'Falha ao enviar e-mail.',
                    })
                }
            }
        })
    }

    if (channels.includes('notification')) {
        const notificationRows = clients.map((client) => ({
            profile_id: client.id,
            type: 'campaign',
            title,
            message: message || null,
            image_url: imageUrl || null,
            campaign_id: campaignId || null,
        }))

        for (let i = 0; i < notificationRows.length; i += 500) {
            const chunk = notificationRows.slice(i, i + 500)
            const { error } = await supabase.from('client_notifications').insert(chunk)
            if (error) {
                results.errors += chunk.length
            } else {
                results.notification += chunk.length
            }
        }

        if (campaignId && results.notification > 0) {
            const sentRows = clients.map((client) => ({
                campaign_id: campaignId,
                channel: 'notification',
                recipient_id: client.id,
                recipient_email: client.email,
                status: 'sent',
            }))

            for (let i = 0; i < sentRows.length; i += 500) {
                const chunk = sentRows.slice(i, i + 500)
                await supabase.from('campaign_send_history').insert(chunk)
            }
        }
    }

    if (channels.includes('push')) {
        try {
            const pushResult = await sendMarketingPush({
                supabase,
                title,
                message,
                targetAudience,
                targetSegment,
            })

            results.push = pushResult.sent

            if (campaignId && pushResult.attemptedProfileIds.length > 0) {
                const clientEmailById = new Map(clients.map((client) => [client.id, client.email]))

                const sentRows = pushResult.deliveredProfileIds.map((profileId) => ({
                    campaign_id: campaignId,
                    channel: 'push',
                    recipient_id: profileId,
                    recipient_email: clientEmailById.get(profileId) || null,
                    status: 'sent',
                }))

                const failedRows = pushResult.failedProfileIds.map((profileId) => ({
                    campaign_id: campaignId,
                    channel: 'push',
                    recipient_id: profileId,
                    recipient_email: clientEmailById.get(profileId) || null,
                    status: 'failed',
                    error_message: 'Falha ao entregar push para os dispositivos do cliente.',
                }))

                const historyRows = [...sentRows, ...failedRows]
                for (let i = 0; i < historyRows.length; i += 500) {
                    const chunk = historyRows.slice(i, i + 500)
                    await supabase.from('campaign_send_history').insert(chunk)
                }
            }
        } catch {
            results.errors++
        }
    }

    return results
}
