import type { Metadata } from 'next'
import CatalogPage from '@/app/(store)/catalog/page'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { PriceTableInitializer } from '@/components/store/PriceTableInitializer'

export const metadata: Metadata = {
  title: 'Catalogo de Produtos | Representante | CDJWE',
  description: 'Visualizacao do catalogo de produtos para representantes.',
}

export default function SalesCatalogPage() {
  return (
    <SettingsProvider>
      <PriceTableInitializer />
      <div className="mb-3 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Modo representante: visualizacao de catalogo sem carrinho.
      </div>
      <CatalogPage />
    </SettingsProvider>
  )
}
