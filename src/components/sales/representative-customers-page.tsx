'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageCircle,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { getWhatsAppLink } from '@/lib/utils'
import type { PriceTable, Profile, Store, StoreAddress } from '@/lib/types'

type CustomerRow = Store & {
  profile?: Profile | null
  addresses?: StoreAddress[]
  assigned_price_tables?: PriceTable[]
  last_order?: { order_number: string; created_at: string; total: number; status: string } | null
  open_quotes_count?: number
  overdue_followups_count?: number
  alerts?: string[]
  data_quality?: {
    score: number
    issues: string[]
  }
  priority?: {
    score: number
    level: 'high' | 'medium' | 'low'
    next_action: string
  }
}

type CustomersPagination = {
  total: number
  page: number
  totalPages: number
}

type CustomersSummary = {
  totalCustomers: number
  customersWithoutOrders: number
  customersWithRecentOrders30: number
  customersInactive60Plus: number
  customersInactive90Plus: number
  highPriorityCustomers?: number
  lowQualityCustomers?: number
  customersWithOverdueFollowups?: number
}

type CustomerTypeFacet = {
  id: string
  name: string
}

type InactivityFilter = 'all' | '30' | '60' | '90' | 'no_order'
type SortMode = 'inactivity_desc' | 'name_asc' | 'recent_order_desc'
type SegmentMode = 'all' | 'reactivation_90' | 'hot_30' | 'never_ordered'

const stateLabelMap: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapa',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceara',
  DF: 'Distrito Federal',
  ES: 'Espirito Santo',
  GO: 'Goias',
  MA: 'Maranhao',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Para',
  PB: 'Paraiba',
  PR: 'Parana',
  PE: 'Pernambuco',
  PI: 'Piaui',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondonia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'Sao Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function getInactivityDays(lastOrderDate?: string | null) {
  if (!lastOrderDate) return null
  const diff = Date.now() - new Date(lastOrderDate).getTime()
  if (!Number.isFinite(diff) || diff < 0) return null
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatLastOrder(lastOrder?: CustomerRow['last_order'] | null) {
  if (!lastOrder) return 'Sem pedidos'
  const date = new Date(lastOrder.created_at)
  const dateLabel = Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR') : '-'
  return `${lastOrder.order_number} - ${dateLabel}`
}

function getSegmentLabel(segment: SegmentMode) {
  if (segment === 'reactivation_90') return 'Reativacao 90+'
  if (segment === 'hot_30') return 'Ativos 30d'
  if (segment === 'never_ordered') return 'Nunca comprou'
  return 'Todos'
}

function getStateLabel(stateCode: string) {
  const normalized = stateCode.trim().toUpperCase()
  if (!normalized) return ''
  const label = stateLabelMap[normalized]
  return label ? `${label} (${normalized})` : normalized
}

function getInactivityFilterLabel(value: InactivityFilter) {
  if (value === '30') return 'Sem pedido 30+ dias'
  if (value === '60') return 'Sem pedido 60+ dias'
  if (value === '90') return 'Sem pedido 90+ dias'
  if (value === 'no_order') return 'Nunca comprou'
  return 'Todas as faixas'
}

function getSortModeLabel(value: SortMode) {
  if (value === 'recent_order_desc') return 'Compra mais recente'
  if (value === 'name_asc') return 'Nome (A-Z)'
  return 'Maior inatividade'
}

function getPriorityBadge(level?: 'high' | 'medium' | 'low') {
  if (!level) {
    return { label: 'Prioridade n/d', className: 'bg-muted text-muted-foreground' }
  }
  if (level === 'high') {
    return { label: 'Prioridade alta', className: 'bg-destructive/15 text-destructive' }
  }
  if (level === 'medium') {
    return { label: 'Prioridade media', className: 'bg-amber-50 text-amber-700' }
  }
  return { label: 'Prioridade baixa', className: 'bg-emerald-50 text-emerald-700' }
}

