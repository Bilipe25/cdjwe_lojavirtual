'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  BarChart3,
  ClipboardCheck,
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

const dashboardActions = [
  { label: 'Venda', href: '/sales/orders/new', icon: ShoppingBag, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Orçamento', href: '/sales/quotes/new', icon: FileText, color: 'bg-bronze/10 hover:bg-bronze/20', iconColor: 'text-bronze' },
  { label: 'Visita', href: '/sales/visits', icon: MapPinned, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Clientes', href: '/sales/customers', icon: Users, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Pedidos', href: '/sales/orders', icon: ClipboardCheck, color: 'bg-bronze/10 hover:bg-bronze/20', iconColor: 'text-bronze' },
  { label: 'Orçamentos', href: '/sales/quotes', icon: BarChart3, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
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
      <DashboardGrid />

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

function DashboardGrid() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-3 gap-3 sm:grid-cols-3 lg:grid-cols-6"
    >
      {dashboardActions.map((action) => (
        <motion.div key={action.href} variants={item}>
          <Link href={action.href}>
            <motion.div
              whileTap={{ scale: 0.95 }}
              className={`relative flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl border border-border/40 transition-all duration-200 ${action.color} min-h-[100px] shadow-sm`}
            >
              <action.icon className={`h-7 w-7 ${action.iconColor}`} />
              <span className="text-xs font-semibold text-foreground text-center leading-tight">{action.label}</span>
            </motion.div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  )
}
