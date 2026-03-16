import {
    calculateProductPrice,
    type PriceCalculationResult,
    type PriceTableContext,
} from '@/lib/pricing/calculate-product-price'

export interface VariantPricingInput {
    basePrice: number | null | undefined
    fabricModifier?: number | null
    variantId?: string | null
    variantPriceOverride?: number | null
    sizePriceMode?: 'absolute' | 'delta' | null
    sizePriceValue?: number | null
    priceTable?: PriceTableContext | null
}

export interface ResolvedVariantPricing extends PriceCalculationResult {
    unitPrice: number
    productPrice: number
    variationPrice: number | null
    sizeMode: 'absolute' | 'delta' | null
}

export function resolveVariantPricing(
    input: VariantPricingInput
): ResolvedVariantPricing {
    const productPrice = Number(input.basePrice || 0)
    const variationPrice =
        input.variantPriceOverride !== null && input.variantPriceOverride !== undefined
            ? Number(input.variantPriceOverride)
            : null

    const calculation = calculateProductPrice({
        basePrice: productPrice,
        fabricModifier: input.fabricModifier,
        variantId: input.variantId,
        variantPriceOverride: variationPrice,
        sizePriceMode: input.sizePriceMode,
        sizePriceValue: input.sizePriceValue,
        priceTable: input.priceTable,
    })

    return {
        ...calculation,
        unitPrice: calculation.finalPrice,
        productPrice,
        variationPrice,
        sizeMode: input.sizePriceMode || null,
    }
}
