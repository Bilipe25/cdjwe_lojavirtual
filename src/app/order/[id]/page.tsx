import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OrderRedirectPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role || 'client'

  if (role === 'admin') {
    // Admins have a central list and a modal, so just going to /admin/orders or opening the modal via query params if possible.
    // For now, redirecting to /admin/orders is the standard way.
    // If the admin order dashboard supports a query param like ?order=id, we could use that. Let's use /admin/orders for now,
    // or if we have a specific /admin/orders/[id] route, we use that.
    redirect('/admin/orders')
  } else if (role === 'representative') {
    redirect(`/sales/orders/${params.id}`)
  } else {
    redirect(`/orders/${params.id}`)
  }
}
