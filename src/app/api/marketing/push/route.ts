import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTargetAudience, normalizeTargetSegment } from '@/lib/marketing/audience'
import { requireAdminSession, requireAuthenticatedSession } from '@/lib/marketing/auth'
import { sendMarketingPush } from '@/lib/marketing/push-dispatch'

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const body = await req.json()
        const title = typeof body?.title === 'string' ? body.title.trim() : ''
        const messageBody = typeof body?.body === 'string' ? body.body.trim() : ''
        const redirectUrl = typeof body?.url === 'string' ? body.url.trim() : ''
        const targetAudience = normalizeTargetAudience(body?.target_audience)
        const targetSegment = normalizeTargetSegment(body?.target_segment)

        if (!title) {
            return NextResponse.json({ error: 'Titulo obrigatorio.' }, { status: 400 })
        }

        const supabase = createServiceRoleClient()
        const result = await sendMarketingPush({
            supabase,
            title,
            message: messageBody,
            url: redirectUrl || undefined,
            targetAudience,
            targetSegment,
        })

        return NextResponse.json(result)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function PUT(req: NextRequest) {
    try {
        const authResult = await requireAuthenticatedSession()
        if (!authResult.ok) return authResult.response

        const body = await req.json()
        const subscription = body?.subscription
        const userAgent = typeof body?.user_agent === 'string' ? body.user_agent : null

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ error: 'Dados incompletos da inscricao push.' }, { status: 400 })
        }

        const supabase = createServiceRoleClient()
        const { error } = await supabase.from('push_subscriptions').upsert(
            {
                profile_id: authResult.userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: userAgent,
            },
            { onConflict: 'profile_id,endpoint' },
        )

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
