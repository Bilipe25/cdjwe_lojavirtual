'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getAdminClient() {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            cookies: {
                getAll() { return [] },
                setAll() { }
            }
        }
    )
}

function getAnonClient() {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return [] },
                setAll() { }
            }
        }
    )
}

export async function requestPasswordReset(identifier: string, origin: string) {
    if (!identifier) return { error: 'Identificador obrigatório' }
    
    let emailToReset = identifier.trim()
    const cleanIdentifier = identifier.trim()
    
    // Look up email by exact match on email or cnpj using admin privileges
    const admin = getAdminClient()
    const { data: store } = await admin
        .from('stores')
        .select('email')
        .or(`email.eq.${cleanIdentifier},cnpj.eq.${cleanIdentifier}`)
        .maybeSingle()

    if (store?.email) {
        emailToReset = store.email
    } else {
        // Fallback: If no store was found but it looks like a CNPJ (mostly numbers, len >= 14)
        // Let's strip punctuation and try to match again.
        const numbersOnly = cleanIdentifier.replace(/\D/g, '')
        if (numbersOnly.length === 14) {
            // We can search for the CNPJ directly if we strip it, but since sql ilike exists:
            // This is just a basic fallback, we can't easily query stripped text in standard exact query without RPC.
            // If they provided CNPJ and it's not found exactly, we return success anyway to prevent enumeration.
            // But we don't have an email to send to, so we just stop.
            return { success: true }
        }
        
        // If it doesn't look like a CNPJ, assume they typed an email that doesn't have a store record,
        // but might still be a user profile. We keep emailToReset as is to let Supabase Auth handle it.
    }

    try {
        const supabase = getAnonClient()
        const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
            redirectTo: `${origin}/reset-password`,
        })

        if (error) {
            console.error('Password reset auth error:', error)
            return { error: 'Ocorreu um erro ao processar sua solicitação.' }
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
