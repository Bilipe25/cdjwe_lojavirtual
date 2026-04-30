'use client'

import { useState, useMemo, useTransition } from 'react'
import { CalendarCheck2, CheckCircle, FolderOpen, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { approveReadyDeliveryClosing, reopenReadyDeliveryClosing } from '../actions'
import {
  formatDateBR,
  formatDateTime,
  formatMoney,
  getRelation,
  ReadyDeliveryStat,
  SectionCard,
  EmptyState,
  StatusBadge,
} from '../_components'

function getClosingStatusConfig(status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' } {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
    open: { label: 'Aberto', tone: 'neutral' },
    submitted: { label: 'Enviado', tone: 'info' },
    approved: { label: 'Aprovado', tone: 'success' },
    reopened: { label: 'Reaberto', tone: 'warning' },
    cancelled: { label: 'Cancelado', tone: 'danger' },
  }
  return map[status] || { label: status, tone: 'neutral' }
}

type ClosingRow = {
  id: string
  closing_number: string
  representative_id: string
  business_date: string
  route_label: string | null
  status: string
  orders_count: number
  items_count: number
  gross_amount: number
  received_amount: number
  submitted_at: string | null
  approved_at: string | null
  representative: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
}

export function ReadyDeliveryClosingsClient({ initialRows }: { initialRows: ClosingRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isPending, startTransition] = useTransition()

  const representatives = useMemo(() => {
    const map = new Map<string, string>()
    initialRows.forEach((row) => {
      const rep = getRelation(row.representative)
      if (rep) map.set(rep.id, rep.full_name || rep.email)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [initialRows])

  const filtered = useMemo(() => {
    let result = rows
    if (repFilter !== 'all') {
      result = result.filter((row) => getRelation(row.representative)?.id === repFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((row) => row.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((row) => {
        const rep = getRelation(row.representative)
        return (
          row.closing_number?.toLowerCase().includes(q) ||
          row.route_label?.toLowerCase().includes(q) ||
          rep?.full_name?.toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [rows, search, repFilter, statusFilter])

  const totalGross = filtered.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0)
  const submittedCount = filtered.filter((row) => row.status === 'submitted').length

  function handleApprove(closingId: string) {
    startTransition(async () => {
      const result = await approveReadyDeliveryClosing(closingId)
      if (result.success) {
        setRows((prev) => prev.map((row) => row.id === closingId ? { ...row, status: 'approved', approved_at: new Date().toISOString() } : row))
        toast.success('Fechamento aprovado com sucesso.')
      } else {
        toast.error(result.error || 'Não foi possível aprovar o fechamento.')
      }
    })
  }

  function handleReopen(closingId: string) {
    startTransition(async () => {
      const result = await reopenReadyDeliveryClosing(closingId)
      if (result.success) {
        setRows((prev) => prev.map((row) => row.id === closingId ? { ...row, status: 'reopened', approved_at: null } : row))
        toast.success('Fechamento reaberto.')
      } else {
        toast.error(result.error || 'Não foi possível reabrir o fechamento.')
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <ReadyDeliveryStat label="Fechamentos registrados" value={filtered.length} icon={CalendarCheck2} tone="neutral" />
        <ReadyDeliveryStat label="Valor fechado" value={formatMoney(totalGross)} tone="success" />
        <ReadyDeliveryStat
          label="Pendentes de aprovação"
          value={submittedCount}
          tone={submittedCount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar número, rota, representante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
        >
          <option value="all">Todos os representantes</option>
          {representatives.map((rep) => (
            <option key={rep.id} value={rep.id}>{rep.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
        >
          <option value="all">Todos os status</option>
          <option value="submitted">Enviados</option>
          <option value="approved">Aprovados</option>
          <option value="reopened">Reabertos</option>
          <option value="open">Abertos</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      <SectionCard
        title="Fechamentos"
        description={`Resumo diário enviado pelos representantes`}
        icon={CalendarCheck2}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Representante</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState icon={CalendarCheck2} message="Nenhum fechamento de pronta entrega encontrado." />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const representative = getRelation(row.representative)
                  const statusConfig = getClosingStatusConfig(row.status)
                  const canApprove = row.status === 'submitted' || row.status === 'reopened'
                  const canReopen = row.status === 'submitted' || row.status === 'approved'

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold tabular-nums">{row.closing_number}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{representative?.full_name || '-'}</p>
                        <p className="text-[11px] text-muted-foreground">{row.route_label || 'Sem rota informada'}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateBR(row.business_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.orders_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.items_count}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(row.gross_amount)}</TableCell>
                      <TableCell>
                        <StatusBadge status={statusConfig.tone} label={statusConfig.label} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.submitted_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canApprove && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                              onClick={() => handleApprove(row.id)}
                              disabled={isPending}
                            >
                              <CheckCircle className="h-3 w-3" />
                              Aprovar
                            </Button>
                          )}
                          {canReopen && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                              onClick={() => handleReopen(row.id)}
                              disabled={isPending}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reabrir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  )
}
