'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { Boxes, Lock, PackageOpen, Search, ShoppingBag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRepresentativeStockStatus } from '@/lib/representative-stock'
import {
  formatDateTime,
  getRelation,
  getVariantLabel,
  ReadyDeliveryStat,
  SectionCard,
  EmptyState,
  StatusBadge,
} from '../_components'

type StockRow = {
  id: string
  representative_id: string
  quantity_available: number
  quantity_reserved: number
  quantity_sold: number
  updated_at: string
  representative: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
  product_variant: {
    id: string
    sku: string | null
    image_url: string | null
    stock_quantity: number
    product: { id: string; name: string } | { id: string; name: string }[] | null
    fabric: { id: string; name: string } | { id: string; name: string }[] | null
    fabric_color: { id: string; name: string; hex_code: string | null; image_url: string | null } | { id: string; name: string; hex_code: string | null; image_url: string | null }[] | null
  } | {
    id: string
    sku: string | null
    image_url: string | null
    stock_quantity: number
    product: { id: string; name: string } | { id: string; name: string }[] | null
    fabric: { id: string; name: string } | { id: string; name: string }[] | null
    fabric_color: { id: string; name: string; hex_code: string | null; image_url: string | null } | { id: string; name: string; hex_code: string | null; image_url: string | null }[] | null
  }[] | null
  size_option: { id: string; name: string } | { id: string; name: string }[] | null
}

export function ReadyDeliveryStockClient({ rows }: { rows: StockRow[] }) {
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('all')

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
      result = result.filter((row) => {
        const rep = getRelation(row.representative)
        return rep?.id === repFilter
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((row) => {
        const variant = getVariantLabel(row)
        const rep = getRelation(row.representative)
        return (
          variant.title.toLowerCase().includes(q) ||
          variant.subtitle.toLowerCase().includes(q) ||
          rep?.full_name?.toLowerCase().includes(q) ||
          rep?.email?.toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [rows, search, repFilter])

  const totalAvailable = filtered.reduce((sum, row) => sum + Number(row.quantity_available || 0), 0)
  const totalReserved = filtered.reduce((sum, row) => sum + Number(row.quantity_reserved || 0), 0)
  const totalSold = filtered.reduce((sum, row) => sum + Number(row.quantity_sold || 0), 0)

  // Group by representative
  const grouped = useMemo(() => {
    const groups = new Map<string, { name: string; email: string; rows: StockRow[] }>()
    filtered.forEach((row) => {
      const rep = getRelation(row.representative)
      const key = rep?.id || 'unknown'
      if (!groups.has(key)) {
        groups.set(key, { name: rep?.full_name || 'Sem representante', email: rep?.email || '', rows: [] })
      }
      groups.get(key)!.rows.push(row)
    })
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <ReadyDeliveryStat
          label="Disponível com representantes"
          value={totalAvailable}
          helper="Saldo pronto para venda presencial"
          icon={Boxes}
          tone="success"
        />
        <ReadyDeliveryStat
          label="Reservado online"
          value={totalReserved}
          helper="Reservas temporárias em builders ativos"
          icon={Lock}
          tone="warning"
        />
        <ReadyDeliveryStat
          label="Vendido em pronta entrega"
          value={totalSold}
          helper="Baixa automática acumulada"
          icon={ShoppingBag}
          tone="neutral"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto, SKU, representante..."
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
      </div>

      {/* Grouped Table */}
      <SectionCard
        title="Saldos por representante"
        description={`${filtered.length} registro${filtered.length !== 1 ? 's' : ''} · agrupado por representante`}
        icon={Boxes}
      >
        {grouped.length === 0 ? (
          <EmptyState icon={PackageOpen} message="Nenhum estoque de pronta entrega encontrado." />
        ) : (
          <div className="divide-y divide-border/30">
            {grouped.map(([repId, group]) => (
              <div key={repId}>
                {/* Rep header */}
                <div className="flex items-center gap-3 bg-muted/30 px-4 py-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{group.name}</p>
                    <p className="text-[11px] text-muted-foreground">{group.email} · {group.rows.length} item{group.rows.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Items */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Disponível</TableHead>
                        <TableHead className="text-right">Reservado</TableHead>
                        <TableHead className="text-right">Vendido</TableHead>
                        <TableHead className="text-right">Atualizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => {
                        const variant = getVariantLabel(row)
                        const status = getRepresentativeStockStatus(Number(row.quantity_available || 0))

                        return (
                          <TableRow key={row.id}>
                            <TableCell className="w-12 pr-0">
                              {variant.imageUrl ? (
                                <Image
                                  src={variant.imageUrl}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="h-8 w-8 rounded-md object-cover ring-1 ring-border/30"
                                />
                              ) : variant.hexCode ? (
                                <span
                                  className="inline-block h-8 w-8 rounded-md ring-1 ring-border/30"
                                  style={{ backgroundColor: variant.hexCode }}
                                />
                              ) : (
                                <span className="inline-block h-8 w-8 rounded-md bg-muted ring-1 ring-border/30" />
                              )}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-foreground">{variant.title}</p>
                              <p className="text-xs text-muted-foreground">{variant.subtitle || '-'}</p>
                            </TableCell>
                            <TableCell className="text-right">
                              <StatusBadge
                                status={status.tone === 'danger' ? 'danger' : status.tone === 'warning' ? 'warning' : 'success'}
                                label={status.label}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{row.quantity_reserved}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <ShoppingBag className="h-3 w-3" />
                                {row.quantity_sold}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(row.updated_at)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
