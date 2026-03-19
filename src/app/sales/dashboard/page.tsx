import Link from 'next/link'
import { getRepresentativeDashboardData } from '@/app/sales/actions'
import { SalesKpiStrip, SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { DashboardGridClient } from './dashboard-grid-client'

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
  const recentOrders = data.recentOrders as RecentRepresentativeOrder[]
  const recentQuotes = data.recentQuotes as RecentRepresentativeQuote[]

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <SalesKpiStrip
        items={[
          { label: 'Clientes', value: data.metrics.customers },
          { label: 'Pedidos', value: data.metrics.orders },
          { label: 'Orçam.', value: data.metrics.quotes },
          { label: 'Visitas', value: data.metrics.visits },
        ]}
      />

      {/* Quick Access Grid — native app style */}
      <DashboardGridClient />

      {/* Recent orders + quotes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="rounded-2xl border border-border/40 bg-card">
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold font-heading text-foreground">Pedidos recentes</h2>
            <Link href="/sales/orders" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-border/30">
            {recentOrders.length === 0 ? (
              <div className="p-4">
                <SalesEmptyState
                  title="Nenhum pedido criado"
                  description="Os pedidos gerados aparecem aqui."
                  action={
                    <Button asChild size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
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
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{order.order_number}</p>
                    <p className="truncate text-xs text-muted-foreground">{order.store?.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold font-heading text-foreground">{formatCurrency(order.total)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{order.status}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent quotes */}
        <div className="rounded-2xl border border-border/40 bg-card">
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold font-heading text-foreground">Orçamentos recentes</h2>
            <Link href="/sales/quotes" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-border/30">
            {recentQuotes.length === 0 ? (
              <div className="p-4">
                <SalesEmptyState
                  title="Nenhum orçamento salvo"
                  description="Registre propostas de campo aqui."
                  action={
                    <Button asChild variant="outline" size="sm" className="h-8 rounded-xl border-border text-xs">
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
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{quote.quote_number}</p>
                    <p className="truncate text-xs text-muted-foreground">{quote.store?.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold font-heading text-foreground">{formatCurrency(quote.total)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{quote.status}</p>
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
