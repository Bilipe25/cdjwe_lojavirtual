'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, Loader2 } from 'lucide-react'
import { convertRepresentativeQuoteToOrderAction } from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import type { SalesQuote } from '@/lib/types'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export function RepresentativeQuotesPage({ quotes }: { quotes: SalesQuote[] }) {
  const router = useRouter()
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null)

  const handleConvertQuote = async (quoteId: string) => {
    if (pendingQuoteId) return

    setPendingQuoteId(quoteId)
    try {
      const response = await convertRepresentativeQuoteToOrderAction(quoteId)
      if (!response.success || !response.orderId) {
        toast.error(response.error || 'Falha ao converter orçamento.')
        return
      }

      toast.success(`Pedido ${response.orderNumber || ''} criado com sucesso.`)
      router.push(`/sales/orders/${response.orderId}`)
      router.refresh()
    } catch {
      toast.error('Falha inesperada ao converter orçamento.')
    } finally {
      setPendingQuoteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <span className="text-xs font-medium text-muted-foreground">{quotes.length} orçamento(s)</span>

      {quotes.length === 0 ? (
        <SalesEmptyState
          title="Nenhum orçamento salvo"
          description="Salve propostas durante a visita e converta em pedido depois."
          action={
            <Button asChild size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
              <Link href="/sales/quotes/new">Criar orçamento</Link>
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
          {quotes.map((quote) => {
            const convertingThisQuote = pendingQuoteId === quote.id
            const isLocked = Boolean(pendingQuoteId)

            return (
              <div key={quote.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{quote.quote_number}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {quote.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{quote.company_name_snapshot || quote.store?.company_name}</span>
                    <span>{new Date(quote.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                <span className="shrink-0 text-sm font-bold font-heading text-foreground">{formatCurrency(quote.total)}</span>

                <div className="flex shrink-0 items-center gap-1.5">
                  {quote.status !== 'converted' && quote.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      className="h-8 rounded-lg border-0 px-3 text-xs font-semibold gradient-bronze text-white hover:opacity-90"
                      disabled={isLocked}
                      onClick={() => {
                        void handleConvertQuote(quote.id)
                      }}
                    >
                      {convertingThisQuote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Converter'}
                    </Button>
                  )}
                  <Link href={`/sales/quotes/${quote.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
