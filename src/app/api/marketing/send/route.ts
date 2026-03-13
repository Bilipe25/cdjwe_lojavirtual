import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import CampaignEmail from '@/emails/CampaignEmail'
import React from 'react'

// Admin-only: send campaign to all channels
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { title, message, image_url, channels, campaign_id } = body

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )

        // Get system settings
        const { data: settings } = await supabase
            .from('system_settings')
            .select('system_name')
            .limit(1)
            .single()
        const systemName = settings?.system_name || 'CDJWE Estofados'

        // Get all approved client profiles
        const { data: clients } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('role', 'client')
            .eq('status', 'approved')

        // Default to returning immediately if no clients
        if (!clients?.length) {
            return NextResponse.json({ error: 'Nenhum cliente encontrado' }, { status: 404 })
        }

        const results = { email: 0, notification: 0, push: 0, errors: 0 }

        // Helper function to process arrays in chunks
        const processInChunks = async <T, R>(items: T[], chunkSize: number, processor: (item: T) => Promise<R>) => {
            for (let i = 0; i < items.length; i += chunkSize) {
                const chunk = items.slice(i, i + chunkSize)
                await Promise.allSettled(chunk.map(processor))
            }
        }

        // Channel: Email
        if (channels?.includes('email')) {
            // Build the email react element strictly once
            const emailElement = React.createElement(CampaignEmail, {
                systemName,
                title,
                message: message || '',
                imageUrl: image_url,
                buttonText: 'Ver mais',
                buttonUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app',
            })

            await processInChunks(clients, 20, async (client) => {
                try {
                    await sendEmail({
                        to: client.email,
                        subject: title,
                        react: emailElement,
                    })

                    // Log send
                    if (campaign_id) {
                        await supabase.from('campaign_send_history').insert({
                            campaign_id,
                            channel: 'email',
                            recipient_id: client.id,
                            recipient_email: client.email,
                            status: 'sent',
                        })
                    }
                    results.email++
                } catch {
                    results.errors++
                    if (campaign_id) {
                        await supabase.from('campaign_send_history').insert({
                            campaign_id,
                            channel: 'email',
                            recipient_id: client.id,
                            recipient_email: client.email,
                            status: 'failed',
                        })
                    }
                }
            })
        }

        // Channel: In-app Notification
        if (channels?.includes('notification')) {
            const notificationInserts = clients.map(c => ({
                profile_id: c.id,
                type: 'campaign',
                title,
                message: message || null,
                image_url: image_url || null,
                campaign_id: campaign_id || null,
            }))

            const { error } = await supabase.from('client_notifications').insert(notificationInserts)
            if (!error) {
                results.notification = clients.length
                if (campaign_id) {
                    await supabase.from('campaign_send_history').insert(
                        clients.map(c => ({
                            campaign_id,
                            channel: 'notification',
                            recipient_id: c.id,
                            status: 'sent',
                        }))
                    )
                }
            }
        }

        // Channel: Push — delegate to push API
        if (channels?.includes('push')) {
            try {
                const pushRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'}/api/marketing/push`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, body: message }),
                })
                const pushData = await pushRes.json()
                results.push = pushData.sent || 0
            } catch {
                results.errors++
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
