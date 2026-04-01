'use client'

import { Search, MapPin, Building2, Filter, CheckCircle2, CircleAlert, Crosshair } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ValueLabelOption } from '@/lib/logistics/filter-display'
import type { ClientMapFilters, ClientMapItem, ClientMapScope } from './client-map-types'

interface ClientMapSidebarProps {
    loading: boolean
    error: string | null
    filters: ClientMapFilters
    clients: ClientMapItem[]
    scope: ClientMapScope
    selectedClientIds: Set<string>
    focusedClientId: string | null
    cities: string[]
    selectedCityLabel: string
    regions: ValueLabelOption[]
    selectedRegionLabel: string
    totalClients: number
    loadedClients: number
    truncated: boolean
    selectedWithOrdersCount: number
    onSearchChange: (value: string) => void
    onCityChange: (value: string) => void
    onRegionChange: (value: string) => void
    onToggleWithOrders: () => void
    onToggleWithoutOrders: () => void
    onToggleWithCoordinates: () => void
    onToggleWithoutCoordinates: () => void
    onToggleOnlySelected: () => void
    onToggleClient: (storeId: string) => void
    onFocusClient: (storeId: string) => void
    onSelectAllFiltered: () => void
    onSelectWithOrders: () => void
    onSelectByCurrentArea: () => void
    onClearSelection: () => void
    onOpenGeocode: (client: ClientMapItem) => void
}

function FilterChip({
    active,
    label,
    onClick,
}: {
    active: boolean
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-full border px-2.5 py-1 text-[10px] font-semibold transition',
                active
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
        >
            {label}
        </button>
    )
}

