import { ArrowUpDown, Tag, Package, Ruler, X } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Category, Fabric } from '@/lib/types'
import { Button } from '@/components/ui/button'

interface CatalogSizeFilterOption {
    slug: string
    name: string
}

interface CatalogFiltersProps {
    categories: Category[]
    fabrics: Fabric[]
    sizes: CatalogSizeFilterOption[]
    selectedCategory: string
    selectedFabric: string
    selectedSize: string
    sortBy: string
    onSortChange: (value: string) => void
    onCategoryChange: (id: string) => void
    onFabricChange: (id: string) => void
    onSizeChange: (slug: string) => void
    onClearAll?: () => void
}

export function CatalogFilters({
    categories,
    fabrics,
    sizes,
    selectedCategory,
    selectedFabric,
    selectedSize,
    sortBy,
    onSortChange,
    onCategoryChange,
    onFabricChange,
    onSizeChange,
    onClearAll
}: CatalogFiltersProps) {
    return (
        <div className="space-y-6 pb-6">
            {/* Sort */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <ArrowUpDown className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Classificar por</h3>
                    </div>
                    {sortBy !== 'name' && (
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    )}
                </div>
                <Select value={sortBy} onValueChange={(val) => {
                    if (val) onSortChange(val)
                }}>
                    <SelectTrigger className="w-full h-11 bg-muted/30 border-border/40 hover:bg-white hover:border-primary/30 transition-all rounded-xl ring-offset-background focus:ring-1 focus:ring-primary/20">
                        <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/40 shadow-xl">
                        <SelectItem value="name" className="rounded-lg">Nome (A-Z)</SelectItem>
                        <SelectItem value="price_asc" className="rounded-lg">Menor preço</SelectItem>
                        <SelectItem value="price_desc" className="rounded-lg">Maior preço</SelectItem>
                        <SelectItem value="newest" className="rounded-lg">Mais recentes</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Separator className="opacity-40" />

            {/* Categories */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Categorias</h3>
                    </div>
                    {selectedCategory !== 'all' && (
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    )}
                </div>
                <div className="flex flex-col gap-1.5">
                    <button
                        onClick={() => onCategoryChange('all')}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                            selectedCategory === 'all'
                                ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                                : 'bg-muted/20 border-transparent hover:bg-muted/40 text-muted-foreground'
                        }`}
                    >
                        Todas as categorias
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => onCategoryChange(cat.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                                selectedCategory === cat.id
                                    ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                                    : 'bg-muted/20 border-transparent hover:bg-muted/40 text-muted-foreground'
                            }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            </div>

            <Separator className="opacity-40" />

            {/* Sizes */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Ruler className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Tamanhos</h3>
                    </div>
                    {selectedSize !== 'all' && (
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    )}
                </div>
                <div className="flex flex-col gap-1.5">
                    <button
                        onClick={() => onSizeChange('all')}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                            selectedSize === 'all'
                                ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                                : 'bg-muted/20 border-transparent hover:bg-muted/40 text-muted-foreground'
                        }`}
                    >
                        Todos os tamanhos
                    </button>
                    {sizes.map((size) => (
                        <button
                            key={size.slug}
                            onClick={() => onSizeChange(size.slug)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                                selectedSize === size.slug
                                    ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                                    : 'bg-muted/20 border-transparent hover:bg-muted/40 text-muted-foreground'
                            }`}
                        >
                            {size.name}
                        </button>
                    ))}
                </div>
            </div>

            <Separator className="opacity-40" />

            {/* Fabrics */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Tecidos</h3>
                    </div>
                    {selectedFabric !== 'all' && (
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    )}
                </div>
                <div className="flex flex-col gap-1.5">
                    <button
                        onClick={() => onFabricChange('all')}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                            selectedFabric === 'all'
                                ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                                : 'bg-muted/20 border-transparent hover:bg-muted/40 text-muted-foreground'
                        }`}
                    >
                        Todos os tecidos
                    </button>
                    {fabrics.map((fab) => (
                        <button
                            key={fab.id}
                            onClick={() => onFabricChange(fab.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 border ${
                                selectedFabric === fab.id
                                    ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                                    : 'bg-muted/20 border-transparent hover:bg-muted/40 text-muted-foreground'
                            }`}
                        >
                            {fab.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Clear filters trigger */}
            {(selectedCategory !== 'all' || selectedFabric !== 'all' || selectedSize !== 'all') && (
                <div className="pt-2">
                    <Button
                        variant="ghost"
                        className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl gap-2"
                        onClick={() => {
                            if (onClearAll) {
                                onClearAll()
                            } else {
                                onCategoryChange('all')
                                onFabricChange('all')
                                onSizeChange('all')
                            }
                        }}
                    >
                        <X className="h-4 w-4" />
                        Limpar todos os filtros
                    </Button>
                </div>
            )}
        </div>
    )
}
