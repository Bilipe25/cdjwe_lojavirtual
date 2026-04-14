import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'
import type { CartItem } from '@/lib/types'

interface CartState {
    items: CartItem[]
    isOpen: boolean

    addItem: (item: CartItem) => void
    removeItem: (cartKey: string) => void
    updateQuantity: (cartKey: string, quantity: number) => void
    setItems: (items: CartItem[]) => void
    clearCart: () => void
    toggleCart: () => void
    openCart: () => void
    closeCart: () => void
    syncFromDb: () => Promise<void>

    totalItems: () => number
    subtotal: () => number
}

type RemoteCartRow = {
    cart_key: string
    product_variant_id: string
    product_id: string
    size_option_id: string | null
    product_name: string
    fabric_name: string
    color_name: string
    size_name: string | null
    size_price: number | null
    image_url: string | null
    quantity: number
    unit_price: number
    item_updated_at: string | null
}

const CART_STORAGE_NAME = 'cdjwe-cart'
const CART_STORAGE_SCOPE_KEY = 'cdjwe-cart:active-user'
const CART_STORAGE_GUEST_SCOPE = 'guest'
const CART_SYNC_DEBOUNCE_MS = 450

let cartSyncTimeout: ReturnType<typeof globalThis.setTimeout> | null = null

function getNowIso() {
    return new Date().toISOString()
}

function getCartStorageScope() {
    if (typeof window === 'undefined') return CART_STORAGE_GUEST_SCOPE

    return window.localStorage.getItem(CART_STORAGE_SCOPE_KEY) || CART_STORAGE_GUEST_SCOPE
}

function buildScopedCartStorageKey(scope: string) {
    return `${CART_STORAGE_NAME}:${scope}`
}

function getScopedCartStorageKey(scope = getCartStorageScope()) {
    return buildScopedCartStorageKey(scope)
}

function migrateLegacyCartStorageIfNeeded(scope: string) {
    if (typeof window === 'undefined') return

    const scopedKey = getScopedCartStorageKey(scope)
    const legacyValue = window.localStorage.getItem(CART_STORAGE_NAME)
    if (!legacyValue || window.localStorage.getItem(scopedKey)) return

    window.localStorage.setItem(scopedKey, legacyValue)
    window.localStorage.removeItem(CART_STORAGE_NAME)
}

const scopedCartStorage: StateStorage = {
    getItem: () => {
        if (typeof window === 'undefined') return null
        return window.localStorage.getItem(getScopedCartStorageKey())
    },
    setItem: (_name, value) => {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(getScopedCartStorageKey(), value)
    },
    removeItem: () => {
        if (typeof window === 'undefined') return
        window.localStorage.removeItem(getScopedCartStorageKey())
    },
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
        updatedAt: item.updatedAt || getNowIso(),
    }
}

function mapRemoteRowToCartItem(row: RemoteCartRow): CartItem {
    return normalizeCartItem({
        cartKey: row.cart_key,
        variantId: row.product_variant_id,
        productId: row.product_id,
        productName: row.product_name,
        fabricName: row.fabric_name,
        colorName: row.color_name,
        size: row.size_name,
        sizeOptionId: row.size_option_id,
        sizePrice: row.size_price,
        imageUrl: row.image_url,
        quantity: row.quantity,
        unitPrice: row.unit_price,
        updatedAt: row.item_updated_at || getNowIso(),
    })
}

function mergeCartItems(localItems: CartItem[], remoteItems: CartItem[]) {
    const merged = new Map<string, CartItem>()

    const assignItem = (candidate: CartItem) => {
        const normalizedCandidate = normalizeCartItem(candidate)
        const key = getCartItemKey(normalizedCandidate)
        const current = merged.get(key)

        if (!current) {
            merged.set(key, normalizedCandidate)
            return
        }

        const currentTime = new Date(current.updatedAt || 0).getTime()
        const candidateTime = new Date(normalizedCandidate.updatedAt || 0).getTime()

        if (candidateTime >= currentTime) {
            merged.set(key, normalizedCandidate)
        }
    }

    remoteItems.forEach(assignItem)
    localItems.forEach(assignItem)

    return Array.from(merged.values())
}

async function getCartSyncContext() {
    const supabase = createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    return {
        supabase,
        profileId: user?.id || null,
    }
}

