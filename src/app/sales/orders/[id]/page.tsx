import { notFound } from 'next/navigation'
import { getRepresentativeOrderDetail } from '@/app/sales/actions'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await getRepresentativeOrderDetail(id)

  if (!order) notFound()

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader><CardTitle>Cliente e pedido</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <p><span className="font-medium text-slate-950">Numero:</span> {order.order_number}</p>
              <p><span className="font-medium text-slate-950">Status:</span> {order.status}</p>
              <p><span className="font-medium text-slate-950">Cliente:</span> {order.store?.company_name}</p>
              <p><span className="font-medium text-slate-950">Criado em:</span> {new Date(order.created_at).toLocaleString('pt-BR')}</p>
              {order.shipping_address && <p className="md:col-span-2"><span className="font-medium text-slate-950">Entrega:</span> {order.shipping_address}</p>}
              {order.notes && <p className="md:col-span-2"><span className="font-medium text-slate-950">Observacoes:</span> {order.notes}</p>}
              {order.negotiation_reason && <p className="md:col-span-2"><span className="font-medium text-slate-950">Negociacao:</span> {order.negotiation_reason}</p>}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {order.items?.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-950">{item.product_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.fabric_name} / {item.color_name}{item.size_name ? ` / ${item.size_name}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-950">{formatCurrency(item.subtotal)}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.quantity} x {formatCurrency(item.unit_price)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <OrderPaymentSummaryCard order={order} className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm" />
          <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              {order.negotiation_discount_amount ? <div className="flex justify-between text-sm text-emerald-700"><span>Desconto negociado</span><span>- {formatCurrency(order.negotiation_discount_amount)}</span></div> : null}
              {order.negotiation_surcharge_amount ? <div className="flex justify-between text-sm text-amber-700"><span>Acrescimo negociado</span><span>+ {formatCurrency(order.negotiation_surcharge_amount)}</span></div> : null}
              <div className="flex justify-between text-lg font-semibold text-slate-950"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
