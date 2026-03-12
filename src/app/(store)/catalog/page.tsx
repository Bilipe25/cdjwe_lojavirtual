'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, X, SlidersHorizontal, ChevronRight, ChevronLeft, ArrowUp, Instagram } from 'lucide-react'
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
    const [hidePrices, setHidePrices] = useState(false)
    const [showScrollTop, setShowScrollTop] = useState(false)
    const [socialUrls, setSocialUrls] = useState<{ whatsapp: string | null; instagram: string | null }>({ whatsapp: null, instagram: null })
    const isMobile = useIsMobile()

    // Handle scroll to top visibility
    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // Sync search state with URL search params (TopBar search)
    // We REMOVED the internal debounce as it's handled by MobileTopBar
    useEffect(() => {
        const urlSearch = searchParams.get('search') || ''
        const urlCategory = searchParams.get('category') || 'all'
        const urlFabric = searchParams.get('fabric') || 'all'

        if (urlSearch !== search) setSearch(urlSearch)
        if (urlSearch !== debouncedSearch) setDebouncedSearch(urlSearch)
        if (urlCategory !== selectedCategory) setSelectedCategory(urlCategory)
        if (urlFabric !== selectedFabric) setSelectedFabric(urlFabric)
        
        // Reset to page 1 always on search/filter changes
        setCurrentPage(1)
    }, [searchParams])

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
            let fabricProductIds: string[] | null = null
            if (selectedFabric !== 'all') {
                const { data: variantLinks } = await supabase
                    .from('product_variants')
                    .select('product_id')
                    .eq('fabric_id', selectedFabric)
                    .eq('is_active', true)
                
                if (variantLinks && variantLinks.length > 0) {
                    // Deduplicate product IDs
                    fabricProductIds = [...new Set(variantLinks.map(v => v.product_id))]
                } else {
                    // No products match this fabric — short-circuit
                    setProducts([])
                    setTotalCount(0)
                    setLoading(false)
                    return
                }
            }

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
            
            // Apply fabric filter server-side using pre-fetched IDs
            if (fabricProductIds) {
                query = query.in('id', fabricProductIds)
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
                setProducts(data as any)
                setTotalCount(count || 0)
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
                className="mb-6 hidden md:block"
            >
                <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                    Catálogo
                </h1>
                <p className="text-muted-foreground mt-1">
                    Encontre os melhores estofados para sua loja
                </p>
            </motion.div>

            {/* Category Carousel (mobile + desktop) */}
            <CategoryCarousel
                categories={categories}
                selectedCategory={selectedCategory}
                onSelect={(id: string) => { setSelectedCategory(id); setCurrentPage(1); }}
            />

            {/* Filter Button (mobile/tablet only) - hidden on large desktop sidebar */}
            <div className="flex lg:hidden mb-6">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <SheetTrigger render={<Button variant="outline" className="w-full h-11 gap-2 bg-white/60" />}>
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
                                sortBy={sortBy}
                                onSortChange={(v) => { setSortBy(v); setCurrentPage(1); }}
                                onCategoryChange={(id) => { setSelectedCategory(id); setCurrentPage(1); }}
                                onFabricChange={(id) => { setSelectedFabric(id); setCurrentPage(1); }}
                                onClearAll={() => {
                                    setSelectedCategory('all');
                                    setSelectedFabric('all');
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
                    {activeFilters.map((filter) => (
                        <Badge key={filter || Math.random()} variant="secondary" className="gap-1">
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
                            selectedCategory={selectedCategory}
                            selectedFabric={selectedFabric}
                            sortBy={sortBy}
                            onSortChange={(v) => { setSortBy(v); setCurrentPage(1); }}
                            onCategoryChange={(id) => { setSelectedCategory(id); setCurrentPage(1); }}
                            onFabricChange={(id) => { setSelectedFabric(id); setCurrentPage(1); }}
                            onClearAll={() => {
                                setSelectedCategory('all');
                                setSelectedFabric('all');
                                setSortBy('name');
                                setCurrentPage(1);
                            }}
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

            {/* Scroll to Top Button (Left Side) */}
            <AnimatePresence>
                {showScrollTop && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.8 }}
                        className="fixed bottom-24 md:bottom-6 left-4 lg:left-8 z-50 flex flex-col gap-3"
                    >
                        <motion.div
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ scale: 1.1 }}
                        >
                            <Button
                                size="icon"
                                className="h-12 w-12 rounded-full gradient-bronze text-white shadow-xl hover:shadow-2xl border-none transition-all duration-300"
                                onClick={scrollToTop}
                            >
                                <ArrowUp className="h-6 w-6" />
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Social Media Buttons (Right Side) */}
            <AnimatePresence>
                {(socialUrls.whatsapp || socialUrls.instagram) && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="fixed bottom-24 md:bottom-6 right-4 lg:right-8 z-50 flex flex-col gap-3"
                    >
                        {socialUrls.instagram && (
                            <a href={socialUrls.instagram} target="_blank" rel="noopener noreferrer">
                                <Button
                                    size="icon"
                                    className="h-12 w-12 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-500 text-white shadow-xl hover:shadow-2xl hover:opacity-90 border-none transition-all duration-300"
                                >
                                    <Instagram className="h-6 w-6" />
                                </Button>
                            </a>
                        )}
                        {socialUrls.whatsapp && (
                            <a href={`https://wa.me/${socialUrls.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                <Button
                                    size="icon"
                                    className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-xl hover:shadow-2xl border-none transition-all duration-300"
                                >
                                    {/* Custom WhatsApp SVG within lucide-react size constraints */}
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                    </svg>
                                </Button>
                            </a>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

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
