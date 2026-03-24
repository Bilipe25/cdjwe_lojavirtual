import { getRepresentativeCustomersPageData } from '@/app/sales/actions'
import { RepresentativeCustomersPage } from '@/components/sales/representative-customers-page'

type CustomersSearchParams = {
  page?: string
  q?: string
}

function normalizePage(value?: string) {
  const parsed = Number(value || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.floor(parsed))
}

export default async function SalesCustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomersSearchParams>
}) {
  const params = await searchParams
  const page = normalizePage(params.page)
  const query = (params.q || '').trim()

  const customersPage = await getRepresentativeCustomersPageData({
    page,
    pageSize: 20,
    query,
  })

  return (
    <RepresentativeCustomersPage
      customers={customersPage.items}
      pagination={{
        total: customersPage.total,
        page: customersPage.page,
        totalPages: customersPage.totalPages,
      }}
      initialQuery={query}
    />
  )
}
