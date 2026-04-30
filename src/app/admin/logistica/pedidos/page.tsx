'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    PackageCheck,
    Search,
    RefreshCw,
    Route,
    CheckSquare,
    Square,
    MapPin,
    Filter,
    ShoppingCart,
    Map as MapIcon,
    X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    buildOptionLabelMap,
    buildRegionDisplayOptions,
    ensureCurrentOption,
    getRemovedEntityLabel,
    resolveLabelFromMap,
} from '@/lib/logistics/filter-display'
import {
    getRoutableOrders,
    createRoute,
    getCenters,
    getVehicles,
    getDrivers,
    getRegions,
    getDistinctCities,
    type PaginationMeta,
    type RoutableOrder,
    type CenterItem,
    type VehicleItem,
    type DriverItem,
    type RegionItem,
} from '../services'
import type { ClientMapScope } from '@/components/logistics/client-map-types'

const ClientMapModeDialog = dynamic(
    () => import('@/components/logistics/client-map-mode-dialog'),
    { ssr: false },
)

const statusLabels: Record<string, { label: string; color: string }> = {
    approved: { label: 'Aprovado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    in_production: { label: 'Em Producao', color: 'bg-blue-50 text-blue-700 border-blue-200' },
}

type ApplyClientFilterPayload = {
    selectedClientIds: string[]
    scope: ClientMapScope
}

export default function PedidosParaRotaPage() {
    const router = useRouter()
    const [data, setData] = useState<RoutableOrder[]>([])
    const [pagination, setPagination] = useState<PaginationMeta>({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [cityFilter, setCityFilter] = useState('')
    const [regionFilter, setRegionFilter] = useState('')
    const [dateFilter, setDateFilter] = useState('')
    const [cities, setCities] = useState<string[]>([])
    const [regions, setRegions] = useState<RegionItem[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [createOpen, setCreateOpen] = useState(false)
    const [centers, setCenters] = useState<CenterItem[]>([])
    const [vehicles, setVehicles] = useState<VehicleItem[]>([])
    const [drivers, setDrivers] = useState<DriverItem[]>([])
    const [creating, setCreating] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [clientMapOpen, setClientMapOpen] = useState(false)
    const [clientScope, setClientScope] = useState<ClientMapScope>('routable')
    const [mapSelectedClientIds, setMapSelectedClientIds] = useState<string[]>([])
    const [appliedClientFilterIds, setAppliedClientFilterIds] = useState<string[]>([])
    const [pendingClientFilterApply, setPendingClientFilterApply] = useState<ApplyClientFilterPayload | null>(null)
    const [selectionConflictOpen, setSelectionConflictOpen] = useState(false)
    const [routeForm, setRouteForm] = useState({
        centerId: '',
        vehicleId: '',
        driverId: '',
        plannedDate: new Date().toISOString().split('T')[0],
    })

    const selectedOrderById = useMemo(() => {
        const index = new Map<string, RoutableOrder>()
        for (const order of data) index.set(order.order_id, order)
        return index
    }, [data])

    const regionCatalog = useMemo(() => (
        regions.map((region) => ({ id: region.id, name: region.name }))
    ), [regions])

    const regionOptions = useMemo(() => {
        const rawRegionValues = data.map((order) => order.region).filter(Boolean)
        return buildRegionDisplayOptions(rawRegionValues, regionCatalog)
    }, [data, regionCatalog])

    const regionOptionMap = useMemo(() => buildOptionLabelMap(regionOptions), [regionOptions])

    const selectedRegionLabel = useMemo(() => {
        if (!regionFilter) return 'Todas regioes'
        return resolveLabelFromMap(regionFilter, regionOptionMap, getRemovedEntityLabel('region'))
    }, [regionFilter, regionOptionMap])

    const visibleRegionOptions = useMemo(() => {
        if (!regionFilter) return regionOptions
        return ensureCurrentOption(regionOptions, regionFilter, selectedRegionLabel)
    }, [regionFilter, regionOptions, selectedRegionLabel])

    const statusOptions = useMemo(() => ([
        { value: 'all', label: 'Todos aptos' },
        { value: 'approved', label: 'Aprovado' },
        { value: 'in_production', label: 'Em Producao' },
    ]), [])

    const statusLabelMap = useMemo(() => buildOptionLabelMap(statusOptions), [statusOptions])
    const selectedStatusLabel = useMemo(() => (
        resolveLabelFromMap(statusFilter || 'all', statusLabelMap, 'Todos aptos')
    ), [statusFilter, statusLabelMap])

    const cityBaseOptions = useMemo(() => (
        cities
            .map((city) => String(city || '').trim())
            .filter(Boolean)
            .map((city) => ({ value: city, label: city }))
    ), [cities])

    const cityLabelMap = useMemo(() => buildOptionLabelMap(cityBaseOptions), [cityBaseOptions])
    const selectedCityLabel = useMemo(() => {
        if (!cityFilter) return 'Todas cidades'
        return resolveLabelFromMap(cityFilter, cityLabelMap, cityFilter)
    }, [cityFilter, cityLabelMap])

    const visibleCityOptions = useMemo(() => (
        cityFilter
            ? ensureCurrentOption(cityBaseOptions, cityFilter, selectedCityLabel)
            : cityBaseOptions
    ), [cityBaseOptions, cityFilter, selectedCityLabel])

    const centerOptions = useMemo(() => (
        centers
            .map((center) => {
                const value = String(center.id || '').trim()
                if (!value) return null
                const label = [center.name, center.city].filter(Boolean).join(' - ') || getRemovedEntityLabel('center')
                return { value, label }
            })
            .filter((option): option is { value: string; label: string } => Boolean(option))
    ), [centers])

    const vehicleOptions = useMemo(() => (
        vehicles
            .map((vehicle) => {
                const value = String(vehicle.id || '').trim()
                if (!value) return null
                const label = [vehicle.plate, vehicle.name].filter(Boolean).join(' - ') || getRemovedEntityLabel('vehicle')
                return { value, label }
            })
            .filter((option): option is { value: string; label: string } => Boolean(option))
    ), [vehicles])

    const driverOptions = useMemo(() => (
        drivers
            .map((driver) => {
                const value = String(driver.id || '').trim()
                if (!value) return null
                const label = String(driver.profile_name || '').trim() || getRemovedEntityLabel('driver')
                return { value, label }
            })
            .filter((option): option is { value: string; label: string } => Boolean(option))
    ), [drivers])

    const centerLabelMap = useMemo(() => buildOptionLabelMap(centerOptions), [centerOptions])
    const vehicleLabelMap = useMemo(() => buildOptionLabelMap(vehicleOptions), [vehicleOptions])
    const driverLabelMap = useMemo(() => buildOptionLabelMap(driverOptions), [driverOptions])

    const selectedCenterLabel = useMemo(() => {
        if (!routeForm.centerId) return 'Selecionar depois'
        return resolveLabelFromMap(routeForm.centerId, centerLabelMap, getRemovedEntityLabel('center'))
    }, [centerLabelMap, routeForm.centerId])

    const selectedVehicleLabel = useMemo(() => {
        if (!routeForm.vehicleId) return 'Selecionar depois'
        return resolveLabelFromMap(routeForm.vehicleId, vehicleLabelMap, getRemovedEntityLabel('vehicle'))
    }, [routeForm.vehicleId, vehicleLabelMap])

    const selectedDriverLabel = useMemo(() => {
        if (!routeForm.driverId) return 'Selecionar depois'
        return resolveLabelFromMap(routeForm.driverId, driverLabelMap, getRemovedEntityLabel('driver'))
    }, [driverLabelMap, routeForm.driverId])

    const visibleCenterOptions = useMemo(() => (
        routeForm.centerId
            ? ensureCurrentOption(centerOptions, routeForm.centerId, selectedCenterLabel)
            : centerOptions
    ), [centerOptions, routeForm.centerId, selectedCenterLabel])

    const visibleVehicleOptions = useMemo(() => (
        routeForm.vehicleId
            ? ensureCurrentOption(vehicleOptions, routeForm.vehicleId, selectedVehicleLabel)
            : vehicleOptions
    ), [routeForm.vehicleId, selectedVehicleLabel, vehicleOptions])

    const visibleDriverOptions = useMemo(() => (
        routeForm.driverId
            ? ensureCurrentOption(driverOptions, routeForm.driverId, selectedDriverLabel)
            : driverOptions
    ), [driverOptions, routeForm.driverId, selectedDriverLabel])

    const applyClientFilterDirect = useCallback((payload: ApplyClientFilterPayload, clearSelectionOutsideFilter: boolean) => {
        const uniqueClientIds = [...new Set(payload.selectedClientIds.map((id) => id.trim()).filter(Boolean))]
        setClientScope(payload.scope)
        setMapSelectedClientIds(uniqueClientIds)
        setAppliedClientFilterIds(uniqueClientIds)
        setPagination((prev) => ({ ...prev, page: 1 }))

        if (clearSelectionOutsideFilter) {
            const clientSet = new Set(uniqueClientIds)
            setSelected((prev) => {
                const next = new Set<string>()
                for (const orderId of prev) {
                    const order = selectedOrderById.get(orderId)
                    if (!order) continue
                    if (clientSet.has(order.store_id)) next.add(orderId)
                }
                return next
            })
        }
    }, [selectedOrderById])

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRoutableOrders({
            status: statusFilter,
            search,
            city: cityFilter,
            region: regionFilter,
            date: dateFilter || undefined,
            storeIds: appliedClientFilterIds.length > 0 ? appliedClientFilterIds : undefined,
            page: pagination.page,
            pageSize: pagination.pageSize,
        })
        if ('error' in res && res.error) setError(res.error)
        else if ('data' in res && res.data) {
            setData(res.data)
            if ('pagination' in res && res.pagination) {
                setPagination(res.pagination)
            }
        }
        setLoading(false)
    }, [
        statusFilter,
        search,
        cityFilter,
        regionFilter,
        dateFilter,
        appliedClientFilterIds,
        pagination.page,
        pagination.pageSize,
    ])

    useEffect(() => {
        const loadFilters = async () => {
            const [c, r] = await Promise.all([getDistinctCities(), getRegions()])
            if (c.data) setCities(c.data)
            if ('data' in r && r.data) setRegions(r.data)
        }
        void loadFilters()
    }, [])

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadData() }, [loadData])

    const loadResources = async () => {
        const [c, v, d] = await Promise.all([getCenters(), getVehicles(), getDrivers()])
        if ('data' in c && c.data) setCenters(c.data)
        if ('data' in v && v.data) setVehicles(v.data.filter((item) => item.status === 'available'))
        if ('data' in d && d.data) setDrivers(d.data.filter((item) => item.status === 'available'))
    }

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAll = () => {
        if (selected.size === data.length) setSelected(new Set())
        else setSelected(new Set(data.map((order) => order.order_id)))
    }

    const openCreateRoute = () => {
        if (selected.size === 0) return
        void loadResources()
        setCreateOpen(true)
    }

    const handleCreateRoute = async () => {
        setCreating(true)
        setError(null)
        const res = await createRoute({
            orderIds: Array.from(selected),
            centerId: routeForm.centerId || null,
            vehicleId: routeForm.vehicleId || null,
            driverId: routeForm.driverId || null,
            plannedDate: routeForm.plannedDate,
        })
        setCreating(false)
        if (res.error) {
            setError(res.error)
            return
        }
        if ('data' in res && res.data) {
            setCreateOpen(false)
            router.push(`/admin/logistica/rotas/${res.data.routeId}`)
        }
    }

    const handleMapApply = (payload: ApplyClientFilterPayload) => {
        const uniqueIds = [...new Set(payload.selectedClientIds.map((id) => id.trim()).filter(Boolean))]
        const uniqueIdSet = new Set(uniqueIds)
        const outsideSelectedCount = data.filter(
            (order) => selected.has(order.order_id) && !uniqueIdSet.has(order.store_id),
        ).length

        if (uniqueIds.length > 0 && outsideSelectedCount > 0) {
            setPendingClientFilterApply({ selectedClientIds: uniqueIds, scope: payload.scope })
            setSelectionConflictOpen(true)
            return
        }

        applyClientFilterDirect({ selectedClientIds: uniqueIds, scope: payload.scope }, false)
    }

    const handleKeepSelectionAndApply = () => {
        if (!pendingClientFilterApply) return
        applyClientFilterDirect(pendingClientFilterApply, false)
        setSelectionConflictOpen(false)
        setPendingClientFilterApply(null)
    }

    const handleClearOutsideAndApply = () => {
        if (!pendingClientFilterApply) return
        applyClientFilterDirect(pendingClientFilterApply, true)
        setSelectionConflictOpen(false)
        setPendingClientFilterApply(null)
    }

    const clearClientFilter = () => {
        setAppliedClientFilterIds([])
        setPagination((prev) => ({ ...prev, page: 1 }))
    }

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value)

    const selectedOrders = data.filter((order) => selected.has(order.order_id))
    const selectedTotal = selectedOrders.reduce((acc, order) => acc + order.total, 0)
    const selectedCities = [...new Set(selectedOrders.map((order) => order.city).filter(Boolean))]
    const hasOperationalFilters = cityFilter || regionFilter || dateFilter
    const hasClientFilter = appliedClientFilterIds.length > 0

    return (
        <div className="space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-navy">
                        <PackageCheck className="h-6 w-6" /> Pedidos para Rota
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Selecione pedidos aprovados para criar uma rota de entrega
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="h-9 gap-1.5" onClick={() => setClientMapOpen(true)}>
                        <MapIcon className="h-4 w-4" />
                        Mapa de Clientes
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Disponiveis</p>
                    <p className="text-xl font-black text-navy">{pagination.total}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Aprovados</p>
                    <p className="text-xl font-black text-emerald-600">{data.filter((order) => order.status === 'approved').length}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Em Producao</p>
                    <p className="text-xl font-black text-blue-600">{data.filter((order) => order.status === 'in_production').length}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cidades</p>
                    <p className="text-xl font-black text-navy">{[...new Set(data.map((order) => order.city).filter(Boolean))].length}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative max-w-sm min-w-[200px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="h-9 pl-9"
                        placeholder="Buscar por numero ou empresa..."
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setPagination((prev) => ({ ...prev, page: 1 }))
                        }}
                    />
                </div>

                <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                        setStatusFilter(value || 'all')
                        setPagination((prev) => ({ ...prev, page: 1 }))
                    }}
                >
                    <SelectTrigger className="h-9 w-40">
                        <SelectValue placeholder="Status">{selectedStatusLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {statusOptions.map((statusOption) => (
                            <SelectItem key={statusOption.value} value={statusOption.value}>
                                {statusOption.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-9 gap-1', hasOperationalFilters && 'border-indigo-300 text-indigo-700')}
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <Filter className="h-3 w-3" />
                    Filtros
                    {hasOperationalFilters && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">!</span>
                    )}
                </Button>
            </div>

            {hasClientFilter && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
                    <Badge variant="outline" className="border-indigo-200 bg-white text-[10px] text-indigo-700">
                        Filtro por clientes: {appliedClientFilterIds.length}
                    </Badge>
                    <Badge variant="outline" className="border-indigo-200 bg-white text-[10px] text-indigo-700">
                        Escopo: {clientScope === 'global' ? 'Base Global' : 'Roteirizaveis'}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-indigo-700 hover:bg-indigo-100" onClick={clearClientFilter}>
                        <X className="h-3 w-3" />
                        Remover filtro
                    </Button>
                </div>
            )}

            {showFilters && (
                <div className="space-y-2 rounded-xl border bg-slate-50/50 p-3">
                    <p className="text-xs font-semibold text-navy">Filtros Avancados</p>
                    <div className="flex flex-wrap gap-2">
                        <Select
                            value={cityFilter || 'all'}
                            onValueChange={(value) => {
                                setCityFilter(!value || value === 'all' ? '' : value)
                                setPagination((prev) => ({ ...prev, page: 1 }))
                            }}
                        >
                            <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue placeholder="Cidade">{selectedCityLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas cidades</SelectItem>
                                {visibleCityOptions.map((cityOption) => (
                                    <SelectItem key={cityOption.value} value={cityOption.value}>
                                        {cityOption.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={regionFilter || 'all'}
                            onValueChange={(value) => {
                                setRegionFilter(!value || value === 'all' ? '' : value)
                                setPagination((prev) => ({ ...prev, page: 1 }))
                            }}
                        >
                            <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue placeholder="Regiao">{selectedRegionLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas regioes</SelectItem>
                                {visibleRegionOptions.map((regionOption) => (
                                    <SelectItem key={regionOption.value} value={regionOption.value}>
                                        {regionOption.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Input
                            type="date"
                            value={dateFilter}
                            onChange={(event) => {
                                setDateFilter(event.target.value)
                                setPagination((prev) => ({ ...prev, page: 1 }))
                            }}
                            className="h-8 w-36 text-xs"
                        />

                        {hasOperationalFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-red-500"
                                onClick={() => {
                                    setCityFilter('')
                                    setRegionFilter('')
                                    setDateFilter('')
                                    setPagination((prev) => ({ ...prev, page: 1 }))
                                }}
                            >
                                Limpar filtros
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-relaxed text-indigo-900">
                Esta fila mostra apenas pedidos Pre-venda aprovados ou em producao. Pedidos Pronta entrega sao atendidos diretamente pelo representante e nao entram em roteirizacao.
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(6)].map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center">
                    <PackageCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Nenhum pedido apto para roteirizacao.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50/60">
                                    <th className="w-10 px-3 py-3 text-center">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleAll}>
                                            {selected.size === data.length ? (
                                                <CheckSquare className="h-4 w-4 text-indigo-600" />
                                            ) : (
                                                <Square className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-navy">Pedido</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-navy">Cliente</th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-navy md:table-cell">Cidade</th>
                                    <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-navy sm:table-cell">Total</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-navy">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((order) => {
                                    const st = statusLabels[order.status] || { label: order.status, color: '' }
                                    const isSelected = selected.has(order.order_id)
                                    return (
                                        <tr
                                            key={order.order_id}
                                            className={cn(
                                                'cursor-pointer border-b transition last:border-b-0',
                                                isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50/40',
                                            )}
                                            onClick={() => toggleSelect(order.order_id)}
                                        >
                                            <td className="px-3 py-3 text-center">
                                                {isSelected ? (
                                                    <CheckSquare className="mx-auto h-4 w-4 text-indigo-600" />
                                                ) : (
                                                    <Square className="mx-auto h-4 w-4 text-muted-foreground" />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-navy">{order.order_number}</td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium">{order.company_name}</p>
                                                <p className="text-[10px] text-muted-foreground">{order.client_name}</p>
                                            </td>
                                            <td className="hidden px-4 py-3 md:table-cell">
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3" /> {order.city}{order.state ? ` / ${order.state}` : ''}
                                                </span>
                                            </td>
                                            <td className="hidden px-4 py-3 text-right text-sm font-bold sm:table-cell">
                                                {formatCurrency(order.total)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn('rounded-full border text-[10px] font-bold', st.color)}>
                                                    {st.label}
                                                </Badge>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="border-t bg-slate-50/40 px-4 py-2 text-xs text-muted-foreground">
                        {selected.size} de {data.length} pedidos selecionados
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t bg-white px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                            Pagina {pagination.page} de {pagination.totalPages} - {pagination.total} pedidos
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pagination.hasPreviousPage || loading}
                                onClick={() => {
                                    setSelected(new Set())
                                    setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                                }}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pagination.hasNextPage || loading}
                                onClick={() => {
                                    setSelected(new Set())
                                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                                }}
                            >
                                Proxima
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {selected.size > 0 && (
                <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
                    <div className="flex w-fit max-w-[calc(100vw-2rem)] items-center gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/95 px-5 py-3 text-slate-50 shadow-2xl shadow-slate-900/35 backdrop-blur-sm">
                        <div className="flex items-center gap-3 text-xs">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-black text-slate-900">
                                {selected.size}
                            </span>
                            <div className="hidden sm:block">
                                <p className="font-semibold">pedidos selecionados</p>
                                <p className="text-[10px] text-slate-300">
                                    {formatCurrency(selectedTotal)} - {selectedCities.length} cidade(s)
                                </p>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-slate-700" />
                        <Button size="sm" className="h-8 gap-1.5 border border-white/80 bg-white font-bold text-slate-900 hover:bg-slate-100" onClick={openCreateRoute}>
                            <Route className="h-3.5 w-3.5" /> Criar Rota
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => setSelected(new Set())}>
                            Limpar
                        </Button>
                    </div>
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Route className="h-4 w-4 text-indigo-600" /> Criar Rota de Entrega
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="flex items-center gap-3 rounded-xl border bg-indigo-50/50 p-3 text-sm">
                            <ShoppingCart className="h-4 w-4 text-indigo-600" />
                            <div>
                                <span className="font-bold text-navy">{selected.size}</span> pedidos selecionados
                                <span className="text-muted-foreground"> - </span>
                                <span className="font-semibold text-navy">{formatCurrency(selectedTotal)}</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Data Planejada *</label>
                            <Input
                                type="date"
                                value={routeForm.plannedDate}
                                onChange={(event) => setRouteForm({ ...routeForm, plannedDate: event.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Centro de Saida</label>
                            <Select
                                value={routeForm.centerId || 'none'}
                                onValueChange={(value) => setRouteForm({ ...routeForm, centerId: !value || value === 'none' ? '' : value })}
                            >
                                <SelectTrigger><SelectValue>{selectedCenterLabel}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {visibleCenterOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Veiculo</label>
                            <Select
                                value={routeForm.vehicleId || 'none'}
                                onValueChange={(value) => setRouteForm({ ...routeForm, vehicleId: !value || value === 'none' ? '' : value })}
                            >
                                <SelectTrigger><SelectValue>{selectedVehicleLabel}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {visibleVehicleOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Motorista</label>
                            <Select
                                value={routeForm.driverId || 'none'}
                                onValueChange={(value) => setRouteForm({ ...routeForm, driverId: !value || value === 'none' ? '' : value })}
                            >
                                <SelectTrigger><SelectValue>{selectedDriverLabel}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {visibleDriverOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateRoute} disabled={creating || !routeForm.plannedDate} className="gap-1.5">
                            <Route className="h-3.5 w-3.5" />
                            {creating ? 'Criando...' : 'Criar Rota'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={selectionConflictOpen} onOpenChange={(open) => { if (!open) { setSelectionConflictOpen(false); setPendingClientFilterApply(null) } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Conflito entre filtro de clientes e pedidos selecionados</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2 text-sm text-slate-600">
                        <p>
                            Existem pedidos ja selecionados que ficarao fora do novo filtro por clientes.
                        </p>
                        <p>
                            Escolha como deseja continuar:
                        </p>
                    </div>
                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button variant="outline" onClick={() => { setSelectionConflictOpen(false); setPendingClientFilterApply(null) }}>
                            Cancelar
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" onClick={handleKeepSelectionAndApply}>
                                Manter selecao atual
                            </Button>
                            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleClearOutsideAndApply}>
                                Limpar fora do filtro
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ClientMapModeDialog
                open={clientMapOpen}
                onOpenChange={setClientMapOpen}
                initialScope={clientScope}
                initialSelectedClientIds={mapSelectedClientIds.length > 0 ? mapSelectedClientIds : appliedClientFilterIds}
                cities={cities}
                regions={regionCatalog}
                onApply={handleMapApply}
            />
        </div>
    )
}
