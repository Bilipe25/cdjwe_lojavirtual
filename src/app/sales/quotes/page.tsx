import { getRepresentativeQuotesPageData } from '@/app/sales/actions'
import { RepresentativeQuotesPage } from '@/components/sales/representative-quotes-page'
import type { SalesQuoteStatus } from '@/lib/types'

type QuotesSearchParams = {
  page?: string
  q?: string
  status?: string
}

function normalizePage(value?: string) {
  const parsed = Number(value || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.floor(parsed))
}

function normalizeStatus(value?: string): SalesQuoteStatus | null {
  if (
    value === 'draft' ||
    value === 'sent' ||
    value === 'approved' ||
    value === 'converted' ||
    value === 'cancelled'
  ) {
    return value
  }
  return null
}

export default async function SalesQuotesPage({
  searchParams,
}: {
  searchParams: Promise<QuotesSearchParams>
}) {
  const params = await searchParams
  const page = normalizePage(params.page)
  const query = (params.q || '').trim()
  const status = normalizeStatus(params.status)

  const quotesPage = await getRepresentativeQuotesPageData({
    page,
    pageSize: 20,
    query,
    status,
  })

  return (
    <RepresentativeQuotesPage
      quotes={quotesPage.items}
      pagination={{
        total: quotesPage.total,
        page: quotesPage.page,
        totalPages: quotesPage.totalPages,
      }}
      indicators={quotesPage.indicators}
      pipeline={quotesPage.pipeline}
      aging={quotesPage.aging}
      initialQuery={query}
      initialStatus={status}
    />
  )
}
