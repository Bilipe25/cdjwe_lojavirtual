'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Package,
    Plus,
    Search,
    MoreHorizontal,
    Edit,
    Trash2,
    Eye,
    Star,
    Loader2,
    ImageIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import type { Product, Category } from '@/lib/types'
import Image from 'next/image'

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function AdminProductsPage() {
    const [products, setProducts] = useState<(Product & { category?: Category; images?: { url: string; is_primary: boolean }[] })[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    // Form state
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [size, setSize] = useState('')
    const [basePrice, setBasePrice] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [isFeatured, setIsFeatured] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        const supabase = createClient()
        const [prodsRes, catsRes] = await Promise.all([
            supabase.from('products').select('*, category:categories(*), images:product_images(url, is_primary)').order('sort_order'),
            supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        ])
        if (prodsRes.data) setProducts(prodsRes.data)
        if (catsRes.data) setCategories(catsRes.data)
        setLoading(false)
    }

    const openDialog = (product?: Product) => {
        if (product) {
            setEditingProduct(product)
            setName(product.name)
            setDescription(product.description || '')
            setCategoryId(product.category_id)
            setSize(product.size || '')
            setBasePrice(product.base_price.toString())
            setIsActive(product.is_active)
            setIsFeatured(product.is_featured)
        } else {
            setEditingProduct(null)
            setName('')
            setDescription('')
            setCategoryId(categories[0]?.id || '')
            setSize('')
            setBasePrice('')
            setIsActive(true)
            setIsFeatured(false)
        }
        setDialogOpen(true)
    }

    const handleSave = async () => {
        if (!name || !categoryId || !basePrice) {
            toast.error('Preencha todos os campos obrigatórios')
            return
        }

        setSaving(true)
        const supabase = createClient()
        const slug = slugify(name)
        const data = {
            name,
            slug,
            description: description || null,
            category_id: categoryId,
            size: size || null,
            base_price: parseFloat(basePrice),
            is_active: isActive,
            is_featured: isFeatured,
        }

        if (editingProduct) {
            const { error } = await supabase.from('products').update(data).eq('id', editingProduct.id)
            if (error) { toast.error('Erro ao atualizar'); setSaving(false); return }
            toast.success('Produto atualizado!')
        } else {
            const { error } = await supabase.from('products').insert(data)
            if (error) {
                if (error.message.includes('duplicate')) toast.error('Já existe um produto com esse nome')
                else toast.error('Erro ao criar produto')
                setSaving(false)
                return
            }
            toast.success('Produto criado!')
        }

        setSaving(false)
        setDialogOpen(false)
        loadData()
    }

    const deleteProduct = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este produto?')) return
        const supabase = createClient()
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (error) { toast.error('Erro ao excluir. O produto pode ter pedidos vinculados.'); return }
        setProducts(prev => prev.filter(p => p.id !== id))
        toast.success('Produto excluído!')
    }

    const filtered = products.filter((p) => {
        if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">Produtos</h1>
                    <p className="text-muted-foreground mt-1">Gerencie o catálogo de produtos</p>
                </div>
                <Button className="gradient-navy border-0 text-white gap-2" onClick={() => openDialog()}>
                    <Plus className="h-4 w-4" />Novo Produto
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar produtos..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-9 h-11 bg-white/60" />
                </div>
                <Select value={categoryFilter} onValueChange={(v: any) => setCategoryFilter(v)}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="glass-card border-0"><CardContent className="p-4"><Skeleton className="h-40 w-full mb-3" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2 mt-2" /></CardContent></Card>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4"><Package className="h-8 w-8 text-muted-foreground" /></div>
                    <h3 className="text-lg font-semibold">Nenhum produto encontrado</h3>
                    <Button className="mt-4 gradient-bronze border-0 text-white" onClick={() => openDialog()}>Criar primeiro produto</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((product, i) => {
                        const img = product.images?.find(i => i.is_primary) || product.images?.[0]
                        return (
                            <motion.div key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                                <Card className="glass-card border-0 hover:shadow-md transition-shadow">
                                    <div className="relative h-40 bg-muted overflow-hidden rounded-t-xl">
                                        {img ? <Image src={img.url} alt={product.name} fill className="object-cover" /> : (
                                            <div className="h-full flex items-center justify-center"><ImageIcon className="h-12 w-12 text-muted-foreground/20" /></div>
                                        )}
                                        {!product.is_active && <Badge className="absolute top-2 left-2 bg-red-500 text-white text-[10px]">Inativo</Badge>}
                                        {product.is_featured && <Badge className="absolute top-2 right-2 gradient-bronze border-0 text-white text-[10px]"><Star className="h-3 w-3 mr-0.5" />Destaque</Badge>}
                                    </div>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0">
                                                <h3 className="font-semibold truncate">{product.name}</h3>
                                                <p className="text-xs text-muted-foreground">{product.category?.name} {product.size ? `• ${product.size}` : ''}</p>
                                                <p className="text-lg font-bold text-gradient-bronze mt-1">R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openDialog(product)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => deleteProduct(product.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            {/* Product Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)]">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Nome *</Label><Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Ex: Sofá Lisboa" className="bg-white/60" /></div>
                        <div className="space-y-2"><Label>Descrição</Label><Textarea value={description} onChange={(e: any) => setDescription(e.target.value)} placeholder="Descrição do produto..." className="bg-white/60 resize-none" rows={3} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Categoria *</Label>
                                <Select value={categoryId} onValueChange={(v: any) => setCategoryId(v)}><SelectTrigger className="bg-white/60"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label>Tamanho</Label><Input value={size} onChange={(e: any) => setSize(e.target.value)} placeholder="Ex: 3x2 lugares" className="bg-white/60" /></div>
                        </div>
                        <div className="space-y-2"><Label>Preço Base (R$) *</Label><Input type="number" step="0.01" value={basePrice} onChange={(e: any) => setBasePrice(e.target.value)} placeholder="0,00" className="bg-white/60" /></div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Ativo</Label></div>
                            <div className="flex items-center gap-2"><Switch checked={isFeatured} onCheckedChange={setIsFeatured} /><Label>Destaque</Label></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                        <Button className="gradient-navy border-0 text-white" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingProduct ? 'Salvar' : 'Criar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
