'use server'

import { createClient } from '@/lib/supabase/server'
import type { Fabric, FabricColor } from '@/lib/types'

// ==================== TYPES ====================

export interface FabricConfigGroup {
    fabric: Fabric
    colors: (FabricColor & { variantId: string; isActive: boolean; price_override: number | null })[]
}

interface ProductRow {
    id: string
    is_active: boolean
}

interface ColorRow {
    id: string
    fabric_id: string
    is_active: boolean
}

interface FabricRow {
    id: string
    is_active: boolean
}

interface VariantRow {
    id: string
    fabric_id: string
    fabric_color_id: string
    is_active: boolean
    price_override: number | null
}

interface ExistingVariantKeyRow {
    product_id: string
    fabric_id: string
    fabric_color_id: string
}

interface ExistingProductVariantKeyRow {
    fabric_id: string
    fabric_color_id: string
}

interface VariantInsert {
    product_id: string
    fabric_id: string
    fabric_color_id: string
    stock_quantity: number
    is_active: boolean
}

interface VariantIdRow {
    id: string
}

const VARIANT_INSERT_CHUNK_SIZE = 500
const VARIANT_UPDATE_CHUNK_SIZE = 200

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return 'Erro inesperado'
}

function isMissingFabricAuditTableError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const code = 'code' in error ? String((error as { code?: unknown }).code || '') : ''
    const message = 'message' in error ? String((error as { message?: unknown }).message || '') : ''
    return code === '42P01' || message.toLowerCase().includes('admin_fabric_actions_audit')
}

async function appendVariantSyncAuditLog(params: {
    supabase: Awaited<ReturnType<typeof createClient>>
    action: 'variants_sync_all' | 'variants_sync_product'
    fabricId?: string | null
    details: Record<string, unknown>
}) {
    const {
        data: { user },
    } = await params.supabase.auth.getUser()

    const { error } = await params.supabase
        .from('admin_fabric_actions_audit')
        .insert({
            actor_profile_id: user?.id || null,
            action: params.action,
            fabric_id: params.fabricId || null,
            details: params.details,
        })

    if (!error) return
    if (isMissingFabricAuditTableError(error)) return
    console.warn('[VARIANTS_AUDIT] log skipped:', error)
}

async function insertVariantsInChunks(variants: VariantInsert[]) {
    const supabase = await createClient()

    for (let index = 0; index < variants.length; index += VARIANT_INSERT_CHUNK_SIZE) {
        const chunk = variants.slice(index, index + VARIANT_INSERT_CHUNK_SIZE)
        const { error } = await supabase.from('product_variants').insert(chunk)
        if (error) throw error
    }
}

// ==================== SYNC ALL VARIANTS ====================

export async function syncAllVariants() {
    try {
        const supabase = await createClient()

        // 1. Get base data
        const [
            { data: products, error: productsError },
            { data: colors, error: colorsError },
            { data: fabrics, error: fabricsError },
        ] = await Promise.all([
            supabase.from('products').select('id, is_active'),
            supabase.from('fabric_colors').select('id, fabric_id, is_active'),
            supabase.from('fabrics').select('id, is_active'),
        ])

        if (productsError) throw productsError
        if (colorsError) throw colorsError
        if (fabricsError) throw fabricsError

        if (!products?.length || !colors?.length || !fabrics?.length) {
            return { success: false, message: 'Faltam dados base' }
        }

        const fabricActiveMap = new Map(
            (fabrics as FabricRow[]).map((fabric) => [fabric.id, Boolean(fabric.is_active)])
        )

        // 2. Fetch existing variants
        const { data: existingVariants, error: existingError } = await supabase
            .from('product_variants')
            .select('product_id, fabric_id, fabric_color_id')

        if (existingError) throw existingError

        const existingSet = new Set(
            (existingVariants as ExistingVariantKeyRow[] | null)?.map(
                (variant) => `${variant.product_id}-${variant.fabric_id}-${variant.fabric_color_id}`
            ) || []
        )

        // 3. Build new variants
        const newVariants: VariantInsert[] = []

        for (const product of products as ProductRow[]) {
            for (const color of colors as ColorRow[]) {
                const key = `${product.id}-${color.fabric_id}-${color.id}`
                if (!existingSet.has(key)) {
                    newVariants.push({
                        product_id: product.id,
                        fabric_id: color.fabric_id,
                        fabric_color_id: color.id,
                        stock_quantity: 999,
                        is_active: product.is_active && color.is_active && Boolean(fabricActiveMap.get(color.fabric_id)),
                    })
                }
            }
        }

        if (newVariants.length > 0) {
            await insertVariantsInChunks(newVariants)
            await appendVariantSyncAuditLog({
                supabase,
                action: 'variants_sync_all',
                details: {
                    products: products.length,
                    colors: colors.length,
                    inserted: newVariants.length,
                },
            })
            return { success: true, count: newVariants.length }
        }

        await appendVariantSyncAuditLog({
            supabase,
            action: 'variants_sync_all',
            details: {
                products: products.length,
                colors: colors.length,
                inserted: 0,
            },
        })
        return { success: true, count: 0 }
    } catch (error: unknown) {
        console.error('Fatal syncAllVariants error:', error)
        return { success: false, error: getErrorMessage(error) }
    }
}

