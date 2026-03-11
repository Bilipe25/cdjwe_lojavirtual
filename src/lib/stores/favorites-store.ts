import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FavoritesState {
    favoriteIds: string[]
    toggle: (productId: string) => void
    isFavorite: (productId: string) => boolean
    clear: () => void
}

export const useFavoritesStore = create<FavoritesState>()(
    persist(
        (set, get) => ({
            favoriteIds: [],
            toggle: (productId: string) => {
                set((state) => {
                    const exists = state.favoriteIds.includes(productId)
                    return {
                        favoriteIds: exists
                            ? state.favoriteIds.filter(id => id !== productId)
                            : [...state.favoriteIds, productId],
                    }
                })
            },
            isFavorite: (productId: string) => {
                return get().favoriteIds.includes(productId)
            },
            clear: () => set({ favoriteIds: [] }),
        }),
        {
            name: 'cdjwe-favorites',
        }
    )
)
