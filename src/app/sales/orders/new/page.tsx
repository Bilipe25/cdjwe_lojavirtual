import { getRepresentativeOrderBuilderData } from '@/app/sales/actions'
import { RepresentativeOrderBuilder } from '@/components/sales/representative-order-builder'

export default async function SalesNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; fromVisit?: string }>
}) {
  const params = await searchParams
  const data = await getRepresentativeOrderBuilderData()
  const sourceVisitId = (params.fromVisit || '').trim() || null

  return (
    <RepresentativeOrderBuilder
      mode="order"
      initialCustomerId={params.customer}
      initialDraft={sourceVisitId ? { sourceVisitId } : undefined}
      customers={data.customers}
      products={data.products}
      categories={data.categories}
      priceTables={data.priceTables}
      customerTypes={data.customerTypes}
    />
  )
}
