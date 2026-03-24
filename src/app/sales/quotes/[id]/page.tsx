import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, FileText, MapPinned, Scale, UserRound, Wallet } from 'lucide-react'
import { getRepresentativeQuoteTimeline } from '@/app/sales/actions'
import { SalesInfoPill } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function getSlaTone(isOverdue: boolean, agingDays: number) {
  if (isOverdue) return 'text-red-700 bg-red-50 border-red-200'
  if (agingDays > 3) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-emerald-700 bg-emerald-50 border-emerald-200'
}

export default async function SalesQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const timelineData = await getRepresentativeQuoteTimeline(id)

  if (!timelineData?.quote) notFound()

  const { quote, sla, events, warning } = timelineData

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Orcamento presencial
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {quote.status}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getSlaTone(sla.isOverdue, sla.agingDays)}`}>
              SLA {sla.agingDays}d / {sla.slaDays}d
            </span>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-slate-950">{quote.quote_number}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Proposta comercial salva pelo representante com snapshot de cliente, pagamento e negociacao.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
          <Link href="/sales/quotes">Voltar aos orcamentos</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SalesInfoPill label="Cliente" value={quote.company_name_snapshot || quote.store?.company_name || 'Nao informado'} />
        <SalesInfoPill label="Tabela" value={quote.price_table_name_snapshot || 'Padrao'} />
        <SalesInfoPill label="Pagamento" value={quote.payment_method_name || 'Pendente'} />
        <SalesInfoPill label="Total" value={formatCurrency(quote.total)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle>Contexto do orcamento</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <UserRound className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Cliente</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950">{quote.company_name_snapshot || quote.store?.company_name}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Scale className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Status</p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950">{quote.status}</p>
              </div>
              {quote.shipping_address ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 md:col-span-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPinned className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Entrega</p>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{quote.shipping_address}</p>
                </div>
              ) : null}
              {quote.notes ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 md:col-span-2">
                  <div className="flex items-center gap-2 text-slate-500">
                    <FileText className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Observacoes</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{quote.notes}</p>
                </div>
              ) : null}
              {quote.negotiation_reason ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 md:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Motivo da negociacao</p>
                  <p className="mt-2 text-sm leading-6 text-amber-900">{quote.negotiation_reason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle>Itens do orcamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.items?.map((item) => (
                <div key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{item.product_name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {item.fabric_name} / {item.color_name}
                      {item.size_name ? ` / ${item.size_name}` : ''}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-semibold text-slate-950">{formatCurrency(item.subtotal)}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.quantity} x {formatCurrency(item.unit_price)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {warning && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{warning}</p>
              )}
              {events.length === 0 ? (
                <p className="text-xs text-slate-500">Sem eventos adicionais para este orcamento.</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Activity className="h-4 w-4" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">{event.label}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(event.timestamp).toLocaleString('pt-BR')}</p>
                    {event.details ? <p className="mt-2 text-xs text-slate-700">{event.details}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle>Resumo financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
              {quote.negotiation_discount_amount ? <div className="flex justify-between text-sm text-emerald-700"><span>Desconto negociado</span><span>- {formatCurrency(quote.negotiation_discount_amount)}</span></div> : null}
              {quote.negotiation_surcharge_amount ? <div className="flex justify-between text-sm text-amber-700"><span>Acrescimo negociado</span><span>+ {formatCurrency(quote.negotiation_surcharge_amount)}</span></div> : null}
              <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
                <div className="flex items-center gap-2 text-slate-300">
                  <Wallet className="h-4 w-4" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Total do orcamento</p>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight">{formatCurrency(quote.total)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
