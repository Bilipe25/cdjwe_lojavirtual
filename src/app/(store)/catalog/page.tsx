'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Search, Filter, X, SlidersHorizontal, ChevronRight, ChevronLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProductGridSkeleton } from '@/components/ui/skeletons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'
import type { Product, Category, Fabric } from '@/lib/types'
import { ProductCard } from '@/components/catalog/product-card'
import { QuickViewModal } from '@/components/catalog/quick-view-modal'
import { CatalogFilters } from './components/CatalogFilters'

const PAGE_SIZE = 12

export default function CatalogPage() {
    return (
        <Suspense fallback={<div className="p-8"><ProductGridSkeleton count={12} /></div>}>
            <CatalogContent />
        </Suspense>
    )
}

function CatalogContent() {
    const [products, setProducts] = useState<(Product & { images: { url: string; is_primary: boolean }[] })[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [fabrics, setFabrics] = useState<Fabric[]>([])
    
    // Pagination State
    const [loading, setLoading] = useState(true)
    const [totalCount, setTotalCount] = useState(0)
    const [currentPage, setCurrentPage] = useState(1)
    
    // Filter State
    const searchParams = useSearchParams()
    const initialSearch = searchParams.get('search') || ''
    const [search, setSearch] = useState(initialSearch)
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [selectedFabric, setSelectedFabric] = useState<string>('all')
    const [sortBy, setSortBy] = useState<string>('name')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [quickViewId, setQuickViewId] = useState<string | null>(null)

    // Debounce the search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
            setCurrentPage(1) // Reset page on search
        }, 500)
        return () => clearTimeout(timer)
    }, [search])

    // Load static filters once
    useEffect(() => {
        const loadFilters = async () => {
            const supabase = createClient()
            const [categoriesRes, fabricsRes] = await Promise.all([
                supabase.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
                supabase.from('fabrics').select('*').eq('is_active', true).order('sort_order', { ascending: true })
            ])
            if (categoriesRes.data) setCategories(categoriesRes.data)
            if (fabricsRes.data) setFabrics(fabricsRes.data)
        }
        loadFilters()
    }, [])

    // Execute paginated queries safely on the Server Side Database
    useEffect(() => {
        const fetchPaginatedProducts = async () => {
            setLoading(true)
            const supabase = createClient()
            
            let query = supabase
                .from('products')
                .select('*, category:categories(*), images:product_images(url, is_primary, sort_order)', { count: 'exact' })
                .eq('is_active', true)

            // Dynamic Queries to avoid Client Side Array.Filtering over 1000s of rows
            if (debouncedSearch) {
                query = query.ilike('name', `%${debouncedSearch}%`)
            }
            if (selectedCategory !== 'all') {
                query = query.eq('category_id', selectedCategory)
            }
            
            // Fabric filter: join through product_variants to find products available in this fabric
            // Note: Supabase doesn't support filtering by related table easily without RPC
            // So we'll apply this filter client-side after fetching, or use a workaround

            // Sorting logic translation
            if (sortBy === 'name') query = query.order('name', { ascending: true })
            if (sortBy === 'price_asc') query = query.order('base_price', { ascending: true })
            if (sortBy === 'price_desc') query = query.order('base_price', { ascending: false })
            if (sortBy === 'newest') query = query.order('created_at', { ascending: false })
            
            // Applying Strict Pagination boundaries to save massive RAM and Bandwidth
            const from = (currentPage - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, count, error } = await query

            if (!error && data) {
                // Client-side fabric filter (Supabase can't filter by related m2m without RPC)
                if (selectedFabric !== 'all') {
                    const supabase2 = createClient()
                    const productIds = data.map((p: any) => p.id)
                    if (productIds.length > 0) {
                        const { data: variantLinks } = await supabase2
                            .from('product_variants')
                            .select('product_id')
                            .in('product_id', productIds)
                            .eq('fabric_id', selectedFabric)
                            .eq('is_active', true)
                        const validIds = new Set(variantLinks?.map(v => v.product_id) || [])
                        const filtered = data.filter((p: any) => validIds.has(p.id))
                        setProducts(filtered as any)
                        setTotalCount(filtered.length)
                    } else {
                        setProducts([])
                        setTotalCount(0)
                    }
                } else {
                    setProducts(data as any)
                    setTotalCount(count || 0)
                }
            }
            setLoading(false)
        }

        fetchPaginatedProducts()
    }, [debouncedSearch, selectedCategory, selectedFabric, sortBy, currentPage])

    const activeFilters = [
        selectedCategory !== 'all' && categories.find(c => c.id === selectedCategory)?.name,
        selectedFabric !== 'all' && fabrics.find(f => f.id === selectedFabric)?.name,
    ].filter(Boolean)

    const clearFilters = () => {
        setSelectedCategory('all')
        setSelectedFabric('all')
        setSearch('')
        setDebouncedSearch('')
        setCurrentPage(1)
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
            >
                <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                    Catálogo
                </h1>
                <p className="text-muted-foreground mt-1">
                    Encontre os melhores estofados para sua loja
                </p>
            </motion.div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar produtos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-11 bg-white/60"
                    />
                    {search && (
                        <button
                            onClick={() => { setSearch(''); setDebouncedSearch(''); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60">
                        <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="name">Nome (A-Z)</SelectItem>
                        <SelectItem value="price_asc">Menor preço</SelectItem>
                        <SelectItem value="price_desc">Maior preço</SelectItem>
                        <SelectItem value="newest">Mais recentes</SelectItem>
                    </SelectContent>
                </Select>

                {/* Mobile Filter Button */}
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <SheetTrigger render={<Button variant="outline" className="lg:hidden h-11 gap-2" />}>
                            <SlidersHorizontal className="h-4 w-4" />
                            Filtros
                            {activeFilters.length > 0 && (
                                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] gradient-bronze border-0 text-white">
                                    {activeFilters.length}
                                </Badge>
                            )}
                    </SheetTrigger>
                    <SheetContent side="left" className="w-80">
                        <SheetHeader>
                            <SheetTitle>Filtros</SheetTitle>
                        </SheetHeader>
                        <ScrollArea className="mt-6 h-[calc(100vh-100px)]">
                            <CatalogFilters 
                                categories={categories}
                                fabrics={fabrics}
                                selectedCategory={selectedCategory}
                                selectedFabric={selectedFabric}
                                onCategoryChange={(id) => { setSelectedCategory(id); setCurrentPage(1); }}
                                onFabricChange={(id) => { setSelectedFabric(id); setCurrentPage(1); }}
                            />
                        </ScrollArea>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Active Filters */}
            {activeFilters.length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    {activeFilters.map((filter) => (
                        <Badge key={filter || Math.random()} variant="secondary" className="gap-1">
                            {filter}
                        </Badge>
                    ))}
                    <button
                        onClick={clearFilters}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                        Limpar filtros
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex gap-8">
                {/* Desktop Sidebar Filters */}
                <aside className="hidden lg:block w-64 shrink-0">
                    <div className="sticky top-24 glass-card rounded-xl p-4">
                        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4" />
                            Filtros
                        </h2>
                        <CatalogFilters 
                            categories={categories}
                            fabrics={fabrics}
                            selectedCategory={selectedCategory}
                            selectedFabric={selectedFabric}
                            onCategoryChange={(id) => { setSelectedCategory(id); setCurrentPage(1); }}
                            onFabricChange={(id) => { setSelectedFabric(id); setCurrentPage(1); }}
                        />
                    </div>
                </aside>

                {/* Products Grid & Pagination */}
                <div className="flex-1 flex flex-col">
                    {loading ? (
                        <ProductGridSkeleton count={9} />
                    ) : products.length === 0 ? (
                        <div className="text-center py-16 flex-1">
                            <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Search className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold">Nenhum produto encontrado</h3>
                            <p className="text-muted-foreground mt-1">
                                Tente alterar os filtros ou buscar por outro termo
                            </p>
                            <Button variant="outline" className="mt-4" onClick={clearFilters}>
                                Limpar filtros
                            </Button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground mb-4">
                                Exibindo {products.length} de {totalCount} produtos
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 mb-8">
                                {products.map((product, i) => (
                                    <motion.div
                                        key={product.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <ProductCard product={product} onQuickView={(id) => setQuickViewId(id)} />
                                    </motion.div>
                                ))}
                            </div>
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="mt-auto pt-6 flex items-center justify-center gap-4">
                                    <Button
                                        variant="outline"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-2" /> Anterior
                                    </Button>
                                    <span className="text-sm text-muted-foreground font-medium">
                                        Página {currentPage} de {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Próxima <ChevronRight className="h-4 w-4 ml-2" />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <QuickViewModal
                productId={quickViewId}
                open={!!quickViewId}
                onClose={() => setQuickViewId(null)}
            />
        </div>
    )
}
