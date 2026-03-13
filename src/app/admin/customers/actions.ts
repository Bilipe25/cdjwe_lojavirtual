'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createCustomerAsAdmin(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string
    const phone = formData.get('phone') as string
    const companyName = formData.get('companyName') as string
    const cnpj = formData.get('cnpj') as string
    const tradeName = formData.get('tradeName') as string

    if (!email || !password || !fullName || !companyName || !cnpj) {
        return { error: 'Campos obrigatórios faltando.' }
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // If no service key, we can't use the admin API securely
    if (!serviceRoleKey) {
        return { error: 'Chave SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Contate o suporte técnico.' }
    }

    // Create a Supabase client with the SERVICE ROLE KEY
    // This bypasses RLS and allows creating users without modifying the current session
    const cookieStore = await cookies()
    const supabaseAdmin = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll() {
                    // Do nothing for admin client to not mess with the current user's session cookies
                },
            },
        }
    )

    // 1. Check if we are an admin actually doing this
    const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll() { } // read only
            }
        }
    )

    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return { error: 'Acesso negado' }

    const { data: adminProfile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (adminProfile?.role !== 'admin') return { error: 'Permissão negada' }

    try {
        // 2. Create Auth User using the Admin API
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: 'client'
            }
        })

        if (authError) throw authError

        // 3. Update Profiles -> immediately mark as approved
        await supabaseAdmin.from('profiles')
            .update({
                full_name: fullName,
                phone,
                status: 'approved'
            })
            .eq('id', authData.user.id)

        // 4. Create the Store associated with the user
        const { error: storeError } = await supabaseAdmin.from('stores')
            .insert({
                profile_id: authData.user.id,
                company_name: companyName,
                trade_name: tradeName || null,
                cnpj,
                email,
                phone: phone || null,
            })

        if (storeError) throw storeError

        // 5. Send welcome email to the new approved customer
        try {
            const { sendEmail } = await import('@/lib/email')
            const React = (await import('react')).default
            const { default: AccountApprovedEmail } = await import('@/emails/AccountApprovedEmail')

            const { data: settings } = await supabaseAdmin
                .from('system_settings')
                .select('system_name')
                .limit(1)
                .single()

            const systemName = settings?.system_name || 'CDJWE'
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'

            await sendEmail({
                to: email,
                subject: `✅ Sua conta foi aprovada — ${systemName}`,
                senderName: systemName,
                react: React.createElement(AccountApprovedEmail, {
                    clientName: fullName,
                    systemName,
                    appUrl,
                }),
            })
        } catch (emailErr) {
            console.error('[ADMIN CREATE CUSTOMER EMAIL] Error:', emailErr)
            // Email failures should never block customer creation
        }

        return { success: true }
    } catch (err: any) {
        console.error('Customer Creation Error:', err)
        return { error: err.message || 'Erro ao criar o cliente no servidor.' }
    }
}
