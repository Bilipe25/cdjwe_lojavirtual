'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, MoreHorizontal, Search } from 'lucide-react'
import {
  cancelRepresentativeQuoteAction,
  convertRepresentativeQuoteToOrderAction,
  deleteRepresentativeQuoteAction,
  duplicateRepresentativeQuoteAction,
  updateRepresentativeQuoteStatusAction,
} from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { SalesQuote, SalesQuoteStatus } from '@/lib/types'

type QuotesPagination = {
  total: number
  page: number
  totalPages: number
}

type QuoteIndicators = {
  totalQuotes: number
  totalValue: number
  convertedQuotes: number
  conversionRate: number
  avgAgingDays: number
}

type QuotePipeline = {
  status: SalesQuoteStatus
  count: number
  totalValue: number
}

type QuoteAging = {
  bucket: '0_3' | '4_7' | '8_14' | '15_plus'
  label: string
  count: number
}

type QuoteAction = 'convert' | 'cancel' | 'duplicate' | 'delete'

const statusLabel: Record<SalesQuoteStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  converted: 'Convertido',
  cancelled: 'Cancelado',
}

function getStatusFilterLabel(value: SalesQuoteStatus | 'all') {
  if (value === 'all') return 'Todos os status'
  return statusLabel[value]
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function calculateAgingDays(createdAt: string) {
  const diff = Date.now() - new Date(createdAt).getTime()
  if (!Number.isFinite(diff) || diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getSlaTone(days: number) {
  if (days > 7) return 'text-destructive'
  if (days > 3) return 'text-amber-600'
  return 'text-emerald-600'
}

export function RepresentativeQuotesPage({
  quotes,
  pagination,
  indicators,
  pipeline,
  aging,
  initialQuery = '',
  initialStatus = null,
}: {
  quotes: SalesQuote[]
  pagination: QuotesPagination
  indicators: QuoteIndicators
  pipeline: QuotePipeline[]
  aging: QuoteAging[]
  initialQuery?: string
  initialStatus?: SalesQuoteStatus | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(initialQuery)
  const [status, setStatus] = useState<SalesQuoteStatus | 'all'>(initialStatus || 'all')
  const [pending, setPending] = useState<{ quoteId: string; action: QuoteAction } | null>(null)
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{ quoteId: string; status: SalesQuoteStatus } | null>(null)
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    setSearch(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setStatus(initialStatus || 'all')
  }, [initialStatus])

  useEffect(() => {
    const nextQuery = deferredSearch.trim()
    const currentQuery = (searchParams.get('q') || '').trim()
    if (nextQuery === currentQuery) return

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (nextQuery) {
        params.set('q', nextQuery)
      } else {
        params.delete('q')
      }
      params.set('page', '1')
      const queryString = params.toString()
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    }, 350)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [deferredSearch, pathname, router, searchParams])

  const queryFromUrl = (searchParams.get('q') || '').trim()
  const statusFromUrl = (searchParams.get('status') || '').trim()

  const setStatusFilter = (nextStatus: SalesQuoteStatus | 'all') => {
    setStatus(nextStatus)
    const params = new URLSearchParams(searchParams.toString())
    if (nextStatus === 'all') {
      params.delete('status')
    } else {
      params.set('status', nextStatus)
    }
    params.set('page', '1')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  const buildPageHref = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (queryFromUrl) {
      params.set('q', queryFromUrl)
    } else {
      params.delete('q')
    }

    if (statusFromUrl) {
      params.set('status', statusFromUrl)
    } else {
      params.delete('status')
    }

    params.set('page', String(nextPage))
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const isBusy = (quoteId: string, action: QuoteAction) => pending?.quoteId === quoteId && pending.action === action
  const hasPendingAction = Boolean(pending) || Boolean(pendingStatusUpdate)

  const handleStatusUpdate = async (quoteId: string, targetStatus: SalesQuoteStatus) => {
    if (hasPendingAction) return
    if (targetStatus === 'converted') return

    setPendingStatusUpdate({ quoteId, status: targetStatus })
    try {
      const response = await updateRepresentativeQuoteStatusAction(quoteId, targetStatus)
      if (!('success' in response) || !response.success) {
        toast.error(response.error || 'Falha ao atualizar status do orcamento.')
        return
      }

      toast.success(`Status atualizado para ${statusLabel[targetStatus]}.`)
      router.refresh()
    } catch {
      toast.error('Falha inesperada ao atualizar status do orcamento.')
    } finally {
      setPendingStatusUpdate(null)
    }
  }

  const handleQuoteAction = async (action: QuoteAction, quote: SalesQuote) => {
    if (hasPendingAction) return

    if (action === 'cancel') {
      const confirmCancel = window.confirm(`Cancelar o orcamento ${quote.quote_number}?`)
      if (!confirmCancel) return
    }

    if (action === 'delete') {
      const confirmDelete = window.confirm(`Excluir o orcamento ${quote.quote_number}? Esta acao nao pode ser desfeita.`)
      if (!confirmDelete) return
    }

    setPending({ quoteId: quote.id, action })

    try {
      if (action === 'convert') {
        const response = await convertRepresentativeQuoteToOrderAction(quote.id)
        if (!response.success || !response.orderId) {
          toast.error(response.error || 'Falha ao converter orcamento.')
          return
        }

        toast.success(`Pedido ${response.orderNumber || ''} criado com sucesso.`)
        router.push(`/sales/orders/${response.orderId}`)
        router.refresh()
        return
      }

      if (action === 'cancel') {
        const response = await cancelRepresentativeQuoteAction(quote.id)
        if (!('success' in response) || !response.success) {
          toast.error(response.error || 'Falha ao cancelar orcamento.')
          return
        }

        toast.success('Orcamento cancelado com sucesso.')
        router.refresh()
        return
      }

      if (action === 'duplicate') {
        const response = await duplicateRepresentativeQuoteAction(quote.id)
        if (!response.success || !response.quoteId) {
          toast.error(response.error || 'Falha ao duplicar orcamento.')
          return
        }

        toast.success(`Orcamento ${response.quoteNumber || ''} duplicado com sucesso.`)
        router.push(`/sales/quotes/${response.quoteId}`)
        router.refresh()
        return
      }

      const response = await deleteRepresentativeQuoteAction(quote.id)
      if (!('success' in response) || !response.success) {
        toast.error(response.error || 'Falha ao excluir orcamento.')
        return
      }

      toast.success('Orcamento excluido com sucesso.')
      router.refresh()
    } catch {
      toast.error('Falha inesperada ao executar acao no orcamento.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Orcamentos</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{indicators.totalQuotes}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Valor em pipeline</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{formatCurrency(indicators.totalValue)}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversao</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{indicators.conversionRate.toFixed(1)}%</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{indicators.convertedQuotes} convertido(s)</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aging medio</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{indicators.avgAgingDays.toFixed(1)} dias</p>
          <p className="mt-0.5 text-xs text-muted-foreground">SLA sugerido: 7 dias</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/40 bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline por status</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {pipeline.map((stage) => (
              <button
                key={stage.status}
                type="button"
                onClick={() => setStatusFilter(stage.status)}
                className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <p className="text-xs font-semibold text-foreground">{statusLabel[stage.status]}</p>
                <p className="mt-1 text-sm font-bold text-foreground">{stage.count}</p>
                <p className="text-[11px] text-muted-foreground">{formatCurrency(stage.totalValue)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aging de oportunidades abertas</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {aging.map((bucket) => (
              <div key={bucket.bucket} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2">
                <p className="text-xs font-semibold text-foreground">{bucket.label}</p>
                <p className="mt-1 text-sm font-bold text-foreground">{bucket.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por numero ou empresa"
              className="h-10 rounded-xl border-border pl-10 text-sm"
            />
          </div>

          <Select value={status} onValueChange={(value) => setStatusFilter((value || 'all') as SalesQuoteStatus | 'all')}>
            <SelectTrigger className="h-10 w-full rounded-xl border-border text-sm sm:w-[180px]">
              <SelectValue placeholder="Status">{getStatusFilterLabel(status)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="converted">Convertido</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs font-medium text-muted-foreground">{pagination.total} orcamento(s)</span>
      </div>

      {quotes.length === 0 ? (
        <SalesEmptyState
          title="Nenhum orcamento encontrado"
          description="Ajuste os filtros ou crie um novo orcamento para continuar."
          action={
            <Button asChild size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
              <Link href="/sales/quotes/new">Criar orcamento</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
            {quotes.map((quote) => {
              const canConvert = quote.status !== 'converted' && quote.status !== 'cancelled'
              const canCancel = quote.status !== 'converted' && quote.status !== 'cancelled'
              const canDelete = quote.status !== 'converted'
              const agingDays = calculateAgingDays(quote.created_at)

              return (
                <div key={quote.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{quote.quote_number}</span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {statusLabel[quote.status]}
                      </span>
                      <span className={`text-[10px] font-semibold ${getSlaTone(agingDays)}`}>SLA {agingDays}d</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{quote.company_name_snapshot || quote.store?.company_name || 'Cliente sem nome'}</span>
                      <span>{new Date(quote.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>

                  <span className="shrink-0 text-sm font-bold font-heading text-foreground">{formatCurrency(quote.total)}</span>

                  <div className="flex shrink-0 items-center gap-2">
                    {canConvert && (
                      <Button
                        size="sm"
                        className="h-8 rounded-lg border-0 px-3 text-xs font-semibold gradient-bronze text-white hover:opacity-90"
                        disabled={hasPendingAction}
                        onClick={() => {
                          void handleQuoteAction('convert', quote)
                        }}
                      >
                        {isBusy(quote.id, 'convert') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Converter'}
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50"
                        disabled={hasPendingAction}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => {
                            router.push(`/sales/quotes/new?customer=${quote.store_id}&editQuote=${quote.id}`)
                          }}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void handleQuoteAction('duplicate', quote)
                          }}
                        >
                          {isBusy(quote.id, 'duplicate') ? 'Duplicando...' : 'Duplicar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            router.push(`/sales/quotes/${quote.id}`)
                          }}
                        >
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {quote.status !== 'draft' && (
                          <DropdownMenuItem onClick={() => { void handleStatusUpdate(quote.id, 'draft') }}>
                            Marcar como Rascunho
                          </DropdownMenuItem>
                        )}
                        {quote.status !== 'sent' && quote.status !== 'converted' && quote.status !== 'cancelled' && (
                          <DropdownMenuItem onClick={() => { void handleStatusUpdate(quote.id, 'sent') }}>
                            Marcar como Enviado
                          </DropdownMenuItem>
                        )}
                        {quote.status !== 'approved' && quote.status !== 'converted' && quote.status !== 'cancelled' && (
                          <DropdownMenuItem onClick={() => { void handleStatusUpdate(quote.id, 'approved') }}>
                            Marcar como Aprovado
                          </DropdownMenuItem>
                        )}
                        {(canCancel || canDelete) && <DropdownMenuSeparator />}
                        {canCancel && (
                          <DropdownMenuItem
                            onClick={() => {
                              void handleQuoteAction('cancel', quote)
                            }}
                          >
                            {isBusy(quote.id, 'cancel') ? 'Cancelando...' : 'Cancelar'}
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              void handleQuoteAction('delete', quote)
                            }}
                          >
                            {isBusy(quote.id, 'delete') ? 'Excluindo...' : 'Excluir'}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Link href={`/sales/quotes/${quote.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card p-3">
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs" disabled={pagination.page <= 1}>
              <Link href={buildPageHref(Math.max(1, pagination.page - 1))} aria-disabled={pagination.page <= 1}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Anterior
              </Link>
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              Pagina {pagination.page} de {pagination.totalPages}
            </span>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg border-border px-3 text-xs" disabled={pagination.page >= pagination.totalPages}>
              <Link href={buildPageHref(Math.min(pagination.totalPages, pagination.page + 1))} aria-disabled={pagination.page >= pagination.totalPages}>
                Proxima
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

