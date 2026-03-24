import { getRepresentativeCustomersPageData } from '@/app/sales/actions'
import { RepresentativeCustomersPage } from '@/components/sales/representative-customers-page'

type CustomersSearchParams = {
  page?: string
  q?: string
  state?: string
  customerType?: string
  segment?: string
  inactivity?: string
  sort?: string
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
  const state = (params.state || '').trim().toUpperCase() || null
  const customerTypeId = (params.customerType || '').trim() || null
  const segmentParam = (params.segment || '').trim()
  const segment =
    segmentParam === 'reactivation_90' ||
    segmentParam === 'hot_30' ||
    segmentParam === 'never_ordered'
      ? segmentParam
      : null
  const inactivity = (params.inactivity || '').trim()
  const inactivityBucket =
    inactivity === '30' || inactivity === '60' || inactivity === '90' || inactivity === 'no_order'
      ? inactivity
      : null
  const sort = (params.sort || '').trim()
  const sortMode =
    sort === 'name_asc' || sort === 'recent_order_desc' || sort === 'inactivity_desc'
      ? sort
      : segment === 'hot_30'
        ? 'recent_order_desc'
        : 'inactivity_desc'

  const customersPage = await getRepresentativeCustomersPageData({
    page,
    pageSize: 20,
    query,
    state,
    customerTypeId,
    segment,
    inactivityBucket,
    sort: sortMode,
  })

  return (
    <RepresentativeCustomersPage
      customers={customersPage.items}
      summary={customersPage.summary}
      availableStates={customersPage.facets.states}
      availableCustomerTypes={customersPage.facets.customerTypes}
      pagination={{
        total: customersPage.total,
        page: customersPage.page,
        totalPages: customersPage.totalPages,
      }}
      initialQuery={query}
      initialState={state}
      initialCustomerTypeId={customerTypeId}
      initialSegment={segment}
      initialInactivityBucket={inactivityBucket}
      initialSort={sortMode}
    />
  )
}
