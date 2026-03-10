'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Check, X, Tag } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// Extending the type locally to ensure we have exactly what we need
interface PriceTable {
    id: string
    name: string
    description: string | null
    discount_percentage: number
    is_default: boolean
    is_active: boolean
    created_at: string
}

export default function PriceTablesPage() {
    const [priceTables, setPriceTables] = useState<PriceTable[]>([])
    const [loading, setLoading] = useState(true)

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingTable, setEditingTable] = useState<PriceTable | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Form State
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [discount, setDiscount] = useState('0')
    const [isDefault, setIsDefault] = useState(false)
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        loadPriceTables()
    }, [])

    const loadPriceTables = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('price_tables')
            .select('*')
            .order('name')

        if (error) {
            toast.error('Erro ao buscar tabelas de preço')
        } else {
            setPriceTables(data || [])
        }
        setLoading(false)
    }

    const openCreateDialog = () => {
        setEditingTable(null)
        setName('')
        setDescription('')
        setDiscount('0')
        setIsDefault(false)
        setIsActive(true)
        setIsDialogOpen(true)
    }

    const openEditDialog = (table: PriceTable) => {
        setEditingTable(table)
        setName(table.name)
        setDescription(table.description || '')
        setDiscount(table.discount_percentage.toString())
        setIsDefault(table.is_default)
        setIsActive(table.is_active)
        setIsDialogOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) {
            toast.error('O nome é obrigatório')
            return
        }

        setIsSaving(true)
        const supabase = createClient()
        const parsedDiscount = parseFloat(discount.replace(',', '.')) || 0

        try {
            // Se estiver marcando como padrão, remove o padrão das outras
            if (isDefault) {
                await supabase
                    .from('price_tables')
                    .update({ is_default: false })
                    .neq('id', editingTable?.id || '00000000-0000-0000-0000-000000000000') // just a dummy uuid if creating
            }

            if (editingTable) {
                // Update
                const { error } = await supabase
                    .from('price_tables')
                    .update({
                        name,
                        description,
                        discount_percentage: parsedDiscount,
                        is_default: isDefault,
                        is_active: isActive
                    })
                    .eq('id', editingTable.id)

                if (error) throw error
                toast.success('Tabela atualizada!')
            } else {
                // Create
                const { error } = await supabase
                    .from('price_tables')
                    .insert({
                        name,
                        description,
                        discount_percentage: parsedDiscount,
                        is_default: isDefault,
                        is_active: isActive
                    })

                if (error) throw error
                toast.success('Tabela criada!')
            }

            setIsDialogOpen(false)
            loadPriceTables()
        } catch (err: any) {
            console.error(err)
            toast.error(err.message || 'Erro ao salvar tabela')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja remover a tabela "${name}"?
CUIDADO: Isso removerá a tabela dos clientes que a utilizam!`)) {
            return
        }

        const supabase = createClient()
        const { error } = await supabase
            .from('price_tables')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('Erro ao remover tabela. Ela pode estar em uso.')
        } else {
            toast.success('Tabela removida!')
            setPriceTables(prev => prev.filter(t => t.id !== id))
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy flex items-center gap-2">
                        <Tag className="h-8 w-8 text-bronze" />
                        Tabelas de Preços
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie as tabelas que você pode atribuir aos clientes
                    </p>
                </div>
                <Button onClick={openCreateDialog} className="gradient-navy border-0 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Tabela
                </Button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="glass-card border-0">
                            <CardContent className="p-5">
                                <Skeleton className="h-6 w-3/4 mb-4" />
                                <Skeleton className="h-4 w-full mb-2" />
                                <Skeleton className="h-4 w-1/2" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : priceTables.length === 0 ? (
                <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                    <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Tag className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Nenhuma tabela encontrada</h3>
                    <p className="text-muted-foreground mt-1 text-sm max-w-sm mx-auto">
                        Crie tabelas de preços com diferentes percentuais de desconto para organizar seus clientes.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {priceTables.map((table) => (
                        <motion.div
                            key={table.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            layout
                        >
                            <Card className={`glass-card border-0 relative overflow-hidden transition-all hover:shadow-md ${!table.is_active ? 'opacity-70 grayscale-[30%]' : ''}`}>
                                {table.is_default && (
                                    <div className="absolute top-0 right-0 bg-bronze text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm">
                                        <Check className="h-3 w-3" /> PADRÃO
                                    </div>
                                )}
                                <CardContent className="p-5">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-semibold text-lg text-navy line-clamp-1 pr-6">{table.name}</h3>
                                            {!table.is_active && (
                                                <Badge variant="secondary" className="mt-1 text-[10px]">Inativa</Badge>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-xl font-bold ${table.discount_percentage > 0 ? 'text-green-600' : table.discount_percentage < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                                {table.discount_percentage > 0 ? '-' : table.discount_percentage < 0 ? '+' : ''}
                                                {Math.abs(table.discount_percentage)}%
                                            </div>
                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Desconto Base</span>
                                        </div>
                                    </div>

                                    <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4">
                                        {table.description || 'Sem descrição'}
                                    </p>

                                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-muted-foreground hover:text-navy"
                                            onClick={() => openEditDialog(table)}
                                        >
                                            <Edit2 className="h-4 w-4 mr-1.5" /> Editar
                                        </Button>
                                        {!table.is_default && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(table.id, table.name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)] text-xl text-navy">
                            {editingTable ? 'Editar Tabela de Preços' : 'Nova Tabela de Preços'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure o percentual base que será aplicado a todos os produtos para os clientes desta tabela.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome da Tabela *</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Tabela Especial Ouro"
                                required
                                className="bg-white/60"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Descrição</Label>
                            <Input
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Para clientes da Grande SP"
                                className="bg-white/60"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="discount">Desconto Base (%)</Label>
                            <div className="relative">
                                <Input
                                    id="discount"
                                    type="number"
                                    step="0.01"
                                    value={discount}
                                    onChange={(e) => setDiscount(e.target.value)}
                                    className="bg-white/60 pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Use números positivos para desconto. Use números negativos (-10) para acréscimo de preço.
                            </p>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mt-2">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Tabela Padrão</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Atribuir automaticamente a novos clientes
                                </p>
                            </div>
                            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mb-4">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Status Ativo</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Lojistas com esta tabela só verão os preços se ela estiver ativa
                                </p>
                            </div>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
                                {isSaving ? 'Salvando...' : 'Salvar Tabela'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
