import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { DriverShell } from '@/components/driver/driver-shell'

export default async function MotoristaLayout({ children }: { children: ReactNode }) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()

    if (!profile) redirect('/login')

    const canAccess = profile.role === 'driver' || profile.role === 'admin'
    if (!canAccess) redirect('/login')

    return (
        <DriverShell
            driverName={profile.full_name || 'Motorista'}
            driverEmail={user.email || undefined}
        >
            {children}
        </DriverShell>
    )
}
