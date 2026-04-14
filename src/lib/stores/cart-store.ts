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
let lastSyncedCartItems = new Map<string, CartItem>()
let forceRemoteCartClear = false

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

function buildCartItemMap(items: CartItem[]) {
    const mapped = new Map<string, CartItem>()
    items.map(normalizeCartItem).forEach((item) => {
        mapped.set(getCartItemKey(item), item)
    })
    return mapped
}

function areCartItemsEqual(left: CartItem, right: CartItem) {
    return (
        getCartItemKey(left) === getCartItemKey(right) &&
        left.variantId === right.variantId &&
        left.productId === right.productId &&
        left.productName === right.productName &&
        left.fabricName === right.fabricName &&
        left.colorName === right.colorName &&
        (left.size ?? null) === (right.size ?? null) &&
        (left.sizeOptionId ?? null) === (right.sizeOptionId ?? null) &&
        (left.sizePrice ?? null) === (right.sizePrice ?? null) &&
        (left.imageUrl ?? null) === (right.imageUrl ?? null) &&
        left.quantity === right.quantity &&
        left.unitPrice === right.unitPrice &&
        (left.updatedAt ?? null) === (right.updatedAt ?? null)
    )
}

function diffCartItems(previousItems: CartItem[], nextItems: CartItem[]) {
    const previousMap = buildCartItemMap(previousItems)
    const nextMap = buildCartItemMap(nextItems)

    const upserts: CartItem[] = []
    const deleteKeys: string[] = []

    nextMap.forEach((nextItem, key) => {
        const previousItem = previousMap.get(key)
        if (!previousItem || !areCartItemsEqual(previousItem, nextItem)) {
            upserts.push(nextItem)
        }
    })

    previousMap.forEach((_previousItem, key) => {
        if (!nextMap.has(key)) {
            deleteKeys.push(key)
        }
    })

    return {
        normalizedNextItems: Array.from(nextMap.values()),
        upserts,
        deleteKeys,
    }
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

function buildRemoteCartPayload(profileId: string, item: CartItem) {
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
}

async function applyCartDiff(params: {
    supabase: Awaited<ReturnType<typeof createClient>>
    profileId: string
    previousItems: CartItem[]
    nextItems: CartItem[]
    forceClearAll?: boolean
}) {
    const { supabase, profileId, previousItems, nextItems, forceClearAll = false } = params
    const diff = diffCartItems(previousItems, nextItems)
    const shouldClearAll = forceClearAll && diff.normalizedNextItems.length === 0

    if (shouldClearAll) {
        await supabase.from('user_cart_items').delete().eq('profile_id', profileId)
    } else if (diff.deleteKeys.length > 0) {
        await supabase
            .from('user_cart_items')
            .delete()
            .eq('profile_id', profileId)
            .in('cart_key', diff.deleteKeys)
    }

    if (diff.upserts.length > 0) {
        await supabase
            .from('user_cart_items')
            .upsert(
                diff.upserts.map((item) => buildRemoteCartPayload(profileId, item)),
                { onConflict: 'profile_id,cart_key' }
            )
    }

    return {
        normalizedNextItems: diff.normalizedNextItems,
        hasChanges: shouldClearAll || diff.deleteKeys.length > 0 || diff.upserts.length > 0,
    }
}

async function pushCartItemsToDb(items: CartItem[]) {
    try {
        const { supabase, profileId } = await getCartSyncContext()
        if (!profileId) return

        const previousItems = Array.from(lastSyncedCartItems.values())
        const result = await applyCartDiff({
            supabase,
            profileId,
            previousItems,
            nextItems: items,
            forceClearAll: forceRemoteCartClear,
        })

        lastSyncedCartItems = buildCartItemMap(result.normalizedNextItems)
        forceRemoteCartClear = false
    } catch {
        // Silent fail: local cart remains the fallback.
    }
}

function resetCartSyncState() {
    if (cartSyncTimeout) {
        globalThis.clearTimeout(cartSyncTimeout)
        cartSyncTimeout = null
    }
    lastSyncedCartItems = new Map<string, CartItem>()
    forceRemoteCartClear = false
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
                const previousItems = get().items
                const existingItem = previousItems.find(
                    (currentItem) => getCartItemKey(currentItem) === incomingKey
                )

                const nextItems = existingItem
                    ? previousItems.map((currentItem) =>
                          getCartItemKey(currentItem) === incomingKey
                              ? normalizeCartItem({
                                    ...currentItem,
                                    quantity: currentItem.quantity + normalizedIncoming.quantity,
                                    unitPrice: normalizedIncoming.unitPrice,
                                    sizePrice: normalizedIncoming.sizePrice ?? currentItem.sizePrice ?? null,
                                })
                              : currentItem
                      )
                    : [...previousItems, normalizedIncoming]

                set({ items: nextItems })

                scheduleCartSync()
            },

            removeItem: (cartKey: string) => {
                const nextItems = get().items.filter((item) => getCartItemKey(item) !== cartKey)
                set({ items: nextItems })

                scheduleCartSync()
            },

            updateQuantity: (cartKey: string, quantity: number) => {
                if (quantity <= 0) {
                    get().removeItem(cartKey)
                    return
                }

                const nextItems = get().items.map((item) =>
                        getCartItemKey(item) === cartKey
                            ? normalizeCartItem({ ...item, quantity })
                            : item
                    )
                set({ items: nextItems })

                scheduleCartSync()
            },

            setItems: (items: CartItem[]) => {
                const previousItems = get().items
                const normalizedItems = items.map(normalizeCartItem)
                if (previousItems.length > 0 && normalizedItems.length === 0) {
                    forceRemoteCartClear = true
                }

                set({ items: normalizedItems })
                scheduleCartSync()
            },

            clearCart: () => {
                if (get().items.length > 0) {
                    forceRemoteCartClear = true
                }
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
                    lastSyncedCartItems = buildCartItemMap(remoteItems)
                    forceRemoteCartClear = false

                    const result = await applyCartDiff({
                        supabase,
                        profileId,
                        previousItems: remoteItems,
                        nextItems: mergedItems,
                    })

                    lastSyncedCartItems = buildCartItemMap(result.normalizedNextItems)
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
    resetCartSyncState()
    setCartStorageScope(profileId)
    useCartStore.setState({ items: [], isOpen: false })
    await useCartStore.persist.rehydrate()
}
