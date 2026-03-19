import { getRepresentativeCustomersData, getRepresentativeVisitsData } from '@/app/sales/actions'
import { RepresentativeVisitsPage } from '@/components/sales/representative-visits-page'

export default async function SalesVisitsPage() {
  const [customers, visits] = await Promise.all([
    getRepresentativeCustomersData(),
    getRepresentativeVisitsData(),
  ])

  return <RepresentativeVisitsPage customers={customers} visits={visits} />
}
