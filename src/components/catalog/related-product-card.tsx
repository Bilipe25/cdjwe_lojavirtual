'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePriceTableStore } from '@/lib/stores/price-table-store'
import type { RelatedProduct } from '@/lib/products/related-products'

interface RelatedProductCardProps {
    product: RelatedProduct
    detailsBasePath?: string
}

export function RelatedProductCard({
    product,
    detailsBasePath = '/catalog',
}: RelatedProductCardProps) {
    const { calculateB2BPrice } = usePriceTableStore()
    const primaryImage = product.images?.find((image) => image.is_primary) || product.images?.[0]
    const activeSizeOptions = [...(product.size_options || [])]
        .filter((sizeOption) => sizeOption.is_active)
        .sort((left, right) => {
            const orderDelta = (left.sort_order || 0) - (right.sort_order || 0)
            if (orderDelta !== 0) return orderDelta
            return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        })
    const defaultSizeOption =
        activeSizeOptions.find((sizeOption) => sizeOption.is_default) || activeSizeOptions[0]

    const displayPrice =
        calculateB2BPrice({
            basePrice: product.base_price,
            sizePriceMode: defaultSizeOption?.price_mode ?? null,
            sizePriceValue: defaultSizeOption?.price_value ?? null,
        }) ?? product.base_price

    return (
        <article className="group glass-card flex h-full flex-col overflow-hidden rounded-[28px] border-0">
            <Link
                href={`${detailsBasePath}/${product.id}`}
                className="relative block overflow-hidden bg-muted/30"
            >
                <div className="relative aspect-[1/0.9]">
                    {primaryImage ? (
                        <Image
                            src={primaryImage.url}
                            alt={product.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                    )}
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/22 to-transparent" />

                {product.category?.name && (
                    <div className="absolute left-3 top-3">
                        <Badge className="rounded-full border-white/40 bg-background/82 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur-md">
                            {product.category.name}
                        </Badge>
                    </div>
                )}
            </Link>

            <div className="flex flex-1 flex-col p-4">
                <div className="min-h-[3.25rem]">
                    <Link href={`${detailsBasePath}/${product.id}`} className="block">
                        <h3 className="line-clamp-2 font-heading text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                            {product.name}
                        </h3>
                    </Link>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {product.size ||
                            (product.has_size_variants
                                ? 'Variacoes de tamanho disponiveis'
                                : 'Produto semelhante para sua compra')}
                    </p>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            A partir de
                        </p>
                        <p className="text-lg font-bold text-gradient-bronze">
                            R$ {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="rounded-full border-white/55 bg-background/85 px-3 shadow-sm backdrop-blur-md"
                    >
                        <Link href={`${detailsBasePath}/${product.id}`}>
                            Ver
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </Button>
                </div>
            </div>
        </article>
    )
}
