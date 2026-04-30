'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RepresentativeStockMovementType } from '@/lib/types'
import { getRepresentativeStockMovementLabel } from '@/lib/representative-stock'
import {
  formatDateTime,
  getRelation,
  getVariantLabel,
  SectionCard,
  EmptyState,
  MovementBadge,
} from '../_components'

const MOVEMENT_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'TRANSFER_IN', label: 'Transferências' },
  { value: 'READY_DELIVERY_SALE', label: 'Vendas' },
  { value: 'RESERVATION_CREATE', label: 'Reservas' },
  { value: 'SALE_CANCEL_REVERSAL', label: 'Estornos' },
  { value: 'ADJUSTMENT', label: 'Ajustes' },
]

type MovementRow = {
  id: string
  representative_id: string
  movement_type: RepresentativeStockMovementType
  quantity_delta: number
  quantity_available_after: number
  quantity_reserved_after: number
  quantity_sold_after: number
  order_id: string | null
  transfer_id: string | null
  notes: string | null
  created_at: string
  representative: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
  product_variant: unknown
  size_option: unknown
  order: { id: string; order_number: string; total: number; status: string } | { id: string; order_number: string; total: number; status: string }[] | null
}

export function ReadyDeliveryMovementsClient({ rows }: { rows: MovementRow[] }) {
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

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
    if (typeFilter !== 'all') {
      result = result.filter((row) => row.movement_type === typeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((row) => {
        const variant = getVariantLabel(row as any)
        const rep = getRelation(row.representative)
        const order = getRelation(row.order)
        return (
          variant.title.toLowerCase().includes(q) ||
          variant.subtitle.toLowerCase().includes(q) ||
          rep?.full_name?.toLowerCase().includes(q) ||
          order?.order_number?.toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [rows, search, repFilter, typeFilter])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto, representante, pedido..."
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
        >
          {MOVEMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <SectionCard
        title="Livro de movimentações"
        description={`${filtered.length} registro${filtered.length !== 1 ? 's' : ''} · auditoria por representante, pedido e produto`}
        icon={Activity}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Representante</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Mov.</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Referência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState icon={ArrowUpDown} message="Nenhuma movimentação encontrada." />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const representative = getRelation(row.representative)
                  const order = getRelation(row.order)
                  const variant = getVariantLabel(row as any)
                  const quantity = Number(row.quantity_delta || 0)

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell>
                        <MovementBadge
                          type={row.movement_type}
                          label={getRepresentativeStockMovementLabel(row.movement_type)}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{representative?.full_name || '-'}</p>
                        <p className="text-[11px] text-muted-foreground">{representative?.email || ''}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{variant.title}</p>
                        <p className="text-[11px] text-muted-foreground">{variant.subtitle || '-'}</p>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${quantity < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {quantity > 0 ? '+' : ''}{quantity}
                      </TableCell>
                      <TableCell className="text-right text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                        Disp. {row.quantity_available_after} / Res. {row.quantity_reserved_after} / Vend. {row.quantity_sold_after}
                      </TableCell>
                      <TableCell>
                        {order?.id ? (
                          <Link href={`/admin/orders/${order.id}`} className="text-sm font-medium text-primary hover:underline">
                            {order.order_number}
                          </Link>
                        ) : row.transfer_id ? (
                          <span className="text-xs text-muted-foreground">Transferência</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
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