export function RepresentativeCustomersPage({
  customers,
  summary,
  availableStates,
  availableCustomerTypes,
  pagination,
  initialQuery = '',
  initialState = null,
  initialCustomerTypeId = null,
  initialSegment = null,
  initialInactivityBucket = null,
  initialSort = 'inactivity_desc',
}: {
  customers: CustomerRow[]
  summary: CustomersSummary
  availableStates: string[]
  availableCustomerTypes: CustomerTypeFacet[]
  pagination: CustomersPagination
  initialQuery?: string
  initialState?: string | null
  initialCustomerTypeId?: string | null
  initialSegment?: 'reactivation_90' | 'hot_30' | 'never_ordered' | null
  initialInactivityBucket?: '30' | '60' | '90' | 'no_order' | null
  initialSort?: SortMode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(initialQuery)
  const [stateFilter, setStateFilter] = useState(initialState || 'all')
  const [customerTypeFilter, setCustomerTypeFilter] = useState(initialCustomerTypeId || 'all')
  const [segmentMode, setSegmentMode] = useState<SegmentMode>(initialSegment || 'all')
  const [inactivityFilter, setInactivityFilter] = useState<InactivityFilter>(initialInactivityBucket || 'all')
  const [sortMode, setSortMode] = useState<SortMode>(initialSort)
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    setSearch(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setStateFilter(initialState || 'all')
  }, [initialState])

  useEffect(() => {
    setCustomerTypeFilter(initialCustomerTypeId || 'all')
  }, [initialCustomerTypeId])

  useEffect(() => {
    setSegmentMode(initialSegment || 'all')
  }, [initialSegment])

  useEffect(() => {
    setInactivityFilter(initialInactivityBucket || 'all')
  }, [initialInactivityBucket])

  useEffect(() => {
    setSortMode(initialSort)
  }, [initialSort])

  useEffect(() => {
    const nextQuery = deferredSearch.trim()
    const currentQuery = (searchParams.get('q') || '').trim()
    if (nextQuery === currentQuery) return

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (nextQuery) {
        params.set('q', nextQuery)
      } else {
        params.delete('q')
      }
      params.set('page', '1')
      const queryString = params.toString()
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    }, 350)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [deferredSearch, pathname, router, searchParams])

  const queryFromUrl = (searchParams.get('q') || '').trim()
  const stateFromUrl = (searchParams.get('state') || '').trim().toUpperCase()
  const customerTypeFromUrl = (searchParams.get('customerType') || '').trim()
  const segmentFromUrl = (searchParams.get('segment') || '').trim()
  const inactivityFromUrl = (searchParams.get('inactivity') || '').trim()
  const sortFromUrl = (searchParams.get('sort') || '').trim()

  const buildPageHref = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())

    if (queryFromUrl) params.set('q', queryFromUrl)
    else params.delete('q')

    if (stateFromUrl) params.set('state', stateFromUrl)
    else params.delete('state')

    if (customerTypeFromUrl) params.set('customerType', customerTypeFromUrl)
    else params.delete('customerType')

    if (segmentFromUrl) params.set('segment', segmentFromUrl)
    else params.delete('segment')

    if (inactivityFromUrl) params.set('inactivity', inactivityFromUrl)
    else params.delete('inactivity')

    if (sortFromUrl) params.set('sort', sortFromUrl)
    else params.delete('sort')

    params.set('page', String(nextPage))
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const applyFilter = (updates: {
    state?: string
    customerType?: string
    segment?: SegmentMode
    inactivity?: InactivityFilter
    sort?: SortMode
  }) => {
    const params = new URLSearchParams(searchParams.toString())

    const stateValue = updates.state ?? stateFilter
    const customerTypeValue = updates.customerType ?? customerTypeFilter
    const segmentValue = updates.segment ?? segmentMode
    const inactivityValue = updates.inactivity ?? inactivityFilter
    const sortValue = updates.sort ?? sortMode

    if (stateValue && stateValue !== 'all') params.set('state', stateValue)
    else params.delete('state')

    if (customerTypeValue && customerTypeValue !== 'all') params.set('customerType', customerTypeValue)
    else params.delete('customerType')

    if (segmentValue && segmentValue !== 'all') params.set('segment', segmentValue)
    else params.delete('segment')

    if (inactivityValue && inactivityValue !== 'all') params.set('inactivity', inactivityValue)
    else params.delete('inactivity')

    if (sortValue && sortValue !== 'inactivity_desc') params.set('sort', sortValue)
    else params.delete('sort')

    params.set('page', '1')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  const compactStates = useMemo(() => ['all', ...availableStates], [availableStates])
  const selectedCustomerTypeLabel = useMemo(() => {
    if (customerTypeFilter === 'all') return 'Todos os tipos'
    return availableCustomerTypes.find((item) => item.id === customerTypeFilter)?.name || 'Tipo selecionado'
  }, [availableCustomerTypes, customerTypeFilter])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-7">
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clientes na carteira</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{summary.totalCustomers}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Com pedido (30 dias)</p>
          <p className="mt-1 text-lg font-bold font-heading text-emerald-600 sm:text-xl">{summary.customersWithRecentOrders30}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sem pedido (60+)</p>
          <p className="mt-1 text-lg font-bold font-heading text-amber-600 sm:text-xl">{summary.customersInactive60Plus}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sem pedido (90+)</p>
          <p className="mt-1 text-lg font-bold font-heading text-destructive sm:text-xl">{summary.customersInactive90Plus}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nunca compraram</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{summary.customersWithoutOrders}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alta prioridade</p>
          <p className="mt-1 text-lg font-bold font-heading text-destructive sm:text-xl">{summary.highPriorityCustomers || 0}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Baixa qualidade</p>
          <p className="mt-1 text-lg font-bold font-heading text-amber-600 sm:text-xl">{summary.lowQualityCustomers || 0}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {(['all', 'reactivation_90', 'hot_30', 'never_ordered'] as SegmentMode[]).map((segment) => (
            <button
              key={segment}
              type="button"
              onClick={() => {
                setSegmentMode(segment)
                setInactivityFilter('all')
                const nextSort = segment === 'hot_30' ? 'recent_order_desc' : 'inactivity_desc'
                setSortMode(nextSort)
                applyFilter({ segment, inactivity: 'all', sort: nextSort })
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                segmentMode === segment
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {getSegmentLabel(segment)}
            </button>
          ))}
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, CNPJ, codigo ou contato"
              className="h-10 rounded-xl border-border pl-10 text-sm"
            />
          </div>

          <Select
            value={stateFilter}
            onValueChange={(value) => {
              const next = value || 'all'
              setStateFilter(next)
              applyFilter({ state: next })
            }}
          >
            <SelectTrigger className="h-10 rounded-xl border-border text-sm">
              <SelectValue placeholder="Estado">{stateFilter === 'all' ? 'Todos os estados' : getStateLabel(stateFilter)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {compactStates.map((stateCode) => (
                <SelectItem key={stateCode} value={stateCode}>
                  {stateCode === 'all' ? 'Todos os estados' : getStateLabel(stateCode)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={customerTypeFilter}
            onValueChange={(value) => {
              const next = value || 'all'
              setCustomerTypeFilter(next)
              applyFilter({ customerType: next })
            }}
          >
            <SelectTrigger className="h-10 rounded-xl border-border text-sm">
              <SelectValue placeholder="Tipo de cliente">{selectedCustomerTypeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {availableCustomerTypes.map((typeItem) => (
                <SelectItem key={typeItem.id} value={typeItem.id}>
                  {typeItem.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={inactivityFilter}
            onValueChange={(value) => {
              const next = (value || 'all') as InactivityFilter
              setInactivityFilter(next)
              setSegmentMode('all')
              applyFilter({ inactivity: next, segment: 'all' })
            }}
          >
            <SelectTrigger className="h-10 rounded-xl border-border text-sm">
              <SelectValue placeholder="Inatividade">{getInactivityFilterLabel(inactivityFilter)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as faixas</SelectItem>
              <SelectItem value="30">Sem pedido 30+ dias</SelectItem>
              <SelectItem value="60">Sem pedido 60+ dias</SelectItem>
              <SelectItem value="90">Sem pedido 90+ dias</SelectItem>
              <SelectItem value="no_order">Nunca comprou</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortMode}
            onValueChange={(value) => {
              const next = (value || 'inactivity_desc') as SortMode
              setSortMode(next)
              applyFilter({ sort: next })
            }}
          >
            <SelectTrigger className="h-10 rounded-xl border-border text-sm">
              <SelectValue placeholder="Ordenacao">{getSortModeLabel(sortMode)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inactivity_desc">Maior inatividade</SelectItem>
              <SelectItem value="recent_order_desc">Compra mais recente</SelectItem>
              <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{pagination.total} cliente(s)</span>
      </div>

      {customers.length === 0 ? (
        <SalesEmptyState
          title="Nenhum cliente encontrado"
          description="Ajuste busca e filtros para ampliar sua carteira visivel."
        />
      ) : (
        <>
          <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
            {customers.map((customer) => {
              const tableName = customer.assigned_price_tables?.[0]?.name
              const customerTypeName = customer.customer_type?.name || null
              const inactivityDays = getInactivityDays(customer.last_order?.created_at)
              const phone = customer.phone || customer.profile?.phone || null
              const whatsappLink = getWhatsAppLink(phone)
              const priority = customer.priority
              const quality = customer.data_quality
              const priorityBadge = getPriorityBadge(priority?.level)

              return (
                <div key={customer.id} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/40 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{customer.company_name}</span>
                      {customer.customer_code && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {customer.customer_code}
                        </span>
                      )}
                      {inactivityDays !== null ? (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          {inactivityDays} dia(s) sem comprar
                        </span>
                      ) : (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          Sem historico de pedidos
                        </span>
                      )}
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${priorityBadge.className}`}>
                        {priorityBadge.label}
                      </span>
                      {quality && quality.score < 70 && (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Qualidade {quality.score}/100
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{customer.trade_name || customer.cnpj}</span>
                      {(customer.city || customer.state) && (
                        <span>{[customer.city, customer.state].filter(Boolean).join(' - ')}</span>
                      )}
                      {customerTypeName && <span>Tipo: {customerTypeName}</span>}
                      {tableName && <span>Tabela: {tableName}</span>}
                      <span>Ultimo pedido: {formatLastOrder(customer.last_order)}</span>
                      {customer.last_order && <span>{formatCurrency(customer.last_order.total)}</span>}
                      {typeof customer.open_quotes_count === 'number' && customer.open_quotes_count > 0 && (
                        <span>Orcamentos em aberto: {customer.open_quotes_count}</span>
                      )}
                      {typeof customer.overdue_followups_count === 'number' && customer.overdue_followups_count > 0 && (
                        <span>Follow-ups vencidos: {customer.overdue_followups_count}</span>
                      )}
                      {priority?.next_action && <span>Proxima acao: {priority.next_action}</span>}
                      {Array.isArray(customer.alerts) && customer.alerts.length > 0 && (
                        <span>Alertas: {customer.alerts.slice(0, 2).join(' | ')}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
                    <Button asChild size="sm" className="h-8 rounded-lg border-0 px-3 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
                      <Link href={`/sales/orders/new?customer=${customer.id}`}>
                        <ShoppingBag className="mr-1 h-3.5 w-3.5" />
                        Pedido
                      </Link>
                    </Button>

                    <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs">
                      <Link href={`/sales/quotes/new?customer=${customer.id}`}>
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        Orcamento
                      </Link>
                    </Button>

                    <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs">
                      <Link href={`/sales/visits?customer=${customer.id}`}>
                        <CalendarDays className="mr-1 h-3.5 w-3.5" />
                        Visita
                      </Link>
                    </Button>

                    {whatsappLink ? (
                      <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs">
                        <a href={whatsappLink} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-1 h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs" disabled>
                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                        WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card p-3">
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs" disabled={pagination.page <= 1}>
              <Link href={buildPageHref(Math.max(1, pagination.page - 1))} aria-disabled={pagination.page <= 1}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Anterior
              </Link>
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              Pagina {pagination.page} de {pagination.totalPages}
            </span>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs" disabled={pagination.page >= pagination.totalPages}>
              <Link href={buildPageHref(Math.min(pagination.totalPages, pagination.page + 1))} aria-disabled={pagination.page >= pagination.totalPages}>
                Proxima
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}













