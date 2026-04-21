'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Category } from '@/lib/types'
import { ProductList, type ProductWithDetails } from './components/ProductList'
import { ProductFilters } from './components/ProductFilters'
import { ProductFormModal } from './components/ProductFormModal'
import { type ProductFormData } from './schema'
import {
    cleanupProductImageUploadsAction,
    createProductImageSignedUploadUrlsAction,
    listProductTaxProfilesAction,
    saveProductImagesMetadataAction,
    upsertProductDomainAction,
} from '@/app/admin/actions/products'

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const ITEMS_PER_PAGE = 12;
const MAX_PRODUCT_IMAGES = 5
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export default function AdminProductsPage() {
    const supabase = useMemo(() => createClient(), [])

    const [products, setProducts] = useState<ProductWithDetails[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [taxProfiles, setTaxProfiles] = useState<
        Array<{
            id: string
            name: string
            code: string
            ncm: string | null
            cest: string | null
            default_output_cfop: string | null
            is_active: boolean
            version: number
            products_count: number
            updated_at: string
        }>
    >([])
    
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
    const [draftCreatedProductId, setDraftCreatedProductId] = useState<string | null>(null)

    // Bulk Mode State
    const [selectedProducts, setSelectedProducts] = useState<string[]>([])

    // View Preferences State
    const [layout, setLayout] = useState<'grid' | 'list'>('grid')

    // Apply Debounce for Search filter
    const [debouncedSearch, setDebouncedSearch] = useState(search)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    const shouldLoadCategories = categories.length === 0
    const shouldLoadTaxProfiles = taxProfiles.length === 0

    const loadData = useCallback(async () => {
        setLoading(true)

        try {
            let query = supabase
                .from('products')
                .select('*, category:categories(*), images:product_images(*), tax_profile:product_tax_profiles(*)', {
                    count: 'exact',
                })

            if (debouncedSearch) {
                query = query.ilike('name', `%${debouncedSearch}%`)
            }
            if (categoryFilter !== 'all') {
                query = query.eq('category_id', categoryFilter)
            }

            const from = (currentPage - 1) * ITEMS_PER_PAGE
            const to = from + ITEMS_PER_PAGE - 1
            query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: false }).range(from, to)

            const [prodsRes, catsRes, taxProfilesRes] = await Promise.allSettled([
                query,
                shouldLoadCategories
                    ? supabase.from('categories').select('*').eq('is_active', true).order('sort_order')
                    : Promise.resolve({ data: categories, error: null }),
                shouldLoadTaxProfiles
                    ? listProductTaxProfilesAction({ includeInactive: true })
                    : Promise.resolve({ success: true, data: taxProfiles }),
            ])

            if (prodsRes.status === 'fulfilled') {
                if (prodsRes.value.error) {
                    toast.error('Erro ao carregar produtos.')
                } else {
                    setProducts(prodsRes.value.data || [])
                    if (prodsRes.value.count !== null) {
                        setTotalCount(prodsRes.value.count)
                    }
                }
            } else {
                console.error('[ADMIN_PRODUCTS] products load failed:', prodsRes.reason)
                setProducts([])
                setTotalCount(0)
                toast.error('Erro inesperado ao carregar produtos.')
            }

            if (catsRes.status === 'fulfilled') {
                if (catsRes.value.error) {
                    toast.error('Erro ao carregar categorias.')
                } else if (catsRes.value.data) {
                    setCategories(catsRes.value.data)
                }
            } else {
                console.error('[ADMIN_PRODUCTS] categories load failed:', catsRes.reason)
                toast.error('Erro inesperado ao carregar categorias.')
            }

            if (taxProfilesRes.status === 'fulfilled') {
                if (taxProfilesRes.value.success && taxProfilesRes.value.data) {
                    setTaxProfiles(taxProfilesRes.value.data)
                } else if (!taxProfilesRes.value.success) {
                    const taxProfileError =
                        'error' in taxProfilesRes.value ? taxProfilesRes.value.error : 'Erro ao carregar perfis tributarios.'
                    console.error('[ADMIN_PRODUCTS] tax profiles load returned failure:', taxProfileError)
                    toast.error('Nao foi possivel carregar os perfis tributarios. O catalogo de produtos continuara disponivel.')
                }
            } else {
                console.error('[ADMIN_PRODUCTS] tax profiles load failed:', taxProfilesRes.reason)
                toast.error('Falha ao carregar perfis tributarios. Os produtos continuam disponiveis.')
            }
        } finally {
            setLoading(false)
        }
    }, [
        debouncedSearch,
        categoryFilter,
        currentPage,
        supabase,
        shouldLoadCategories,
        shouldLoadTaxProfiles,
    ])

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
        setDraftCreatedProductId(null)
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
        primaryImageId: string | null,
        activeVariantIds: string[],
        variantPriceOverrides: Record<string, number | null>,
        options: { variantConfigTouched: boolean; variantPricingTouched: boolean }
    ) => {
        setSaving(true)
        const operationId = crypto.randomUUID()
        const uploadedStoragePaths: string[] = []
        const slug = slugify(data.name)
        const payload = {
            name: data.name,
            slug,
            description: data.description || null,
            manufacturer_name: data.manufacturer_name?.trim() || null,
            category_id: data.category_id,
            tax_profile_id: data.tax_profile_id || null,
            size: data.size || null,
            has_size_variants: data.has_size_variants === true,
            size_options: data.size_options || [],
            base_price: data.base_price,
            is_active: data.is_active,
            is_featured: data.is_featured,
        }

        let productId = editingProduct?.id ?? draftCreatedProductId

        try {
            const existingImagesAfterDelete = (editingProduct?.images || []).filter(
                (image) => !imagesToDelete.includes(image.id)
            ).length
            const totalImagesAfterSave = existingImagesAfterDelete + newImageFiles.length
            if (totalImagesAfterSave > MAX_PRODUCT_IMAGES) {
                throw new Error(`Limite maximo de ${MAX_PRODUCT_IMAGES} imagens por produto.`)
            }

            for (const file of newImageFiles) {
                if (!file.type.startsWith('image/')) {
                    throw new Error(`Arquivo nao suportado: ${file.name}`)
                }
                if (file.size > MAX_IMAGE_SIZE_BYTES) {
                    throw new Error(`Imagem excede 5MB: ${file.name}`)
                }
            }

            // 1. Persist product + variant domain atomically (RPC layer)
            const domainResult = await upsertProductDomainAction({
                productId: productId ?? null,
                name: payload.name,
                slug: payload.slug,
                description: payload.description,
                manufacturerName: payload.manufacturer_name,
                categoryId: payload.category_id,
                taxProfileId: payload.tax_profile_id,
                size: payload.size,
                hasSizeVariants: payload.has_size_variants,
                sizeOptions: payload.size_options.map((sizeOption) => ({
                    id: sizeOption.id,
                    name: sizeOption.name,
                    priceMode: sizeOption.price_mode,
                    priceValue: sizeOption.price_value,
                    isActive: sizeOption.is_active,
                    sortOrder: sizeOption.sort_order,
                    isDefault: sizeOption.is_default,
                })),
                basePrice: payload.base_price,
                isActive: payload.is_active,
                isFeatured: payload.is_featured,
                activeVariantIds: options.variantConfigTouched ? activeVariantIds : null,
                variantPriceOverrides: options.variantPricingTouched ? variantPriceOverrides : null,
                operationId,
            })

            if (!domainResult.success || !domainResult.productId) {
                throw new Error(domainResult.error || 'Falha ao salvar produto.')
            }

            productId = domainResult.productId
            if (!editingProduct && !draftCreatedProductId) {
                setDraftCreatedProductId(productId)
            }

            // 2. Upload files via signed upload URLs (server-side issued)
            const uploadedPublicUrls: string[] = []
            if (newImageFiles.length > 0 && productId) {
                const signedUploadResult = await createProductImageSignedUploadUrlsAction({
                    productId,
                    files: newImageFiles.map((file) => ({ name: file.name, contentType: file.type })),
                    operationId,
                })

                if (!signedUploadResult.success || !signedUploadResult.uploads) {
                    throw new Error(signedUploadResult.error || 'Falha ao preparar upload das imagens.')
                }

                if (signedUploadResult.uploads.length !== newImageFiles.length) {
                    throw new Error('Falha ao validar lote de upload assinado.')
                }

                for (let i = 0; i < newImageFiles.length; i++) {
                    const file = newImageFiles[i]
                    const signed = signedUploadResult.uploads[i]
                    const { error: uploadError } = await supabase.storage
                        .from('products')
                        .uploadToSignedUrl(signed.path, signed.token, file)

                    if (uploadError) {
                        throw new Error(`Erro ao fazer upload da imagem ${file.name}`)
                    }

                    uploadedStoragePaths.push(signed.path)
                    uploadedPublicUrls.push(signed.publicUrl)
                }
            }

            // 3. Persist image metadata in a single server-side contract
            if (productId) {
                const imagesResult = await saveProductImagesMetadataAction({
                    productId,
                    imageIdsToDelete: imagesToDelete,
                    newImageUrls: uploadedPublicUrls,
                    primaryImageRef: primaryImageId,
                    operationId,
                })
                if (!imagesResult.success) {
                    throw new Error(imagesResult.error || 'Falha ao salvar metadados das imagens.')
                }
            }

            // 4. Optional: keep user informed when new variants were synced
            if (domainResult.variantsInserted && domainResult.variantsInserted > 0) {
                toast.info(`${domainResult.variantsInserted} variacoes foram sincronizadas automaticamente.`)
            }

            // 5. Refresh local data
            toast.success(editingProduct ? 'Produto atualizado!' : 'Produto criado!')
            setDialogOpen(false)
            setDraftCreatedProductId(null)
            await loadData()
        } catch (err: unknown) {
            console.error(err)
            const errorMessage = err instanceof Error ? err.message : ''
            if (errorMessage.includes('duplicate') || errorMessage.toLowerCase().includes('slug')) {
                toast.error('Ja existe um produto com esse nome')
            } else {
                toast.error(errorMessage || 'Erro ao salvar produto')
            }
            if (uploadedStoragePaths.length > 0) {
                await cleanupProductImageUploadsAction({
                    paths: uploadedStoragePaths,
                    productId: productId ?? editingProduct?.id,
                    operationId,
                })
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
        toast.success('Produto excluido!')
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
        toast.success(`${selectedProducts.length} produtos excluidos!`)
        setSelectedProducts([])
        loadData()
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Produtos
                    </h1>
                    <p className="text-muted-foreground mt-1">Gerencie seu catalogo de produtos</p>
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
                layout={layout}
                onLayoutChange={setLayout}
            />

            <ProductList 
                products={products}
                loading={loading}
                selectedProducts={selectedProducts}
                onToggleSelect={toggleSelect}
                onEdit={openDialog}
                onDelete={deleteProduct}
                onEmptyAction={() => openDialog()}
                layout={layout}
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
                            Proxima <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            <ProductFormModal 
                isOpen={dialogOpen}
                onOpenChange={setDialogOpen}
                categories={categories}
                taxProfiles={taxProfiles}
                editingProduct={editingProduct}
                saving={saving}
                onSave={handleSave}
            />
        </div>
    )
}

