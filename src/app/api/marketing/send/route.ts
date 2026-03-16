import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTargetAudience, normalizeTargetSegment } from '@/lib/marketing/audience'
import { requireAdminSession } from '@/lib/marketing/auth'
import { dispatchCampaign } from '@/lib/marketing/campaign-dispatch'
import { MARKETING_CHANNELS, type MarketingChannel } from '@/lib/marketing/types'

function normalizeChannels(value: unknown): MarketingChannel[] {
    if (!Array.isArray(value)) return []

    return value
        .map((channel) => (typeof channel === 'string' ? channel : ''))
        .filter((channel): channel is MarketingChannel =>
            (MARKETING_CHANNELS as readonly string[]).includes(channel),
        )
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const body = await req.json()
        const title = typeof body?.title === 'string' ? body.title.trim() : ''
        const message = typeof body?.message === 'string' ? body.message.trim() : ''
        const imageUrl = typeof body?.image_url === 'string' ? body.image_url : null
        const campaignId = typeof body?.campaign_id === 'string' ? body.campaign_id : null
        const channels = normalizeChannels(body?.channels)
        const targetAudience = normalizeTargetAudience(body?.target_audience)
        const targetSegment = normalizeTargetSegment(body?.target_segment)

        if (!title) {
            return NextResponse.json({ error: 'Titulo obrigatorio.' }, { status: 400 })
        }

        if (channels.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos um canal de envio.' }, { status: 400 })
        }

        const supabase = createServiceRoleClient()
        const results = await dispatchCampaign({
            supabase,
            title,
            message,
            imageUrl,
            channels,
            campaignId,
            targetAudience,
            targetSegment,
        })

        if (results.recipients === 0) {
            return NextResponse.json(
                { error: 'Nenhum cliente encontrado para o segmento especificado.' },
                { status: 404 },
            )
        }

        if (campaignId) {
            await supabase
                .from('campaigns')
                .update({ status: 'sent' })
                .eq('id', campaignId)
        }

        return NextResponse.json({ success: true, results })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
