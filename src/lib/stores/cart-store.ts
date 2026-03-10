import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from '@/lib/types'

interface CartState {
    items: CartItem[]
    isOpen: boolean

    // Actions
    addItem: (item: CartItem) => void
    removeItem: (variantId: string) => void
    updateQuantity: (variantId: string, quantity: number) => void
    clearCart: () => void
    toggleCart: () => void
    openCart: () => void
    closeCart: () => void

    // Computed
    totalItems: () => number
    subtotal: () => number
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            isOpen: false,

            addItem: (item: CartItem) => {
                set((state) => {
                    const existingItem = state.items.find(
                        (i) => i.variantId === item.variantId
                    )
                    if (existingItem) {
                        return {
                            items: state.items.map((i) =>
                                i.variantId === item.variantId
                                    ? { ...i, quantity: i.quantity + item.quantity }
                                    : i
                            ),
                        }
                    }
                    return { items: [...state.items, item] }
                })
            },

            removeItem: (variantId: string) => {
                set((state) => ({
                    items: state.items.filter((i) => i.variantId !== variantId),
                }))
            },

            updateQuantity: (variantId: string, quantity: number) => {
                if (quantity <= 0) {
                    get().removeItem(variantId)
                    return
                }
                set((state) => ({
                    items: state.items.map((i) =>
                        i.variantId === variantId ? { ...i, quantity } : i
                    ),
                }))
            },

            clearCart: () => set({ items: [] }),
            toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
            openCart: () => set({ isOpen: true }),
            closeCart: () => set({ isOpen: false }),

            totalItems: () => {
                return get().items.reduce((sum, item) => sum + item.quantity, 0)
            },

            subtotal: () => {
                return get().items.reduce(
                    (sum, item) => sum + item.unitPrice * item.quantity,
                    0
                )
            },
        }),
        {
            name: 'cdjwe-cart',
            partialize: (state) => ({ items: state.items }),
        }
    )
)
