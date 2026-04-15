'use client'

import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  FiscalDocumentsIndexQuery,
  FiscalEnvironmentFilter,
  FiscalModelFilter,
  FiscalPeriodFilter,
  FiscalStatusFilter,
} from '../types'

export function FiscalDocumentsToolbar({
  query,
  searchValue,
  onSearchChange,
  onStatusChange,
  onEnvironmentChange,
  onModelChange,
  onPeriodChange,
  onReset,
}: {
  query: FiscalDocumentsIndexQuery
  searchValue: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: FiscalStatusFilter) => void
  onEnvironmentChange: (value: FiscalEnvironmentFilter) => void
  onModelChange: (value: FiscalModelFilter) => void
  onPeriodChange: (value: FiscalPeriodFilter) => void
  onReset: () => void
}) {
  const hasFilters =
    Boolean(query.search) ||
    (query.status && query.status !== 'all') ||
    (query.ambiente && query.ambiente !== 'all') ||
    (query.model && query.model !== 'all') ||
    (query.period && query.period !== 'all')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por numero, chave, pedido ou loja"
            className="h-10 rounded-2xl border-white/30 bg-background/70 pl-9 shadow-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl border-white/30 bg-background/70"
            onClick={onReset}
            disabled={!hasFilters}
          >
            <X className="h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-background/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-sm">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
        </div>

        <Select value={query.status || 'all'} onValueChange={(value) => onStatusChange(value as FiscalStatusFilter)}>
          <SelectTrigger className="h-10 min-w-[170px] rounded-2xl border-white/30 bg-background/70 px-3 shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as notas</SelectItem>
            <SelectItem value="authorized">Autorizadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={query.ambiente || 'all'} onValueChange={(value) => onEnvironmentChange(value as FiscalEnvironmentFilter)}>
          <SelectTrigger className="h-10 min-w-[170px] rounded-2xl border-white/30 bg-background/70 px-3 shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os ambientes</SelectItem>
            <SelectItem value="producao">Producao</SelectItem>
            <SelectItem value="homologacao">Homologacao</SelectItem>
          </SelectContent>
        </Select>

        <Select value={query.model || 'all'} onValueChange={(value) => onModelChange(value as FiscalModelFilter)}>
          <SelectTrigger className="h-10 min-w-[160px] rounded-2xl border-white/30 bg-background/70 px-3 shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os modelos</SelectItem>
            <SelectItem value="55">55 - NF-e</SelectItem>
            <SelectItem value="65">65 - NFC-e</SelectItem>
          </SelectContent>
        </Select>

        <Select value={query.period || 'all'} onValueChange={(value) => onPeriodChange(value as FiscalPeriodFilter)}>
          <SelectTrigger className="h-10 min-w-[150px] rounded-2xl border-white/30 bg-background/70 px-3 shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo o periodo</SelectItem>
            <SelectItem value="7d">Ultimos 7 dias</SelectItem>
            <SelectItem value="30d">Ultimos 30 dias</SelectItem>
            <SelectItem value="90d">Ultimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
