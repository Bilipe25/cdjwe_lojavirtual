import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from '@/lib/types'

interface CartState {
    items: CartItem[]
    isOpen: boolean

    // Actions
    addItem: (item: CartItem) => void
    removeItem: (cartKey: string) => void
    updateQuantity: (cartKey: string, quantity: number) => void
    setItems: (items: CartItem[]) => void
    clearCart: () => void
    toggleCart: () => void
    openCart: () => void
    closeCart: () => void

    // Computed
    totalItems: () => number
    subtotal: () => number
}

function getCartItemKey(item: Pick<CartItem, 'cartKey' | 'variantId' | 'sizeOptionId'>) {
    return item.cartKey || `${item.variantId}::${item.sizeOptionId || 'legacy'}`
}

function normalizeCartItem(item: CartItem): CartItem {
    return {
        ...item,
        cartKey: getCartItemKey(item),
        sizeOptionId: item.sizeOptionId ?? null,
        sizePrice: item.sizePrice ?? null,
    }
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            isOpen: false,

            addItem: (item: CartItem) => {
                const normalizedIncoming = normalizeCartItem(item)
                const incomingKey = getCartItemKey(normalizedIncoming)

                set((state) => {
                    const existingItem = state.items.find(
                        (currentItem) => getCartItemKey(currentItem) === incomingKey
                    )

                    if (existingItem) {
                        return {
                            items: state.items.map((currentItem) =>
                                getCartItemKey(currentItem) === incomingKey
                                    ? {
                                          ...currentItem,
                                          quantity: currentItem.quantity + normalizedIncoming.quantity,
                                          unitPrice: normalizedIncoming.unitPrice,
                                          sizePrice: normalizedIncoming.sizePrice ?? currentItem.sizePrice ?? null,
                                      }
                                    : currentItem
                            ),
                        }
                    }

                    return { items: [...state.items, normalizedIncoming] }
                })
            },

            removeItem: (cartKey: string) => {
                set((state) => ({
                    items: state.items.filter((item) => getCartItemKey(item) !== cartKey),
                }))
            },

            updateQuantity: (cartKey: string, quantity: number) => {
                if (quantity <= 0) {
                    get().removeItem(cartKey)
                    return
                }
                set((state) => ({
                    items: state.items.map((item) =>
                        getCartItemKey(item) === cartKey ? { ...item, quantity } : item
                    ),
                }))
            },

            setItems: (items: CartItem[]) => set({ items: items.map(normalizeCartItem) }),
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
