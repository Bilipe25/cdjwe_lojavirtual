'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { useRouter } from 'next/navigation'

const statusLabels: Record<string, { label: string; color: string }> = {
    approved: { label: 'Aprovado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    in_production: { label: 'Em Produção', color: 'bg-blue-50 text-blue-700 border-blue-200' },
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
    const [routeForm, setRouteForm] = useState({
        centerId: '',
        vehicleId: '',
        driverId: '',
        plannedDate: new Date().toISOString().split('T')[0],
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRoutableOrders({
            status: statusFilter,
            search,
            city: cityFilter,
            region: regionFilter,
            date: dateFilter || undefined,
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
    }, [statusFilter, search, cityFilter, regionFilter, dateFilter, pagination.page, pagination.pageSize])

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
        if ('data' in v && v.data) setVehicles(v.data.filter(x => x.status === 'available'))
        if ('data' in d && d.data) setDrivers(d.data.filter(x => x.status === 'available'))
    }

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAll = () => {
        if (selected.size === data.length) setSelected(new Set())
        else setSelected(new Set(data.map(o => o.order_id)))
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
        if (res.error) { setError(res.error); return }
        if ('data' in res && res.data) {
            setCreateOpen(false)
            router.push(`/admin/logistica/rotas/${res.data.routeId}`)
        }
    }

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    // Selected items summary
    const selectedOrders = data.filter(o => selected.has(o.order_id))
    const selectedTotal = selectedOrders.reduce((acc, o) => acc + o.total, 0)
    const selectedCities = [...new Set(selectedOrders.map(o => o.city).filter(Boolean))]
    const hasActiveFilters = cityFilter || regionFilter || dateFilter

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2 tracking-tight">
                        <PackageCheck className="h-6 w-6" /> Pedidos para Rota
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Selecione pedidos aprovados para criar uma rota de entrega
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {/* KPI Summary / Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Disponíveis</p>
                    <p className="text-xl font-black text-navy">{pagination.total}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Aprovados</p>
                    <p className="text-xl font-black text-emerald-600">{data.filter(o => o.status === 'approved').length}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Em Produção</p>
                    <p className="text-xl font-black text-blue-600">{data.filter(o => o.status === 'in_production').length}</p>
                </div>
                <div className="rounded-xl border bg-white p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Cidades</p>
                    <p className="text-xl font-black text-navy">{[...new Set(data.map(o => o.city).filter(Boolean))].length}</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9 h-9" placeholder="Buscar por número ou empresa..." value={search} onChange={(e) => { setSearch(e.target.value); setPagination((prev) => ({ ...prev, page: 1 })) }} />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'all'); setPagination((prev) => ({ ...prev, page: 1 })) }}>
                    <SelectTrigger className="w-36 h-9">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos aptos</SelectItem>
                        <SelectItem value="approved">Aprovado</SelectItem>
                        <SelectItem value="in_production">Em Produção</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className={cn('h-9 gap-1', hasActiveFilters && 'border-indigo-300 text-indigo-700')} onClick={() => setShowFilters(!showFilters)}>
                    <Filter className="h-3 w-3" />
                    Filtros
                    {hasActiveFilters && <span className="h-4 w-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold">!</span>}
                </Button>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
                <div className="rounded-xl border bg-slate-50/50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-navy">Filtros Avançados</p>
                    <div className="flex flex-wrap gap-2">
                        <Select value={cityFilter || 'all'} onValueChange={(v) => { setCityFilter(!v || v === 'all' ? '' : v); setPagination((prev) => ({ ...prev, page: 1 })) }}>
                            <SelectTrigger className="w-40 h-8 text-xs">
                                <SelectValue placeholder="Cidade" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas cidades</SelectItem>
                                {cities.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                            </SelectContent>
                        </Select>
                        <Select value={regionFilter || 'all'} onValueChange={(v) => { setRegionFilter(!v || v === 'all' ? '' : v); setPagination((prev) => ({ ...prev, page: 1 })) }}>
                            <SelectTrigger className="w-40 h-8 text-xs">
                                <SelectValue placeholder="Região" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas regiões</SelectItem>
                                {regions.map(r => (<SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>))}
                            </SelectContent>
                        </Select>
                        <Input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPagination((prev) => ({ ...prev, page: 1 })) }} className="w-36 h-8 text-xs" />
                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-red-500" onClick={() => { setCityFilter(''); setRegionFilter(''); setDateFilter(''); setPagination((prev) => ({ ...prev, page: 1 })) }}>
                                Limpar filtros
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center">
                    <PackageCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum pedido apto para roteirização.</p>
                </div>
            ) : (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50/60">
                                    <th className="px-3 py-3 text-center w-10">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleAll}>
                                            {selected.size === data.length ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
                                        </Button>
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy text-xs uppercase tracking-wide">Pedido</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy text-xs uppercase tracking-wide">Cliente</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy text-xs uppercase tracking-wide hidden md:table-cell">Cidade</th>
                                    <th className="px-4 py-3 text-right font-semibold text-navy text-xs uppercase tracking-wide hidden sm:table-cell">Total</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy text-xs uppercase tracking-wide">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((o) => {
                                    const st = statusLabels[o.status] || { label: o.status, color: '' }
                                    const isSelected = selected.has(o.order_id)
                                    return (
                                        <tr key={o.order_id}
                                            className={cn(
                                                'border-b last:border-b-0 transition cursor-pointer',
                                                isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50/40'
                                            )}
                                            onClick={() => toggleSelect(o.order_id)}
                                        >
                                            <td className="px-3 py-3 text-center">
                                                {isSelected ? <CheckSquare className="h-4 w-4 text-indigo-600 mx-auto" /> : <Square className="h-4 w-4 text-muted-foreground mx-auto" />}
                                            </td>
                                            <td className="px-4 py-3 font-mono font-bold text-navy text-xs">{o.order_number}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-sm">{o.company_name}</p>
                                                <p className="text-[10px] text-muted-foreground">{o.client_name}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3" /> {o.city}{o.state ? ` / ${o.state}` : ''}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right hidden sm:table-cell font-bold text-sm">
                                                {formatCurrency(o.total)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn('text-[10px] font-bold rounded-full border', st.color)}>
                                                    {st.label}
                                                </Badge>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-2 border-t bg-slate-50/40 text-xs text-muted-foreground">
                        {selected.size} de {data.length} pedidos selecionados
                    </div>
                    <div className="px-4 py-3 border-t bg-white flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                            Pagina {pagination.page} de {pagination.totalPages} • {pagination.total} pedidos
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pagination.hasPreviousPage || loading}
                                onClick={() => { setSelected(new Set()); setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) })) }}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!pagination.hasNextPage || loading}
                                onClick={() => { setSelected(new Set()); setPagination((prev) => ({ ...prev, page: prev.page + 1 })) }}
                            >
                                Proxima
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== FLOATING BATCH ACTION BAR ===== */}
            {selected.size > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-navy text-white rounded-2xl shadow-2xl shadow-navy/20 px-5 py-3 flex items-center gap-4 border border-white/10">
                        <div className="flex items-center gap-3 text-xs">
                            <span className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center font-black">{selected.size}</span>
                            <div className="hidden sm:block">
                                <p className="font-semibold">pedidos selecionados</p>
                                <p className="text-white/60 text-[10px]">
                                    {formatCurrency(selectedTotal)} • {selectedCities.length} cidade(s)
                                </p>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-white/20" />
                        <Button size="sm" className="bg-white text-navy hover:bg-white/90 font-bold gap-1.5 h-8" onClick={openCreateRoute}>
                            <Route className="h-3.5 w-3.5" /> Criar Rota
                        </Button>
                        <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 h-8 text-xs" onClick={() => setSelected(new Set())}>
                            Limpar
                        </Button>
                    </div>
                </div>
            )}

            {/* Create Route Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Route className="h-4 w-4 text-indigo-600" /> Criar Rota de Entrega
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-xl border bg-indigo-50/50 p-3 text-sm flex items-center gap-3">
                            <ShoppingCart className="h-4 w-4 text-indigo-600" />
                            <div>
                                <span className="font-bold text-navy">{selected.size}</span> pedidos selecionados
                                <span className="text-muted-foreground"> • </span>
                                <span className="font-semibold text-navy">{formatCurrency(selectedTotal)}</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Data Planejada *</label>
                            <Input type="date" value={routeForm.plannedDate} onChange={(e) => setRouteForm({ ...routeForm, plannedDate: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Centro de Saída</label>
                            <Select value={routeForm.centerId || 'none'} onValueChange={(v) => setRouteForm({ ...routeForm, centerId: !v || v === 'none' ? '' : v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {centers.map(c => (<SelectItem key={c.id} value={c.id}>{c.name} - {c.city}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Veículo</label>
                            <Select value={routeForm.vehicleId || 'none'} onValueChange={(v) => setRouteForm({ ...routeForm, vehicleId: !v || v === 'none' ? '' : v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {vehicles.map(v => (<SelectItem key={v.id} value={v.id}>{v.plate} - {v.name}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Motorista</label>
                            <Select value={routeForm.driverId || 'none'} onValueChange={(v) => setRouteForm({ ...routeForm, driverId: !v || v === 'none' ? '' : v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {drivers.map(d => (<SelectItem key={d.id} value={d.id}>{d.profile_name}</SelectItem>))}
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
        </div>
    )
}


