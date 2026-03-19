'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, MapPinned, Search, ShoppingBag, Tags } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SalesEmptyState, SalesMetricCard } from '@/components/sales/sales-ui'
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

  const metrics = useMemo(() => {
    const withTable = customers.filter((customer) => (customer.assigned_price_tables?.length || 0) > 0).length
    const withMainAddress = customers.filter((customer) => (customer.addresses?.length || 0) > 0).length
    const withLastOrder = customers.filter((customer) => customer.last_order).length
    return { withTable, withMainAddress, withLastOrder }
  }, [customers])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard icon={Building2} label="Clientes na carteira" value={customers.length} helper="Base ativa para atendimento, proposta e pedido." tone="blue" />
        <SalesMetricCard icon={Tags} label="Com tabela vinculada" value={metrics.withTable} helper="Clientes com regra comercial pronta para uso." tone="slate" />
        <SalesMetricCard icon={MapPinned} label="Com endereco ativo" value={metrics.withMainAddress} helper="Entrega mais rapida no atendimento assistido." tone="emerald" />
        <SalesMetricCard icon={ShoppingBag} label="Com historico recente" value={metrics.withLastOrder} helper="Ajuda a retomar negocia��es e reposicoes." tone="amber" />
      </div>

      <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, CNPJ ou codigo"
              className="h-12 rounded-2xl border-slate-200 pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {filtered.length} cliente(s)
            </span>
            <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
              <Link href="/sales/quotes/new">Novo orcamento</Link>
            </Button>
            <Button asChild className="h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/sales/orders/new">Novo pedido</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <SalesEmptyState
          title="Nenhum cliente encontrado"
          description="Ajuste a busca por nome, CNPJ ou codigo para localizar rapidamente um cliente da sua carteira."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((customer) => {
            const mainAddress = customer.addresses?.find((address) => address.is_main) || customer.addresses?.[0]
            return (
              <Card key={customer.id} className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {customer.customer_code || 'Cliente'}
                        </span>
                        {customer.city ? (
                          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
                            {customer.city}
                            {customer.state ? ` - ${customer.state}` : ''}
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold leading-tight text-slate-950">{customer.company_name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{customer.trade_name || customer.cnpj}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Tabela</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{customer.assigned_price_tables?.[0]?.name || 'Padrao'}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Endereco principal</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">{mainAddress?.title || 'Nao informado'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Ultimo pedido</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">
                        {customer.last_order ? `${customer.last_order.order_number} � ${formatCurrency(customer.last_order.total)}` : 'Sem historico recente'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild className="h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
                      <Link href={`/sales/orders/new?customer=${customer.id}`}>Novo pedido</Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
                      <Link href={`/sales/quotes/new?customer=${customer.id}`}>Novo orcamento</Link>
                    </Button>
                    <Button asChild variant="ghost" className="h-11 rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-950">
                      <Link href="/sales/visits">Registrar visita</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
