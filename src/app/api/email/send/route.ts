import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import NewRegistrationEmail from '@/emails/NewRegistrationEmail'
import AccountApprovedEmail from '@/emails/AccountApprovedEmail'
import NewOrderEmail from '@/emails/NewOrderEmail'
import OrderConfirmationEmail from '@/emails/OrderConfirmationEmail'
import OrderStatusEmail from '@/emails/OrderStatusEmail'
import React from 'react'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { type, payload } = body

        if (!type || !payload) {
            return NextResponse.json({ error: 'Tipo e payload obrigatórios.' }, { status: 400 })
        }

        // Fetch system settings for system_name and admin email
        const supabase = await createClient()
        const { data: settings } = await supabase
            .from('system_settings')
            .select('system_name, email')
            .limit(1)
            .single()

        const systemName = settings?.system_name || 'CDJWE'
        const adminEmail = settings?.email

        switch (type) {
            case 'new_registration': {
                if (!adminEmail) {
                    return NextResponse.json({ error: 'Email do admin não configurado nas configurações do sistema.' }, { status: 400 })
                }
                await sendEmail({
                    to: adminEmail,
                    subject: `📋 Novo cadastro: ${payload.clientName} — ${systemName}`,
                    react: React.createElement(NewRegistrationEmail, {
                        clientName: payload.clientName,
                        clientEmail: payload.clientEmail,
                        companyName: payload.companyName,
                        cnpj: payload.cnpj,
                        systemName,
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
                    react: React.createElement(AccountApprovedEmail, {
                        clientName: payload.clientName,
                        systemName,
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
                    react: React.createElement(NewOrderEmail, {
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        companyName: payload.companyName,
                        itemCount: payload.itemCount,
                        total: payload.total,
                        systemName,
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
                    react: React.createElement(OrderConfirmationEmail, {
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        items: payload.items,
                        subtotal: payload.subtotal,
                        discount: payload.discount,
                        total: payload.total,
                        systemName,
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
                    react: React.createElement(OrderStatusEmail, {
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        newStatus: payload.newStatus,
                        systemName,
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
