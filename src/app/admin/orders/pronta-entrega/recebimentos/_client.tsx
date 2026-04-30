'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, ReceiptText, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatDateTime,
  formatMoney,
  getRelation,
  ReadyDeliveryStat,
  SectionCard,
  EmptyState,
  StatusBadge,
} from '../_components'

function getPaymentStatusConfig(status: string | null | undefined): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    paid: { label: 'Pago', tone: 'success' },
    pending: { label: 'Pendente', tone: 'warning' },
    overdue: { label: 'Em atraso', tone: 'danger' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
    partially_paid: { label: 'Parcial', tone: 'warning' },
  }
  return map[status || ''] || { label: status || 'Indefinido', tone: 'neutral' }
}

function getReceiptStatusConfig(status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    issued: { label: 'Emitido', tone: 'success' },
    cancelled: { label: 'Cancelado', tone: 'danger' },
    reissued: { label: 'Reemitido', tone: 'warning' },
  }
  return map[status] || { label: status, tone: 'neutral' }
}

type ReceiptRow = {
  id: string
  receipt_number: string
  status: string
  pdf_url: string | null
  issued_at: string
  representative: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
  order: {
    id: string
    order_number: string
    total: number
    payment_status: string
    status: string
    created_at: string
    store: { id: string; company_name: string; trade_name: string | null } | { id: string; company_name: string; trade_name: string | null }[] | null
  } | {
    id: string
    order_number: string
    total: number
    payment_status: string
    status: string
    created_at: string
    store: { id: string; company_name: string; trade_name: string | null } | { id: string; company_name: string; trade_name: string | null }[] | null
  }[] | null
}

export function ReadyDeliveryReceiptsClient({ rows }: { rows: ReceiptRow[] }) {
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const representatives = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((row) => {
      const rep = getRelation(row.representative)
      if (rep) map.set(rep.id, rep.full_name || rep.email)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filtered = useMemo(() => {
    let result = rows
    if (repFilter !== 'all') {
      result = result.filter((row) => getRelation(row.representative)?.id === repFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((row) => {
        const order = getRelation(row.order)
        return order?.payment_status === statusFilter
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((row) => {
        const order = getRelation(row.order)
        const store = getRelation(order?.store)
        const rep = getRelation(row.representative)
        return (
          row.receipt_number?.toLowerCase().includes(q) ||
          order?.order_number?.toLowerCase().includes(q) ||
          store?.company_name?.toLowerCase().includes(q) ||
          store?.trade_name?.toLowerCase().includes(q) ||
          rep?.full_name?.toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [rows, search, repFilter, statusFilter])

  const total = filtered.reduce((sum, row) => {
    const order = getRelation(row.order)
    return sum + Number(order?.total || 0)
  }, 0)
  const paidCount = filtered.filter((row) => getRelation(row.order)?.payment_status === 'paid').length

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <ReadyDeliveryStat label="Recibos emitidos" value={filtered.length} icon={ReceiptText} tone="neutral" />
        <ReadyDeliveryStat label="Valor em pronta entrega" value={formatMoney(total)} tone="success" />
        <ReadyDeliveryStat label="Pedidos pagos" value={paidCount} helper="Baseado no status financeiro do pedido" tone="neutral" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar recibo, pedido, cliente..."
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
          <option value="paid">Pago</option>
          <option value="pending">Pendente</option>
          <option value="overdue">Em atraso</option>
        </select>
      </div>

      <SectionCard
        title="Recibos"
        description={`Comprovantes gerados automaticamente para pronta entrega`}
        icon={ReceiptText}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recibo</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Representante</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Recibo</TableHead>
                <TableHead>Financeiro</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState icon={ReceiptText} message="Nenhum recibo de pronta entrega encontrado." />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const order = getRelation(row.order)
                  const store = getRelation(order?.store)
                  const representative = getRelation(row.representative)
                  const paymentConfig = getPaymentStatusConfig(order?.payment_status)
                  const receiptConfig = getReceiptStatusConfig(row.status)

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold text-foreground tabular-nums">{row.receipt_number}</TableCell>
                      <TableCell>
                        {order?.id ? (
                          <Link href={`/admin/orders/${order.id}`} className="font-medium text-primary hover:underline">
                            {order.order_number}
                          </Link>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{store?.trade_name || store?.company_name || '-'}</TableCell>
                      <TableCell className="text-sm">{representative?.full_name || '-'}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(order?.total)}</TableCell>
                      <TableCell>
                        <StatusBadge status={receiptConfig.tone} label={receiptConfig.label} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={paymentConfig.tone} label={paymentConfig.label} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.issued_at)}</TableCell>
                      <TableCell>
                        {row.pdf_url ? (
                          <a
                            href={row.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="Abrir PDF"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
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
