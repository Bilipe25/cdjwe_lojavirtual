'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    Truck,
    Plus,
    Pencil,
    Trash2,
    RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getVehicles, upsertVehicle, deleteVehicle, type VehicleItem } from '../services'

const typeLabels: Record<string, string> = {
    van: 'Van',
    truck: 'Caminhão',
    motorcycle: 'Moto',
    car: 'Carro',
    other: 'Outro',
}

const statusConfig: Record<string, { label: string; color: string }> = {
    available: { label: 'Disponível', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    in_use: { label: 'Em Uso', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    maintenance: { label: 'Manutenção', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    inactive: { label: 'Inativo', color: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const emptyForm = {
    plate: '',
    name: '',
    type: 'van',
    capacity_kg: '' as string | number,
    capacity_m3: '' as string | number,
    max_stops: '' as string | number,
    fuel_consumption_km_l: '' as string | number,
    fuel_type: 'diesel',
    status: 'available',
    notes: '',
}

export default function VeiculosPage() {
    const [data, setData] = useState<VehicleItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<VehicleItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getVehicles()
        if ('error' in res && res.error) setError(res.error)
        else if ('data' in res && res.data) setData(res.data)
        setLoading(false)
    }, [])

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadData() }, [loadData])

    const openNew = () => {
        setEditId(null)
        setForm(emptyForm)
        setFormOpen(true)
    }

    const openEdit = (v: VehicleItem) => {
        setEditId(v.id)
        setForm({
            plate: v.plate,
            name: v.name,
            type: v.type,
            capacity_kg: v.capacity_kg ?? '',
            capacity_m3: v.capacity_m3 ?? '',
            max_stops: v.max_stops ?? '',
            fuel_consumption_km_l: v.fuel_consumption_km_l ?? '',
            fuel_type: v.fuel_type || 'diesel',
            status: v.status,
            notes: v.notes ?? '',
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        const res = await upsertVehicle({
            id: editId ?? undefined,
            plate: form.plate.toUpperCase().trim(),
            name: form.name.trim(),
            type: form.type,
            capacity_kg: form.capacity_kg ? Number(form.capacity_kg) : null,
            capacity_m3: form.capacity_m3 ? Number(form.capacity_m3) : null,
            max_stops: form.max_stops ? Number(form.max_stops) : null,
            fuel_consumption_km_l: form.fuel_consumption_km_l ? Number(form.fuel_consumption_km_l) : null,
            fuel_type: form.fuel_type,
            status: form.status,
            notes: form.notes || null,
        })
        setSaving(false)
        if (res.error) { setError(res.error); return }
        setFormOpen(false)
        void loadData()
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        const res = await deleteVehicle(deleteTarget.id)
        setDeleting(false)
        setDeleteTarget(null)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const filtered = data.filter(v =>
        v.plate.toLowerCase().includes(search.toLowerCase()) ||
        v.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <Truck className="h-6 w-6" /> Veículos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gerencie a frota de veículos para roteirização
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={openNew} className="gap-2">
                        <Plus className="h-4 w-4" /> Novo Veículo
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Search */}
            <Input
                placeholder="Buscar por placa ou nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />

            {/* Table */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhum veículo encontrado.
                </div>
            ) : (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50/60">
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Placa</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Nome</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy hidden sm:table-cell">Tipo</th>
                                    <th className="px-4 py-3 text-right font-semibold text-navy hidden md:table-cell">Capacidade</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Status</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((v) => {
                                    const st = statusConfig[v.status] || statusConfig.available
                                    return (
                                        <tr key={v.id} className="border-b last:border-b-0 hover:bg-slate-50/40 transition">
                                            <td className="px-4 py-3 font-mono font-bold text-navy">{v.plate}</td>
                                            <td className="px-4 py-3">{v.name}</td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{typeLabels[v.type] || v.type}</td>
                                            <td className="px-4 py-3 text-right hidden md:table-cell text-muted-foreground">
                                                {v.capacity_kg ? `${v.capacity_kg} kg` : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full', st.color)}>
                                                    {st.label}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)} title="Editar">
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(v)} title="Excluir">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Form Dialog */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editId ? 'Editar Veículo' : 'Novo Veículo'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Placa *</label>
                                <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC1D23" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sprinter 01" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v || 'van' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(typeLabels).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Status</label>
                                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v || 'available' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(statusConfig).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Capac. (kg)</label>
                                <Input type="number" value={form.capacity_kg} onChange={(e) => setForm({ ...form, capacity_kg: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Capac. (m³)</label>
                                <Input type="number" value={form.capacity_m3} onChange={(e) => setForm({ ...form, capacity_m3: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Máx. Paradas</label>
                                <Input type="number" value={form.max_stops} onChange={(e) => setForm({ ...form, max_stops: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Consumo (km/l)</label>
                                <Input type="number" step="0.1" value={form.fuel_consumption_km_l} onChange={(e) => setForm({ ...form, fuel_consumption_km_l: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Combustível</label>
                                <Select value={form.fuel_type} onValueChange={(v) => setForm({ ...form, fuel_type: v || 'diesel' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="diesel">Diesel</SelectItem>
                                        <SelectItem value="gasolina">Gasolina</SelectItem>
                                        <SelectItem value="etanol">Etanol</SelectItem>
                                        <SelectItem value="gnv">GNV</SelectItem>
                                        <SelectItem value="eletrico">Elétrico</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Observações</label>
                            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving || !form.plate || !form.name}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Veículo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O veículo <strong>{deleteTarget?.plate}</strong> ({deleteTarget?.name}) será excluído permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleDelete() }} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                            {deleting ? 'Excluindo...' : 'Excluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

