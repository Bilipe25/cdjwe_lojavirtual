import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardCheck, FileText, MapPinned, UserRound } from 'lucide-react'
import { getRepresentativeOrderDetail } from '@/app/sales/actions'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'
import { SalesInfoPill, SalesPanel, SalesPanelHeader, SalesStatusBadge } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { getOrderDeliverySummary, getOrderTypeLabel } from '@/lib/orders/order-type'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await getRepresentativeOrderDetail(id)

  if (!order) notFound()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SalesStatusBadge>Pedido presencial</SalesStatusBadge>
            <SalesStatusBadge tone={order.order_type === 'PRONTA_ENTREGA' ? 'success' : 'neutral'}>
              {getOrderTypeLabel(order.order_type)}
            </SalesStatusBadge>
            <SalesStatusBadge tone="navy">{order.status}</SalesStatusBadge>
          </div>
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground">{order.order_number}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Documento comercial criado no modo representante com snapshot de cliente, pagamento e negociacao.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="h-11 rounded-xl border-border bg-card">
          <Link href="/sales/orders">Voltar aos pedidos</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SalesInfoPill label="Cliente" value={order.store?.company_name || 'Nao informado'} />
        <SalesInfoPill label="Criado em" value={new Date(order.created_at).toLocaleString('pt-BR')} />
        <SalesInfoPill label="Tipo" value={getOrderTypeLabel(order.order_type)} />
        <SalesInfoPill label="Pagamento" value={order.payment_method_name || 'Pendente'} />
        <SalesInfoPill label="Total" value={formatCurrency(order.total)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SalesPanel>
            <SalesPanelHeader title="Contexto comercial" />
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserRound className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Cliente</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{order.store?.company_name}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ClipboardCheck className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Status</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{order.status}</p>
              </div>
              {order.shipping_address ? (
                <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 md:col-span-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPinned className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Entrega</p>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">{order.shipping_address}</p>
                </div>
              ) : order.order_type === 'PRONTA_ENTREGA' ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 md:col-span-2">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <MapPinned className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Pronta entrega</p>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-6 text-emerald-900">{getOrderDeliverySummary(order.order_type, order.shipping_address)}</p>
                </div>
              ) : null}
              {order.notes ? (
                <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 md:col-span-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Observacoes</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground">{order.notes}</p>
                </div>
              ) : null}
              {order.negotiation_reason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 md:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Motivo da negociacao</p>
                  <p className="mt-2 text-sm leading-6 text-amber-900">{order.negotiation_reason}</p>
                </div>
              ) : null}
            </div>
          </SalesPanel>

          <SalesPanel>
            <SalesPanelHeader title="Itens do pedido" />
            <div className="space-y-3 p-4">
              {order.items?.map((item) => (
                <div key={item.id} className="flex flex-col gap-4 rounded-xl border border-border/40 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.product_name}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.fabric_name} / {item.color_name}
                      {item.size_name ? ` / ${item.size_name}` : ''}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(item.subtotal)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.quantity} x {formatCurrency(item.unit_price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </SalesPanel>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <OrderPaymentSummaryCard order={order} className="rounded-2xl border border-border/40 bg-card shadow-sm" />
          <SalesPanel>
            <SalesPanelHeader title="Resumo financeiro" />
            <div className="space-y-3 p-4">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              {order.negotiation_discount_amount ? <div className="flex justify-between text-sm text-emerald-700"><span>Desconto negociado</span><span>- {formatCurrency(order.negotiation_discount_amount)}</span></div> : null}
              {order.negotiation_surcharge_amount ? <div className="flex justify-between text-sm text-amber-700"><span>Acrescimo negociado</span><span>+ {formatCurrency(order.negotiation_surcharge_amount)}</span></div> : null}
              <div className="rounded-xl gradient-navy px-4 py-4 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Total final</p>
                <p className="mt-2 text-3xl font-bold tracking-tight">{formatCurrency(order.total)}</p>
              </div>
            </div>
          </SalesPanel>
        </div>
      </div>
    </div>
  )
}
