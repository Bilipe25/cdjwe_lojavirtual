import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getRepresentativeShellData } from '@/app/sales/actions'
import { SalesShell } from '@/components/sales/sales-shell'

export default async function SalesLayout({ children }: { children: ReactNode }) {
  let profile
  let isAdminPreview = false

  try {
    const data = await getRepresentativeShellData()
    profile = data.profile
    isAdminPreview = data.isAdminPreview
  } catch {
    redirect('/login')
  }

  return <SalesShell profile={profile} isAdminPreview={isAdminPreview}>{children}</SalesShell>
}
