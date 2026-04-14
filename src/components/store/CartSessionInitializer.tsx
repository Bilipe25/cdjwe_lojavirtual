'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { rehydrateCartStoreForScope, useCartStore } from '@/lib/stores/cart-store'

export function CartSessionInitializer() {
    const initialized = useRef(false)

    useEffect(() => {
        if (initialized.current) return
        initialized.current = true

        const supabase = createClient()
        let cancelled = false

        const syncCartScope = async (profileId: string | null) => {
            await rehydrateCartStoreForScope(profileId)
            if (profileId) {
                await useCartStore.getState().syncFromDb()
            }
        }

        const bootstrap = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (cancelled) return
            await syncCartScope(user?.id || null)
        }

        void bootstrap()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            void syncCartScope(session?.user?.id || null)
        })

        return () => {
            cancelled = true
            subscription.unsubscribe()
        }
    }, [])

    return null
}
