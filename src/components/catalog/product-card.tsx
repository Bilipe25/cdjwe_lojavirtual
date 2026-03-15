'use client'

import Image from 'next/image'
import { Package, Heart, ShoppingCart } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/types'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { usePriceTableStore } from '@/lib/stores/price-table-store'

import { useRouter } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

interface ProductCardProps {
    product: Product & {
        images?: { url: string; is_primary: boolean }[]
        category?: { name: string }
    }
    onQuickView?: (productId: string) => void
    hidePrices?: boolean
}

export function ProductCard({ product, onQuickView, hidePrices = false }: ProductCardProps) {
    const router = useRouter()
    const isMobile = useIsMobile()
    const primaryImage = product.images?.find((img) => img.is_primary) || product.images?.[0]
    const { isFavorite, toggle } = useFavoritesStore()
    const { calculateB2BPrice } = usePriceTableStore()
    const favorited = isFavorite(product.id)

    const basePriceCalc = calculateB2BPrice({ basePrice: product.base_price }) ?? product.base_price

    const handleCardClick = () => {
        if (isMobile && onQuickView) {
            onQuickView(product.id)
        } else {
            router.push(`/catalog/${product.id}`)
        }
    }

    return (
        <Card className="group glass-card border-0 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] active:shadow-sm">
            {/* Image */}
            <div
                className="relative h-40 sm:h-56 bg-muted overflow-hidden"
                onClick={handleCardClick}
            >
                {primaryImage ? (
                    <Image
                        src={primaryImage.url}
                        alt={product.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/30" />
                    </div>
                )}

                {/* Badges */}
                <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex gap-1.5">
                    {product.is_featured && (
                        <Badge className="gradient-bronze border-0 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5">
                            Destaque
                        </Badge>
                    )}
                    {product.category && (
                        <Badge variant="secondary" className="bg-white/80 backdrop-blur text-[9px] sm:text-[10px] px-1.5 py-0.5 hidden sm:flex">
                            {product.category.name}
                        </Badge>
                    )}
                </div>

                {/* Favorite heart - larger touch area on mobile */}
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(product.id) }}
                    className="absolute top-2 right-2 sm:top-3 sm:right-3 h-9 w-9 sm:h-8 sm:w-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition-all shadow-sm z-10 mobile-touch-target"
                >
                    <Heart
                        className={`h-4 w-4 transition-colors ${
                            favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                        }`}
                    />
                </button>

                {/* Desktop Hover Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 items-center justify-center pointer-events-none hidden sm:flex">
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
                        {onQuickView && (
                            <Button
                                size="sm"
                                className="gradient-bronze hover:brightness-110 border-0 text-white shadow"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickView(product.id) }}
                            >
                                <ShoppingCart className="h-4 w-4 mr-1" />
                                Comprar
                            </Button>
                        )}
                        <a href={`/catalog/${product.id}`}>
                            <Button
                                size="sm"
                                variant="secondary"
                                className="bg-white/90 hover:bg-white shadow"
                            >
                                Detalhes
                            </Button>
                        </a>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div onClick={handleCardClick}>
                <CardContent className="p-3 sm:p-4">
                    <h3 className="font-semibold font-heading text-sm sm:text-base line-clamp-1 group-hover:text-primary transition-colors">
                        {product.name}
                    </h3>
                    {product.size && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{product.size}</p>
                    )}
                    {/* Description hidden on mobile for compact 2-col layout */}
                    {product.description && (
                        <p className="text-sm text-muted-foreground mt-1 hidden sm:line-clamp-3 min-h-12">
                            {product.description}
                        </p>
                    )}
                    <div className="mt-2 sm:mt-3 flex items-end justify-between">
                        <div>
                            {hidePrices ? (
                                <p className="text-xs text-muted-foreground italic">Faça login para ver preços</p>
                            ) : (
                                <>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground">A partir de</p>
                                    <p className="text-base sm:text-lg font-bold text-gradient-bronze">
                                        R$ {basePriceCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </div>
        </Card>
    )
}
