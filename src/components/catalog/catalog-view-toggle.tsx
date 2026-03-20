'use client'

import { LayoutGrid, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CatalogViewMode = 'grid' | 'list'

interface CatalogViewToggleProps {
    value: CatalogViewMode
    onChange: (mode: CatalogViewMode) => void
    compact?: boolean
}

export function CatalogViewToggle({ value, onChange, compact = false }: CatalogViewToggleProps) {
    return (
        <div
            className="inline-flex items-center rounded-xl border border-border/60 bg-white/85 p-1 shadow-sm"
            role="tablist"
            aria-label="Modo de visualizacao do catalogo"
        >
            <button
                type="button"
                role="tab"
                aria-selected={value === 'grid'}
                aria-label="Visualizacao em grade"
                onClick={() => onChange('grid')}
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    value === 'grid'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
            >
                <LayoutGrid className="h-3.5 w-3.5" />
                {!compact && <span>Grade</span>}
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={value === 'list'}
                aria-label="Visualizacao em lista"
                onClick={() => onChange('list')}
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    value === 'list'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                )}
            >
                <Rows3 className="h-3.5 w-3.5" />
                {!compact && <span>Lista</span>}
            </button>
        </div>
    )
}

