'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ShoppingBag, FileText, MapPinned } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import type { PriceTable, Store, StoreAddress } from '@/lib/types'

type CustomerRow = Store & {
  addresses?: StoreAddress[]
  assigned_price_tables?: PriceTable[]
  last_order?: { order_number: string; created_at: string; total: number; status: string } | null
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export function RepresentativeCustomersPage({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((customer) =>
      customer.company_name.toLowerCase().includes(term) ||
      customer.cnpj.toLowerCase().includes(term) ||
      customer.customer_code?.toLowerCase().includes(term)
    )
  }, [customers, search])

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, CNPJ ou código"
            className="h-10 rounded-xl border-slate-200 pl-10 text-sm"
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-500">
          {filtered.length} cliente(s)
        </span>
      </div>

      {/* Customer list */}
      {filtered.length === 0 ? (
        <SalesEmptyState
          title="Nenhum cliente encontrado"
          description="Ajuste a busca por nome, CNPJ ou código."
        />
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {filtered.map((customer) => {
            const tableName = customer.assigned_price_tables?.[0]?.name
            const lastOrder = customer.last_order

            return (
              <div key={customer.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Left — customer info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-950">{customer.company_name}</span>
                    {customer.customer_code && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {customer.customer_code}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>{customer.trade_name || customer.cnpj}</span>
                    {customer.city && (
                      <span>{customer.city}{customer.state ? ` - ${customer.state}` : ''}</span>
                    )}
                    {tableName && <span>Tabela: {tableName}</span>}
                    {lastOrder && <span>Últ. pedido: {lastOrder.order_number} · {formatCurrency(lastOrder.total)}</span>}
                  </div>
                </div>

                {/* Right — actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button asChild size="sm" className="h-8 rounded-lg border-0 bg-slate-950 px-3 text-xs text-white hover:bg-slate-800">
                    <Link href={`/sales/orders/new?customer=${customer.id}`}>
                      <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
                      Pedido
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 px-3 text-xs">
                    <Link href={`/sales/quotes/new?customer=${customer.id}`}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Orçam.
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-950">
                    <Link href="/sales/visits">
                      <MapPinned className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
