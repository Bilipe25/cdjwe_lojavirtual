'use server'

import { createClient } from '@/lib/supabase/server'
import type { Fabric, FabricColor } from '@/lib/types'

// ==================== TYPES ====================

export interface FabricConfigGroup {
    fabric: Fabric
    colors: (FabricColor & { variantId: string; isActive: boolean; price_override: number | null })[]
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

// ==================== SYNC VARIANTS FOR ONE PRODUCT ====================

export async function syncProductVariants(productId: string) {
    try {
        const supabase = await createClient()

        const [{ data: product }, { data: colors }, { data: existingVars }] = await Promise.all([
            supabase.from('products').select('id, is_active').eq('id', productId).single(),
            supabase.from('fabric_colors').select('id, fabric_id, is_active'),
            supabase.from('product_variants').select('fabric_id, fabric_color_id').eq('product_id', productId),
        ])

        if (!product || !colors?.length) {
            return { success: false, message: 'Faltam dados base' }
        }

        const existingSet = new Set(existingVars?.map(v => `${v.fabric_id}-${v.fabric_color_id}`) || [])
        const newVariants = []

        for (const c of colors) {
            const key = `${c.fabric_id}-${c.id}`
            if (!existingSet.has(key)) {
                newVariants.push({
                    product_id: productId,
                    fabric_id: c.fabric_id,
                    fabric_color_id: c.id,
                    stock_quantity: 999,
                    is_active: product.is_active && c.is_active
                })
            }
        }

        if (newVariants.length > 0) {
            const chunkSize = 500
            for (let i = 0; i < newVariants.length; i += chunkSize) {
                const chunk = newVariants.slice(i, i + chunkSize)
                const { error } = await supabase.from('product_variants').insert(chunk)
                if (error) console.error('Sync Product Variants Error chunk:', error)
            }
            return { success: true, count: newVariants.length }
        }

        return { success: true, count: 0 }
    } catch (e: any) {
        console.error('Fatal Sync Product Variants Error:', e)
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
    meta?: { fabrics: number; colors: number; variantsAll: number; variantsForProduct: number }
}> {
    try {
        const supabase = await createClient()
        const syncResult = await syncProductVariants(productId)
        if (syncResult && syncResult.success === false && syncResult.error) {
            return { data: null, error: syncResult.error }
        }

        const { data: variantsData, error } = await supabase
            .from('product_variants')
            .select('id, is_active, price_override, fabric_id, fabric_color_id')
            .eq('product_id', productId)
            .order('fabric_id')

        if (error) throw error
        if (!variantsData) return { data: [], error: null }

        const [
            fabricsRes,
            colorsRes,
            fabricsCount,
            colorsCount,
            variantsAllCount,
            variantsProductCount,
        ] = await Promise.all([
            supabase.from('fabrics').select('*'),
            supabase.from('fabric_colors').select('*'),
            supabase.from('fabrics').select('id', { count: 'exact', head: true }),
            supabase.from('fabric_colors').select('id', { count: 'exact', head: true }),
            supabase.from('product_variants').select('id', { count: 'exact', head: true }),
            supabase.from('product_variants').select('id', { count: 'exact', head: true }).eq('product_id', productId),
        ])

        const fabricById = new Map<string, Fabric>()
        fabricsRes.data?.forEach(f => fabricById.set(f.id, f as Fabric))

        const colorById = new Map<string, FabricColor>()
        colorsRes.data?.forEach(c => colorById.set(c.id, c as FabricColor))

        // Group by fabric
        const fabricMap = new Map<string, FabricConfigGroup>()
        for (const v of variantsData as any[]) {
            const fabric = fabricById.get(v.fabric_id)
            const color = colorById.get(v.fabric_color_id)
            if (!fabric || !color) continue
            if (!fabricMap.has(fabric.id)) {
                fabricMap.set(fabric.id, { fabric, colors: [] })
            }
            const group = fabricMap.get(fabric.id)!
            group.colors.push({
                ...color,
                variantId: v.id,
                isActive: v.is_active,
                price_override: v.price_override ?? null,
            })
        }

        // Sort fabrics by sort_order, colors by sort_order
        const groups = Array.from(fabricMap.values())
        groups.sort((a, b) => (a.fabric.sort_order ?? 0) - (b.fabric.sort_order ?? 0))
        groups.forEach(g => g.colors.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))

        return {
            data: groups,
            error: null,
            meta: {
                fabrics: fabricsCount.count || 0,
                colors: colorsCount.count || 0,
                variantsAll: variantsAllCount.count || 0,
                variantsForProduct: variantsProductCount.count || 0,
            }
        }
    } catch (e: any) {
        console.error('getProductVariantConfig error:', e)
        return { data: null, error: e.message }
    }
}

// ==================== SAVE PRODUCT VARIANT PRICES ====================

/**
 * Updates price_override for variants that belong to the given product.
 * Only Admin users (RLS) should be able to run this action.
 */
export async function saveProductVariantPrices(
    productId: string,
    priceOverrides: Record<string, number | null>
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient()

        const { data: allVariants, error: fetchError } = await supabase
            .from('product_variants')
            .select('id')
            .eq('product_id', productId)

        if (fetchError) throw fetchError

        const allowedIds = new Set(allVariants?.map(v => v.id) ?? [])
        const updates = Object.entries(priceOverrides)
            .filter(([id]) => id && allowedIds.has(id))
            .map(([id, price]) => ({ id, price }))

        if (updates.length === 0) return { success: true }

        const chunkSize = 200
        for (let i = 0; i < updates.length; i += chunkSize) {
            const chunk = updates.slice(i, i + chunkSize)
            await Promise.all(
                chunk.map(async ({ id, price }) => {
                    if (price !== null && price < 0) {
                        throw new Error('PreÃ§o invÃ¡lido para a variaÃ§Ã£o.')
                    }
                    const { error } = await supabase
                        .from('product_variants')
                        .update({ price_override: price })
                        .eq('id', id)
                    if (error) throw error
                })
            )
        }

        return { success: true }
    } catch (e: any) {
        console.error('saveProductVariantPrices error:', e)
        return { success: false, error: e.message }
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
