import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

type LogisticsAuthSuccess = { ok: true; userId: string; role: 'admin' | 'driver' }
type LogisticsAuthFailure = { ok: false; response: NextResponse }

type LogisticsAuthResult = LogisticsAuthSuccess | LogisticsAuthFailure

async function resolveLogisticsSession(): Promise<LogisticsAuthResult> {
    const supabase = await createServerClient()
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 }),
        }
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

    if (profileError) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Falha ao validar permissao.' }, { status: 500 }),
        }
    }

    const role = profile?.role
    if (role !== 'admin' && role !== 'driver') {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }),
        }
    }

    return {
        ok: true,
        userId: user.id,
        role,
    }
}

export async function requireLogisticsOperatorSession() {
    return resolveLogisticsSession()
}

export async function requireAdminLogisticsSession() {
    const auth = await resolveLogisticsSession()
    if (!auth.ok) return auth

    if (auth.role !== 'admin') {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 }),
        } as const
    }

    return auth
}