async function pushCartItemsToDb(items: CartItem[]) {
    try {
        const { supabase, profileId } = await getCartSyncContext()
        if (!profileId) return

        const normalizedItems = items.map(normalizeCartItem)

        if (normalizedItems.length === 0) {
            await supabase.from('user_cart_items').delete().eq('profile_id', profileId)
            return
        }

        const { data: existingRows } = await supabase
            .from('user_cart_items')
            .select('cart_key')
            .eq('profile_id', profileId)

        const nextKeys = new Set(normalizedItems.map((item) => getCartItemKey(item)))
        const staleKeys =
            existingRows
                ?.map((row) => row.cart_key)
                .filter((cartKey) => !nextKeys.has(cartKey)) || []

        if (staleKeys.length > 0) {
            await supabase
                .from('user_cart_items')
                .delete()
                .eq('profile_id', profileId)
                .in('cart_key', staleKeys)
        }

        const payload = normalizedItems.map((item) => {
            const timestamp = item.updatedAt || getNowIso()
            return {
                profile_id: profileId,
                cart_key: getCartItemKey(item),
                product_variant_id: item.variantId,
                product_id: item.productId,
                size_option_id: item.sizeOptionId ?? null,
                product_name: item.productName,
                fabric_name: item.fabricName,
                color_name: item.colorName,
                size_name: item.size ?? null,
                size_price: item.sizePrice ?? null,
                image_url: item.imageUrl,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                item_updated_at: timestamp,
                updated_at: timestamp,
            }
        })

        await supabase
            .from('user_cart_items')
            .upsert(payload, { onConflict: 'profile_id,cart_key' })
    } catch {
        // Silent fail: local cart remains the fallback.
    }
}

function scheduleCartSync() {
    if (typeof window === 'undefined') return

    if (cartSyncTimeout) {
        globalThis.clearTimeout(cartSyncTimeout)
    }

    cartSyncTimeout = globalThis.setTimeout(() => {
        cartSyncTimeout = null
        void pushCartItemsToDb(useCartStore.getState().items)
    }, CART_SYNC_DEBOUNCE_MS)
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
                                    ? normalizeCartItem({
                                          ...currentItem,
                                          quantity: currentItem.quantity + normalizedIncoming.quantity,
                                          unitPrice: normalizedIncoming.unitPrice,
                                          sizePrice: normalizedIncoming.sizePrice ?? currentItem.sizePrice ?? null,
                                      })
                                    : currentItem
                            ),
                        }
                    }

                    return { items: [...state.items, normalizedIncoming] }
                })

                scheduleCartSync()
            },

            removeItem: (cartKey: string) => {
                set((state) => ({
                    items: state.items.filter((item) => getCartItemKey(item) !== cartKey),
                }))

                scheduleCartSync()
            },

            updateQuantity: (cartKey: string, quantity: number) => {
                if (quantity <= 0) {
                    get().removeItem(cartKey)
                    return
                }

                set((state) => ({
                    items: state.items.map((item) =>
                        getCartItemKey(item) === cartKey
                            ? normalizeCartItem({ ...item, quantity })
                            : item
                    ),
                }))

                scheduleCartSync()
            },

            setItems: (items: CartItem[]) => {
                set({ items: items.map(normalizeCartItem) })
                scheduleCartSync()
            },

            clearCart: () => {
                set({ items: [] })
                scheduleCartSync()
            },

            toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
            openCart: () => set({ isOpen: true }),
            closeCart: () => set({ isOpen: false }),

            syncFromDb: async () => {
                try {
                    const { supabase, profileId } = await getCartSyncContext()
                    if (!profileId) return

                    const { data } = await supabase
                        .from('user_cart_items')
                        .select(`
                            cart_key,
                            product_variant_id,
                            product_id,
                            size_option_id,
                            product_name,
                            fabric_name,
                            color_name,
                            size_name,
                            size_price,
                            image_url,
                            quantity,
                            unit_price,
                            item_updated_at
                        `)
                        .eq('profile_id', profileId)
                        .order('item_updated_at', { ascending: false })

                    const remoteItems = ((data || []) as RemoteCartRow[]).map(mapRemoteRowToCartItem)
                    const mergedItems = mergeCartItems(get().items, remoteItems)

                    set({ items: mergedItems })
                    await pushCartItemsToDb(mergedItems)
                } catch {
                    // Silent fail: local scoped cart remains usable.
                }
            },

            totalItems: () => {
                return get().items.reduce((sum, item) => sum + item.quantity, 0)
            },

            subtotal: () => {
                return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
            },
        }),
        {
            name: CART_STORAGE_NAME,
            storage: createJSONStorage(() => scopedCartStorage),
            partialize: (state) => ({ items: state.items }),
            skipHydration: true,
        }
    )
)

export function setCartStorageScope(profileId: string | null) {
    if (typeof window === 'undefined') return

    const nextScope = profileId || CART_STORAGE_GUEST_SCOPE
    migrateLegacyCartStorageIfNeeded(nextScope)
    window.localStorage.setItem(CART_STORAGE_SCOPE_KEY, nextScope)
}

export async function rehydrateCartStoreForScope(profileId: string | null) {
    setCartStorageScope(profileId)
    useCartStore.setState({ items: [], isOpen: false })
    await useCartStore.persist.rehydrate()
}
