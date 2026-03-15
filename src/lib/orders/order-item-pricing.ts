import type { OrderItem } from '@/lib/types'

export interface OrderItemPricingSnapshot {
    basePrice: number
    variationPrice: number | null
    finalPrice: number
    subtotal: number
    hasFrozenSnapshot: boolean
    hasVariationOverride: boolean
}

export function getOrderItemPricingSnapshot(item: OrderItem): OrderItemPricingSnapshot {
    const basePrice = item.product_price ?? item.unit_price ?? 0
    const variationPrice = item.variation_price ?? null
    const finalPrice = item.final_price ?? item.unit_price ?? 0
    const subtotal = item.subtotal ?? finalPrice * item.quantity
    const hasFrozenSnapshot =
        (item.product_price !== null && item.product_price !== undefined) ||
        (item.variation_price !== null && item.variation_price !== undefined) ||
        (item.final_price !== null && item.final_price !== undefined)

    return {
        basePrice,
        variationPrice,
        finalPrice,
        subtotal,
        hasFrozenSnapshot,
        hasVariationOverride: variationPrice !== null,
    }
}
