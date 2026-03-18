'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
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
import { QuickViewBottomSheet } from '@/components/catalog/quick-view-bottom-sheet'
import { CatalogFilters } from './components/CatalogFilters'
import { CategoryCarousel } from '@/components/catalog/category-carousel'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useSettings } from '@/components/providers/settings-provider'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { NoticeCard } from '@/components/store/NoticeCard'
import { useCustomerGreeting } from '@/lib/hooks/use-customer-greeting'
import { DesktopInstalledBadge } from '@/components/store/desktop-installed-badge'

const PAGE_SIZE = 12

interface CatalogSizeFilterOption {
    slug: string
    name: string
    sort_order: number
}

type CatalogProduct = Product & {
    images: { url: string; is_primary: boolean }[]
    size_options?: Product['size_options']
}

const CatalogContent = dynamic(() => Promise.resolve(CatalogContentInner), {
    ssr: false,
    loading: () => <div className="p-8"><ProductGridSkeleton count={12} /></div>
})

export default function CatalogPage() {
    return <CatalogContent />
}

function CatalogContentInner() {
    const [products, setProducts] = useState<CatalogProduct[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [fabrics, setFabrics] = useState<Fabric[]>([])
    const [sizes, setSizes] = useState<CatalogSizeFilterOption[]>([])
    
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
    const [selectedSize, setSelectedSize] = useState<string>('all')
    const [sortBy, setSortBy] = useState<string>('name')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [quickViewId, setQuickViewId] = useState<string | null>(null)
    const [hidePrices, setHidePrices] = useState(false)
    const [socialUrls, setSocialUrls] = useState<{ whatsapp: string | null; instagram: string | null }>({ whatsapp: null, instagram: null })
    const isMobile = useIsMobile()
    const greetingData = useCustomerGreeting()

    // Sync search state with URL search params (TopBar search)
    // We REMOVED the internal debounce as it's handled by MobileTopBar
    useEffect(() => {
        const urlSearch = searchParams.get('search') || ''
        const urlCategory = searchParams.get('category') || 'all'
        const urlFabric = searchParams.get('fabric') || 'all'
        const urlSize = searchParams.get('size') || 'all'

        const needsSync =
            urlSearch !== search ||
            urlSearch !== debouncedSearch ||
            urlCategory !== selectedCategory ||
            urlFabric !== selectedFabric ||
            urlSize !== selectedSize

        if (!needsSync) return

        const frame = window.requestAnimationFrame(() => {
            if (urlSearch !== search) setSearch(urlSearch)
            if (urlSearch !== debouncedSearch) setDebouncedSearch(urlSearch)
            if (urlCategory !== selectedCategory) setSelectedCategory(urlCategory)
            if (urlFabric !== selectedFabric) setSelectedFabric(urlFabric)
            if (urlSize !== selectedSize) setSelectedSize(urlSize)
            setCurrentPage(1)
        })

        return () => window.cancelAnimationFrame(frame)
    }, [debouncedSearch, search, searchParams, selectedCategory, selectedFabric, selectedSize])

    // Load static filters once
    useEffect(() => {
        const loadFilters = async () => {
            const supabase = createClient()
            const [categoriesRes, fabricsRes, sizeOptionsRes] = await Promise.all([
                supabase.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
                supabase.from('fabrics').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
                supabase
                    .from('product_size_options')
                    .select('slug, name, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true })
                    .order('name', { ascending: true }),
            ])
            if (categoriesRes.data) setCategories(categoriesRes.data)
            if (fabricsRes.data) setFabrics(fabricsRes.data)
            if (sizeOptionsRes.data) {
                const uniqueSizes = new Map<string, CatalogSizeFilterOption>()

                sizeOptionsRes.data.forEach((sizeOption) => {
                    if (!sizeOption.slug) return

                    const current = uniqueSizes.get(sizeOption.slug)
                    if (!current || (sizeOption.sort_order || 0) < current.sort_order) {
                        uniqueSizes.set(sizeOption.slug, {
                            slug: sizeOption.slug,
                            name: sizeOption.name,
                            sort_order: sizeOption.sort_order || 0,
                        })
                    }
                })

                setSizes(
                    Array.from(uniqueSizes.values()).sort((a, b) => {
                        const sortDelta = a.sort_order - b.sort_order
                        if (sortDelta !== 0) return sortDelta
                        return a.name.localeCompare(b.name, 'pt-BR')
                    })
                )
            }
        }
        loadFilters()
    }, [])

    const { settings } = useSettings()

    // No longer need local setting fetch for visibility and social links, provided by SettingsProvider
    useEffect(() => {
        const loadUserStatusAndSocial = async () => {
            if (!settings) return
            
            const supabase = createClient()
            setSocialUrls({
                whatsapp: settings.whatsapp,
                instagram: settings.instagram,
            })

            const { data: userRes } = await supabase.auth.getUser()
            if (userRes?.user) {
                // Check if user is unapproved
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('status')
                    .eq('id', userRes.user.id)
                    .single()
                if (profile?.status === 'pending' && !settings.show_prices_to_unapproved) {
                    setHidePrices(true)
                }
            }
        }
        loadUserStatusAndSocial()
    }, [settings])

    // Execute paginated queries safely on the Server Side Database
    useEffect(() => {
        const fetchPaginatedProducts = async () => {
            setLoading(true)
            const supabase = createClient()
            
            // When fabric filter is active, pre-fetch matching product IDs server-side
            // This avoids the broken client-side filtering that destroyed pagination
            let filteredProductIds: string[] | null = null
            if (selectedFabric !== 'all') {
                const { data: variantLinks } = await supabase
                    .from('product_variants')
                    .select('product_id')
                    .eq('fabric_id', selectedFabric)
                    .eq('is_active', true)
                
                if (variantLinks && variantLinks.length > 0) {
                    // Deduplicate product IDs
                    filteredProductIds = [...new Set(variantLinks.map(v => v.product_id))]
                } else {
                    // No products match this fabric — short-circuit
                    setProducts([])
                    setTotalCount(0)
                    setLoading(false)
                    return
                }
            }

            if (selectedSize !== 'all') {
                const { data: sizeLinks } = await supabase
                    .from('product_size_options')
                    .select('product_id')
                    .eq('slug', selectedSize)
                    .eq('is_active', true)

                if (sizeLinks && sizeLinks.length > 0) {
                    const sizeProductIds = [...new Set(sizeLinks.map((sizeLink) => sizeLink.product_id))]
                    filteredProductIds = filteredProductIds
                        ? filteredProductIds.filter((productId) => sizeProductIds.includes(productId))
                        : sizeProductIds
                } else {
                    setProducts([])
                    setTotalCount(0)
                    setLoading(false)
                    return
                }

                if (filteredProductIds && filteredProductIds.length === 0) {
                    setProducts([])
                    setTotalCount(0)
                    setLoading(false)
                    return
                }
            }

            let query = supabase
                .from('products')
                .select('*, category:categories(*), images:product_images(url, is_primary, sort_order), size_options:product_size_options(*)', { count: 'exact' })
                .eq('is_active', true)

            // Dynamic Queries to avoid Client Side Array.Filtering over 1000s of rows
            if (debouncedSearch) {
                query = query.ilike('name', `%${debouncedSearch}%`)
            }
            if (selectedCategory !== 'all') {
                query = query.eq('category_id', selectedCategory)
            }
            
            // Apply fabric filter server-side using pre-fetched IDs
            if (filteredProductIds) {
                query = query.in('id', filteredProductIds)
            }

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
                setProducts(data as CatalogProduct[])
                setTotalCount(count || 0)
            }
            setLoading(false)
        }

        fetchPaginatedProducts()
    }, [debouncedSearch, selectedCategory, selectedFabric, selectedSize, sortBy, currentPage])

    const activeFilters = [
        selectedCategory !== 'all' && categories.find(c => c.id === selectedCategory)?.name,
        selectedSize !== 'all' && sizes.find((size) => size.slug === selectedSize)?.name,
        selectedFabric !== 'all' && fabrics.find(f => f.id === selectedFabric)?.name,
    ].filter(Boolean)

    const clearFilters = () => {
        setSelectedCategory('all')
        setSelectedFabric('all')
        setSelectedSize('all')
        setSearch('')
        setDebouncedSearch('')
        setCurrentPage(1)
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <PullToRefresh onRefresh={async () => {
            const supabase = createClient()
            setProducts([])
            setCurrentPage(1)
            // The useEffect will trigger fetchPaginatedProducts automatically due to setCurrentPage(1) and setProducts([])
        }}>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 hidden md:flex flex-col md:flex-row md:items-start md:justify-between gap-6"
            >
                <div>
                    {greetingData.loading ? (
                        <>
                            <div className="h-9 w-64 bg-navy/10 animate-pulse rounded-md mb-2" />
                            <div className="h-5 w-80 bg-muted animate-pulse rounded-md" />
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                                    Bem-vindo(a), {greetingData.customerName || 'visitante'}
                                </h1>
                                <DesktopInstalledBadge detail="Catalogo otimizado para desktop" />
                            </div>
                            <p className="text-muted-foreground mt-1 text-balance">
                                {greetingData.greetingMessage}
                            </p>
                        </>
                    )}
                </div>
                
                <NoticeCard 
                    notice={settings?.catalog_notice} 
                    type={settings?.catalog_notice_type} 
                    className="max-w-md w-full hidden md:block" 
                />
            </motion.div>

            {/* Category Carousel (mobile + desktop) */}
            <CategoryCarousel
                categories={categories}
                selectedCategory={selectedCategory}
                onSelect={(id: string) => { setSelectedCategory(id); setCurrentPage(1); }}
            />

            {/* Filter Button (tablet only) - hidden on mobile (handled by MobileTopBar) and large desktop (sidebar) */}
            <div className="hidden md:flex lg:hidden mb-6">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <SheetTrigger asChild>
                        <Button variant="outline" className="w-full h-11 gap-2 bg-white/60">
                            <SlidersHorizontal className="h-4 w-4" />
                            Filtros
                            {activeFilters.length > 0 && (
                                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] gradient-bronze border-0 text-white">
                                    {activeFilters.length}
                                </Badge>
                            )}
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-80">
                        <SheetHeader>
                            <SheetTitle>Filtros</SheetTitle>
                        </SheetHeader>
                        <ScrollArea className="mt-6 h-[calc(100vh-100px)]">
                            <CatalogFilters 
                                categories={categories}
                                fabrics={fabrics}
                                sizes={sizes}
                                selectedCategory={selectedCategory}
                                selectedFabric={selectedFabric}
                                selectedSize={selectedSize}
                                sortBy={sortBy}
                                onSortChange={(v) => { setSortBy(v); setCurrentPage(1); }}
                                onCategoryChange={(id) => { setSelectedCategory(id); setCurrentPage(1); }}
                                onFabricChange={(id) => { setSelectedFabric(id); setCurrentPage(1); }}
                                onSizeChange={(slug) => { setSelectedSize(slug); setCurrentPage(1); }}
                                onClearAll={() => {
                                    setSelectedCategory('all');
                                    setSelectedFabric('all');
                                    setSelectedSize('all');
                                    setSortBy('name');
                                    setCurrentPage(1);
                                }}
                            />
                        </ScrollArea>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Active Filters */}
            {activeFilters.length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    {activeFilters.filter((filter): filter is string => typeof filter === 'string').map((filter) => (
                        <Badge key={filter} variant="secondary" className="gap-1">
                            {filter}
                        </Badge>
                    ))}
                    <button
                        onClick={clearFilters}
                        className="text-xs text-muted-foreground hover:text-foreground underline active:opacity-70 transition-opacity"
                    >
                        Limpar filtros
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex gap-8">
                {/* Desktop Sidebar Filters */}
                <aside className="hidden lg:block w-64 shrink-0">
                    <div className="sticky top-20 glass-card rounded-xl p-4">
                        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4" />
                            Filtros
                        </h2>
                        <CatalogFilters 
                            categories={categories}
                            fabrics={fabrics}
                            sizes={sizes}
                            selectedCategory={selectedCategory}
                            selectedFabric={selectedFabric}
                            selectedSize={selectedSize}
                            sortBy={sortBy}
                            onSortChange={(v) => { setSortBy(v); setCurrentPage(1); }}
                            onCategoryChange={(id) => { setSelectedCategory(id); setCurrentPage(1); }}
                            onFabricChange={(id) => { setSelectedFabric(id); setCurrentPage(1); }}
                            onSizeChange={(slug) => { setSelectedSize(slug); setCurrentPage(1); }}
                            onClearAll={() => {
                                setSelectedCategory('all');
                                setSelectedFabric('all');
                                setSelectedSize('all');
                                setSortBy('name');
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                </aside>

                {/* Products Grid & Pagination */}
                <div className="flex-1 flex flex-col pt-2 md:pt-0">
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
                            <Button variant="outline" className="mt-4 active:scale-95 transition-transform" onClick={clearFilters}>
                                Limpar filtros
                            </Button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground mb-4">
                                Exibindo {products.length} de {totalCount} produtos
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6 mb-8">
                                {products.map((product, i) => (
                                    <motion.div
                                        key={product.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <ProductCard product={product} onQuickView={(id) => setQuickViewId(id)} hidePrices={hidePrices} />
                                    </motion.div>
                                ))}
                            </div>
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="mt-auto pt-6 flex items-center justify-center gap-4">
                                    <Button
                                        variant="outline"
                                        className="active:scale-95 transition-transform"
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
                                        className="active:scale-95 transition-transform"
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

            {/* Responsive QuickView: Bottom Sheet on mobile, Modal on desktop */}
            {isMobile ? (
                <QuickViewBottomSheet
                    productId={quickViewId}
                    open={!!quickViewId}
                    onClose={() => setQuickViewId(null)}
                />
            ) : (
                <QuickViewModal
                    productId={quickViewId}
                    open={!!quickViewId}
                    onClose={() => setQuickViewId(null)}
                />
            )}
            </div>
        </PullToRefresh>
    )
}
