import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getRepresentativeShellData } from '@/app/sales/actions'
import { SalesShell } from '@/components/sales/sales-shell'

export default async function SalesLayout({ children }: { children: ReactNode }) {
  let profile

  try {
    const data = await getRepresentativeShellData()
    profile = data.profile
  } catch {
    redirect('/login')
  }

  return <SalesShell profile={profile}>{children}</SalesShell>
}
