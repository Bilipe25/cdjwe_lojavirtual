'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, ShoppingBag, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import type { PriceTable, Store, StoreAddress } from '@/lib/types'

type CustomerRow = Store & {
  addresses?: StoreAddress[]
  assigned_price_tables?: PriceTable[]
  last_order?: { order_number: string; created_at: string; total: number; status: string } | null
}

type CustomersPagination = {
  total: number
  page: number
  totalPages: number
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export function RepresentativeCustomersPage({
  customers,
  pagination,
  initialQuery = '',
}: {
  customers: CustomerRow[]
  pagination: CustomersPagination
  initialQuery?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(initialQuery)
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    setSearch(initialQuery)
  }, [initialQuery])

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
  const buildPageHref = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (queryFromUrl) {
      params.set('q', queryFromUrl)
    } else {
      params.delete('q')
    }
    params.set('page', String(nextPage))
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, CNPJ ou código"
            className="h-10 rounded-xl border-border pl-10 text-sm"
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {pagination.total} cliente(s)
        </span>
      </div>

      {customers.length === 0 ? (
        <SalesEmptyState
          title="Nenhum cliente encontrado"
          description="Ajuste a busca por nome, CNPJ ou código."
        />
      ) : (
        <>
          <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
            {customers.map((customer) => {
              const tableName = customer.assigned_price_tables?.[0]?.name
              const lastOrder = customer.last_order

              return (
                <div key={customer.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{customer.company_name}</span>
                      {customer.customer_code && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {customer.customer_code}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{customer.trade_name || customer.cnpj}</span>
                      {customer.city && <span>{customer.city}{customer.state ? ` - ${customer.state}` : ''}</span>}
                      {tableName && <span>Tab: {tableName}</span>}
                      {lastOrder && <span>Últ: {lastOrder.order_number} · {formatCurrency(lastOrder.total)}</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button asChild size="sm" className="h-8 rounded-lg border-0 px-3 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
                      <Link href={`/sales/orders/new?customer=${customer.id}`}>
                        <ShoppingBag className="mr-1 h-3.5 w-3.5" />
                        Pedido
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs">
                      <Link href={`/sales/quotes/new?customer=${customer.id}`}>
                        <FileText className="mr-1 h-3.5 w-3.5" />
                        Orçam.
                      </Link>
                    </Button>
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
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs" disabled={pagination.page >= pagination.totalPages}>
              <Link href={buildPageHref(Math.min(pagination.totalPages, pagination.page + 1))} aria-disabled={pagination.page >= pagination.totalPages}>
                Próxima
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
