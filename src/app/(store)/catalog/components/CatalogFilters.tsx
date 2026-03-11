import React from 'react'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Category, Fabric } from '@/lib/types'

interface CatalogFiltersProps {
    categories: Category[]
    fabrics: Fabric[]
    selectedCategory: string
    selectedFabric: string
    sortBy: string
    onSortChange: (value: string) => void
    onCategoryChange: (id: string) => void
    onFabricChange: (id: string) => void
}

export function CatalogFilters({
    categories,
    fabrics,
    selectedCategory,
    selectedFabric,
    sortBy,
    onSortChange,
    onCategoryChange,
    onFabricChange
}: CatalogFiltersProps) {
    return (
        <div className="space-y-6">
            {/* Sort */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Classificar por</h3>
                <Select value={sortBy} onValueChange={(val) => {
                    if (val) onSortChange(val)
                }}>
                    <SelectTrigger className="w-full h-10 bg-white/60">
                        <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="name">Nome (A-Z)</SelectItem>
                        <SelectItem value="price_asc">Menor preço</SelectItem>
                        <SelectItem value="price_desc">Maior preço</SelectItem>
                        <SelectItem value="newest">Mais recentes</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Separator />

            {/* Categories */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Categorias</h3>
                <div className="space-y-1">
                    <button
                        onClick={() => onCategoryChange('all')}
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
                            onClick={() => onCategoryChange(cat.id)}
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
                        onClick={() => onFabricChange('all')}
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
                            onClick={() => onFabricChange(fab.id)}
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
}
