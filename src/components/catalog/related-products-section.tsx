'use client'

import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRelatedProducts } from '@/lib/hooks/use-related-products'
import type { Product } from '@/lib/types'
import { RelatedProductsCarousel } from '@/components/catalog/related-products-carousel'

interface RelatedProductsSectionProps {
    product: Product | null
    detailsBasePath?: string
}

function RelatedProductsSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div
                        key={index}
                        className="glass-card overflow-hidden rounded-[28px] border-0"
                    >
                        <div className="aspect-[1/0.9] animate-pulse bg-muted/40" />
                        <div className="space-y-3 p-4">
                            <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted/40" />
                            <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted/35" />
                            <div className="h-8 w-28 animate-pulse rounded-full bg-muted/35" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export function RelatedProductsSection({
    product,
    detailsBasePath = '/catalog',
}: RelatedProductsSectionProps) {
    const { products, loading, error, reload } = useRelatedProducts({
        currentProduct: product,
        enabled: Boolean(product),
        limit: 8,
    })

    if (!product) return null

    if (!loading && !error && products.length === 0) {
        return null
    }

    return (
        <section className="space-y-5 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Continuar explorando
                    </p>
                    <h2 className="mt-1 font-heading text-2xl font-bold text-gradient-navy sm:text-3xl">
                        Produtos relacionados
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        Selecoes semelhantes para continuar sua compra com mais rapidez.
                    </p>
                </div>
            </div>

            {loading ? (
                <RelatedProductsSkeleton />
            ) : error ? (
                <div className="glass-card rounded-[28px] border-0 px-5 py-6">
                    <p className="font-semibold text-foreground">
                        Nao foi possivel carregar os produtos relacionados.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Tente novamente para buscar sugestoes semelhantes a este item.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-4 rounded-full bg-background/80 shadow-sm"
                        onClick={() => void reload()}
                    >
                        <RefreshCcw className="h-4 w-4" />
                        Tentar novamente
                    </Button>
                </div>
            ) : (
                <RelatedProductsCarousel
                    products={products}
                    detailsBasePath={detailsBasePath}
                />
            )}
        </section>
    )
}
