import ProductDetailPage from '@/app/(store)/catalog/[id]/page'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { PriceTableInitializer } from '@/components/store/PriceTableInitializer'

export default function SalesCatalogProductPage() {
  return (
    <SettingsProvider>
      <PriceTableInitializer />
      <ProductDetailPage />
    </SettingsProvider>
  )
}
