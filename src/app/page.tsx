import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDefaultRouteByRole } from '@/lib/auth/role-routing'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  redirect(
    getDefaultRouteByRole(
      (profile?.role || 'client') as 'admin' | 'client' | 'representative',
      (profile?.status || 'approved') as 'pending' | 'approved' | 'blocked' | 'imported'
    )
  )
}
