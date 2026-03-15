export type PriceTableContext = {
    discountPercentage?: number | null
    overrides?: Record<string, number> | null
}

export type PriceLayer =
    | 'variant'
    | 'price_table_override'
    | 'price_table_discount'
    | 'base'

export interface PriceCalculationInput {
    basePrice: number
    fabricModifier?: number | null
    variantPriceOverride?: number | null
    priceTable?: PriceTableContext | null
    variantId?: string | null
}

export interface PriceCalculationResult {
    finalPrice: number
    layer: PriceLayer
    basePrice: number
}

export function calculateProductPrice(input: PriceCalculationInput): PriceCalculationResult {
    const basePrice = Number(input.basePrice || 0)
    const fabricModifier = Number(input.fabricModifier || 0)
    const standardBase = basePrice + fabricModifier

    if (input.variantPriceOverride !== null && input.variantPriceOverride !== undefined) {
        return {
            finalPrice: Number(input.variantPriceOverride),
            layer: 'variant',
            basePrice: standardBase,
        }
    }

    const overrides = input.priceTable?.overrides || {}
    const overrideValue =
        input.variantId && overrides[input.variantId] !== undefined
            ? overrides[input.variantId]
            : undefined

    if (overrideValue !== undefined) {
        return {
            finalPrice: Number(overrideValue),
            layer: 'price_table_override',
            basePrice: standardBase,
        }
    }

    const discountPercentage = Number(input.priceTable?.discountPercentage || 0)
    if (discountPercentage > 0) {
        return {
            finalPrice: standardBase * (1 - discountPercentage / 100),
            layer: 'price_table_discount',
            basePrice: standardBase,
        }
    }

    return {
        finalPrice: standardBase,
        layer: 'base',
        basePrice: standardBase,
    }
}
