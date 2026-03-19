'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, CalendarPlus, CheckCircle2, FileText, Loader2, ShoppingBag } from 'lucide-react'
import { createRepresentativeVisitAction } from '@/app/sales/actions'
import { SalesEmptyState, SalesMetricCard } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { RepresentativeVisit, Store } from '@/lib/types'

type CustomerRow = Store

const outcomeLabels: Record<RepresentativeVisit['outcome'], string> = {
  planned: 'Planejada',
  completed: 'Concluida',
  follow_up: 'Follow-up',
  converted_quote: 'Gerou orcamento',
  converted_order: 'Gerou pedido',
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
  const metrics = useMemo(() => ({
    planned: visits.filter((visit) => visit.outcome === 'planned').length,
    completed: visits.filter((visit) => visit.outcome === 'completed').length,
    quote: visits.filter((visit) => visit.outcome === 'converted_quote').length,
    order: visits.filter((visit) => visit.outcome === 'converted_order').length,
  }), [visits])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetricCard icon={CalendarClock} label="Visitas registradas" value={visits.length} helper="Linha do tempo comercial da carteira." tone="blue" />
        <SalesMetricCard icon={CheckCircle2} label="Concluidas" value={metrics.completed} helper="Atendimentos finalizados com registro." tone="emerald" />
        <SalesMetricCard icon={FileText} label="Geraram orcamento" value={metrics.quote} helper="Sinaliza proposta criada durante a visita." tone="amber" />
        <SalesMetricCard icon={ShoppingBag} label="Geraram pedido" value={metrics.order} helper="Conversao direta durante o atendimento." tone="slate" />
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Nova visita
            </Button>
          </DialogTrigger>

          <DialogContent className="rounded-[32px] border border-slate-200 bg-white sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar visita comercial</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Cliente</Label>
                <Select value={customerId} onValueChange={(value) => setCustomerId(value || '')}>
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                    <SelectValue placeholder="Selecione um cliente da carteira" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCustomers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.customer_code ? `${customer.customer_code} - ` : ''}
                        {customer.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data da visita</Label>
                <Input type="datetime-local" value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} className="h-11 rounded-2xl border-slate-200" />
              </div>

              <div className="space-y-2">
                <Label>Resultado</Label>
                <Select value={outcome} onValueChange={(value) => setOutcome((value || 'planned') as typeof outcome)}>
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200">
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

              <div className="space-y-2 md:col-span-2">
                <Label>Resumo da conversa</Label>
                <Input value={resultSummary} onChange={(event) => setResultSummary(event.target.value)} className="h-11 rounded-2xl border-slate-200" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Proximo passo</Label>
                <Input value={nextStep} onChange={(event) => setNextStep(event.target.value)} className="h-11 rounded-2xl border-slate-200" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Observacoes</Label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[120px] rounded-2xl border-slate-200" />
              </div>
            </div>

            <Button
              className="mt-2 h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800"
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
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar visita'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {visits.length === 0 ? (
        <SalesEmptyState
          title="Nenhuma visita registrada"
          description="Comece registrando visitas para manter historico, follow-up e conversao ligados ao cliente certo."
          action={
            <Button onClick={() => setOpen(true)} className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              Registrar primeira visita
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {visits.map((visit) => (
            <Card key={visit.id} className="rounded-[32px] border border-slate-200 bg-white/95 shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {outcomeLabels[visit.outcome]}
                      </span>
                      <span className="text-xs text-slate-400">{new Date(visit.visited_at).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{visit.store?.company_name || 'Cliente'}</p>
                    {visit.result_summary ? <p className="mt-1 text-sm leading-6 text-slate-600">{visit.result_summary}</p> : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Proximo passo</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{visit.next_step || 'Nao informado'}</p>
                  </div>
                </div>

                {visit.notes ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
                    {visit.notes}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
