import Link from 'next/link'
import { ArrowRight, FileText, MapPinned, ShoppingBag, Users } from 'lucide-react'
import { getRepresentativeDashboardData } from '@/app/sales/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type RecentRepresentativeOrder = {
  id: string
  order_number: string
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
    { label: 'Novo orcamento', href: '/sales/quotes/new', icon: FileText },
    { label: 'Meus clientes', href: '/sales/customers', icon: Users },
    { label: 'Visitas', href: '/sales/visits', icon: MapPinned },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Clientes da carteira', value: data.metrics.customers },
          { label: 'Pedidos realizados', value: data.metrics.orders },
          { label: 'Orcamentos ativos', value: data.metrics.quotes },
          { label: 'Visitas registradas', value: data.metrics.visits },
        ].map((metric) => (
          <Card key={metric.label} className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardContent className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{metric.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-950">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardTitle>Atalhos da operacao</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-slate-950">{action.label}</p>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardTitle>Pedidos recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                Nenhum pedido criado ainda no modo representante.
              </div>
            ) : (
              (data.recentOrders as RecentRepresentativeOrder[]).map((order) => (
                <Link
                  key={order.id}
                  href={`/sales/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50/70"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{order.order_number}</p>
                    <p className="mt-1 text-xs text-slate-500">{order.store?.company_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{formatCurrency(order.total)}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">{order.status}</p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
