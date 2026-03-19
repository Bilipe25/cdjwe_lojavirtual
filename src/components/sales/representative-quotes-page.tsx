'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, FileText, Loader2, Scale, Wallet } from 'lucide-react'
import { convertRepresentativeQuoteToOrderAction } from '@/app/sales/actions'
import { SalesEmptyState, SalesMetricCard } from '@/components/sales/sales-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { SalesQuote } from '@/lib/types'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export function RepresentativeQuotesPage({ quotes }: { quotes: SalesQuote[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const metrics = useMemo(() => ({
    draft: quotes.filter((quote) => quote.status === 'draft').length,
    converted: quotes.filter((quote) => quote.status === 'converted').length,
    totalValue: quotes.reduce((sum, quote) => sum + Number(quote.total || 0), 0),
  }), [quotes])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard icon={FileText} label="Orcamentos" value={quotes.length} helper="Propostas registradas no atendimento assistido." tone="blue" />
        <SalesMetricCard icon={Scale} label="Em negociacao" value={metrics.draft} helper="Orcamentos ainda em aberto para follow-up." tone="amber" />
        <SalesMetricCard icon={ArrowRightLeft} label="Convertidos" value={metrics.converted} helper="Documentos que viraram pedido." tone="emerald" />
        <SalesMetricCard icon={Wallet} label="Valor total" value={formatCurrency(metrics.totalValue)} helper="Potencial comercial acumulado dos orcamentos." tone="slate" />
      </div>

      {quotes.length === 0 ? (
        <SalesEmptyState
          title="Nenhum orcamento salvo"
          description="Salve propostas durante a visita para negociar depois com o cliente e converter em pedido no momento certo."
          action={
            <Button asChild className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/sales/quotes/new">Criar orcamento</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {quotes.map((quote) => (
            <Card key={quote.id} className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-950">{quote.quote_number}</p>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                      {quote.status}
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-sm text-slate-600">{quote.company_name_snapshot || quote.store?.company_name}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {new Date(quote.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                      {quote.payment_method_name || 'Pagamento pendente'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left sm:min-w-[180px] sm:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(quote.total)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
                      <Link href={`/sales/quotes/${quote.id}`}>Abrir</Link>
                    </Button>
                    {quote.status !== 'converted' && quote.status !== 'cancelled' && (
                      <Button
                        className="h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const response = await convertRepresentativeQuoteToOrderAction(quote.id)
                            if (!response.success) {
                              toast.error(response.error || 'Falha ao converter orcamento.')
                              return
                            }

                            toast.success(`Pedido ${response.orderNumber || ''} criado a partir do orcamento.`)
                            router.push(`/sales/orders/${response.orderId}`)
                            router.refresh()
                          })
                        }
                      >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Converter em pedido'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
