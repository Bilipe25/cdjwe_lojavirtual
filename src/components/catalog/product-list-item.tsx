'use client'

import Image from 'next/image'
import { Package, Heart, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Product } from '@/lib/types'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { usePriceTableStore } from '@/lib/stores/price-table-store'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

interface ProductListItemProps {
    product: Product & {
        images?: { url: string; is_primary: boolean }[]
        category?: { name: string }
    }
    onQuickView?: (productId: string) => void
    hidePrices?: boolean
}

export function ProductListItem({ product, onQuickView, hidePrices = false }: ProductListItemProps) {
    const router = useRouter()
    const isMobile = useIsMobile()
    const primaryImage = product.images?.find((img) => img.is_primary) || product.images?.[0]
    const { isFavorite, toggle } = useFavoritesStore()
    const { calculateB2BPrice } = usePriceTableStore()
    const favorited = isFavorite(product.id)

    const activeSizeOptions = [...(product.size_options || [])]
        .filter((option) => option.is_active)
        .sort((a, b) => {
            const sortOrderDelta = (a.sort_order || 0) - (b.sort_order || 0)
            if (sortOrderDelta !== 0) return sortOrderDelta
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
    const defaultSizeOption = activeSizeOptions.find((option) => option.is_default) || activeSizeOptions[0]

    const basePriceCalc =
        calculateB2BPrice({
            basePrice: product.base_price,
            sizePriceMode: defaultSizeOption?.price_mode ?? null,
            sizePriceValue: defaultSizeOption?.price_value ?? null,
        }) ?? product.base_price

    const handlePrimaryAction = () => {
        if (isMobile && onQuickView) {
            onQuickView(product.id)
            return
        }
        router.push(`/catalog/${product.id}`)
    }

    return (
        <article className="group rounded-2xl border border-border/60 bg-white/90 p-2.5 shadow-[0_12px_36px_-30px_rgba(15,23,42,0.6)] transition-all hover:border-primary/30 hover:shadow-[0_16px_40px_-28px_rgba(15,23,42,0.7)]">
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={handlePrimaryAction}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted sm:h-24 sm:w-24"
                    aria-label={`Abrir ${product.name}`}
                >
                    {primaryImage ? (
                        <Image
                            src={primaryImage.url}
                            alt={product.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                    )}
                </button>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                        <button type="button" onClick={handlePrimaryAction} className="min-w-0 flex-1 text-left">
                            <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary sm:text-base">
                                {product.name}
                            </h3>
                            {product.size && (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
                                    Ref/Tamanho: {product.size}
                                </p>
                            )}
                        </button>

                        <button
                            onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                toggle(product.id)
                            }}
                            className="mobile-touch-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        >
                            <Heart
                                className={`h-4 w-4 transition-colors ${
                                    favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                                }`}
                            />
                        </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {product.category?.name && (
                            <Badge variant="secondary" className="rounded-full border border-border/60 bg-muted/35 text-[10px] text-muted-foreground">
                                {product.category.name}
                            </Badge>
                        )}
                        {product.is_featured && (
                            <Badge className="rounded-full border-0 bg-linear-to-r from-amber-700 to-orange-500 text-[10px] text-white">
                                Destaque
                            </Badge>
                        )}
                    </div>

                    {product.description && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">
                            {product.description}
                        </p>
                    )}

                    <div className="mt-3 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                            {hidePrices ? (
                                <p className="text-xs italic text-muted-foreground">Faca login para ver precos</p>
                            ) : (
                                <>
                                    <p className="text-[10px] text-muted-foreground">A partir de</p>
                                    <p className="truncate text-base font-bold text-gradient-bronze sm:text-lg">
                                        R$ {basePriceCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                            {onQuickView && (
                                <Button
                                    size="sm"
                                    className="h-8 rounded-xl px-2.5 text-xs"
                                    onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        onQuickView(product.id)
                                    }}
                                >
                                    <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                                    {isMobile ? 'Abrir' : 'Comprar'}
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-xl border-border/60 px-2.5 text-xs"
                                onClick={handlePrimaryAction}
                            >
                                Detalhes
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    )
}

