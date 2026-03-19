import { getRepresentativeCustomersData } from '@/app/sales/actions'
import { RepresentativeCustomersPage } from '@/components/sales/representative-customers-page'

export default async function SalesCustomersPage() {
  const customers = await getRepresentativeCustomersData()
  return <RepresentativeCustomersPage customers={customers} />
}
