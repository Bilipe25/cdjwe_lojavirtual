'use server'

import { createClient } from '@/lib/supabase/server'
import type { Fabric, FabricColor } from '@/lib/types'

// ==================== TYPES ====================

export interface FabricConfigGroup {
    fabric: Fabric
    colors: (FabricColor & { variantId: string; isActive: boolean })[]
}

// ==================== SYNC ALL VARIANTS ====================

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

// ==================== GET PRODUCT VARIANT CONFIG ====================

/**
 * Returns all fabric/color groups for a product, with variant ID and isActive status.
 * Used by the admin ProductFabricConfig component.
 */
export async function getProductVariantConfig(productId: string): Promise<{
    data: FabricConfigGroup[] | null
    error: string | null
}> {
    try {
        const supabase = await createClient()

        const { data: variantsData, error } = await supabase
            .from('product_variants')
            .select('id, is_active, fabric_id, fabric_color_id, fabric:fabrics(*), color:fabric_colors(*)')
            .eq('product_id', productId)
            .order('fabric_id')

        if (error) throw error
        if (!variantsData) return { data: [], error: null }

        // Group by fabric
        const fabricMap = new Map<string, FabricConfigGroup>()
        for (const v of variantsData as any[]) {
            if (!v.fabric || !v.color) continue
            if (!fabricMap.has(v.fabric.id)) {
                fabricMap.set(v.fabric.id, { fabric: v.fabric, colors: [] })
            }
            const group = fabricMap.get(v.fabric.id)!
            group.colors.push({
                ...v.color,
                variantId: v.id,
                isActive: v.is_active,
            })
        }

        // Sort fabrics by sort_order, colors by sort_order
        const groups = Array.from(fabricMap.values())
        groups.sort((a, b) => (a.fabric.sort_order ?? 0) - (b.fabric.sort_order ?? 0))
        groups.forEach(g => g.colors.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))

        return { data: groups, error: null }
    } catch (e: any) {
        console.error('getProductVariantConfig error:', e)
        return { data: null, error: e.message }
    }
}

// ==================== SAVE PRODUCT VARIANT CONFIG ====================

/**
 * Given a product and a set of variant IDs that should be ACTIVE,
 * sets all other variants of that product to inactive.
 */
export async function saveProductVariantConfig(
    productId: string,
    activeVariantIds: string[]
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient()

        // 1. Get all variant IDs for this product
        const { data: allVariants, error: fetchError } = await supabase
            .from('product_variants')
            .select('id')
            .eq('product_id', productId)

        if (fetchError) throw fetchError

        const allIds = allVariants?.map(v => v.id) ?? []
        const activeSet = new Set(activeVariantIds)
        
        const toActivate = allIds.filter(id => activeSet.has(id))
        const toDeactivate = allIds.filter(id => !activeSet.has(id))

        // 2. Batch update — activate
        if (toActivate.length > 0) {
            const { error } = await supabase
                .from('product_variants')
                .update({ is_active: true })
                .in('id', toActivate)
            if (error) throw error
        }

        // 3. Batch update — deactivate
        if (toDeactivate.length > 0) {
            const { error } = await supabase
                .from('product_variants')
                .update({ is_active: false })
                .in('id', toDeactivate)
            if (error) throw error
        }

        return { success: true }
    } catch (e: any) {
        console.error('saveProductVariantConfig error:', e)
        return { success: false, error: e.message }
    }
}
