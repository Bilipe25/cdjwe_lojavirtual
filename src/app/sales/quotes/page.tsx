import { getRepresentativeQuotesData } from '@/app/sales/actions'
import { RepresentativeQuotesPage } from '@/components/sales/representative-quotes-page'

export default async function SalesQuotesPage() {
  const quotes = await getRepresentativeQuotesData()
  return <RepresentativeQuotesPage quotes={quotes} />
}
