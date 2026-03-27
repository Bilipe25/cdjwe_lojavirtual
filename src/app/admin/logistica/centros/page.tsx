'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    Warehouse,
    Plus,
    Pencil,
    Trash2,
    RefreshCw,
    MapPin,
    Star,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import { cn } from '@/lib/utils'
import { getCenters, upsertCenter, deleteCenter, type CenterItem } from '../services'

const emptyForm = {
    name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    latitude: '',
    longitude: '',
    is_default: false,
    is_active: true,
}

export default function CentrosPage() {
    const [data, setData] = useState<CenterItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [formOpen, setFormOpen] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<CenterItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getCenters()
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

    const openEdit = (c: CenterItem) => {
        setEditId(c.id)
        setForm({
            name: c.name,
            address: c.address,
            city: c.city,
            state: c.state || '',
            zip_code: c.zip_code || '',
            latitude: c.latitude ? String(c.latitude) : '',
            longitude: c.longitude ? String(c.longitude) : '',
            is_default: c.is_default,
            is_active: c.is_active,
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        if (!form.name || !form.address || !form.city) return
        setSaving(true)
        setError(null)
        const res = await upsertCenter({
            ...(editId ? { id: editId } : {}),
            name: form.name,
            address: form.address,
            city: form.city,
            state: form.state || null,
            zip_code: form.zip_code || null,
            latitude: form.latitude ? parseFloat(form.latitude) : null,
            longitude: form.longitude ? parseFloat(form.longitude) : null,
            is_default: form.is_default,
            is_active: form.is_active,
        })
        setSaving(false)
        if ('error' in res && res.error) { setError(res.error); return }
        setFormOpen(false)
        void loadData()
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        const res = await deleteCenter(deleteTarget.id)
        setDeleting(false)
        setDeleteTarget(null)
        if ('error' in res && res.error) setError(res.error)
        else void loadData()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <Warehouse className="h-6 w-6" /> Centros de Distribuição
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gerencie os centros de saída das rotas
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={openNew} className="gap-2">
                        <Plus className="h-4 w-4" /> Novo Centro
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhum centro cadastrado.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.map((c) => (
                        <div key={c.id} className={cn(
                            'rounded-xl border bg-white p-4 transition hover:shadow-sm',
                            !c.is_active && 'opacity-50'
                        )}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                        <Warehouse className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-navy text-sm">{c.name}</p>
                                            {c.is_default && (
                                                <Badge variant="secondary" className="text-[9px] rounded-full gap-0.5 bg-amber-50 text-amber-700 border-amber-200">
                                                    <Star className="h-2 w-2" /> Padrão
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{c.address}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                                        <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(c)}>
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            <div className="mt-2.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                <MapPin className="h-2.5 w-2.5" />
                                <span>{c.city}{c.state ? ` / ${c.state}` : ''}</span>
                                {c.latitude && c.longitude && (
                                    <Badge variant="outline" className="text-[8px] rounded-full text-emerald-600 border-emerald-200">
                                        Geocodificado
                                    </Badge>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Form Dialog */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editId ? 'Editar Centro' : 'Novo Centro'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CD Principal" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Endereço *</label>
                            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua das Flores, 123" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Cidade *</label>
                                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">CEP</label>
                            <Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Latitude</label>
                                <Input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="-23.5505" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Longitude</label>
                                <Input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="-46.6333" />
                            </div>
                        </div>
                        <div className="flex items-center gap-6 pt-2">
                            <div className="flex items-center gap-2">
                                <Switch id="is_default" checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                                <label htmlFor="is_default" className="text-xs font-medium">Centro Padrão</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                                <label htmlFor="is_active" className="text-xs font-medium">Ativo</label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving || !form.name || !form.address || !form.city}>
                            {saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Centro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O centro <strong>{deleteTarget?.name}</strong> será excluído permanentemente.
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

