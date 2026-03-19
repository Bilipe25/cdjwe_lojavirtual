import Link from 'next/link'
import {
  ArrowRight,
  FileText,
  MapPinned,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { getRepresentativeDashboardData } from '@/app/sales/actions'
import { SalesEmptyState, SalesInfoPill, SalesMetricCard } from '@/components/sales/sales-ui'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    {
      label: 'Novo pedido',
      description: 'Atendimento completo com cliente, itens, pagamento e negociacao.',
      href: '/sales/orders/new',
      icon: ShoppingBag,
    },
    {
      label: 'Novo orcamento',
      description: 'Guarde proposta, contexto comercial e converta depois em pedido.',
      href: '/sales/quotes/new',
      icon: FileText,
    },
    {
      label: 'Meus clientes',
      description: 'Carteira com tabela de preco, historico e atalhos de acao.',
      href: '/sales/customers',
      icon: Users,
    },
    {
      label: 'Visitas',
      description: 'Registre visitas, follow-ups e resultados da rotina em campo.',
      href: '/sales/visits',
      icon: MapPinned,
    },
  ]

  const recentOrders = data.recentOrders as RecentRepresentativeOrder[]
  const recentQuotes = data.recentQuotes as RecentRepresentativeQuote[]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fafc_52%,#eef4ff_100%)] shadow-sm">
          <CardContent className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Atendimento assistido
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Modo campo
              </span>
            </div>

            <div className="mt-4 max-w-3xl">
              <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Workspace comercial pensado para fechar rapido.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                Pedido, orcamento, carteira e visita ficam no mesmo fluxo para o representante operar com menos cliques e mais contexto.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <SalesInfoPill label="Carteira" value={`${data.metrics.customers} clientes`} />
              <SalesInfoPill label="Pedidos" value={`${data.metrics.orders} documentos`} />
              <SalesInfoPill label="Visitas" value={`${data.metrics.visits} registros`} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>Atalhos de hoje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">{action.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{action.description}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard icon={Users} label="Clientes da carteira" value={data.metrics.customers} helper="Base ativa para atendimento presencial." tone="blue" />
        <SalesMetricCard icon={ShoppingBag} label="Pedidos realizados" value={data.metrics.orders} helper="Pedidos originados no modo representante." tone="slate" />
        <SalesMetricCard icon={FileText} label="Orcamentos ativos" value={data.metrics.quotes} helper="Propostas salvas aguardando conversao." tone="amber" />
        <SalesMetricCard icon={MapPinned} label="Visitas registradas" value={data.metrics.visits} helper="Historico comercial para follow-up." tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle>Pedidos recentes</CardTitle>
            <Button asChild variant="ghost" className="rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-950">
              <Link href="/sales/orders">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentOrders.length === 0 ? (
              <SalesEmptyState
                title="Nenhum pedido criado ainda"
                description="Os pedidos gerados pelo representante passam a aparecer aqui com leitura rï¿½pida de cliente, total e status."
                action={
                  <Button asChild className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
                    <Link href="/sales/orders/new">Criar pedido</Link>
                  </Button>
                }
              />
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/sales/orders/${order.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3.5 transition hover:border-slate-300 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{order.order_number}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{order.store?.company_name}</p>
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

        <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle>Orcamentos recentes</CardTitle>
            <Button asChild variant="ghost" className="rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-950">
              <Link href="/sales/quotes">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentQuotes.length === 0 ? (
              <SalesEmptyState
                title="Nenhum orcamento salvo"
                description="Use o fluxo de orcamento para registrar propostas de campo antes da confirmacao do pedido."
                action={
                  <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                    <Link href="/sales/quotes/new">Criar orcamento</Link>
                  </Button>
                }
              />
            ) : (
              recentQuotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/sales/quotes/${quote.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3.5 transition hover:border-slate-300 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{quote.quote_number}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{quote.store?.company_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-950">{formatCurrency(quote.total)}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">{quote.status}</p>
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
