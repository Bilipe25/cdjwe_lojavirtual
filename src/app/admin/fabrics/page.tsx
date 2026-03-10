'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Palette,
    Plus,
    Search,
    MoreHorizontal,
    Edit,
    Trash2,
    Loader2,
    ChevronDown,
    ChevronRight,
    Paintbrush,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Fabric, FabricColor } from '@/lib/types'

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

type FabricWithColors = Fabric & { colors: FabricColor[] }

export default function AdminFabricsPage() {
    const [fabrics, setFabrics] = useState<FabricWithColors[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedFabric, setExpandedFabric] = useState<string | null>(null)

    // Fabric dialog
    const [fabricDialogOpen, setFabricDialogOpen] = useState(false)
    const [savingFabric, setSavingFabric] = useState(false)
    const [editingFabric, setEditingFabric] = useState<Fabric | null>(null)
    const [fabricName, setFabricName] = useState('')
    const [fabricDescription, setFabricDescription] = useState('')
    const [fabricPriceMod, setFabricPriceMod] = useState('0')
    const [fabricActive, setFabricActive] = useState(true)

    // Color dialog
    const [colorDialogOpen, setColorDialogOpen] = useState(false)
    const [savingColor, setSavingColor] = useState(false)
    const [editingColor, setEditingColor] = useState<FabricColor | null>(null)
    const [colorFabricId, setColorFabricId] = useState('')
    const [colorName, setColorName] = useState('')
    const [colorHex, setColorHex] = useState('#8B7355')
    const [colorActive, setColorActive] = useState(true)

    useEffect(() => { loadFabrics() }, [])

    const loadFabrics = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data: fabricsData } = await supabase.from('fabrics').select('*').order('sort_order')
        const { data: colorsData } = await supabase.from('fabric_colors').select('*').order('sort_order')

        if (fabricsData) {
            const withColors = fabricsData.map(f => ({
                ...f,
                colors: (colorsData || []).filter(c => c.fabric_id === f.id),
            }))
            setFabrics(withColors)
        }
        setLoading(false)
    }

    // ---- Fabric CRUD ----
    const openFabricDialog = (fabric?: Fabric) => {
        if (fabric) {
            setEditingFabric(fabric)
            setFabricName(fabric.name)
            setFabricDescription(fabric.description || '')
            setFabricPriceMod(fabric.price_modifier.toString())
            setFabricActive(fabric.is_active)
        } else {
            setEditingFabric(null)
            setFabricName('')
            setFabricDescription('')
            setFabricPriceMod('0')
            setFabricActive(true)
        }
        setFabricDialogOpen(true)
    }

    const saveFabric = async () => {
        if (!fabricName) { toast.error('Informe o nome do tecido'); return }
        setSavingFabric(true)
        const supabase = createClient()
        const data = {
            name: fabricName,
            slug: slugify(fabricName),
            description: fabricDescription || null,
            price_modifier: parseFloat(fabricPriceMod) || 0,
            is_active: fabricActive,
        }
        if (editingFabric) {
            const { error } = await supabase.from('fabrics').update(data).eq('id', editingFabric.id)
            if (error) { toast.error('Erro ao atualizar'); setSavingFabric(false); return }
            toast.success('Tecido atualizado!')
        } else {
            const { error } = await supabase.from('fabrics').insert(data)
            if (error) { toast.error('Erro ao criar tecido'); setSavingFabric(false); return }
            toast.success('Tecido criado!')
        }
        setSavingFabric(false)
        setFabricDialogOpen(false)
        loadFabrics()
    }

    const deleteFabric = async (id: string) => {
        if (!confirm('Excluir tecido e todas as suas cores?')) return
        const supabase = createClient()
        const { error } = await supabase.from('fabrics').delete().eq('id', id)
        if (error) { toast.error('Erro ao excluir. O tecido pode estar vinculado a variantes.'); return }
        setFabrics(prev => prev.filter(f => f.id !== id))
        toast.success('Tecido excluído!')
    }

    // ---- Color CRUD ----
    const openColorDialog = (fabricId: string, color?: FabricColor) => {
        setColorFabricId(fabricId)
        if (color) {
            setEditingColor(color)
            setColorName(color.name)
            setColorHex(color.hex_code || '#8B7355')
            setColorActive(color.is_active)
        } else {
            setEditingColor(null)
            setColorName('')
            setColorHex('#8B7355')
            setColorActive(true)
        }
        setColorDialogOpen(true)
    }

    const saveColor = async () => {
        if (!colorName) { toast.error('Informe o nome da cor'); return }
        setSavingColor(true)
        const supabase = createClient()
        const data = {
            fabric_id: colorFabricId,
            name: colorName,
            hex_code: colorHex,
            is_active: colorActive,
        }
        if (editingColor) {
            const { error } = await supabase.from('fabric_colors').update(data).eq('id', editingColor.id)
            if (error) { toast.error('Erro ao atualizar'); setSavingColor(false); return }
            toast.success('Cor atualizada!')
        } else {
            const { error } = await supabase.from('fabric_colors').insert(data)
            if (error) { toast.error('Erro ao criar cor'); setSavingColor(false); return }
            toast.success('Cor criada!')
        }
        setSavingColor(false)
        setColorDialogOpen(false)
        loadFabrics()
    }

    const deleteColor = async (id: string) => {
        if (!confirm('Excluir esta cor?')) return
        const supabase = createClient()
        const { error } = await supabase.from('fabric_colors').delete().eq('id', id)
        if (error) { toast.error('Erro ao excluir.'); return }
        loadFabrics()
        toast.success('Cor excluída!')
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">Tecidos & Cores</h1>
                    <p className="text-muted-foreground mt-1">Gerencie a grade de tecidos e cores</p>
                </div>
                <Button className="gradient-navy border-0 text-white gap-2" onClick={() => openFabricDialog()}>
                    <Plus className="h-4 w-4" />Novo Tecido
                </Button>
            </div>

            {loading ? (
                <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
            ) : fabrics.length === 0 ? (
                <div className="text-center py-16">
                    <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4"><Palette className="h-8 w-8 text-muted-foreground" /></div>
                    <h3 className="text-lg font-semibold">Nenhum tecido cadastrado</h3>
                    <Button className="mt-4 gradient-bronze border-0 text-white" onClick={() => openFabricDialog()}>Criar primeiro tecido</Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {fabrics.map((fabric, i) => (
                        <motion.div key={fabric.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                            <Card className="glass-card border-0">
                                <CardContent className="p-0">
                                    {/* Fabric Header */}
                                    <div className="flex items-center p-4 cursor-pointer" onClick={() => setExpandedFabric(expandedFabric === fabric.id ? null : fabric.id)}>
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            {expandedFabric === fabric.id ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                                            <div className="h-10 w-10 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                                                <Palette className="h-5 w-5 text-white" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold">{fabric.name}</h3>
                                                    {!fabric.is_active && <Badge className="text-[10px] bg-red-100 text-red-800">Inativo</Badge>}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {fabric.colors.length} {fabric.colors.length === 1 ? 'cor' : 'cores'} •
                                                    {fabric.price_modifier > 0 ? ` +R$ ${fabric.price_modifier.toFixed(2)}` : ' Sem adicional'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <Button size="sm" variant="outline" className="gap-1" onClick={() => openColorDialog(fabric.id)}>
                                                <Paintbrush className="h-3.5 w-3.5" />+ Cor
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openFabricDialog(fabric)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => deleteFabric(fabric.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>

                                    {/* Colors (expanded) */}
                                    {expandedFabric === fabric.id && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-t px-4 py-3">
                                            {fabric.colors.length === 0 ? (
                                                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cor cadastrada</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {fabric.colors.map((color) => (
                                                        <div key={color.id} className="group relative flex items-center gap-2 px-3 py-2 rounded-lg border bg-white/60 hover:shadow-sm transition-shadow">
                                                            <div className="h-6 w-6 rounded-full border shadow-inner" style={{ backgroundColor: color.hex_code || '#ccc' }} />
                                                            <span className="text-sm">{color.name}</span>
                                                            {!color.is_active && <span className="text-[10px] text-red-500">inativo</span>}
                                                            <div className="hidden group-hover:flex absolute -top-1 -right-1 gap-0.5">
                                                                <button onClick={() => openColorDialog(fabric.id, color)} className="h-5 w-5 rounded-full bg-white border shadow flex items-center justify-center hover:bg-muted">
                                                                    <Edit className="h-2.5 w-2.5" />
                                                                </button>
                                                                <button onClick={() => deleteColor(color.id)} className="h-5 w-5 rounded-full bg-white border shadow flex items-center justify-center hover:bg-red-50 text-destructive">
                                                                    <Trash2 className="h-2.5 w-2.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Fabric Dialog */}
            <Dialog open={fabricDialogOpen} onOpenChange={setFabricDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="font-[family-name:var(--font-heading)]">{editingFabric ? 'Editar Tecido' : 'Novo Tecido'}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Nome *</Label><Input value={fabricName} onChange={(e: any) => setFabricName(e.target.value)} placeholder="Ex: Suede" className="bg-white/60" /></div>
                        <div className="space-y-2"><Label>Descrição</Label><Textarea value={fabricDescription} onChange={(e: any) => setFabricDescription(e.target.value)} placeholder="Descrição do tecido..." className="bg-white/60 resize-none" rows={2} /></div>
                        <div className="space-y-2"><Label>Adicional de Preço (R$)</Label><Input type="number" step="0.01" value={fabricPriceMod} onChange={(e: any) => setFabricPriceMod(e.target.value)} placeholder="0,00" className="bg-white/60" /></div>
                        <div className="flex items-center gap-2"><Switch checked={fabricActive} onCheckedChange={setFabricActive} /><Label>Ativo</Label></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFabricDialogOpen(false)}>Cancelar</Button>
                        <Button className="gradient-navy border-0 text-white" onClick={saveFabric} disabled={savingFabric}>
                            {savingFabric ? <Loader2 className="h-4 w-4 animate-spin" /> : editingFabric ? 'Salvar' : 'Criar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Color Dialog */}
            <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="font-[family-name:var(--font-heading)]">{editingColor ? 'Editar Cor' : 'Nova Cor'}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Nome *</Label><Input value={colorName} onChange={(e: any) => setColorName(e.target.value)} placeholder="Ex: Bege Dourado" className="bg-white/60" /></div>
                        <div className="space-y-2">
                            <Label>Cor</Label>
                            <div className="flex items-center gap-3">
                                <input type="color" value={colorHex} onChange={(e: any) => setColorHex(e.target.value)} className="h-10 w-14 rounded border cursor-pointer" />
                                <Input value={colorHex} onChange={(e: any) => setColorHex(e.target.value)} className="bg-white/60 flex-1" placeholder="#000000" />
                                <div className="h-10 w-10 rounded-full border shadow-inner" style={{ backgroundColor: colorHex }} />
                            </div>
                        </div>
                        <div className="flex items-center gap-2"><Switch checked={colorActive} onCheckedChange={setColorActive} /><Label>Ativo</Label></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setColorDialogOpen(false)}>Cancelar</Button>
                        <Button className="gradient-navy border-0 text-white" onClick={saveColor} disabled={savingColor}>
                            {savingColor ? <Loader2 className="h-4 w-4 animate-spin" /> : editingColor ? 'Salvar' : 'Criar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
