'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePriceTableStore } from '@/lib/stores/price-table-store'

export function PriceTableInitializer() {
    const { setTableData, clearTableData } = usePriceTableStore()
    const initialized = useRef(false)

    useEffect(() => {
        if (initialized.current) return
        initialized.current = true

        const initializeTable = async () => {
            const supabase = createClient()
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) {
                    clearTableData()
                    return
                }

                // Get Store
                const { data: store } = await supabase
                    .from('stores')
                    .select('id')
                    .eq('profile_id', user.id)
                    .single()

                if (!store) {
                    clearTableData()
                    return
                }

                // Get Active Price Table mapping
                const { data: pivot } = await supabase
                    .from('store_price_tables')
                    .select('price_table_id')
                    .eq('store_id', store.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()

                let tableId = pivot?.price_table_id

                if (!tableId) {
                    // Fallback to default
                    const { data: defaultTable } = await supabase
                        .from('price_tables')
                        .select('id')
                        .eq('is_default', true)
                        .single()
                    
                    tableId = defaultTable?.id
                }

                if (!tableId) {
                    clearTableData()
                    return
                }

                // Get Table details
                const { data: priceTable } = await supabase
                    .from('price_tables')
                    .select('id, discount_percentage, valid_from, valid_until, is_active')
                    .eq('id', tableId)
                    .single()

                if (!priceTable || !priceTable.is_active) {
                    clearTableData()
                    return
                }

                const now = new Date()
                const validFrom = priceTable.valid_from ? new Date(priceTable.valid_from) : null
                const validUntil = priceTable.valid_until ? new Date(priceTable.valid_until) : null

                const isStarted = !validFrom || now >= validFrom
                const isExpired = validUntil && now > validUntil

                if (!isStarted || isExpired) {
                    clearTableData()
                    return
                }

                // Get Custom Price Overrides
                const { data: items } = await supabase
                    .from('price_table_items')
                    .select('product_variant_id, custom_price')
                    .eq('price_table_id', tableId)

                const overridesMap: Record<string, number> = {}
                items?.forEach(item => {
                    overridesMap[item.product_variant_id] = item.custom_price
                })

                setTableData(priceTable.id, priceTable.discount_percentage, overridesMap)

            } catch (error) {
                console.error('[PriceTableInitializer] Error:', error)
                // Don't clear on network error to keep cached state if possible, or clear depending on strictness
            }
        }

        initializeTable()
    }, [setTableData, clearTableData])

    return null
}
