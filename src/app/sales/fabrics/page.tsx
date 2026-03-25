import type { Metadata } from 'next'
import { getFabricsForClient } from '@/app/(store)/fabrics/actions'
import { FabricCatalogClient } from '@/app/(store)/fabrics/FabricCatalogClient'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Catalogo de Tecidos | Representante | CDJWE',
  description: 'Visualizacao do catalogo de tecidos para representantes.',
}

export default async function SalesFabricsPage() {
  const fabrics = await getFabricsForClient()

  const supabase = await createClient()
  const { data: settings } = await supabase.from('system_settings').select('*').limit(1).single()

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Modo representante: visualizacao de tecidos sem a navegacao do painel do cliente.
      </div>
      <div className="bg-background min-h-[calc(100vh-var(--header-height))]">
        <FabricCatalogClient initialFabrics={fabrics} systemSettings={settings} />
      </div>
    </div>
  )
}
