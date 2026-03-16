import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

type SessionAuthSuccess = { ok: true; userId: string }
type SessionAuthFailure = { ok: false; response: NextResponse }

export type SessionAuthResult = SessionAuthSuccess | SessionAuthFailure

export async function requireAuthenticatedSession(): Promise<SessionAuthResult> {
    const supabase = await createServerClient()
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 }),
        }
    }

    return { ok: true, userId: user.id }
}

export async function requireAdminSession(): Promise<SessionAuthResult> {
    const authResult = await requireAuthenticatedSession()
    if (!authResult.ok) return authResult

    const supabase = await createServerClient()
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authResult.userId)
        .maybeSingle()

    if (profileError) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Falha ao validar permissoes.' }, { status: 500 }),
        }
    }

    if (profile?.role !== 'admin') {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }),
        }
    }

    return authResult
}
