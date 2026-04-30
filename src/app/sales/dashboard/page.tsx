import Link from 'next/link'
import { getRepresentativeDashboardData } from '@/app/sales/actions'
import {
  SalesEmptyState,
  SalesKpiStrip,
  SalesPanel,
  SalesPanelHeader,
  SalesRecordLink,
  SalesStatusBadge,
} from '@/components/sales/sales-ui'
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
        <SalesPanel>
          <SalesPanelHeader
            title="Pedidos recentes"
            action={
              <Link href="/sales/orders" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                Ver todos
              </Link>
            }
          />
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
                <SalesRecordLink
                  key={order.id}
                  href={`/sales/orders/${order.id}`}
                  title={order.order_number}
                  subtitle={order.store?.company_name || 'Cliente nao informado'}
                  amount={formatCurrency(order.total)}
                  badges={<SalesStatusBadge>{order.status}</SalesStatusBadge>}
                />
              ))
            )}
          </div>
        </SalesPanel>

        <SalesPanel>
          <SalesPanelHeader
            title="Orçamentos recentes"
            action={
              <Link href="/sales/quotes" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                Ver todos
              </Link>
            }
          />
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
                <SalesRecordLink
                  key={quote.id}
                  href={`/sales/quotes/${quote.id}`}
                  title={quote.quote_number}
                  subtitle={quote.store?.company_name || 'Cliente nao informado'}
                  amount={formatCurrency(quote.total)}
                  badges={<SalesStatusBadge>{quote.status}</SalesStatusBadge>}
                />
              ))
            )}
          </div>
        </SalesPanel>
      </div>
    </div>
  )
}
