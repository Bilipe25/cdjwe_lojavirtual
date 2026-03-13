import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Push notification send API
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { title, body: messageBody, url } = body

        if (!title) {
            return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )

        // Get all push subscriptions
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*')

        if (error) throw error
        if (!subscriptions?.length) {
            return NextResponse.json({ sent: 0, message: 'Nenhuma inscrição encontrada' })
        }

        let webPush: any
        try {
            webPush = await import('web-push')
        } catch {
            // web-push not installed — return gracefully
            return NextResponse.json({
                sent: 0,
                error: 'web-push não instalado. Execute: npm install web-push',
            })
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
        const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com'

        if (!vapidPublicKey || !vapidPrivateKey) {
            return NextResponse.json({
                sent: 0,
                error: 'VAPID keys não configuradas. Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.',
            })
        }

        webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)

        const payload = JSON.stringify({
            title,
            body: messageBody || '',
            url: url || '/',
            icon: '/icon-192x192.png',
        })

        let sent = 0
        const failedIds: string[] = []

        // Helper function to process arrays in chunks
        const processInChunks = async <T,>(items: T[], chunkSize: number, processor: (item: T) => Promise<void>) => {
            for (let i = 0; i < items.length; i += chunkSize) {
                const chunk = items.slice(i, i + chunkSize)
                await Promise.allSettled(chunk.map(processor))
            }
        }

        await processInChunks(subscriptions, 50, async (sub) => {
            try {
                await webPush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    payload,
                )
                sent++
            } catch (err: any) {
                // If subscription is invalid (410 Gone), mark for deletion
                if (err.statusCode === 410 || err.statusCode === 404) {
                    failedIds.push(sub.id)
                }
            }
        })

        // Clean up invalid subscriptions
        if (failedIds.length > 0) {
            await supabase.from('push_subscriptions').delete().in('id', failedIds)
        }

        return NextResponse.json({ sent, total: subscriptions.length, cleaned: failedIds.length })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

// Save push subscription
export async function PUT(req: Request) {
    try {
        const body = await req.json()
        const { subscription, profile_id, user_agent } = body

        if (!subscription?.endpoint || !profile_id) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )

        const { error } = await supabase.from('push_subscriptions').upsert(
            {
                profile_id,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: user_agent || null,
            },
            { onConflict: 'profile_id,endpoint' }
        )

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
