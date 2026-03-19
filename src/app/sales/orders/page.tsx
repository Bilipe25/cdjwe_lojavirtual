import Link from 'next/link'
import { ClipboardCheck, CircleDollarSign, ShoppingBag, TimerReset } from 'lucide-react'
import { getRepresentativeOrdersData } from '@/app/sales/actions'
import { SalesEmptyState, SalesMetricCard } from '@/components/sales/sales-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesOrdersPage() {
  const orders = await getRepresentativeOrdersData()
  const approvedOrders = orders.filter((order) => order.status === 'approved').length
  const pendingOrders = orders.filter((order) => order.status === 'pending').length
  const totalValue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard icon={ShoppingBag} label="Pedidos criados" value={orders.length} helper="Documentos emitidos pelo representante em campo." tone="blue" />
        <SalesMetricCard icon={ClipboardCheck} label="Aprovados" value={approvedOrders} helper="Pedidos ja confirmados no fluxo comercial." tone="emerald" />
        <SalesMetricCard icon={TimerReset} label="Pendentes" value={pendingOrders} helper="Pedidos aguardando proxima acao ou analise." tone="amber" />
        <SalesMetricCard icon={CircleDollarSign} label="Valor movimentado" value={formatCurrency(totalValue)} helper="Soma dos pedidos criados neste modo operacional." tone="slate" />
      </div>

      {orders.length === 0 ? (
        <SalesEmptyState
          title="Nenhum pedido criado ainda"
          description="Quando o representante registrar pedidos em nome dos clientes, eles passam a aparecer aqui com status e totais."
          action={
            <Button asChild className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/sales/orders/new">Criar pedido</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-950">{order.order_number}</p>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                      {order.status}
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-sm text-slate-600">{order.store?.company_name}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {new Date(order.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {order.payment_method_name || 'Pagamento pendente'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left sm:min-w-[180px] sm:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(order.total)}</p>
                  </div>
                  <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
                    <Link href={`/sales/orders/${order.id}`}>Abrir pedido</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
