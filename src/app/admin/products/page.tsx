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
    UploadCloud,
    X,
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
import type { Product, Category, ProductImage as DBProductImage } from '@/lib/types'
import Image from 'next/image'

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function AdminProductsPage() {
    const [products, setProducts] = useState<(Product & { category?: Category; images?: DBProductImage[] })[]>([])
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

    // Images State
    const [existingImages, setExistingImages] = useState<DBProductImage[]>([])
    const [newImageFiles, setNewImageFiles] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [imagesToDelete, setImagesToDelete] = useState<string[]>([])
    const [primaryImageId, setPrimaryImageId] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        const supabase = createClient()
        const [prodsRes, catsRes] = await Promise.all([
            supabase.from('products').select('*, category:categories(*), images:product_images(*)').order('sort_order'),
            supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        ])
        if (prodsRes.data) setProducts(prodsRes.data)
        if (catsRes.data) setCategories(catsRes.data)
        setLoading(false)
    }

    const openDialog = (product?: any) => {
        setNewImageFiles([])
        setPreviewUrls([])
        setImagesToDelete([])

        if (product) {
            setEditingProduct(product)
            setName(product.name)
            setDescription(product.description || '')
            setCategoryId(product.category_id)
            setSize(product.size || '')
            setBasePrice(product.base_price.toString())
            setIsActive(product.is_active)
            setIsFeatured(product.is_featured)

            setExistingImages(product.images || [])
            const primary = product.images?.find((i: DBProductImage) => i.is_primary)
            setPrimaryImageId(primary ? primary.id : product.images?.[0]?.id || null)
        } else {
            setEditingProduct(null)
            setName('')
            setDescription('')
            setCategoryId(categories[0]?.id || '')
            setSize('')
            setBasePrice('')
            setIsActive(true)
            setIsFeatured(false)
            setExistingImages([])
            setPrimaryImageId(null)
        }
        setDialogOpen(true)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files)
            setNewImageFiles(prev => [...prev, ...files])

            // Create previews
            const newPreviews = files.map(f => URL.createObjectURL(f))
            setPreviewUrls(prev => [...prev, ...newPreviews])

            // Set first new image as primary if none exists
            if (!primaryImageId && existingImages.length === 0 && previewUrls.length === 0) {
                setPrimaryImageId(`new_0`)
            }
        }
    }

    const removeExistingImage = (id: string) => {
        setExistingImages(prev => prev.filter(img => img.id !== id))
        setImagesToDelete(prev => [...prev, id])
        if (primaryImageId === id) setPrimaryImageId(null)
    }

    const removeNewImage = (index: number) => {
        setNewImageFiles(prev => prev.filter((_, i) => i !== index))
        setPreviewUrls(prev => prev.filter((_, i) => i !== index))
        if (primaryImageId === `new_${index}`) setPrimaryImageId(null)
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
            base_price: parseFloat(basePrice.replace(',', '.')),
            is_active: isActive,
            is_featured: isFeatured,
        }

        let productId = editingProduct?.id

        try {
            // 1. Save Product
            if (editingProduct) {
                const { error } = await supabase.from('products').update(data).eq('id', editingProduct.id)
                if (error) throw error
            } else {
                const { data: newProd, error } = await supabase.from('products').insert(data).select().single()
                if (error) throw error
                productId = newProd.id
            }

            // 2. Delete Removed Images
            if (imagesToDelete.length > 0) {
                // Remove from DB (Cascade will NOT remove from storage automatically without edge functions, but we just remove DB records for now or call storage delete)
                // Let's get the URLs first to delete from storage if needed
                const { data: imgsToRemove } = await supabase.from('product_images').select('url').in('id', imagesToDelete)

                if (imgsToRemove) {
                    const paths = imgsToRemove.map(img => img.url.split('/').pop())
                    if (paths.length > 0) {
                        await supabase.storage.from('products').remove(paths as string[])
                    }
                }

                await supabase.from('product_images').delete().in('id', imagesToDelete)
            }

            // 3. Upload New Images
            if (newImageFiles.length > 0 && productId) {
                for (let i = 0; i < newImageFiles.length; i++) {
                    const file = newImageFiles[i]
                    const fileExt = file.name.split('.').pop()
                    const fileName = `${productId}_${Date.now()}_${i}.${fileExt}`

                    const { error: uploadError } = await supabase.storage
                        .from('products')
                        .upload(fileName, file)

                    if (uploadError) {
                        console.error('Upload error', uploadError)
                        toast.error(`Erro ao fazer upload da imagem ${file.name}`)
                        continue
                    }

                    const { data: publicUrlData } = supabase.storage
                        .from('products')
                        .getPublicUrl(fileName)

                    const isPrimary = primaryImageId === `new_${i}` || (primaryImageId === null && i === 0 && existingImages.length === 0)

                    await supabase.from('product_images').insert({
                        product_id: productId,
                        url: publicUrlData.publicUrl,
                        is_primary: isPrimary,
                        sort_order: existingImages.length + i
                    })
                }
            }

            // 4. Update Primary Status for Existing Images
            if (productId && existingImages.length > 0) {
                for (const img of existingImages) {
                    const isPrimary = img.id === primaryImageId
                    if (img.is_primary !== isPrimary) {
                        await supabase.from('product_images').update({ is_primary: isPrimary }).eq('id', img.id)
                    }
                }
            }

            toast.success(editingProduct ? 'Produto atualizado!' : 'Produto criado!')
            setDialogOpen(false)
            loadData()
        } catch (err: any) {
            console.error(err)
            if (err.message?.includes('duplicate')) {
                toast.error('Já existe um produto com esse nome')
            } else {
                toast.error('Erro ao salvar produto')
            }
        } finally {
            setSaving(false)
        }
    }

    const deleteProduct = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja excluir o produto "${name}"?`)) return
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
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">Catálogo de Produtos</h1>
                    <p className="text-muted-foreground mt-1">Gerencie produtos, categorias, tamanhos e galeria de fotos</p>
                </div>
                <Button className="gradient-navy border-0 text-white gap-2" onClick={() => openDialog()}>
                    <Plus className="h-4 w-4" />Novo Produto
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar produtos por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 bg-white/60" />
                </div>
                <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Card key={i} className="glass-card border-0"><CardContent className="p-4"><Skeleton className="h-48 w-full rounded-lg mb-3" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardContent></Card>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                    <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4"><Package className="h-8 w-8 text-muted-foreground" /></div>
                    <h3 className="text-lg font-semibold">Nenhum produto encontrado</h3>
                    <p className="text-muted-foreground text-sm mt-1">Crie seu primeiro produto para começar a vender.</p>
                    <Button className="mt-6 gradient-bronze border-0 text-white" onClick={() => openDialog()}>Criar Primeiro Produto</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map((product, i) => {
                        const primaryImg = product.images?.find(img => img.is_primary) || product.images?.[0]
                        const imgCount = product.images?.length || 0

                        return (
                            <motion.div key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                                <Card className={`glass-card border-0 hover:shadow-lg transition-all duration-300 overflow-hidden ${!product.is_active ? 'opacity-70 grayscale-[30%]' : ''}`}>
                                    <div className="relative h-48 bg-muted group">
                                        {primaryImg ? (
                                            <Image src={primaryImg.url} alt={product.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
                                        ) : (
                                            <div className="h-full flex items-center justify-center bg-navy/5"><ImageIcon className="h-12 w-12 text-navy/20" /></div>
                                        )}

                                        <div className="absolute top-2 right-2 flex flex-col gap-2 items-end">
                                            {product.is_featured && <Badge className="gradient-bronze border-0 text-white shadow-sm"><Star className="h-3 w-3 mr-1 fill-white" /> Destaque</Badge>}
                                            {imgCount > 1 && <Badge variant="secondary" className="shadow-sm bg-white/90 text-navy backdrop-blur-sm"><ImageIcon className="h-3 w-3 mr-1" /> {imgCount}</Badge>}
                                        </div>

                                        {!product.is_active && <Badge className="absolute top-2 left-2 bg-red-500/90 text-white">Inativo</Badge>}
                                    </div>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0 pr-2">
                                                <h3 className="font-semibold text-lg text-navy truncate" title={product.name}>{product.name}</h3>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-xs font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[120px]">
                                                        {product.category?.name || 'Sem Categoria'}
                                                    </span>
                                                    {product.size && (
                                                        <span className="text-[10px] text-muted-foreground truncate">
                                                            Tam: {product.size}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-bold text-gradient-bronze mt-2">
                                                    R$ {product.base_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy shrink-0 -mr-2"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openDialog(product)}><Edit className="h-4 w-4 mr-2" /> Editar / Fotos</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => deleteProduct(product.id, product.name)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
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
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)] text-2xl text-navy">
                            {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        {/* Left Column: Form Details */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b">Informações Básicas</h3>

                            <div className="space-y-2">
                                <Label className="text-navy font-medium">Nome do Produto *</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sofá Retrátil Florença" className="bg-white/60" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Categoria *</Label>
                                    <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
                                        <SelectTrigger className="bg-white/60"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                        <SelectContent>
                                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-navy font-medium">Preço Base (R$) *</Label>
                                    <Input type="number" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="0.00" className="bg-white/60" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-navy font-medium">Tamanho / Dimensões</Label>
                                <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Ex: 3 Lugares (2.50m x 1.10m)" className="bg-white/60" />
                                <p className="text-[11px] text-muted-foreground">Informe as medidas descritivas para facilitar a escolha do lojista.</p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-navy font-medium">Descrição Detalhada</Label>
                                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva os diferenciais, espumas utilizadas, etc..." className="bg-white/60 resize-none" rows={4} />
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-white/40">
                                    <Switch checked={isActive} onCheckedChange={setIsActive} id="active-mode" />
                                    <Label htmlFor="active-mode" className="cursor-pointer">Ativo na Loja</Label>
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-white/40">
                                    <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="featured-mode" />
                                    <Label htmlFor="featured-mode" className="cursor-pointer">Destaque</Label>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Images Gallery */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 pb-2 border-b flex items-center justify-between">
                                <span>Galeria de Imagens</span>
                                <span className="text-xs lowercase normal-case bg-muted px-2 py-0.5 rounded-full">{existingImages.length + previewUrls.length}/5 max</span>
                            </h3>

                            <div className="grid grid-cols-3 gap-3">
                                {/* Existing Images */}
                                {existingImages.map((img) => (
                                    <div key={img.id} className={`relative aspect-square rounded-lg border-2 overflow-hidden group ${primaryImageId === img.id ? 'border-bronze' : 'border-border'}`}>
                                        <Image src={img.url} alt="Produto" fill className="object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            {primaryImageId !== img.id && (
                                                <Button size="sm" variant="secondary" className="h-7 text-[10px] w-20" onClick={() => setPrimaryImageId(img.id)}>Capa</Button>
                                            )}
                                            <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeExistingImage(img.id)}><Trash2 className="h-3 w-3" /></Button>
                                        </div>
                                        {primaryImageId === img.id && <Badge className="absolute top-1 left-1 bg-bronze text-white text-[9px] px-1 py-0 h-4 border-0">Capa</Badge>}
                                    </div>
                                ))}

                                {/* New Images Previews */}
                                {previewUrls.map((url, i) => (
                                    <div key={`new_${i}`} className={`relative aspect-square rounded-lg border-2 overflow-hidden group ${primaryImageId === `new_${i}` ? 'border-bronze' : 'border-border'}`}>
                                        <Image src={url} alt="Upload" fill className="object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            {primaryImageId !== `new_${i}` && (
                                                <Button size="sm" variant="secondary" className="h-7 text-[10px] w-20" onClick={() => setPrimaryImageId(`new_${i}`)}>Capa</Button>
                                            )}
                                            <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeNewImage(i)}><X className="h-3 w-3" /></Button>
                                        </div>
                                        {primaryImageId === `new_${i}` && <Badge className="absolute top-1 left-1 bg-bronze text-white text-[9px] px-1 py-0 h-4 border-0">Capa</Badge>}
                                    </div>
                                ))}

                                {/* Upload Button */}
                                {(existingImages.length + previewUrls.length) < 5 && (
                                    <Label className="relative aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-bronze hover:bg-bronze/5 transition-colors flex flex-col items-center justify-center cursor-pointer text-muted-foreground hover:text-bronze">
                                        <UploadCloud className="h-8 w-8 mb-2" />
                                        <span className="text-[10px] font-medium text-center px-2">Adicionar Foto</span>
                                        <Input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            multiple
                                            onChange={handleFileChange}
                                        />
                                    </Label>
                                )}
                            </div>

                            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-start mt-4">
                                <ImageIcon className="h-4 w-4 mr-2 shrink-0 mt-0.5" />
                                <p className="text-xs">
                                    Faça o upload de imagens de alta qualidade (JPEG ou PNG). Você precisará criar o bucket "products" no Supabase Storage para que o upload funcione.
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-6 border-t pt-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
                        <Button className="gradient-navy border-0 text-white min-w-[120px]" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
