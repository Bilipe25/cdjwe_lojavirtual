'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Layers, MoveUp, MoveDown } from 'lucide-react'
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

interface Category {
    id: string
    name: string
    slug: string
    description: string | null
    image_url: string | null
    parent_id: string | null
    sort_order: number
    is_active: boolean
    created_at: string
}

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingCategory, setEditingCategory] = useState<Category | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Form State
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [parentId, setParentId] = useState<string>('')
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        loadCategories()
    }, [])

    const loadCategories = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('sort_order', { ascending: true })

        if (error) {
            toast.error('Erro ao buscar categorias')
        } else {
            setCategories(data || [])
        }
        setLoading(false)
    }

    const openCreateDialog = () => {
        setEditingCategory(null)
        setName('')
        setDescription('')
        setParentId('')
        setIsActive(true)
        setIsDialogOpen(true)
    }

    const openEditDialog = (cat: Category) => {
        setEditingCategory(cat)
        setName(cat.name)
        setDescription(cat.description || '')
        setParentId(cat.parent_id || '')
        setIsActive(cat.is_active)
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
        const slug = slugify(name)
        const finalParentId = parentId === '' ? null : parentId

        // Avoid circular reference
        if (editingCategory && editingCategory.id === finalParentId) {
            toast.error('Uma categoria não pode ser pai dela mesma')
            setIsSaving(false)
            return
        }

        try {
            if (editingCategory) {
                // Update
                const { error } = await supabase
                    .from('categories')
                    .update({
                        name,
                        slug,
                        description,
                        parent_id: finalParentId,
                        is_active: isActive
                    })
                    .eq('id', editingCategory.id)

                if (error) {
                    if (error.message.includes('unique')) throw new Error('Já existe uma categoria com este nome')
                    throw error
                }
                toast.success('Categoria atualizada!')
            } else {
                // Create
                const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0

                const { error } = await supabase
                    .from('categories')
                    .insert({
                        name,
                        slug,
                        description,
                        parent_id: finalParentId,
                        is_active: isActive,
                        sort_order: maxOrder + 1
                    })

                if (error) {
                    if (error.message.includes('unique')) throw new Error('Já existe uma categoria com este nome')
                    throw error
                }
                toast.success('Categoria criada!')
            }

            setIsDialogOpen(false)
            loadCategories()
        } catch (err: any) {
            console.error(err)
            toast.error(err.message || 'Erro ao salvar categoria')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja remover a categoria "${name}"?\nIsso pode falhar se existirem produtos vinculados a ela.`)) {
            return
        }

        const supabase = createClient()
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('Erro ao remover. Verifique se existem produtos ou subcategorias vinculadas.')
        } else {
            toast.success('Categoria removida!')
            setCategories(prev => prev.filter(c => c.id !== id))
        }
    }

    const moveOrder = async (index: number, direction: 'up' | 'down') => {
        if (
            (direction === 'up' && index === 0) ||
            (direction === 'down' && index === categories.length - 1)
        ) return

        const newCats = [...categories]
        const swapIndex = direction === 'up' ? index - 1 : index + 1

        const tempOrder = newCats[index].sort_order
        newCats[index].sort_order = newCats[swapIndex].sort_order
        newCats[swapIndex].sort_order = tempOrder

        const tempObj = newCats[index]
        newCats[index] = newCats[swapIndex]
        newCats[swapIndex] = tempObj

        setCategories(newCats)

        const supabase = createClient()
        await Promise.all([
            supabase.from('categories').update({ sort_order: newCats[index].sort_order }).eq('id', newCats[index].id),
            supabase.from('categories').update({ sort_order: newCats[swapIndex].sort_order }).eq('id', newCats[swapIndex].id)
        ])
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy flex items-center gap-2">
                        <Layers className="h-8 w-8 text-bronze" />
                        Categorias de Produtos
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie a organização e hierarquia dos seus sofás e estofados
                    </p>
                </div>
                <Button onClick={openCreateDialog} className="gradient-navy border-0 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Categoria
                </Button>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="glass-card border-0">
                            <CardContent className="p-4 flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : categories.length === 0 ? (
                <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                    <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Layers className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Nenhuma categoria encontrada</h3>
                    <p className="text-muted-foreground mt-1 text-sm max-w-sm mx-auto">
                        Crie categorias (ex: Linha Ouro, Sofás Retráteis) para organizar seus produtos na loja.
                    </p>
                    <Button onClick={openCreateDialog} className="mt-4 gradient-bronze border-0 text-white">Criar categoria</Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {categories.map((cat, index) => {
                        const parent = categories.find(c => c.id === cat.parent_id)
                        return (
                            <motion.div
                                key={cat.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                layout
                            >
                                <Card className={`glass-card border-0 transition-all hover:shadow-md ${!cat.is_active ? 'opacity-70 grayscale-[30%]' : ''} ${cat.parent_id ? 'ml-8 bg-black/5' : ''}`}>
                                    <CardContent className="p-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-navy/10 to-transparent flex items-center justify-center shrink-0 border border-navy/10">
                                                <Layers className={`h-6 w-6 ${cat.parent_id ? 'text-muted-foreground' : 'text-navy'}`} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-lg text-navy truncate">
                                                        {cat.name}
                                                    </h3>
                                                    {!cat.is_active && (
                                                        <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground truncate">
                                                    {parent && <span className="font-medium">↳ Subcategoria de {parent.name} | </span>}
                                                    {cat.description || 'Sem descrição'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <div className="flex flex-col mr-2">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-navy"
                                                        disabled={index === 0} onClick={() => moveOrder(index, 'up')}>
                                                        <MoveUp className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-navy"
                                                        disabled={index === categories.length - 1} onClick={() => moveOrder(index, 'down')}>
                                                        <MoveDown className="h-3 w-3" />
                                                    </Button>
                                                </div>

                                                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-navy" onClick={() => openEditDialog(cat)}>
                                                    <Edit2 className="h-4 w-4 mr-1.5" /> Editar
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(cat.id, cat.name)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)] text-xl text-navy">
                            {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                        </DialogTitle>
                        <DialogDescription>
                            Organize os produtos da loja em categorias e subcategorias.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome da Categoria *</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Sofá Retrátil"
                                required
                                className="bg-white/60"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Descrição (Visível ao cliente)</Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Linha premium de sofás retráteis..."
                                className="bg-white/60 resize-none"
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Categoria Pai (Opcional)</Label>
                            <select
                                value={parentId}
                                onChange={(e) => setParentId(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-white/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">Nenhuma (Categoria Principal)</option>
                                {categories
                                    .filter(c => !editingCategory || c.id !== editingCategory.id) // Cannot be parent of itself
                                    .map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mb-4">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Status Ativo</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Exibir esta categoria na loja
                                </p>
                            </div>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
                                {isSaving ? 'Salvando...' : 'Salvar Categoria'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
