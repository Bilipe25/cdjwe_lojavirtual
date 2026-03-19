'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
    <div className="space-y-5">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, CNPJ ou codigo" className="rounded-2xl border-slate-200 pl-10" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((customer) => (
          <Card key={customer.id} className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{customer.customer_code || 'Cliente'}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">{customer.company_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{customer.cnpj}</p>
                </div>
                {customer.city && <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">{customer.city}{customer.state ? ` - ${customer.state}` : ''}</Badge>}
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <p><span className="font-medium text-slate-950">Tabela:</span> {customer.assigned_price_tables?.[0]?.name || 'Padrao do sistema'}</p>
                <p><span className="font-medium text-slate-950">Endereco principal:</span> {customer.addresses?.find((address) => address.is_main)?.title || customer.addresses?.[0]?.title || 'Nao informado'}</p>
                {customer.last_order && <p><span className="font-medium text-slate-950">Ultimo pedido:</span> {customer.last_order.order_number} - {formatCurrency(customer.last_order.total)}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
                  <Link href={`/sales/orders/new?customer=${customer.id}`}>Novo pedido</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                  <Link href={`/sales/quotes/new?customer=${customer.id}`}>Novo orcamento</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
