'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    MapPin,
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
import { cn } from '@/lib/utils'
import { getRegions, upsertRegion, deleteRegion, getCenters, type RegionItem, type CenterItem } from '../services'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

export default function RegioesPage() {
    const [data, setData] = useState<RegionItem[]>([])
    const [centers, setCenters] = useState<CenterItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [formOpen, setFormOpen] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState({
        name: '',
        description: '',
        citiesText: '',
        statesText: '',
        default_center_id: '',
        color: '#3B82F6',
        is_active: true,
    })
    const [saving, setSaving] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<RegionItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const [regRes, cenRes] = await Promise.all([getRegions(), getCenters()])
        if ('error' in regRes && regRes.error) setError(regRes.error)
        else if ('data' in regRes && regRes.data) setData(regRes.data)
        if ('data' in cenRes && cenRes.data) setCenters(cenRes.data)
        setLoading(false)
    }, [])

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadData() }, [loadData])

    const openNew = () => {
        setEditId(null)
        setForm({ name: '', description: '', citiesText: '', statesText: '', default_center_id: '', color: '#3B82F6', is_active: true })
        setFormOpen(true)
    }

    const openEdit = (r: RegionItem) => {
        setEditId(r.id)
        setForm({
            name: r.name,
            description: r.description ?? '',
            citiesText: (r.cities || []).join(', '),
            statesText: (r.states || []).join(', '),
            default_center_id: r.default_center_id ?? '',
            color: r.color || '#3B82F6',
            is_active: r.is_active,
        })
        setFormOpen(true)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        const res = await upsertRegion({
            id: editId ?? undefined,
            name: form.name.trim(),
            description: form.description || null,
            cities: form.citiesText.split(',').map(c => c.trim()).filter(Boolean),
            states: form.statesText.split(',').map(s => s.trim()).filter(Boolean),
            default_center_id: form.default_center_id || null,
            color: form.color,
            is_active: form.is_active,
        })
        setSaving(false)
        if (res.error) { setError(res.error); return }
        setFormOpen(false)
        void loadData()
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        const res = await deleteRegion(deleteTarget.id)
        setDeleting(false)
        setDeleteTarget(null)
        if (res.error) setError(res.error)
        else void loadData()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <MapPin className="h-6 w-6" /> Regiões de Entrega
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Defina regiões geográficas para agrupamento de rotas
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={openNew} className="gap-2">
                        <Plus className="h-4 w-4" /> Nova Região
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
            ) : data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                    Nenhuma região cadastrada.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.map((r) => (
                        <div key={r.id} className={cn(
                            'rounded-xl border bg-white p-4 space-y-3 relative overflow-hidden',
                            !r.is_active && 'opacity-60'
                        )}>
                            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: r.color }} />
                            <div className="flex items-start justify-between pl-3">
                                <div>
                                    <h3 className="font-bold text-navy">{r.name}</h3>
                                    {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(r)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <div className="pl-3 space-y-1.5">
                                {r.cities?.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {r.cities.slice(0, 5).map((c: string) => (
                                            <Badge key={c} variant="secondary" className="text-[9px] rounded-full">{c}</Badge>
                                        ))}
                                        {r.cities.length > 5 && (
                                            <Badge variant="secondary" className="text-[9px] rounded-full">+{r.cities.length - 5}</Badge>
                                        )}
                                    </div>
                                )}
                                {r.center_name && (
                                    <p className="text-[10px] text-muted-foreground">Centro: <strong>{r.center_name}</strong></p>
                                )}
                                <Badge variant="outline" className={cn(
                                    'text-[9px] font-semibold rounded-full',
                                    r.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                                )}>
                                    {r.is_active ? 'Ativa' : 'Inativa'}
                                </Badge>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editId ? 'Editar Região' : 'Nova Região'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Triângulo Mineiro" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Cor</label>
                                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Cidades (separar por vírgula)</label>
                            <Input value={form.citiesText} onChange={(e) => setForm({ ...form, citiesText: e.target.value })} placeholder="Uberlândia, Uberaba, Araguari" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground">Estados (separar por vírgula)</label>
                            <Input value={form.statesText} onChange={(e) => setForm({ ...form, statesText: e.target.value })} placeholder="MG, SP" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Centro de Saída</label>
                                <Select value={form.default_center_id || 'none'} onValueChange={(v) => setForm({ ...form, default_center_id: !v || v === 'none' ? '' : v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhum</SelectItem>
                                        {centers.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Status</label>
                                <Select value={form.is_active ? 'true' : 'false'} onValueChange={(v) => setForm({ ...form, is_active: v === 'true' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">Ativa</SelectItem>
                                        <SelectItem value="false">Inativa</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving || !form.name}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Região?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A região <strong>{deleteTarget?.name}</strong> será excluída permanentemente.
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

