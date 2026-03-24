import { getRepresentativeCustomersData, getRepresentativeVisitsPageData } from '@/app/sales/actions'
import { RepresentativeVisitsPage } from '@/components/sales/representative-visits-page'
import type { RepresentativeVisitOutcome } from '@/lib/types'

type VisitsSearchParams = {
  page?: string
  q?: string
  outcome?: string
  customer?: string
}

function normalizePage(value?: string) {
  const parsed = Number(value || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.floor(parsed))
}

function normalizeOutcome(value?: string): RepresentativeVisitOutcome | null {
  if (
    value === 'planned' ||
    value === 'completed' ||
    value === 'follow_up' ||
    value === 'converted_quote' ||
    value === 'converted_order'
  ) {
    return value
  }
  return null
}

export default async function SalesVisitsPage({
  searchParams,
}: {
  searchParams: Promise<VisitsSearchParams>
}) {
  const params = await searchParams
  const page = normalizePage(params.page)
  const query = (params.q || '').trim()
  const outcome = normalizeOutcome(params.outcome)
  const customerId = (params.customer || '').trim() || null

  const [customers, visitsPage] = await Promise.all([
    getRepresentativeCustomersData(),
    getRepresentativeVisitsPageData({
      page,
      pageSize: 20,
      query,
      outcome,
      storeId: customerId,
    }),
  ])

  return (
    <RepresentativeVisitsPage
      customers={customers}
      visits={visitsPage.items}
      agenda={visitsPage.agenda}
      pagination={{
        total: visitsPage.total,
        page: visitsPage.page,
        totalPages: visitsPage.totalPages,
      }}
      initialQuery={query}
      initialOutcome={outcome}
      initialCustomerId={customerId}
    />
  )
}
