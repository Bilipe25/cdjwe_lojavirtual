import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import {
    buildOrderEmailItems,
    buildOrderSnapshotSummary,
} from '@/lib/orders/order-communication'

export async function POST(req: NextRequest) {
    try {
        const { orderId } = await req.json()
        if (!orderId) {
            return NextResponse.json({ error: 'orderId obrigatório.' }, { status: 400 })
        }

        const supabase = await createClient()

        // Auth
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
        }

        // Fetch order + ownership check
        const { data: order } = await supabase
            .from('orders')
            .select(`
                *,
                store:stores(company_name, cnpj),
                payment_condition:payment_conditions(name)
            `)
            .eq('id', orderId)
            .eq('profile_id', user.id)
            .single()

        if (!order) {
            return NextResponse.json({ error: 'Pedido não encontrado ou acesso negado.' }, { status: 404 })
        }

        // Fetch order items
        const { data: items } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at')

        // Fetch system settings
        const { data: settings } = await supabase
            .from('system_settings')
            .select('system_name, email')
            .limit(1)
            .single()

        // Fetch client profile email
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single()

        const clientEmail = profile?.email || user.email
        if (!clientEmail) {
            return NextResponse.json({ error: 'E-mail do cliente não disponível.' }, { status: 400 })
        }

        const systemName = settings?.system_name || 'CDJWE'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'
        const emailItems = buildOrderEmailItems(
            (items || []).map((item) => ({
                productName: item.product_name,
                fabricName: item.fabric_name,
                colorName: item.color_name,
                quantity: item.quantity,
                unitPrice: item.unit_price,
                subtotal: item.subtotal,
                productPrice: item.product_price,
                variationPrice: item.variation_price,
                finalPrice: item.final_price,
            }))
        )
        const snapshotSummary = buildOrderSnapshotSummary(emailItems)

        const React = (await import('react')).default
        const { default: OrderConfirmationEmail } = await import('@/emails/OrderConfirmationEmail')

        await sendEmail({
            to: clientEmail,
            subject: `📋 Pedido #${order.order_number} confirmado — ${systemName}`,
            senderName: systemName,
            react: React.createElement(OrderConfirmationEmail, {
                orderId: order.id,
                orderNumber: order.order_number,
                clientName: profile?.full_name || 'Cliente',
                items: emailItems,
                subtotal: order.subtotal,
                discount: order.discount_amount,
                total: order.total,
                snapshotSummary,
                systemName,
                appUrl,
            }),
        })

        return NextResponse.json({ success: true })
    } catch (err: unknown) {
        console.error('[RESEND CONFIRMATION] Error:', err)
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
