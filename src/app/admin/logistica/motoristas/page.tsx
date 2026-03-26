'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    UserCircle,
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
import { getDrivers, upsertDriver, deleteDriver, getVehicles, type DriverItem, type VehicleItem } from '../actions'

const statusConfig: Record<string, { label: string; color: string }> = {
    available: { label: 'Disponível', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    on_route: { label: 'Em Rota', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    off_duty: { label: 'Folga', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    inactive: { label: 'Inativo', color: 'bg-gray-50 text-gray-500 border-gray-200' },
}

export default function MotoristasPage() {
    const [data, setData] = useState<DriverItem[]>([])
    const [vehicles, setVehicles] = useState<VehicleItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState({
        profile_id: '',
        phone: '',
        license_number: '',
        default_vehicle_id: '',
        status: 'available',
        notes: '',
    })
    const [saving, setSaving] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<DriverItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const [driversRes, vehiclesRes] = await Promise.all([getDrivers(), getVehicles()])
        if ('error' in driversRes && driversRes.error) setError(driversRes.error)
        else if ('data' in driversRes && driversRes.data) setData(driversRes.data)
        if ('data' in vehiclesRes && vehiclesRes.data) setVehicles(vehiclesRes.data)
        setLoading(false)
    }, [])

    useEffect(() => { void loadData() }, [loadData])

    const openNew = () => {
        setEditId(null)
        setForm({ profile_id: '', phone: '', license_number: '', default_vehicle_id: '', status: 'available', notes: '' })
        setFormOpen(true)
    }

    const openEdit = (d: DriverItem) => {
        setEditId(d.id)
        setForm({
            profile_id: d.profile_id,
            phone: d.phone ?? '',
            license_number: d.license_number ?? '',
            default_vehicle_id: d.default_vehicle_id || '',
            status: d.status,
            notes: d.notes ?? '',
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        const res = await upsertDriver({
            id: editId ?? undefined,
            profile_id: form.profile_id,
            phone: form.phone || null,
            license_number: form.license_number || null,
            default_vehicle_id: form.default_vehicle_id || null,
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
        const res = await deleteDriver(deleteTarget.id)
        setDeleting(false)
        setDeleteTarget(null)
        if (res.error) setError(res.error)
        else void loadData()
    }

    const filtered = data.filter(d =>
        d.profile_name.toLowerCase().includes(search.toLowerCase()) ||
        d.profile_email.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <UserCircle className="h-6 w-6" /> Motoristas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gerencie motoristas para operação de rotas
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={openNew} className="gap-2">
                        <Plus className="h-4 w-4" /> Novo Motorista
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />

            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhum motorista encontrado.
                </div>
            ) : (
                <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50/60">
                                    <th className="px-4 py-3 text-left font-semibold text-navy">Nome</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy hidden sm:table-cell">Telefone</th>
                                    <th className="px-4 py-3 text-left font-semibold text-navy hidden md:table-cell">CNH</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Status</th>
                                    <th className="px-4 py-3 text-center font-semibold text-navy">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((d) => {
                                    const st = statusConfig[d.status] || statusConfig.available
                                    return (
                                        <tr key={d.id} className="border-b last:border-b-0 hover:bg-slate-50/40 transition">
                                            <td className="px-4 py-3">
                                                <div>
                                                    <p className="font-semibold text-navy">{d.profile_name}</p>
                                                    <p className="text-xs text-muted-foreground">{d.profile_email}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{d.phone || '—'}</td>
                                            <td className="px-4 py-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{d.license_number || '—'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full', st.color)}>
                                                    {st.label}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(d)}>
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

            {/* Form */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editId ? 'Editar Motorista' : 'Novo Motorista'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {!editId && (
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Profile ID (UUID do usuário driver) *</label>
                                <Input value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })} placeholder="UUID do perfil" />
                                <p className="text-[10px] text-muted-foreground mt-1">O usuário deve ter role &quot;driver&quot; no sistema.</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">CNH</label>
                                <Input value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Veículo Padrão</label>
                                <Select value={form.default_vehicle_id || 'none'} onValueChange={(v) => setForm({ ...form, default_vehicle_id: !v || v === 'none' ? '' : v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhum</SelectItem>
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.plate} - {v.name}</SelectItem>
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
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Observações</label>
                            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving || (!editId && !form.profile_id)}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Motorista?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong>{deleteTarget?.profile_name}</strong> será removido da lista de motoristas.
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