// ==================== SYNC VARIANTS FOR ONE PRODUCT ====================

export async function syncProductVariants(productId: string) {
    try {
        const supabase = await createClient()

        const [
            { data: product, error: productError },
            { data: colors, error: colorsError },
            { data: fabrics, error: fabricsError },
            { data: existingVariants, error: existingVariantsError },
        ] = await Promise.all([
            supabase.from('products').select('id, is_active').eq('id', productId).single(),
            supabase.from('fabric_colors').select('id, fabric_id, is_active'),
            supabase.from('fabrics').select('id, is_active'),
            supabase.from('product_variants').select('fabric_id, fabric_color_id').eq('product_id', productId),
        ])

        if (productError) throw productError
        if (colorsError) throw colorsError
        if (fabricsError) throw fabricsError
        if (existingVariantsError) throw existingVariantsError

        if (!product || !colors?.length || !fabrics?.length) {
            return { success: false, message: 'Faltam dados base' }
        }

        const fabricActiveMap = new Map(
            (fabrics as FabricRow[]).map((fabric) => [fabric.id, Boolean(fabric.is_active)])
        )

        const existingSet = new Set(
            (existingVariants as ExistingProductVariantKeyRow[] | null)?.map(
                (variant) => `${variant.fabric_id}-${variant.fabric_color_id}`
            ) || []
        )
        const newVariants: VariantInsert[] = []

        for (const color of colors as ColorRow[]) {
            const key = `${color.fabric_id}-${color.id}`
            if (!existingSet.has(key)) {
                newVariants.push({
                    product_id: productId,
                    fabric_id: color.fabric_id,
                    fabric_color_id: color.id,
                    stock_quantity: 999,
                    is_active: product.is_active && color.is_active && Boolean(fabricActiveMap.get(color.fabric_id)),
                })
            }
        }

        if (newVariants.length > 0) {
            await insertVariantsInChunks(newVariants)
            await appendVariantSyncAuditLog({
                supabase,
                action: 'variants_sync_product',
                details: {
                    productId,
                    colors: colors.length,
                    inserted: newVariants.length,
                },
            })
            return { success: true, count: newVariants.length }
        }

        await appendVariantSyncAuditLog({
            supabase,
            action: 'variants_sync_product',
            details: {
                productId,
                colors: colors.length,
                inserted: 0,
            },
        })
        return { success: true, count: 0 }
    } catch (error: unknown) {
        console.error('Fatal syncProductVariants error:', error)
        return { success: false, error: getErrorMessage(error) }
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
        if (syncResult.success === false && syncResult.error) {
            return { data: null, error: syncResult.error }
        }

        const { data: variantsData, error: variantsError } = await supabase
            .from('product_variants')
            .select('id, is_active, price_override, fabric_id, fabric_color_id')
            .eq('product_id', productId)
            .order('fabric_id')

        if (variantsError) throw variantsError
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

        if (fabricsRes.error) throw fabricsRes.error
        if (colorsRes.error) throw colorsRes.error
        if (fabricsCount.error) throw fabricsCount.error
        if (colorsCount.error) throw colorsCount.error
        if (variantsAllCount.error) throw variantsAllCount.error
        if (variantsProductCount.error) throw variantsProductCount.error

        const fabricById = new Map<string, Fabric>()
        ;(fabricsRes.data ?? []).forEach((fabric) => fabricById.set(fabric.id, fabric as Fabric))

        const colorById = new Map<string, FabricColor>()
        ;(colorsRes.data ?? []).forEach((color) => colorById.set(color.id, color as FabricColor))

        // Group by fabric
        const fabricMap = new Map<string, FabricConfigGroup>()
        for (const variant of variantsData as VariantRow[]) {
            const fabric = fabricById.get(variant.fabric_id)
            const color = colorById.get(variant.fabric_color_id)
            if (!fabric || !color) continue

            if (!fabricMap.has(fabric.id)) {
                fabricMap.set(fabric.id, { fabric, colors: [] })
            }

            const group = fabricMap.get(fabric.id)
            if (!group) continue

            group.colors.push({
                ...color,
                variantId: variant.id,
                isActive: variant.is_active,
                price_override: variant.price_override ?? null,
            })
        }

        // Sort fabrics by sort_order, colors by sort_order
        const groups = Array.from(fabricMap.values())
        groups.sort((a, b) => (a.fabric.sort_order ?? 0) - (b.fabric.sort_order ?? 0))
        groups.forEach((group) => group.colors.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))

        return {
            data: groups,
            error: null,
            meta: {
                fabrics: fabricsCount.count || 0,
                colors: colorsCount.count || 0,
                variantsAll: variantsAllCount.count || 0,
                variantsForProduct: variantsProductCount.count || 0,
            },
        }
    } catch (error: unknown) {
        console.error('getProductVariantConfig error:', error)
        return { data: null, error: getErrorMessage(error) }
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

        const allowedIds = new Set((allVariants as VariantIdRow[] | null)?.map((variant) => variant.id) ?? [])
        const updates = Object.entries(priceOverrides)
            .filter(([id]) => id && allowedIds.has(id))
            .map(([id, price]) => ({ id, price }))

        if (updates.length === 0) return { success: true }

        for (let index = 0; index < updates.length; index += VARIANT_UPDATE_CHUNK_SIZE) {
            const chunk = updates.slice(index, index + VARIANT_UPDATE_CHUNK_SIZE)
            await Promise.all(
                chunk.map(async ({ id, price }) => {
                    if (price !== null) {
                        if (!Number.isFinite(price) || price < 0) {
                            throw new Error('Preco invalido para a variacao.')
                        }
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
    } catch (error: unknown) {
        console.error('saveProductVariantPrices error:', error)
        return { success: false, error: getErrorMessage(error) }
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

        const allIds = (allVariants as VariantIdRow[] | null)?.map((variant) => variant.id) ?? []
        const activeSet = new Set(activeVariantIds)

        const toActivate = allIds.filter((id) => activeSet.has(id))
        const toDeactivate = allIds.filter((id) => !activeSet.has(id))

        // 2. Batch update - activate
        if (toActivate.length > 0) {
            const { error } = await supabase
                .from('product_variants')
                .update({ is_active: true })
                .in('id', toActivate)

            if (error) throw error
        }

        // 3. Batch update - deactivate
        if (toDeactivate.length > 0) {
            const { error } = await supabase
                .from('product_variants')
                .update({ is_active: false })
                .in('id', toDeactivate)

            if (error) throw error
        }

        return { success: true }
    } catch (error: unknown) {
        console.error('saveProductVariantConfig error:', error)
        return { success: false, error: getErrorMessage(error) }
    }
}
