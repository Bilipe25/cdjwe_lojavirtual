'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Filter, X, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'
import type { Product, Category, Fabric } from '@/lib/types'
import { ProductCard } from '@/components/catalog/product-card'

export default function CatalogPage() {
    const [products, setProducts] = useState<(Product & { images: { url: string; is_primary: boolean }[] })[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [fabrics, setFabrics] = useState<Fabric[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [selectedFabric, setSelectedFabric] = useState<string>('all')
    const [sortBy, setSortBy] = useState<string>('name')
    const [filtersOpen, setFiltersOpen] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        const supabase = createClient()

        const [productsRes, categoriesRes, fabricsRes] = await Promise.all([
            supabase
                .from('products')
                .select(`
          *,
          category:categories(*),
          images:product_images(url, is_primary, sort_order)
        `)
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            supabase
                .from('categories')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            supabase
                .from('fabrics')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
        ])

        if (productsRes.data) setProducts(productsRes.data)
        if (categoriesRes.data) setCategories(categoriesRes.data)
        if (fabricsRes.data) setFabrics(fabricsRes.data)
        setLoading(false)
    }

    // Filter & sort
    const filtered = products
        .filter((p) => {
            if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
            if (selectedCategory !== 'all' && p.category_id !== selectedCategory) return false
            return true
        })
        .sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name)
            if (sortBy === 'price_asc') return a.base_price - b.base_price
            if (sortBy === 'price_desc') return b.base_price - a.base_price
            if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            return 0
        })

    const activeFilters = [
        selectedCategory !== 'all' && categories.find(c => c.id === selectedCategory)?.name,
        selectedFabric !== 'all' && fabrics.find(f => f.id === selectedFabric)?.name,
    ].filter(Boolean)

    const clearFilters = () => {
        setSelectedCategory('all')
        setSelectedFabric('all')
        setSearch('')
    }

    const FilterPanel = () => (
        <div className="space-y-6">
            {/* Categories */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Categorias</h3>
                <div className="space-y-1">
                    <button
                        onClick={() => setSelectedCategory('all')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === 'all'
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted text-muted-foreground'
                            }`}
                    >
                        Todas as categorias
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === cat.id
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted text-muted-foreground'
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            </div>

            <Separator />

            {/* Fabrics */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Tecidos</h3>
                <div className="space-y-1">
                    <button
                        onClick={() => setSelectedFabric('all')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedFabric === 'all'
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted text-muted-foreground'
                            }`}
                    >
                        Todos os tecidos
                    </button>
                    {fabrics.map((fab) => (
                        <button
                            key={fab.id}
                            onClick={() => setSelectedFabric(fab.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedFabric === fab.id
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted text-muted-foreground'
                                }`}
                        >
                            {fab.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
            >
                <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
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
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
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
                    <SheetTrigger asChild>
                        <Button variant="outline" className="lg:hidden h-11 gap-2">
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
                            <FilterPanel />
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
                        <FilterPanel />
                    </div>
                </aside>

                {/* Products Grid */}
                <div className="flex-1">
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="glass-card rounded-xl overflow-hidden">
                                    <Skeleton className="h-56 w-full" />
                                    <div className="p-4 space-y-3">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-3 w-1/2" />
                                        <Skeleton className="h-8 w-24" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16">
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
                                {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                                {filtered.map((product, i) => (
                                    <motion.div
                                        key={product.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <ProductCard product={product} />
                                    </motion.div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
