import { create } from 'zustand'
import { calculateProductPrice } from '@/lib/pricing/calculate-product-price'

export interface PriceTableState {
    tableId: string | null
    discountPercentage: number
    overrides: Record<string, number> // variant_id -> custom_price

    // Actions
    setTableData: (tableId: string | null, discountPercentage: number, overrides: Record<string, number>) => void
    clearTableData: () => void

    // Computed
    calculateB2BPrice: (input: {
        basePrice: number | null
        fabricModifier?: number | null
        variantId?: string
        variantPriceOverride?: number | null
    }) => number | null
}

export const usePriceTableStore = create<PriceTableState>((set, get) => ({
    tableId: null,
    discountPercentage: 0,
    overrides: {},

    setTableData: (tableId, discountPercentage, overrides) => {
        set({ tableId, discountPercentage: discountPercentage || 0, overrides: overrides || {} })
    },

    clearTableData: () => {
        set({ tableId: null, discountPercentage: 0, overrides: {} })
    },

    calculateB2BPrice: ({ basePrice, fabricModifier, variantId, variantPriceOverride }) => {
        if (basePrice === null || basePrice === undefined) return null

        const { discountPercentage, overrides } = get()

        return calculateProductPrice({
            basePrice,
            fabricModifier,
            variantId,
            variantPriceOverride,
            priceTable: {
                discountPercentage,
                overrides,
            },
        }).finalPrice
    },
}))
