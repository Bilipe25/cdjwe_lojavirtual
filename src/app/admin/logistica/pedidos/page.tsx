'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    PackageCheck,
    Search,
    RefreshCw,
    Route,
    CheckSquare,
    Square,
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
import { getRoutableOrders, createRoute, getCenters, getVehicles, getDrivers, type RoutableOrder, type CenterItem, type VehicleItem, type DriverItem } from '../actions'
import { useRouter } from 'next/navigation'

const statusLabels: Record<string, { label: string; color: string }> = {
    approved: { label: 'Aprovado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    in_production: { label: 'Em Produção', color: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export default function PedidosParaRotaPage() {
    const router = useRouter()
    const [data, setData] = useState<RoutableOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [createOpen, setCreateOpen] = useState(false)
    const [centers, setCenters] = useState<CenterItem[]>([])
    const [vehicles, setVehicles] = useState<VehicleItem[]>([])
    const [drivers, setDrivers] = useState<DriverItem[]>([])
    const [creating, setCreating] = useState(false)
    const [routeForm, setRouteForm] = useState({
        centerId: '',
        vehicleId: '',
        driverId: '',
        plannedDate: new Date().toISOString().split('T')[0],
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getRoutableOrders({ status: statusFilter, search })
        if ('error' in res && res.error) setError(res.error)
        else if ('data' in res && res.data) setData(res.data)
        setLoading(false)
    }, [statusFilter, search])

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <PackageCheck className="h-6 w-6" /> Pedidos para Rota
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Selecione pedidos aprovados para criar uma rota de entrega
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={openCreateRoute} disabled={selected.size === 0} className="gap-2">
                        <Route className="h-4 w-4" />
                        Criar Rota ({selected.size})
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar por número ou empresa..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || 'all')}>
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos aptos</SelectItem>
                        <SelectItem value="approved">Aprovado</SelectItem>
                        <SelectItem value="in_production">Em Produção</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhum pedido apto para roteirização.
                </div>
            ) : (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50/60">
                                    <th className="px-3 py-3 text-center w-10">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleAll}>
                                            {selected.size === data.length ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                                        </Button>
                                    </th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Pedido</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Cliente</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy hidden md:table-cell">Cidade</th>
                                    <th className="px-4 py-3 text-right font-semibold text-navy hidden sm:table-cell">Total</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Status</th>
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
                                                isSelected ? 'bg-primary/5' : 'hover:bg-slate-50/40'
                                            )}
                                            onClick={() => toggleSelect(o.order_id)}
                                        >
                                            <td className="px-3 py-3 text-center">
                                                {isSelected ? <CheckSquare className="h-4 w-4 text-primary mx-auto" /> : <Square className="h-4 w-4 text-muted-foreground mx-auto" />}
                                            </td>
                                            <td className="px-4 py-3 font-mono font-bold text-navy text-xs">{o.order_number}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{o.company_name}</p>
                                                <p className="text-xs text-muted-foreground">{o.client_name}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                                                {o.city}{o.state ? ` / ${o.state}` : ''}
                                            </td>
                                            <td className="px-4 py-3 text-right hidden sm:table-cell font-semibold">
                                                {formatCurrency(o.total)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full', st.color)}>
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
                </div>
            )}

            {/* Create Route Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Criar Rota de Entrega</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-xl border bg-slate-50/60 p-3 text-sm">
                            <strong>{selected.size}</strong> pedidos selecionados
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
                                    {centers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name} - {c.city}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Veículo</label>
                            <Select value={routeForm.vehicleId || 'none'} onValueChange={(v) => setRouteForm({ ...routeForm, vehicleId: !v || v === 'none' ? '' : v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {vehicles.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.plate} - {v.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Motorista</label>
                            <Select value={routeForm.driverId || 'none'} onValueChange={(v) => setRouteForm({ ...routeForm, driverId: !v || v === 'none' ? '' : v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Selecionar depois</SelectItem>
                                    {drivers.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.profile_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateRoute} disabled={creating || !routeForm.plannedDate}>
                            {creating ? 'Criando...' : 'Criar Rota'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
