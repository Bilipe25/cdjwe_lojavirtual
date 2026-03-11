'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Category } from '@/lib/types'
import { ProductList, type ProductWithDetails } from './components/ProductList'
import { ProductFilters } from './components/ProductFilters'
import { ProductFormModal } from './components/ProductFormModal'
import { type ProductFormData } from './schema'

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const ITEMS_PER_PAGE = 12;

export default function AdminProductsPage() {
    const supabase = createClient()

    const [products, setProducts] = useState<ProductWithDetails[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    
    // Server-side State
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    // Form Modal State
    const [dialogOpen, setDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingProduct, setEditingProduct] = useState<ProductWithDetails | null>(null)

    // Bulk Mode State
    const [selectedProducts, setSelectedProducts] = useState<string[]>([])

    // Apply Debounce for Search filter
    const [debouncedSearch, setDebouncedSearch] = useState(search)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    const loadData = useCallback(async () => {
        setLoading(true)
        
        let query = supabase
            .from('products')
            .select('*, category:categories(*), images:product_images(*)', { count: 'exact' });

        if (debouncedSearch) {
            query = query.ilike('name', `%${debouncedSearch}%`);
        }
        if (categoryFilter !== 'all') {
            query = query.eq('category_id', categoryFilter);
        }

        // Pagination
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: false }).range(from, to);

        const [prodsRes, catsRes] = await Promise.all([
            query,
            categories.length === 0 
                ? supabase.from('categories').select('*').eq('is_active', true).order('sort_order')
                : Promise.resolve({ data: categories })
        ])

        if (prodsRes.data) setProducts(prodsRes.data)
        if (prodsRes.count !== null) setTotalCount(prodsRes.count)
        if (catsRes.data) setCategories(catsRes.data)
        
        setLoading(false)
    }, [debouncedSearch, categoryFilter, currentPage, categories.length, supabase])

    useEffect(() => {
        loadData()
    }, [loadData])

    // Reset pagination on filter changes
    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearch, categoryFilter])


    // Helpers
    const openDialog = (product?: ProductWithDetails) => {
        setEditingProduct(product || null)
        setDialogOpen(true)
    }

    const toggleSelect = (id: string) => {
        setSelectedProducts(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    // Server Actions Logic
    const handleSave = async (
        data: ProductFormData, 
        newImageFiles: File[], 
        imagesToDelete: string[], 
        primaryImageId: string | null
    ) => {
        setSaving(true)
        const slug = slugify(data.name)
        const payload = {
            name: data.name,
            slug,
            description: data.description || null,
            category_id: data.category_id,
            size: data.size || null,
            base_price: data.base_price,
            is_active: data.is_active,
            is_featured: data.is_featured,
        }

        let productId = editingProduct?.id

        try {
            // 1. Save Product
            if (editingProduct) {
                const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id)
                if (error) throw error
            } else {
                const { data: newProd, error } = await supabase.from('products').insert(payload).select().single()
                if (error) throw error
                productId = newProd.id
            }

            // 2. Delete Removed Images
            if (imagesToDelete.length > 0) {
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
                // Determine existing count to start sort_order
                const existingCount = editingProduct?.images?.filter(i => !imagesToDelete.includes(i.id)).length || 0;

                for (let i = 0; i < newImageFiles.length; i++) {
                    const file = newImageFiles[i]
                    const fileExt = file.name.split('.').pop()
                    const fileName = `${productId}_${Date.now()}_${i}.${fileExt}`

                    const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file)

                    if (uploadError) {
                        toast.error(`Erro ao fazer upload da imagem ${file.name}`)
                        continue
                    }

                    const { data: publicUrlData } = supabase.storage.from('products').getPublicUrl(fileName)
                    
                    // Logic to set primary accurately for mixed old/new
                    const isPrimary = (primaryImageId === `new_${i}`) || 
                                      (primaryImageId === null && i === 0 && existingCount === 0);

                    await supabase.from('product_images').insert({
                        product_id: productId,
                        url: publicUrlData.publicUrl,
                        is_primary: isPrimary,
                        sort_order: existingCount + i
                    })
                }
            }

            // 4. Update Primary Status for Existing Images
            if (productId && (!newImageFiles.length || !primaryImageId?.startsWith('new_'))) {
                const finalImages = editingProduct?.images?.filter(i => !imagesToDelete.includes(i.id)) || [];
                for (const img of finalImages) {
                    const isPrimary = img.id === primaryImageId;
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
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (error) { toast.error('Erro ao excluir. O produto pode ter pedidos vinculados.'); return }
        setProducts(prev => prev.filter(p => p.id !== id))
        toast.success('Produto excluído!')
    }

    const handleBulkActivate = async () => {
        const { error } = await supabase.from('products').update({ is_active: true }).in('id', selectedProducts)
        if (error) { toast.error('Erro ao ativar produtos em massa.'); return }
        toast.success(`${selectedProducts.length} produtos ativados!`)
        setSelectedProducts([])
        loadData()
    }

    const handleBulkDeactivate = async () => {
        const { error } = await supabase.from('products').update({ is_active: false }).in('id', selectedProducts)
        if (error) { toast.error('Erro ao desativar produtos em massa.'); return }
        toast.success(`${selectedProducts.length} produtos desativados!`)
        setSelectedProducts([])
        loadData()
    }

    const handleBulkDelete = async () => {
        if (!confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE os ${selectedProducts.length} produtos selecionados?`)) return
        const { error } = await supabase.from('products').delete().in('id', selectedProducts)
        if (error) { toast.error('Erro ao excluir. Alguns produtos podem ter pedidos vinculados.'); return }
        toast.success(`${selectedProducts.length} produtos excluídos!`)
        setSelectedProducts([])
        loadData()
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

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

            <ProductFilters 
                search={search}
                onSearchChange={setSearch}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                categories={categories}
                selectedCount={selectedProducts.length}
                onBulkActivate={handleBulkActivate}
                onBulkDeactivate={handleBulkDeactivate}
                onBulkDelete={handleBulkDelete}
            />

            <ProductList 
                products={products}
                loading={loading}
                selectedProducts={selectedProducts}
                onToggleSelect={toggleSelect}
                onEdit={openDialog}
                onDelete={deleteProduct}
                onEmptyAction={() => openDialog()}
            />

            {/* Pagination Controls */}
            {!loading && totalCount > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between pt-4 border-t border-white/20 mt-8">
                    <p className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} de {totalCount} produtos
                    </p>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                            Próxima <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            <ProductFormModal 
                isOpen={dialogOpen}
                onOpenChange={setDialogOpen}
                categories={categories}
                editingProduct={editingProduct}
                saving={saving}
                onSave={handleSave}
            />
        </div>
    )
}
