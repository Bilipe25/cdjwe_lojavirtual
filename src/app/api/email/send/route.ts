import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import NewRegistrationEmail from '@/emails/NewRegistrationEmail'
import AccountApprovedEmail from '@/emails/AccountApprovedEmail'
import NewOrderEmail from '@/emails/NewOrderEmail'
import OrderConfirmationEmail from '@/emails/OrderConfirmationEmail'
import OrderStatusEmail from '@/emails/OrderStatusEmail'
import React from 'react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { type, payload } = body

        if (!type || !payload) {
            return NextResponse.json({ error: 'Tipo e payload obrigatorios.' }, { status: 400 })
        }

        const supabase = await createClient()

        // Auth check
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
        }

        const { data: requesterProfile } = await supabase
            .from('profiles')
            .select('role, email')
            .eq('id', user.id)
            .single()

        const requesterRole = requesterProfile?.role || 'client'
        const requesterEmail = requesterProfile?.email || user.email || null

        const adminOnlyTypes = new Set(['account_approved', 'new_order_admin', 'order_status'])
        if (adminOnlyTypes.has(type) && requesterRole !== 'admin') {
            return NextResponse.json({ error: 'Acesso negado para este tipo de envio.' }, { status: 403 })
        }

        // For order confirmation, allow admins or the order owner email only.
        if (type === 'order_confirmation' && requesterRole !== 'admin') {
            if (!requesterEmail || payload.clientEmail !== requesterEmail) {
                return NextResponse.json({ error: 'Acesso negado para confirmar este pedido.' }, { status: 403 })
            }
        }

        const { data: settings } = await supabase
            .from('system_settings')
            .select('system_name, email')
            .limit(1)
            .single()

        const systemName = settings?.system_name || 'CDJWE'
        const adminEmail = settings?.email

        const commonProps = { systemName, appUrl: APP_URL }
        const emailOptions = { senderName: systemName }

        switch (type) {
            case 'new_registration': {
                if (!adminEmail) {
                    return NextResponse.json({ error: 'Email do admin nao configurado nas configuracoes do sistema.' }, { status: 400 })
                }
                await sendEmail({
                    to: adminEmail,
                    subject: `Novo cadastro: ${payload.clientName} - ${systemName}`,
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
                    return NextResponse.json({ error: 'Email do cliente obrigatorio.' }, { status: 400 })
                }
                await sendEmail({
                    to: payload.clientEmail,
                    subject: `Sua conta foi aprovada - ${systemName}`,
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
                    return NextResponse.json({ error: 'Email do admin nao configurado.' }, { status: 400 })
                }
                await sendEmail({
                    to: adminEmail,
                    subject: `Novo pedido #${payload.orderNumber} - ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(NewOrderEmail, {
                        orderId: payload.orderId,
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        companyName: payload.companyName,
                        itemCount: payload.itemCount,
                        total: payload.total,
                        pricingSummary: payload.pricingSummary,
                        ...commonProps,
                    }),
                })
                break
            }

            case 'order_confirmation': {
                if (!payload.clientEmail) {
                    return NextResponse.json({ error: 'Email do cliente obrigatorio.' }, { status: 400 })
                }
                await sendEmail({
                    to: payload.clientEmail,
                    subject: `Pedido #${payload.orderNumber} confirmado - ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(OrderConfirmationEmail, {
                        orderId: payload.orderId,
                        orderNumber: payload.orderNumber,
                        clientName: payload.clientName,
                        items: payload.items,
                        subtotal: payload.subtotal,
                        discount: payload.discount,
                        total: payload.total,
                        snapshotSummary: payload.snapshotSummary,
                        ...commonProps,
                    }),
                })
                break
            }

            case 'order_status': {
                if (!payload.clientEmail) {
                    return NextResponse.json({ error: 'Email do cliente obrigatorio.' }, { status: 400 })
                }
                await sendEmail({
                    to: payload.clientEmail,
                    subject: `Pedido #${payload.orderNumber} - Atualizacao de status - ${systemName}`,
                    ...emailOptions,
                    react: React.createElement(OrderStatusEmail, {
                        orderId: payload.orderId,
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
    } catch (error: unknown) {
        console.error('[API Email] Error:', error)
        const message = error instanceof Error ? error.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
