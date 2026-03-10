'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, CreditCard, MoveUp, MoveDown } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'

interface PaymentCondition {
    id: string
    name: string
    description: string | null
    installments: number
    discount_percentage: number
    is_active: boolean
    sort_order: number
    created_at: string
}

export default function PaymentConditionsPage() {
    const [conditions, setConditions] = useState<PaymentCondition[]>([])
    const [loading, setLoading] = useState(true)

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingCondition, setEditingCondition] = useState<PaymentCondition | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Form State
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [installments, setInstallments] = useState('1')
    const [discount, setDiscount] = useState('0')
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        loadConditions()
    }, [])

    const loadConditions = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('payment_conditions')
            .select('*')
            .order('sort_order', { ascending: true })

        if (error) {
            toast.error('Erro ao buscar condições de pagamento')
        } else {
            setConditions(data || [])
        }
        setLoading(false)
    }

    const openCreateDialog = () => {
        setEditingCondition(null)
        setName('')
        setDescription('')
        setInstallments('1')
        setDiscount('0')
        setIsActive(true)
        setIsDialogOpen(true)
    }

    const openEditDialog = (cond: PaymentCondition) => {
        setEditingCondition(cond)
        setName(cond.name)
        setDescription(cond.description || '')
        setInstallments(cond.installments.toString())
        setDiscount(cond.discount_percentage.toString())
        setIsActive(cond.is_active)
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
        const parsedInstallments = parseInt(installments, 10) || 1

        try {
            if (editingCondition) {
                // Update
                const { error } = await supabase
                    .from('payment_conditions')
                    .update({
                        name,
                        description,
                        installments: parsedInstallments,
                        discount_percentage: parsedDiscount,
                        is_active: isActive
                    })
                    .eq('id', editingCondition.id)

                if (error) throw error
                toast.success('Condição atualizada!')
            } else {
                // Create
                // Find max sort_order
                const maxOrder = conditions.length > 0 ? Math.max(...conditions.map(c => c.sort_order)) : 0

                const { error } = await supabase
                    .from('payment_conditions')
                    .insert({
                        name,
                        description,
                        installments: parsedInstallments,
                        discount_percentage: parsedDiscount,
                        is_active: isActive,
                        sort_order: maxOrder + 1
                    })

                if (error) throw error
                toast.success('Condição criada!')
            }

            setIsDialogOpen(false)
            loadConditions()
        } catch (err: any) {
            console.error(err)
            toast.error(err.message || 'Erro ao salvar condição')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja remover a condição "${name}"?`)) {
            return
        }

        const supabase = createClient()
        const { error } = await supabase
            .from('payment_conditions')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('Erro ao remover condição.')
        } else {
            toast.success('Condição removida!')
            setConditions(prev => prev.filter(c => c.id !== id))
        }
    }

    const moveOrder = async (index: number, direction: 'up' | 'down') => {
        if (
            (direction === 'up' && index === 0) ||
            (direction === 'down' && index === conditions.length - 1)
        ) return

        const newConditions = [...conditions]
        const swapIndex = direction === 'up' ? index - 1 : index + 1

        // Swap sort_order values
        const tempOrder = newConditions[index].sort_order
        newConditions[index].sort_order = newConditions[swapIndex].sort_order
        newConditions[swapIndex].sort_order = tempOrder

        // Swap array positions for optimistic UI
        const tempObj = newConditions[index]
        newConditions[index] = newConditions[swapIndex]
        newConditions[swapIndex] = tempObj

        setConditions(newConditions)

        const supabase = createClient()

        // Update both in DB
        await Promise.all([
            supabase.from('payment_conditions').update({ sort_order: newConditions[index].sort_order }).eq('id', newConditions[index].id),
            supabase.from('payment_conditions').update({ sort_order: newConditions[swapIndex].sort_order }).eq('id', newConditions[swapIndex].id)
        ])
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy flex items-center gap-2">
                        <CreditCard className="h-8 w-8 text-bronze" />
                        Formas de Pagamento
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie as condições de pagamento exibidas no checkout
                    </p>
                </div>
                <Button onClick={openCreateDialog} className="gradient-navy border-0 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Condição
                </Button>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="glass-card border-0">
                            <CardContent className="p-4 flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : conditions.length === 0 ? (
                <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                    <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <CreditCard className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Nenhuma condição encontrada</h3>
                    <p className="text-muted-foreground mt-1 text-sm max-w-sm mx-auto">
                        Crie formas de pagamento como "À vista", "30/60 dias" para seus clientes escolherem no carrinho.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {conditions.map((cond, index) => (
                        <motion.div
                            key={cond.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            layout
                        >
                            <Card className={`glass-card border-0 transition-all hover:shadow-md ${!cond.is_active ? 'opacity-70 grayscale-[30%]' : ''}`}>
                                <CardContent className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="h-12 w-12 rounded-full bg-navy/5 flex items-center justify-center shrink-0 border border-navy/10">
                                            <span className="font-bold text-navy">{cond.installments}x</span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold text-lg text-navy truncate">{cond.name}</h3>
                                                {!cond.is_active && (
                                                    <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                                                )}
                                                {cond.discount_percentage > 0 && (
                                                    <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]">
                                                        -{cond.discount_percentage}%
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground truncate">
                                                {cond.description || 'Sem descrição'}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <div className="flex flex-col mr-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-navy"
                                                    disabled={index === 0}
                                                    onClick={() => moveOrder(index, 'up')}
                                                >
                                                    <MoveUp className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-navy"
                                                    disabled={index === conditions.length - 1}
                                                    onClick={() => moveOrder(index, 'down')}
                                                >
                                                    <MoveDown className="h-3 w-3" />
                                                </Button>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-muted-foreground hover:text-navy"
                                                onClick={() => openEditDialog(cond)}
                                            >
                                                <Edit2 className="h-4 w-4 mr-1.5" /> Editar
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(cond.id, cond.name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
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
                            {editingCondition ? 'Editar Condição' : 'Nova Condição de Pagamento'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure os prazos que aparecerão para os clientes no checkout.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome / Prazo *</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: 30/60/90 dias"
                                required
                                className="bg-white/60"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="installments">Qtd. Parcelas *</Label>
                                <Input
                                    id="installments"
                                    type="number"
                                    min="1"
                                    max="36"
                                    required
                                    value={installments}
                                    onChange={(e) => setInstallments(e.target.value)}
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="discount">Desconto (%)</Label>
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
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Descrição (Visível ao cliente)</Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Desconto especial para pagamento à vista no PIX"
                                className="bg-white/60 resize-none"
                                rows={2}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mb-4">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Status Ativo</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Exibir esta opção no carrinho de compras
                                </p>
                            </div>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
                                {isSaving ? 'Salvando...' : 'Salvar Condição'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
