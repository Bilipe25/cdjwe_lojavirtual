'use client'

import { Badge } from '@/components/ui/badge'
import type { OrderItem } from '@/lib/types'
import { getOrderItemPricingSnapshot } from '@/lib/orders/order-item-pricing'
import { cn } from '@/lib/utils'

interface OrderItemPriceDetailsProps {
    item: OrderItem
    compact?: boolean
    className?: string
}

export function OrderItemPriceDetails({
    item,
    compact = false,
    className,
}: OrderItemPriceDetailsProps) {
    const snapshot = getOrderItemPricingSnapshot(item)

    return (
        <div className={cn('space-y-1.5', className)}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                    {item.quantity} unidade{item.quantity > 1 ? 's' : ''} x R$ {snapshot.finalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                {snapshot.hasFrozenSnapshot && (
                    <Badge
                        variant="secondary"
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                    >
                        Preco congelado
                    </Badge>
                )}
                {snapshot.hasVariationOverride && (
                    <Badge className="rounded-full border-0 bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800 shadow-none">
                        Cor
                    </Badge>
                )}
            </div>

            {!compact && snapshot.hasFrozenSnapshot && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                        Base: R$ {snapshot.basePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {snapshot.variationPrice !== null && (
                        <span>
                            Cor: R$ {snapshot.variationPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