export default function ClientMapSidebar({
    loading,
    error,
    filters,
    clients,
    scope,
    selectedClientIds,
    focusedClientId,
    cities,
    selectedCityLabel,
    regions,
    selectedRegionLabel,
    totalClients,
    loadedClients,
    truncated,
    selectedWithOrdersCount,
    onSearchChange,
    onCityChange,
    onRegionChange,
    onToggleWithOrders,
    onToggleWithoutOrders,
    onToggleWithCoordinates,
    onToggleWithoutCoordinates,
    onToggleOnlySelected,
    onToggleClient,
    onFocusClient,
    onSelectAllFiltered,
    onSelectWithOrders,
    onSelectByCurrentArea,
    onClearSelection,
    onOpenGeocode,
}: ClientMapSidebarProps) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="space-y-3 border-b bg-white px-4 py-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        value={filters.search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        className="h-9 pl-9 text-sm"
                        placeholder="Buscar por nome, CNPJ, cidade..."
                    />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Select
                        value={filters.city || 'all'}
                        onValueChange={(value) => {
                            const safeValue = value ?? 'all'
                            onCityChange(safeValue === 'all' ? '' : safeValue)
                        }}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Cidade">{selectedCityLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas cidades</SelectItem>
                            {cities.map((city) => (
                                <SelectItem key={city} value={city}>
                                    {city}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select
                        value={filters.region || 'all'}
                        onValueChange={(value) => {
                            const safeValue = value ?? 'all'
                            onRegionChange(safeValue === 'all' ? '' : safeValue)
                        }}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Regiao">{selectedRegionLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas regioes</SelectItem>
                            {regions.map((region) => (
                                <SelectItem key={region.value} value={region.value}>
                                    {region.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <Filter className="h-3 w-3" />
                        Filtros operacionais
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <FilterChip active={filters.onlyWithOrders} label="Com pedidos" onClick={onToggleWithOrders} />
                        <FilterChip active={filters.onlyWithoutOrders} label="Sem pedidos" onClick={onToggleWithoutOrders} />
                        <FilterChip active={filters.onlyWithCoordinates} label="Com coordenadas" onClick={onToggleWithCoordinates} />
                        <FilterChip active={filters.onlyWithoutCoordinates} label="Sem coordenadas" onClick={onToggleWithoutCoordinates} />
                        <FilterChip active={filters.onlySelected} label="Selecionados" onClick={onToggleOnlySelected} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={onSelectAllFiltered}>
                        Selecionar filtrados
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={onSelectWithOrders}>
                        Selecionar com pedidos
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={onSelectByCurrentArea}>
                        Selecionar por area
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-[11px] text-red-600 hover:text-red-700" onClick={onClearSelection}>
                        Limpar selecao
                    </Button>
                </div>
            </div>

            <div className="border-b bg-slate-50/70 px-4 py-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-medium">
                        {loadedClients} de {totalClients} clientes
                    </span>
                    {truncated ? (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                            Limitado para performance
                        </Badge>
                    ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{selectedClientIds.size} selecionado(s)</span>
                    <span>|</span>
                    <span>{selectedWithOrdersCount} com pedidos</span>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-2 py-2">
                {error && (
                    <div className="mx-2 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="space-y-2 p-2">
                        {[...Array(8)].map((_, index) => (
                            <Skeleton key={index} className="h-14 rounded-lg" />
                        ))}
                    </div>
                ) : clients.length === 0 ? (
                    <div className="mx-2 rounded-lg border border-dashed bg-slate-50 px-4 py-8 text-center">
                        <MapPin className="mx-auto mb-2 h-4 w-4 text-slate-400" />
                        <p className="text-xs font-medium text-slate-600">
                            {scope === 'routable'
                                ? 'Nenhum cliente apto encontrado neste escopo.'
                                : 'Nenhum cliente encontrado.'}
                        </p>
                        {scope === 'routable' ? (
                            <p className="mt-1 text-[11px] text-slate-500">
                                Troque para Base Global ou ajuste filtros.
                            </p>
                        ) : null}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {clients.map((client) => {
                            const isSelected = selectedClientIds.has(client.store_id)
                            const isFocused = focusedClientId === client.store_id
                            const rowStateClassName = isFocused && isSelected
                                ? 'border-indigo-300 bg-indigo-50/80 shadow-sm ring-1 ring-indigo-100'
                                : isFocused
                                    ? 'border-sky-300 bg-sky-50/80 shadow-sm'
                                    : isSelected
                                        ? 'border-violet-300 bg-violet-50/80 shadow-sm'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'

                            return (
                                <div
                                    key={client.store_id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onFocusClient(client.store_id)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault()
                                            onFocusClient(client.store_id)
                                        }
                                    }}
                                    className={cn(
                                        'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                                        rowStateClassName,
                                    )}
                                    aria-pressed={isFocused}
                                >
                                    <div
                                        onClick={(event) => event.stopPropagation()}
                                        className="mt-0.5"
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            aria-label={`Selecionar ${client.company_name || 'cliente'}`}
                                            onCheckedChange={() => onToggleClient(client.store_id)}
                                        />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="truncate text-xs font-semibold text-slate-900">
                                                {client.company_name || 'Cliente sem nome'}
                                            </p>
                                            <div className="flex items-center gap-1">
                                                {isSelected ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="shrink-0 border-violet-200 bg-violet-50 text-[10px] text-violet-700"
                                                    >
                                                        Selecionado
                                                    </Badge>
                                                ) : null}
                                                {client.has_routable_orders ? (
                                                    <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                                                        {client.routable_orders_count} pedido(s)
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                                                        Sem pedidos
                                                    </Badge>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 px-2 text-[10px] text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        onOpenGeocode(client)
                                                    }}
                                                >
                                                    <Crosshair className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                        <p className="truncate text-[10px] text-slate-500">
                                            {client.client_name || 'Sem contato principal'}
                                        </p>

                                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                            <span className="inline-flex items-center gap-1">
                                                <Building2 className="h-3 w-3" />
                                                {client.city || 'Cidade nao informada'}{client.state ? ` / ${client.state}` : ''}
                                            </span>
                                            {client.has_valid_coordinates ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Coordenadas OK
                                                </span>
                                            ) : client.latitude !== null && client.longitude !== null ? (
                                                <span className="inline-flex items-center gap-1 text-sky-700">
                                                    <MapPin className="h-3 w-3" />
                                                    Coordenada provisoria
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-amber-600">
                                                    <CircleAlert className="h-3 w-3" />
                                                    Sem coordenadas
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
