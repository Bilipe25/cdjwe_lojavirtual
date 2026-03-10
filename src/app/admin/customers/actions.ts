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

        return { success: true }
    } catch (err: any) {
        console.error('Customer Creation Error:', err)
        return { error: err.message || 'Erro ao criar o cliente no servidor.' }
    }
}
