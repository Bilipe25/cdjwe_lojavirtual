import { create } from 'zustand'

export interface PriceTableState {
    tableId: string | null
    discountPercentage: number
    overrides: Record<string, number> // variant_id -> custom_price

    // Actions
    setTableData: (tableId: string | null, discountPercentage: number, overrides: Record<string, number>) => void
    clearTableData: () => void

    // Computed
    calculateB2BPrice: (basePrice: number | null, variantId?: string) => number | null
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

    calculateB2BPrice: (basePrice: number | null, variantId?: string) => {
        if (basePrice === null || basePrice === undefined) return null

        const { discountPercentage, overrides } = get()

        // Absolute winner: Specific variant override
        if (variantId && overrides[variantId] !== undefined) {
            return overrides[variantId]
        }

        // Apply global table discount
        if (discountPercentage > 0) {
            return basePrice * (1 - discountPercentage / 100)
        }

        return basePrice
    }
}))
