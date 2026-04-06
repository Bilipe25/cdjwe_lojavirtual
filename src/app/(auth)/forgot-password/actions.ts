'use server'

import { createServerClient } from '@supabase/ssr'
import {
    getDocumentCandidates,
    hasRealCustomerEmail,
    isTaxDocumentIdentifier,
    isPlaceholderEmail,
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
    document_number?: string | null
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

async function findStoreByDocument(
    adminClient: ReturnType<typeof getAdminClient>,
    candidates: string[]
) {
    const byDocument = await adminClient
        .from('stores')
        .select('document_number, cnpj, profiles!stores_profile_id_fkey(email)')
        .in('document_number', candidates)
        .limit(1)
        .maybeSingle()

    if (!byDocument.error && byDocument.data) {
        return { data: byDocument.data as StoreResetRow, error: null as string | null }
    }

    const byCnpj = await adminClient
        .from('stores')
        .select('document_number, cnpj, profiles!stores_profile_id_fkey(email)')
        .in('cnpj', candidates)
        .limit(1)
        .maybeSingle()

    if (byCnpj.error) {
        return { data: null as StoreResetRow | null, error: byCnpj.error.message || 'Falha ao localizar documento.' }
    }

    return { data: (byCnpj.data as StoreResetRow | null) || null, error: null as string | null }
}

export async function requestPasswordReset(identifier: string, origin: string) {
    const trimmedIdentifier = identifier.trim()
    if (!trimmedIdentifier) return { error: 'CPF, CNPJ ou e-mail obrigatorio.' }

    let emailToReset = trimmedIdentifier.includes('@') ? normalizeEmail(trimmedIdentifier) : ''

    try {
        const admin = getAdminClient()

        if (!trimmedIdentifier.includes('@')) {
            if (!isTaxDocumentIdentifier(trimmedIdentifier)) {
                return { error: 'Informe um CPF, CNPJ ou e-mail valido.' }
            }

            const documentCandidates = getDocumentCandidates(trimmedIdentifier)
            const { data: store, error: lookupError } = await findStoreByDocument(admin, documentCandidates)
            if (lookupError) {
                console.error('Password reset lookup error:', lookupError)
                return { error: 'Nao foi possivel validar o documento agora. Tente novamente.' }
            }

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
                error: 'Esta conta ainda nao possui um e-mail real cadastrado. Acesse com o CPF/CNPJ e a senha definida pelo admin ou atualize o cadastro do cliente.',
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
