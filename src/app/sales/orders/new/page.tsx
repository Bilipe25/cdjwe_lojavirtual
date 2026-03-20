import { getRepresentativeOrderBuilderData } from '@/app/sales/actions'
import { RepresentativeOrderBuilder } from '@/components/sales/representative-order-builder'

export default async function SalesNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const params = await searchParams
  const data = await getRepresentativeOrderBuilderData()

  return (
    <RepresentativeOrderBuilder
      mode="order"
      initialCustomerId={params.customer}
      customers={data.customers}
      products={data.products}
      categories={data.categories}
      priceTables={data.priceTables}
      customerTypes={data.customerTypes}
    />
  )
}
