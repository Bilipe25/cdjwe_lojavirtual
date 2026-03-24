'use client'

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  Pencil,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import {
  createRepresentativeVisitAction,
  deleteRepresentativeVisitAction,
  updateRepresentativeVisitAction,
} from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { RepresentativeVisit, RepresentativeVisitOutcome, Store } from '@/lib/types'

type CustomerRow = Store

type VisitOutcome = RepresentativeVisitOutcome

type VisitsPagination = {
  total: number
  page: number
  totalPages: number
}

type VisitsAgenda = {
  overdue: number
  dueToday: number
  dueNext7Days: number
  convertedThisMonth: number
  completedLast7Days: number
}

const outcomeLabels: Record<RepresentativeVisit['outcome'], string> = {
  planned: 'Planejada',
  completed: 'Concluida',
  follow_up: 'Follow-up',
  converted_quote: 'Gerou orcamento',
  converted_order: 'Gerou pedido',
}

const outcomeDot: Record<RepresentativeVisit['outcome'], string> = {
  planned: 'bg-muted-foreground',
  completed: 'bg-emerald-500',
  follow_up: 'bg-amber-500',
  converted_quote: 'bg-primary',
  converted_order: 'bg-bronze',
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function toIsoDateFromLocalInput(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

export function RepresentativeVisitsPage({
  customers,
  visits,
  agenda,
  pagination,
  initialQuery = '',
  initialOutcome = null,
  initialCustomerId = null,
}: {
  customers: CustomerRow[]
  visits: RepresentativeVisit[]
  agenda: VisitsAgenda
  pagination: VisitsPagination
  initialQuery?: string
  initialOutcome?: RepresentativeVisitOutcome | null
  initialCustomerId?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(initialQuery)
  const [outcomeFilter, setOutcomeFilter] = useState<RepresentativeVisitOutcome | 'all'>(initialOutcome || 'all')
  const [customerFilter, setCustomerFilter] = useState(initialCustomerId || 'all')
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [visitedAt, setVisitedAt] = useState('')
  const [outcome, setOutcome] = useState<VisitOutcome>('planned')
  const [resultSummary, setResultSummary] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [notes, setNotes] = useState('')

  const [editingVisitId, setEditingVisitId] = useState<string | null>(null)
  const [editVisitedAt, setEditVisitedAt] = useState('')
  const [editOutcome, setEditOutcome] = useState<VisitOutcome>('planned')
  const [editResultSummary, setEditResultSummary] = useState('')
  const [editNextStep, setEditNextStep] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const deferredSearch = useDeferredValue(search)

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.company_name.localeCompare(b.company_name, 'pt-BR')),
    [customers]
  )

  useEffect(() => {
    setSearch(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setOutcomeFilter(initialOutcome || 'all')
  }, [initialOutcome])

  useEffect(() => {
    setCustomerFilter(initialCustomerId || 'all')
  }, [initialCustomerId])

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
  const outcomeFromUrl = (searchParams.get('outcome') || '').trim()
  const customerFromUrl = (searchParams.get('customer') || '').trim()

  const buildPageHref = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString())

    if (queryFromUrl) {
      params.set('q', queryFromUrl)
    } else {
      params.delete('q')
    }

    if (outcomeFromUrl) {
      params.set('outcome', outcomeFromUrl)
    } else {
      params.delete('outcome')
    }

    if (customerFromUrl) {
      params.set('customer', customerFromUrl)
    } else {
      params.delete('customer')
    }

    params.set('page', String(nextPage))
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  const setOutcomeUrlFilter = (value: RepresentativeVisitOutcome | 'all') => {
    setOutcomeFilter(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('outcome')
    } else {
      params.set('outcome', value)
    }
    params.set('page', '1')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  const setCustomerUrlFilter = (value: string) => {
    setCustomerFilter(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('customer')
    } else {
      params.set('customer', value)
    }
    params.set('page', '1')
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }

  const resetForm = () => {
    setCustomerId('')
    setVisitedAt('')
    setOutcome('planned')
    setResultSummary('')
    setNextStep('')
    setNotes('')
  }

  const resetEditForm = () => {
    setEditingVisitId(null)
    setEditVisitedAt('')
    setEditOutcome('planned')
    setEditResultSummary('')
    setEditNextStep('')
    setEditNotes('')
  }

  const handleDialogChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && !pending) {
      resetForm()
    }
  }

  const handleCreateVisit = () => {
    if (!customerId) {
      toast.error('Selecione um cliente para registrar a visita.')
      return
    }

    startTransition(async () => {
      const response = await createRepresentativeVisitAction({
        storeId: customerId,
        visitedAt: visitedAt ? toIsoDateFromLocalInput(visitedAt) : null,
        outcome,
        resultSummary: resultSummary.trim() || null,
        nextStep: nextStep.trim() || null,
        notes: notes.trim() || null,
      })

      if (!response.success) {
        toast.error(response.error || 'Falha ao registrar visita.')
        return
      }

      toast.success('Visita registrada com sucesso.')
      resetForm()
      setOpen(false)
      router.refresh()
    })
  }

  const openEditVisit = (visit: RepresentativeVisit) => {
    setEditingVisitId(visit.id)
    setEditVisitedAt(toDateTimeLocalValue(visit.visited_at))
    setEditOutcome(visit.outcome)
    setEditResultSummary(visit.result_summary || '')
    setEditNextStep(visit.next_step || '')
    setEditNotes(visit.notes || '')
  }

  const handleSaveVisitEdit = async () => {
    if (!editingVisitId || pendingUpdateId) return

    setPendingUpdateId(editingVisitId)
    try {
      const response = await updateRepresentativeVisitAction({
        id: editingVisitId,
        visitedAt: editVisitedAt ? toIsoDateFromLocalInput(editVisitedAt) : null,
        outcome: editOutcome,
        resultSummary: editResultSummary.trim() || null,
        nextStep: editNextStep.trim() || null,
        notes: editNotes.trim() || null,
      })

      if (!response.success) {
        toast.error(response.error || 'Falha ao atualizar visita.')
        return
      }

      toast.success('Visita atualizada com sucesso.')
      resetEditForm()
      router.refresh()
    } catch {
      toast.error('Falha inesperada ao atualizar visita.')
    } finally {
      setPendingUpdateId(null)
    }
  }

  const handleQuickOutcome = async (visit: RepresentativeVisit, targetOutcome: VisitOutcome) => {
    if (pendingUpdateId) return

    setPendingUpdateId(visit.id)
    try {
      const response = await updateRepresentativeVisitAction({
        id: visit.id,
        outcome: targetOutcome,
      })

      if (!response.success) {
        toast.error(response.error || 'Falha ao atualizar status da visita.')
        return
      }

      toast.success(`Visita marcada como ${outcomeLabels[targetOutcome].toLowerCase()}.`)
      if (editingVisitId === visit.id) {
        resetEditForm()
      }
      router.refresh()
    } catch {
      toast.error('Falha inesperada ao atualizar status da visita.')
    } finally {
      setPendingUpdateId(null)
    }
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (pendingDeleteId) return

    const confirmDelete = window.confirm('Excluir esta visita? Esta acao nao pode ser desfeita.')
    if (!confirmDelete) return

    setPendingDeleteId(visitId)
    try {
      const response = await deleteRepresentativeVisitAction(visitId)
      if (!response.success) {
        toast.error(response.error || 'Falha ao excluir visita.')
        return
      }

      if (editingVisitId === visitId) {
        resetEditForm()
      }
      toast.success('Visita excluida com sucesso.')
      router.refresh()
    } catch {
      toast.error('Falha inesperada ao excluir visita.')
    } finally {
      setPendingDeleteId(null)
    }
  }

  const isUpdatingVisit = (visitId: string) => pendingUpdateId === visitId

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Follow-up atrasado</p>
          <p className="mt-1 text-lg font-bold font-heading text-destructive sm:text-xl">{agenda.overdue}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Follow-up hoje</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{agenda.dueToday}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proximos 7 dias</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{agenda.dueNext7Days}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversoes no mes</p>
          <p className="mt-1 text-lg font-bold font-heading text-emerald-600 sm:text-xl">{agenda.convertedThisMonth}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Concluidas (7 dias)</p>
          <p className="mt-1 text-lg font-bold font-heading text-foreground sm:text-xl">{agenda.completedLast7Days}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por resumo, proximo passo ou notas"
              className="h-10 rounded-xl border-border pl-10 text-sm"
            />
          </div>

          <Select
            value={outcomeFilter}
            onValueChange={(value) => setOutcomeUrlFilter((value || 'all') as RepresentativeVisitOutcome | 'all')}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-border text-sm sm:w-[180px]">
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os resultados</SelectItem>
              <SelectItem value="planned">Planejada</SelectItem>
              <SelectItem value="completed">Concluida</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="converted_quote">Gerou orcamento</SelectItem>
              <SelectItem value="converted_order">Gerou pedido</SelectItem>
            </SelectContent>
          </Select>

          <Select value={customerFilter} onValueChange={(value) => setCustomerUrlFilter(value || 'all')}>
            <SelectTrigger className="h-10 w-full rounded-xl border-border text-sm sm:w-[220px]">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {sortedCustomers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">{pagination.total} visita(s)</span>

          <Dialog open={open} onOpenChange={handleDialogChange}>
            <DialogTrigger className="inline-flex h-8 items-center justify-center rounded-xl border-0 px-3 text-xs font-semibold gradient-bronze text-white transition-opacity hover:opacity-90">
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              Nova visita
            </DialogTrigger>

            <DialogContent className="rounded-2xl border-border bg-card sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading">Registrar visita</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Cliente</Label>
                  <Select value={customerId} onValueChange={(value) => setCustomerId(value || '')}>
                    <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                      <SelectValue placeholder="Selecione um cliente">
                        {sortedCustomers.find((customer) => customer.id === customerId)?.company_name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {sortedCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Data</Label>
                  <Input type="datetime-local" value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Resultado</Label>
                  <Select value={outcome} onValueChange={(value) => setOutcome((value || 'planned') as VisitOutcome)}>
                    <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                      <SelectValue placeholder="Selecione">{outcomeLabels[outcome]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planejada</SelectItem>
                      <SelectItem value="completed">Concluida</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="converted_quote">Gerou orcamento</SelectItem>
                      <SelectItem value="converted_order">Gerou pedido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Resumo da conversa</Label>
                  <Input value={resultSummary} onChange={(event) => setResultSummary(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Proximo passo</Label>
                  <Input value={nextStep} onChange={(event) => setNextStep(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Observacoes</Label>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[80px] rounded-xl border-border text-sm" />
                </div>
              </div>

              <Button
                size="sm"
                className="mt-1 h-9 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90"
                disabled={pending}
                onClick={handleCreateVisit}
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar visita'}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {visits.length === 0 ? (
        <SalesEmptyState
          title="Nenhuma visita encontrada"
          description="Ajuste os filtros ou registre uma nova visita."
          action={
            <Button onClick={() => setOpen(true)} size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
              Registrar visita
            </Button>
          }
        />
      ) : (
        <>
          <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
            {visits.map((visit) => {
              const isEditing = editingVisitId === visit.id
              const isBusy = isUpdatingVisit(visit.id)

              return (
                <div key={visit.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${outcomeDot[visit.outcome]}`} />
                        <span className="text-xs font-medium text-muted-foreground">{outcomeLabels[visit.outcome]}</span>
                        <span className="text-[11px] text-muted-foreground/70">{new Date(visit.visited_at).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-foreground">{visit.store?.company_name || 'Cliente'}</p>
                      {visit.result_summary && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{visit.result_summary}</p>}
                      {(visit.generated_quote_id || visit.generated_order_id) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {visit.generated_quote_id && <Link href={`/sales/quotes/${visit.generated_quote_id}`} className="underline-offset-2 hover:underline">Orcamento vinculado</Link>}
                          {visit.generated_order_id && <Link href={`/sales/orders/${visit.generated_order_id}`} className="underline-offset-2 hover:underline">Pedido vinculado</Link>}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-start gap-2">
                      {visit.next_step && (
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proximo</p>
                          <p className="mt-0.5 text-xs font-medium text-foreground">{visit.next_step}</p>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg border-border"
                        disabled={isBusy || Boolean(pendingDeleteId)}
                        onClick={() => {
                          if (isEditing) {
                            resetEditForm()
                          } else {
                            openEditVisit(visit)
                          }
                        }}
                      >
                        {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg border-border text-destructive hover:bg-destructive/10"
                        disabled={Boolean(pendingDeleteId) || isBusy}
                        onClick={() => {
                          void handleDeleteVisit(visit.id)
                        }}
                      >
                        {pendingDeleteId === visit.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg border-border px-2.5 text-[11px]"
                      disabled={isBusy}
                      onClick={() => {
                        void handleQuickOutcome(visit, visit.outcome === 'follow_up' ? 'planned' : 'follow_up')
                      }}
                    >
                      <Clock3 className="mr-1 h-3.5 w-3.5" />
                      {visit.outcome === 'follow_up' ? 'Mover para planejada' : 'Marcar follow-up'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg border-border px-2.5 text-[11px]"
                      disabled={isBusy || visit.outcome === 'completed'}
                      onClick={() => {
                        void handleQuickOutcome(visit, 'completed')
                      }}
                    >
                      <CalendarDays className="mr-1 h-3.5 w-3.5" />
                      Concluir visita
                    </Button>

                    {visit.generated_quote_id ? (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-border px-2.5 text-[11px]">
                        <Link href={`/sales/quotes/${visit.generated_quote_id}`}>
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          Abrir orcamento
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-border px-2.5 text-[11px]">
                        <Link href={`/sales/quotes/new?customer=${visit.store_id}&fromVisit=${visit.id}`}>
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          Gerar orcamento
                        </Link>
                      </Button>
                    )}

                    {visit.generated_order_id ? (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-border px-2.5 text-[11px]">
                        <Link href={`/sales/orders/${visit.generated_order_id}`}>
                          <ShoppingBag className="mr-1 h-3.5 w-3.5" />
                          Abrir pedido
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-border px-2.5 text-[11px]">
                        <Link href={`/sales/orders/new?customer=${visit.store_id}&fromVisit=${visit.id}`}>
                          <ShoppingBag className="mr-1 h-3.5 w-3.5" />
                          Gerar pedido
                        </Link>
                      </Button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="mt-3 grid gap-3 rounded-xl border border-border/40 bg-muted/20 p-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Data</Label>
                        <Input
                          type="datetime-local"
                          value={editVisitedAt}
                          onChange={(event) => setEditVisitedAt(event.target.value)}
                          className="h-9 rounded-xl border-border text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Resultado</Label>
                        <Select value={editOutcome} onValueChange={(value) => setEditOutcome((value || 'planned') as VisitOutcome)}>
                          <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planned">Planejada</SelectItem>
                            <SelectItem value="completed">Concluida</SelectItem>
                            <SelectItem value="follow_up">Follow-up</SelectItem>
                            <SelectItem value="converted_quote">Gerou orcamento</SelectItem>
                            <SelectItem value="converted_order">Gerou pedido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Resumo da conversa</Label>
                        <Input value={editResultSummary} onChange={(event) => setEditResultSummary(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Proximo passo</Label>
                        <Input value={editNextStep} onChange={(event) => setEditNextStep(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Observacoes</Label>
                        <Textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} className="min-h-[72px] rounded-xl border-border text-sm" />
                      </div>

                      <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg border-border px-3 text-xs"
                          onClick={resetEditForm}
                          disabled={isBusy}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 rounded-lg border-0 px-3 text-xs font-semibold gradient-bronze text-white hover:opacity-90"
                          onClick={() => {
                            void handleSaveVisitEdit()
                          }}
                          disabled={isBusy}
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar alteracoes'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {visit.notes && !isEditing && (
                    <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                      {visit.notes}
                    </p>
                  )}
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
