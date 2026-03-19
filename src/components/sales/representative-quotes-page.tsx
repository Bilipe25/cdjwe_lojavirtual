'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { convertRepresentativeQuoteToOrderAction } from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import type { SalesQuote } from '@/lib/types'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export function RepresentativeQuotesPage({ quotes }: { quotes: SalesQuote[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <span className="text-xs font-medium text-slate-500">{quotes.length} orçamento(s)</span>

      {quotes.length === 0 ? (
        <SalesEmptyState
          title="Nenhum orçamento salvo"
          description="Salve propostas durante a visita e converta em pedido depois."
          action={
            <Button asChild size="sm" className="h-8 rounded-xl border-0 bg-slate-950 text-xs text-white hover:bg-slate-800">
              <Link href="/sales/quotes/new">Criar orçamento</Link>
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {quotes.map((quote) => (
            <div key={quote.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-950">{quote.quote_number}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    {quote.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span>{quote.company_name_snapshot || quote.store?.company_name}</span>
                  <span>{new Date(quote.created_at).toLocaleDateString('pt-BR')}</span>
                  <span>{quote.payment_method_name || 'Pgto pendente'}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-bold text-slate-950">{formatCurrency(quote.total)}</span>
                <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 px-3 text-xs">
                  <Link href={`/sales/quotes/${quote.id}`}>Abrir</Link>
                </Button>
                {quote.status !== 'converted' && quote.status !== 'cancelled' && (
                  <Button
                    size="sm"
                    className="h-8 rounded-lg border-0 bg-slate-950 px-3 text-xs text-white hover:bg-slate-800"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const response = await convertRepresentativeQuoteToOrderAction(quote.id)
                        if (!response.success) {
                          toast.error(response.error || 'Falha ao converter orçamento.')
                          return
                        }

                        toast.success(`Pedido ${response.orderNumber || ''} criado.`)
                        router.push(`/sales/orders/${response.orderId}`)
                        router.refresh()
                      })
                    }
                  >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Converter'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
