'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { createRepresentativeVisitAction } from '@/app/sales/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { RepresentativeVisit, Store } from '@/lib/types'

type CustomerRow = Store

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
    <div className="space-y-5">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              <CalendarPlus className="mr-2 h-4 w-4" />
              Nova visita
            </Button>
          </DialogTrigger>

          <DialogContent className="rounded-3xl border border-slate-200 bg-white sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar visita</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Cliente</Label>
                <Select value={customerId} onValueChange={(value) => setCustomerId(value || '')}>
                  <SelectTrigger className="rounded-2xl border-slate-200">
                    <SelectValue placeholder="Selecione" />
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
                <Input
                  type="datetime-local"
                  value={visitedAt}
                  onChange={(event) => setVisitedAt(event.target.value)}
                  className="rounded-2xl border-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label>Resultado</Label>
                <Select value={outcome} onValueChange={(value) => setOutcome((value || 'planned') as typeof outcome)}>
                  <SelectTrigger className="rounded-2xl border-slate-200">
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
                <Label>Resumo</Label>
                <Input value={resultSummary} onChange={(event) => setResultSummary(event.target.value)} className="rounded-2xl border-slate-200" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Proximo passo</Label>
                <Input value={nextStep} onChange={(event) => setNextStep(event.target.value)} className="rounded-2xl border-slate-200" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Observacoes</Label>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[120px] rounded-2xl border-slate-200" />
              </div>
            </div>

            <Button
              className="mt-2 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800"
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

      <div className="space-y-4">
        {visits.map((visit) => (
          <Card key={visit.id} className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{visit.store?.company_name || 'Cliente'}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(visit.visited_at).toLocaleString('pt-BR')}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {visit.outcome}
                </span>
              </div>
              {visit.result_summary && <p className="text-sm text-slate-700">{visit.result_summary}</p>}
              {visit.next_step && <p className="text-xs text-slate-500">Proximo passo: {visit.next_step}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
