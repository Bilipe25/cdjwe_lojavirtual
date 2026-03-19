'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { convertRepresentativeQuoteToOrderAction } from '@/app/sales/actions'
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

  return (
    <div className="space-y-4">
      {quotes.map((quote) => (
        <Card key={quote.id} className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-slate-950">{quote.quote_number}</p>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                  {quote.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">{quote.company_name_snapshot || quote.store?.company_name}</p>
              <p className="text-xs text-slate-500">
                {new Date(quote.created_at).toLocaleDateString('pt-BR')} • {formatCurrency(quote.total)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                <Link href={`/sales/quotes/${quote.id}`}>Abrir</Link>
              </Button>

              {quote.status !== 'converted' && quote.status !== 'cancelled' && (
                <Button
                  className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800"
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
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
