import type { Metadata } from 'next'
import { getFabricsForClient } from './actions'
import { FabricCatalogClient } from './FabricCatalogClient'

import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Catálogo de Tecidos | CDJWE',
  description: 'Conheça nossa variedade de tecidos e cores disponíveis.',
}

export default async function FabricCatalogPage() {
  const fabrics = await getFabricsForClient()
  
  const supabase = await createClient()
  const { data: settings } = await supabase.from('system_settings').select('*').limit(1).single()

  return (
    <div className="bg-background min-h-[calc(100vh-var(--header-height))]">
      <FabricCatalogClient initialFabrics={fabrics} systemSettings={settings} />
    </div>
  )
}
