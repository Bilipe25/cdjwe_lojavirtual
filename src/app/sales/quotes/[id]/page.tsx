import { notFound } from 'next/navigation'
import { getRepresentativeQuoteDetail } from '@/app/sales/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quote = await getRepresentativeQuoteDetail(id)

  if (!quote) notFound()

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800"><Link href="/sales/quotes">Voltar aos orcamentos</Link></Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader><CardTitle>Cabecalho comercial</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <p><span className="font-medium text-slate-950">Numero:</span> {quote.quote_number}</p>
              <p><span className="font-medium text-slate-950">Status:</span> {quote.status}</p>
              <p><span className="font-medium text-slate-950">Cliente:</span> {quote.company_name_snapshot || quote.store?.company_name}</p>
              <p><span className="font-medium text-slate-950">Tabela:</span> {quote.price_table_name_snapshot || 'Padrao'}</p>
              {quote.shipping_address && <p className="md:col-span-2"><span className="font-medium text-slate-950">Entrega:</span> {quote.shipping_address}</p>}
              {quote.notes && <p className="md:col-span-2"><span className="font-medium text-slate-950">Observacoes:</span> {quote.notes}</p>}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardHeader><CardTitle>Itens do orcamento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {quote.items?.map((item) => (
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

        <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
            {quote.negotiation_discount_amount ? <div className="flex justify-between text-sm text-emerald-700"><span>Desconto negociado</span><span>- {formatCurrency(quote.negotiation_discount_amount)}</span></div> : null}
            {quote.negotiation_surcharge_amount ? <div className="flex justify-between text-sm text-amber-700"><span>Acrescimo negociado</span><span>+ {formatCurrency(quote.negotiation_surcharge_amount)}</span></div> : null}
            <div className="flex justify-between text-sm"><span className="text-slate-500">Pagamento</span><span>{quote.payment_method_name || 'Nao definido'} {quote.payment_condition_name ? `/ ${quote.payment_condition_name}` : ''}</span></div>
            <div className="flex justify-between text-lg font-semibold text-slate-950"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
