export type PriceTableContext = {
    discountPercentage?: number | null
    overrides?: Record<string, number> | null
}

export type PriceLayer =
    | 'variant'
    | 'size_absolute'
    | 'price_table_override'
    | 'price_table_discount'
    | 'base_plus_size_delta'
    | 'base'

export interface PriceCalculationInput {
    basePrice: number
    fabricModifier?: number | null
    variantPriceOverride?: number | null
    sizePriceMode?: 'absolute' | 'delta' | null
    sizePriceValue?: number | null
    priceTable?: PriceTableContext | null
    variantId?: string | null
}

export interface PriceCalculationResult {
    finalPrice: number
    layer: PriceLayer
    basePrice: number
    effectiveBasePrice: number
    sizePrice: number | null
}

export function calculateProductPrice(input: PriceCalculationInput): PriceCalculationResult {
    const basePrice = Number(input.basePrice || 0)
    const fabricModifier = Number(input.fabricModifier || 0)
    const standardBase = Math.max(0, basePrice + fabricModifier)

    const sizeMode = input.sizePriceMode || null
    const sizeValue =
        input.sizePriceValue !== null && input.sizePriceValue !== undefined
            ? Number(input.sizePriceValue)
            : null
    const sizeDelta = sizeMode === 'delta' && sizeValue !== null ? sizeValue : 0
    const effectiveBase = Math.max(0, standardBase + sizeDelta)
    const sizeAbsolutePrice =
        sizeMode === 'absolute' && sizeValue !== null
            ? Math.max(0, sizeValue + fabricModifier)
            : null

    if (input.variantPriceOverride !== null && input.variantPriceOverride !== undefined) {
        return {
            finalPrice: Number(input.variantPriceOverride),
            layer: 'variant',
            basePrice: standardBase,
            effectiveBasePrice: effectiveBase,
            sizePrice: sizeAbsolutePrice,
        }
    }

    if (sizeAbsolutePrice !== null) {
        return {
            finalPrice: sizeAbsolutePrice,
            layer: 'size_absolute',
            basePrice: standardBase,
            effectiveBasePrice: effectiveBase,
            sizePrice: sizeAbsolutePrice,
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
            effectiveBasePrice: effectiveBase,
            sizePrice: sizeAbsolutePrice,
        }
    }

    const discountPercentage = Number(input.priceTable?.discountPercentage || 0)
    if (discountPercentage > 0) {
        return {
            finalPrice: effectiveBase * (1 - discountPercentage / 100),
            layer: 'price_table_discount',
            basePrice: standardBase,
            effectiveBasePrice: effectiveBase,
            sizePrice: sizeAbsolutePrice,
        }
    }

    return {
        finalPrice: effectiveBase,
        layer: sizeMode === 'delta' ? 'base_plus_size_delta' : 'base',
        basePrice: standardBase,
        effectiveBasePrice: effectiveBase,
        sizePrice: sizeAbsolutePrice,
    }
}
