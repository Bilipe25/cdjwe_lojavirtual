'use client'

import { Badge } from '@/components/ui/badge'
import type { PriceLayer } from '@/lib/pricing/calculate-product-price'
import { cn } from '@/lib/utils'

interface PricePresentationProps {
    title?: string
    price: number
    layer: PriceLayer
    discountPercentage?: number
    description?: string
    className?: string
    priceClassName?: string
    badgeClassName?: string
}

export interface PriceBadgeDescriptor {
    label: string
    className: string
}

export function getPriceLayerLabel(layer: PriceLayer, discountPercentage = 0) {
    if (layer === 'variant') return 'Preco da cor aplicada'
    if (layer === 'size_absolute') return 'Preco do tamanho aplicado'
    if (layer === 'price_table_override') return 'Preco da sua tabela aplicado'
    if (layer === 'price_table_discount') return `Desconto de tabela (${discountPercentage}%)`
    return 'Preco base do produto'
}

export function getVariantPriceBadges({
    layer,
    discountPercentage = 0,
}: {
    layer: PriceLayer
    discountPercentage?: number
}): PriceBadgeDescriptor[] {
    if (layer === 'variant') {
        return [{ label: 'Cor', className: 'bg-indigo-100 text-indigo-800' }]
    }

    if (layer === 'price_table_override') {
        return [{ label: 'Tabela', className: 'bg-amber-100 text-amber-800' }]
    }

    if (layer === 'size_absolute') {
        return [{ label: 'Tamanho', className: 'bg-sky-100 text-sky-800' }]
    }

    if (layer === 'price_table_discount' && discountPercentage > 0) {
        return [
            {
                label: `-${discountPercentage}%`,
                className: 'bg-green-100 text-green-800',
            },
        ]
    }

    return []
}

export function PricePresentation({
    title = 'Preco Atual',
    price,
    layer,
    discountPercentage = 0,
    description,
    className,
    priceClassName,
    badgeClassName,
}: PricePresentationProps) {
    return (
        <div className={cn('rounded-2xl border border-border/70 bg-white p-5 shadow-sm', className)}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {title}
                    </span>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className={cn('text-3xl font-bold text-gradient-bronze', priceClassName)}>
                            R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
                <Badge
                    variant="secondary"
                    className={cn(
                        'w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700',
                        badgeClassName
                    )}
                >
                    {getPriceLayerLabel(layer, discountPercentage)}
                </Badge>
            </div>

            {description && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>
            )}
        </div>
    )
}

