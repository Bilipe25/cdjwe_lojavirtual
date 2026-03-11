'use server'

import { createClient } from '@/lib/supabase/server'

export async function syncAllVariants() {
    try {
        const supabase = await createClient()

        // 1. Get all active items
        const { data: products } = await supabase.from('products').select('id, is_active')
        const { data: fabrics } = await supabase.from('fabrics').select('id, is_active')
        const { data: colors } = await supabase.from('fabric_colors').select('id, fabric_id, is_active')
        
        if (!products?.length || !fabrics?.length || !colors?.length) {
            return { success: false, message: 'Faltam dados base' }
        }

        // 2. Fetch existing variants
        const { data: existingVars } = await supabase.from('product_variants').select('product_id, fabric_id, fabric_color_id')
        const existingSet = new Set(existingVars?.map(v => `${v.product_id}-${v.fabric_id}-${v.fabric_color_id}`) || [])

        // 3. Build new variants
        const newVariants = []
        
        for (const p of products) {
            for (const c of colors) {
                const key = `${p.id}-${c.fabric_id}-${c.id}`
                if (!existingSet.has(key)) {
                    newVariants.push({
                        product_id: p.id,
                        fabric_id: c.fabric_id,
                        fabric_color_id: c.id,
                        stock_quantity: 999,
                        is_active: p.is_active && c.is_active
                    })
                }
            }
        }
        
        if (newVariants.length > 0) {
            const chunkSize = 500
            for (let i = 0; i < newVariants.length; i += chunkSize) {
                const chunk = newVariants.slice(i, i + chunkSize)
                const { error } = await supabase.from('product_variants').insert(chunk)
                if (error) console.error('Sync Variants Error chunk:', error)
            }
            return { success: true, count: newVariants.length }
        }
        
        return { success: true, count: 0 }
    } catch (e: any) {
        console.error('Fatal Sync Variants Error:', e)
        return { success: false, error: e.message }
    }
}
