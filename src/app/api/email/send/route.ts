import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import NewRegistrationEmail from '@/emails/NewRegistrationEmail'
import AccountApprovedEmail from '@/emails/AccountApprovedEmail'
import NewOrderEmail from '@/emails/NewOrderEmail'
import OrderConfirmationEmail from '@/emails/OrderConfirmationEmail'
import OrderStatusEmail from '@/emails/OrderStatusEmail'
import React from 'react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { type, payload } = body

        if (!type || !payload) {
            return NextResponse.json({ error: 'Tipo e payload obrigatórios.' }, { status: 400 })
        }

        const supabase = await createClient()

        // 🔒 Security: Verify authenticated user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
        }

        // Fetch system settings for system_name and admin email
        const { data: settings } = await supabase
            .from('system_settings')
            .select('system_name, email')
            .limit(1)
            .single()

        const systemName = settings?.system_name || 'CDJWE'
        const adminEmail = settings?.email

        // Common props for all templates
        const commonProps = { systemName, appUrl: APP_URL }
        const emailOptions = { senderName: systemName }

        switch (type) {
            case 'new_registration': {
                if (!adminEmail) {
                    return NextResponse.json({ error: 'Email do admin não configurado nas configurações do sistema.' }, { status: 400 })
                }
                await sendEmail({
                    to: adminEmail,
                    subject: `📋 Novo cadastro: ${payload.clientName} — ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(NewRegistrationEmail, {
                        clientName: payload.clientName,
                        clientEmail: payload.clientEmail,
                        companyName: payload.companyName,
                        cnpj: payload.cnpj,
                        ...commonProps,
                    }),
                })
                break
            }

            case 'account_approved': {
                if (!payload.clientEmail) {
                    return NextResponse.json({ error: 'Email do cliente obrigatório.' }, { status: 400 })
                }
                await sendEmail({
                    to: payload.clientEmail,
                    subject: `✅ Sua conta foi aprovada — ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(AccountApprovedEmail, {
                        clientName: payload.clientName,
                        ...commonProps,
                    }),
                })
                break
            }

            case 'new_order_admin': {
                if (!adminEmail) {
                    return NextResponse.json({ error: 'Email do admin não configurado.' }, { status: 400 })
                }
                await sendEmail({
                    to: adminEmail,
                    subject: `🛒 Novo pedido #${payload.orderNumber} — ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(NewOrderEmail, {
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        companyName: payload.companyName,
                        itemCount: payload.itemCount,
                        total: payload.total,
                        ...commonProps,
                    }),
                })
                break
            }

            case 'order_confirmation': {
                if (!payload.clientEmail) {
                    return NextResponse.json({ error: 'Email do cliente obrigatório.' }, { status: 400 })
                }
                await sendEmail({
                    to: payload.clientEmail,
                    subject: `📋 Pedido #${payload.orderNumber} confirmado — ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(OrderConfirmationEmail, {
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        items: payload.items,
                        subtotal: payload.subtotal,
                        discount: payload.discount,
                        total: payload.total,
                        ...commonProps,
                    }),
                })
                break
            }

            case 'order_status': {
                if (!payload.clientEmail) {
                    return NextResponse.json({ error: 'Email do cliente obrigatório.' }, { status: 400 })
                }
                await sendEmail({
                    to: payload.clientEmail,
                    subject: `🔄 Pedido #${payload.orderNumber} — Atualização de status — ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(OrderStatusEmail, {
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        newStatus: payload.newStatus,
                        ...commonProps,
                    }),
                })
                break
            }

            default:
                return NextResponse.json({ error: 'Tipo de email desconhecido.' }, { status: 400 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[API Email] Erro:', error)
        return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: 500 })
    }
}
