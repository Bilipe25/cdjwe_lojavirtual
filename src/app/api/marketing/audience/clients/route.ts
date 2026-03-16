import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireAdminSession } from '@/lib/marketing/auth'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

function escapeOrValue(value: string): string {
    return value.replace(/,/g, '\\,')
}

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAdminSession()
        if (!authResult.ok) return authResult.response

        const searchParams = req.nextUrl.searchParams
        const query = (searchParams.get('q') || '').trim()
        const page = parsePositiveInt(searchParams.get('page'), 1)
        const pageSize = Math.min(parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const supabase = createServiceRoleClient()

        let requestBuilder = supabase
            .from('profiles')
            .select('id, full_name, email', { count: 'exact' })
            .eq('role', 'client')
            .eq('status', 'approved')
            .order('full_name', { ascending: true, nullsFirst: false })
            .range(from, to)

        if (query) {
            const safeQuery = escapeOrValue(query)
            requestBuilder = requestBuilder.or(`full_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`)
        }

        const { data, count, error } = await requestBuilder
        if (error) throw error

        const clients = (data ?? []).map((row) => ({
            id: row.id,
            name: row.full_name || 'Sem nome',
            email: row.email || '',
        }))

        return NextResponse.json({
            clients,
            pagination: {
                page,
                pageSize,
                total: count || 0,
                hasMore: from + clients.length < (count || 0),
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
