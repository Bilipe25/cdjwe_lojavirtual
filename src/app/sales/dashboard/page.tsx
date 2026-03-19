import Link from 'next/link'
import {
  FileText,
  MapPinned,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { getRepresentativeDashboardData } from '@/app/sales/actions'
import { SalesKpiStrip, SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'

type RecentRepresentativeOrder = {
  id: string
  order_number: string
  total: number
  status: string
  store?: {
    company_name?: string | null
  } | null
}

type RecentRepresentativeQuote = {
  id: string
  quote_number: string
  total: number
  status: string
  store?: {
    company_name?: string | null
  } | null
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesDashboardPage() {
  const data = await getRepresentativeDashboardData()

  const quickActions = [
    { label: 'Novo pedido', href: '/sales/orders/new', icon: ShoppingBag },
    { label: 'Novo orçamento', href: '/sales/quotes/new', icon: FileText },
    { label: 'Clientes', href: '/sales/customers', icon: Users },
    { label: 'Visitas', href: '/sales/visits', icon: MapPinned },
  ]

  const recentOrders = data.recentOrders as RecentRepresentativeOrder[]
  const recentQuotes = data.recentQuotes as RecentRepresentativeQuote[]

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <SalesKpiStrip
        items={[
          { label: 'Clientes', value: data.metrics.customers },
          { label: 'Pedidos', value: data.metrics.orders },
          { label: 'Orçamentos', value: data.metrics.quotes },
          { label: 'Visitas', value: data.metrics.visits },
        ]}
      />

      {/* Quick actions — compact button grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-500" />
              {action.label}
            </Link>
          )
        })}
      </div>

      {/* Recent orders + quotes — side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Pedidos recentes</h2>
            <Link href="/sales/orders" className="text-xs font-medium text-slate-500 hover:text-slate-950">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentOrders.length === 0 ? (
              <div className="p-4">
                <SalesEmptyState
                  title="Nenhum pedido criado"
                  description="Os pedidos gerados pelo representante aparecem aqui."
                  action={
                    <Button asChild size="sm" className="h-8 rounded-xl border-0 bg-slate-950 text-xs text-white hover:bg-slate-800">
                      <Link href="/sales/orders/new">Criar pedido</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/sales/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{order.order_number}</p>
                    <p className="truncate text-xs text-slate-500">{order.store?.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-950">{formatCurrency(order.total)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{order.status}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent quotes */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Orçamentos recentes</h2>
            <Link href="/sales/quotes" className="text-xs font-medium text-slate-500 hover:text-slate-950">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentQuotes.length === 0 ? (
              <div className="p-4">
                <SalesEmptyState
                  title="Nenhum orçamento salvo"
                  description="Use o fluxo de orçamento para registrar propostas de campo."
                  action={
                    <Button asChild variant="outline" size="sm" className="h-8 rounded-xl border-slate-200 bg-white text-xs">
                      <Link href="/sales/quotes/new">Criar orçamento</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              recentQuotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/sales/quotes/${quote.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{quote.quote_number}</p>
                    <p className="truncate text-xs text-slate-500">{quote.store?.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-950">{formatCurrency(quote.total)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{quote.status}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
