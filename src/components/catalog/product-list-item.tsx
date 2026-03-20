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
        <article className="group relative flex items-center gap-3 rounded-xl border border-border/50 bg-white/90 p-2 shadow-sm transition-all hover:bg-white hover:border-primary/30 hover:shadow-md md:p-3">
            <button
                type="button"
                onClick={handlePrimaryAction}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-muted md:h-16 md:w-16"
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
                        <Package className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                )}
            </button>

            <div className="flex flex-1 flex-col justify-center min-w-0 md:flex-row md:items-center md:justify-between md:gap-4">
                {/* Left side: Info */}
                <div className="flex-1 min-w-0 md:max-w-[40%]">
                    <button type="button" onClick={handlePrimaryAction} className="w-full text-left">
                        <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary md:text-base">
                            {product.name}
                        </h3>
                        {product.size && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground font-medium">
                                Ref/Tamanho: {product.size}
                            </p>
                        )}
                    </button>
                    
                    {/* Mobile Only: Categories & Featured inline with info */}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
                        {product.category?.name && (
                            <Badge variant="secondary" className="rounded-md bg-muted/50 px-1.5 py-0 text-[9px] font-medium text-muted-foreground">
                                {product.category.name}
                            </Badge>
                        )}
                        {product.is_featured && (
                            <Badge className="rounded-md border-0 bg-linear-to-r from-amber-700/90 to-orange-500/90 px-1.5 py-0 text-[9px] text-white">
                                Destaque
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Desktop Only: Categories & Tags Column */}
                <div className="hidden md:flex md:w-48 md:shrink-0 md:flex-wrap md:items-center md:gap-1.5">
                    {product.category?.name && (
                        <Badge variant="secondary" className="rounded-md border-border/40 bg-muted/40 text-[10px] text-muted-foreground">
                            {product.category.name}
                        </Badge>
                    )}
                    {product.is_featured && (
                        <Badge className="rounded-md border-0 bg-linear-to-r from-amber-700/90 to-orange-500/90 text-[10px] text-white">
                            Destaque
                        </Badge>
                    )}
                </div>

                {/* Price Column */}
                <div className="mt-1 md:mt-0 md:w-32 md:shrink-0 md:text-right">
                    {hidePrices ? (
                        <p className="text-[10px] italic text-muted-foreground md:text-xs">Faça login para ver preços</p>
                    ) : (
                        <div className="flex items-baseline gap-1 md:block">
                            <span className="text-[10px] text-muted-foreground md:block md:text-xs">A partir de</span>
                            <span className="text-sm font-bold text-gradient-bronze md:text-lg">
                                R$ {basePriceCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="absolute top-2 right-2 md:static md:flex md:items-center md:gap-2 md:w-auto md:justify-end">
                    <button
                        onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggle(product.id)
                        }}
                        className="mobile-touch-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-white/80 text-muted-foreground transition-all hover:text-foreground hover:bg-white shadow-sm md:h-9 md:w-9"
                        aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                        <Heart
                            className={`h-4 w-4 transition-colors ${
                                favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                            }`}
                        />
                    </button>

                    <div className="hidden md:flex">
                        {onQuickView ? (
                            <Button
                                size="sm"
                                className="h-9 px-3 rounded-lg text-xs gradient-bronze border-0 shadow-sm"
                                onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onQuickView(product.id)
                                }}
                            >
                                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                                Comprar
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-3 rounded-lg text-xs bg-white/80 shadow-sm"
                                onClick={handlePrimaryAction}
                            >
                                Detalhes
                            </Button>
                        )}
                    </div>
                </div>
                
                {/* Mobile Extra Action (Cart/Quickview) */}
                <div className="absolute bottom-2 right-2 md:hidden">
                    {onQuickView ? (
                        <Button
                            size="icon"
                            className="h-8 w-8 rounded-full gradient-bronze border-0 shadow-sm"
                            aria-label="Comprar rápido"
                            onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                onQuickView(product.id)
                            }}
                        >
                            <ShoppingCart className="h-4 w-4 text-white" />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 rounded-full bg-white shadow-sm"
                            aria-label="Ver detalhes"
                            onClick={handlePrimaryAction}
                        >
                            <ShoppingCart className="h-4 w-4 text-primary" />
                        </Button>
                    )}
                </div>
            </div>
        </article>
    )
}

