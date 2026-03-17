'use server'

import { createServerClient } from '@supabase/ssr'
import {
    hasRealCustomerEmail,
    isCnpjIdentifier,
    isPlaceholderEmail,
    normalizeCnpj,
    normalizeEmail,
} from '@/lib/customers/access'

function getAdminClient() {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        cookies: {
            getAll() {
                return []
            },
            setAll() {},
        },
    })
}

function getAnonClient() {
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll() {
                return []
            },
            setAll() {},
        },
    })
}

type StoreResetRow = {
    cnpj: string | null
    profiles?: { email?: string | null } | { email?: string | null }[] | null
}

function readStoreProfileEmail(store?: StoreResetRow | null) {
    const profileData = store?.profiles
    if (Array.isArray(profileData)) {
        return normalizeEmail(profileData[0]?.email)
    }

    return normalizeEmail(profileData?.email)
}

export async function requestPasswordReset(identifier: string, origin: string) {
    const trimmedIdentifier = identifier.trim()
    if (!trimmedIdentifier) return { error: 'CNPJ ou e-mail obrigatorio.' }

    let emailToReset = trimmedIdentifier.includes('@') ? normalizeEmail(trimmedIdentifier) : ''

    try {
        const admin = getAdminClient()

        if (!trimmedIdentifier.includes('@')) {
            if (!isCnpjIdentifier(trimmedIdentifier)) {
                return { error: 'Informe um CNPJ ou e-mail valido.' }
            }

            const normalizedCnpj = normalizeCnpj(trimmedIdentifier)
            const { data: store } = await admin
                .from('stores')
                .select('cnpj, profiles!stores_profile_id_fkey(email)')
                .or(`cnpj.eq.${trimmedIdentifier},cnpj.eq.${normalizedCnpj}`)
                .maybeSingle()

            const resolvedEmail = readStoreProfileEmail(store as StoreResetRow | null)
            if (!resolvedEmail) {
                return { success: true }
            }

            emailToReset = resolvedEmail
        }

        if (!emailToReset) {
            return { success: true }
        }

        if (isPlaceholderEmail(emailToReset) || !hasRealCustomerEmail(emailToReset)) {
            return {
                error: 'Esta conta ainda nao possui um e-mail real cadastrado. Acesse com o CNPJ e a senha definida pelo admin ou atualize o cadastro do cliente.',
            }
        }

        const supabase = getAnonClient()
        const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
            redirectTo: `${origin}/reset-password`,
        })

        if (error) {
            console.error('Password reset auth error:', error)
            return { error: 'Ocorreu um erro ao processar sua solicitacao.' }
        }

        return { success: true, maskedEmail: maskEmail(emailToReset) }
    } catch (err) {
        console.error('Password reset error:', err)
        return { error: 'Erro inesperado. Tente novamente.' }
    }
}

function maskEmail(email: string) {
    const [name, domain] = email.split('@')
    if (!name || !domain) return email
    return `${name.substring(0, 2)}***@${domain}`
}
