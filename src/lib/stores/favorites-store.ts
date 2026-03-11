import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

interface FavoritesState {
    favoriteIds: string[]
    synced: boolean
    toggle: (productId: string) => void
    isFavorite: (productId: string) => boolean
    clear: () => void
    syncFromDb: () => Promise<void>
}

export const useFavoritesStore = create<FavoritesState>()(
    persist(
        (set, get) => ({
            favoriteIds: [],
            synced: false,

            toggle: (productId: string) => {
                const exists = get().favoriteIds.includes(productId)

                // Optimistic update in Zustand state
                set((state) => ({
                    favoriteIds: exists
                        ? state.favoriteIds.filter(id => id !== productId)
                        : [...state.favoriteIds, productId],
                }))

                // Sync to database in background
                const syncToDb = async () => {
                    try {
                        const supabase = createClient()
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) return

                        if (exists) {
                            // Remove from DB
                            await supabase
                                .from('user_favorites')
                                .delete()
                                .eq('profile_id', user.id)
                                .eq('product_id', productId)
                        } else {
                            // Add to DB
                            await supabase
                                .from('user_favorites')
                                .upsert({
                                    profile_id: user.id,
                                    product_id: productId,
                                }, { onConflict: 'profile_id,product_id' })
                        }
                    } catch {
                        // Silent fail — localStorage is the fallback
                    }
                }
                syncToDb()
            },

            isFavorite: (productId: string) => {
                return get().favoriteIds.includes(productId)
            },

            clear: () => {
                set({ favoriteIds: [] })

                // Clear from DB too
                const clearFromDb = async () => {
                    try {
                        const supabase = createClient()
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) return

                        await supabase
                            .from('user_favorites')
                            .delete()
                            .eq('profile_id', user.id)
                    } catch {
                        // Silent fail
                    }
                }
                clearFromDb()
            },

            // Sync favorites from DB → Zustand (call on app load)
            syncFromDb: async () => {
                if (get().synced) return

                try {
                    const supabase = createClient()
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user) return

                    const { data } = await supabase
                        .from('user_favorites')
                        .select('product_id')
                        .eq('profile_id', user.id)

                    if (data) {
                        const dbIds = data.map(f => f.product_id)
                        const localIds = get().favoriteIds

                        // Merge: DB is source of truth, but also push any local-only favorites to DB
                        const localOnlyIds = localIds.filter(id => !dbIds.includes(id))

                        if (localOnlyIds.length > 0) {
                            // Push local favorites that aren't in DB yet
                            const inserts = localOnlyIds.map(id => ({
                                profile_id: user.id,
                                product_id: id,
                            }))
                            await supabase
                                .from('user_favorites')
                                .upsert(inserts, { onConflict: 'profile_id,product_id' })
                        }

                        // Merge both sets
                        const mergedIds = [...new Set([...dbIds, ...localIds])]
                        set({ favoriteIds: mergedIds, synced: true })
                    }
                } catch {
                    // If DB sync fails, keep using localStorage
                    set({ synced: true })
                }
            },
        }),
        {
            name: 'cdjwe-favorites',
            partialize: (state) => ({ favoriteIds: state.favoriteIds }),
        }
    )
)
