'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
    getDocumentCandidates,
    getPrimaryCustomerAccessIdentifier,
    hasRealCustomerEmail,
    isTaxDocumentIdentifier,
    normalizeEmail,
} from '@/lib/customers/access'
import { cookies, headers } from 'next/headers'
import { loginSchema, type LoginFormData } from './schema'

type StoreLoginRow = {
    cnpj: string | null
    profiles?: { email?: string | null } | { email?: string | null }[] | null
}

function getLookupClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Credenciais de lookup do Supabase nao configuradas.')
    }

    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    })
}

function readStoreProfileEmail(store?: StoreLoginRow | null) {
    const profileData = store?.profiles
    if (Array.isArray(profileData)) {
        return normalizeEmail(profileData[0]?.email)
    }

    return normalizeEmail(profileData?.email)
}

export async function loginAction(data: LoginFormData) {
    const parsed = loginSchema.safeParse(data)
    if (!parsed.success) {
        return { error: 'Dados invalidos. Verifique o formulario.' }
    }

    const { identifier, password } = parsed.data
    const trimmedIdentifier = identifier.trim()

    try {
        const supabase = await createClient()

        let emailToAuthenticate = normalizeEmail(trimmedIdentifier)
        const isEmailIdentifier = trimmedIdentifier.includes('@')

        if (!isEmailIdentifier) {
            if (!isTaxDocumentIdentifier(trimmedIdentifier)) {
                return { error: 'Informe um CPF, CNPJ ou e-mail valido para acessar.' }
            }

            const documentCandidates = getDocumentCandidates(trimmedIdentifier)
            const lookupClient = getLookupClient()
            const { data: storeData, error: lookupError } = await lookupClient
                .from('stores')
                .select('cnpj, profiles!stores_profile_id_fkey!inner(email)')
                .in('cnpj', documentCandidates)
                .limit(1)
                .maybeSingle()

            if (lookupError) {
                console.error('Login lookup error:', lookupError)
                return { error: 'Nao foi possivel validar o documento agora. Tente novamente.' }
            }

            const foundEmail = readStoreProfileEmail(storeData as StoreLoginRow | null)

            if (!storeData || !foundEmail) {
                return { error: 'Nenhuma conta encontrada com este CPF ou CNPJ.' }
            }

            emailToAuthenticate = foundEmail
        }

        const { error: authError } = await supabase.auth.signInWithPassword({
            email: emailToAuthenticate,
            password,
        })

        if (authError) {
            if (authError.message.includes('Invalid login credentials')) {
                return { error: 'Credenciais incorretas. Tente novamente.' }
            }

            return { error: authError.message }
        }

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return { error: 'Usuario nao encontrado apos login.' }
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, status, full_name, email, stores!stores_profile_id_fkey(company_name, cnpj)')
            .eq('id', user.id)
            .single()

        const role = profile?.role || 'client'
        const status = profile?.status || 'approved'
        const primaryStore = Array.isArray(profile?.stores) ? profile.stores[0] : undefined
        const companyName = primaryStore?.company_name || profile?.full_name || 'Usuario'
        const preferredIdentifier =
            role === 'client'
                ? getPrimaryCustomerAccessIdentifier({
                    cnpj: primaryStore?.cnpj,
                    email: hasRealCustomerEmail(profile?.email) ? profile?.email : null,
                }) || trimmedIdentifier
                : normalizeEmail(profile?.email) || trimmedIdentifier

        if (role === 'client') {
            const reqHeaders = await headers()
            const userAgent = reqHeaders.get('user-agent') || 'Unknown'
            const ipAddress = reqHeaders.get('x-forwarded-for') || reqHeaders.get('x-real-ip') || 'Local'

            try {
                await supabase.from('customer_login_audit').insert({
                    profile_id: user.id,
                    ip_address: ipAddress.split(',')[0].trim(),
                    user_agent: userAgent,
                })
            } catch (err) {
                console.error(err)
            }
        }

        const cookieStore = await cookies()
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 60 * 60 * 24 * 7,
        }

        cookieStore.set('jwt_role', role, cookieOptions)
        cookieStore.set('jwt_status', status, cookieOptions)

        let redirectUrl = '/catalog'
        if (role === 'admin') {
            redirectUrl = '/admin/dashboard'
        } else if (status === 'pending' || status === 'imported') {
            redirectUrl = '/pending-approval'
        } else if (status === 'blocked') {
            redirectUrl = '/blocked'
        }

        return { success: true, redirectUrl, companyName, identifier: preferredIdentifier }
    } catch (err) {
        console.error('Login action error:', err)
        return { error: 'Ocorreu um erro inesperado no servidor.' }
    }
}

export async function logoutAction() {
    try {
        const supabase = await createClient()
        await supabase.auth.signOut()

        const cookieStore = await cookies()
        cookieStore.delete('jwt_role')
        cookieStore.delete('jwt_status')

        return { success: true }
    } catch (error) {
        console.error('Logout error:', error)
        return { error: 'Ocorreu um erro ao sair da conta.' }
    }
}
