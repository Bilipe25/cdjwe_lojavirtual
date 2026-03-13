import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Get notifications for current user
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const limit = parseInt(searchParams.get('limit') || '50')

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        )
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { data, error } = await supabase
            .from('client_notifications')
            .select('*')
            .eq('profile_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error
        return NextResponse.json({ notifications: data })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

// Mark notification(s) as read
export async function PATCH(req: Request) {
    try {
        const body = await req.json()
        const { id, all } = body

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        )
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        if (all) {
            const { error } = await supabase
                .from('client_notifications')
                .update({ is_read: true })
                .eq('profile_id', user.id)
                .eq('is_read', false)
            if (error) throw error
        } else if (id) {
            const { error } = await supabase
                .from('client_notifications')
                .update({ is_read: true })
                .eq('id', id)
                .eq('profile_id', user.id)
            if (error) throw error
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
