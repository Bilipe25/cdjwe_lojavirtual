'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { createRepresentativeVisitAction } from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { RepresentativeVisit, Store } from '@/lib/types'

type CustomerRow = Store

const outcomeLabels: Record<RepresentativeVisit['outcome'], string> = {
  planned: 'Planejada',
  completed: 'Concluída',
  follow_up: 'Follow-up',
  converted_quote: 'Gerou orçamento',
  converted_order: 'Gerou pedido',
}

const outcomeDot: Record<RepresentativeVisit['outcome'], string> = {
  planned: 'bg-muted-foreground',
  completed: 'bg-emerald-500',
  follow_up: 'bg-amber-500',
  converted_quote: 'bg-primary',
  converted_order: 'bg-bronze',
}

export function RepresentativeVisitsPage({ customers, visits }: { customers: CustomerRow[]; visits: RepresentativeVisit[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [visitedAt, setVisitedAt] = useState('')
  const [outcome, setOutcome] = useState<'planned' | 'completed' | 'follow_up' | 'converted_quote' | 'converted_order'>('planned')
  const [resultSummary, setResultSummary] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => a.company_name.localeCompare(b.company_name, 'pt-BR')), [customers])

  return (
    <div className="space-y-4">
      {/* Header with button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{visits.length} visita(s)</span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              Nova visita
            </Button>
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
                      {sortedCustomers.find(c => c.id === customerId)?.company_name}
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
                <Select value={outcome} onValueChange={(value) => setOutcome((value || 'planned') as typeof outcome)}>
                  <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                    <SelectValue placeholder="Selecione">
                      {outcomeLabels[outcome]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planejada</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="converted_quote">Gerou orçamento</SelectItem>
                    <SelectItem value="converted_order">Gerou pedido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Resumo da conversa</Label>
                <Input value={resultSummary} onChange={(event) => setResultSummary(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Próximo passo</Label>
                <Input value={nextStep} onChange={(event) => setNextStep(event.target.value)} className="h-9 rounded-xl border-border text-sm" />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[80px] rounded-xl border-border text-sm" />
              </div>
            </div>

            <Button
              size="sm"
              className="mt-1 h-9 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const response = await createRepresentativeVisitAction({
                    storeId: customerId,
                    visitedAt: visitedAt || null,
                    outcome,
                    resultSummary,
                    nextStep,
                    notes,
                  })

                  if (!response.success) {
                    toast.error(response.error || 'Falha ao registrar visita.')
                    return
                  }

                  toast.success('Visita registrada com sucesso.')
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar visita'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Visits list */}
      {visits.length === 0 ? (
        <SalesEmptyState
          title="Nenhuma visita registrada"
          description="Registre visitas para manter histórico e follow-up."
          action={
            <Button onClick={() => setOpen(true)} size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
              Registrar visita
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
          {visits.map((visit) => (
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
                </div>

                {visit.next_step && (
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Próximo</p>
                    <p className="mt-0.5 text-xs font-medium text-foreground">{visit.next_step}</p>
                  </div>
                )}
              </div>

              {visit.notes && (
                <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {visit.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
