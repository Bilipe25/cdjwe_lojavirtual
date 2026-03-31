import { createClient } from '@/lib/supabase/server'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import { resolveEffectivePriceTableIdForStore } from '@/lib/commercial/store-commercial'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type VariantPricingRelation<T> = T | T[] | null

type RawVariantPricingRow = {
    id: string
    is_active: boolean
    price_override: number | null
    product: VariantPricingRelation<{
        id: string
        base_price: number | null
        has_size_variants?: boolean | null
        size?: string | null
        is_active?: boolean | null
    }>
    fabric: VariantPricingRelation<{ price_modifier: number | null; is_active?: boolean | null }>
    color: VariantPricingRelation<{ is_active?: boolean | null }>
}

type VariantPricingRow = {
    id: string
    is_active: boolean
    price_override: number | null
    product: {
        id: string
        base_price: number | null
        has_size_variants?: boolean | null
        size?: string | null
        is_active?: boolean | null
    } | null
    fabric: { price_modifier: number | null; is_active?: boolean | null } | null
    color: { is_active?: boolean | null } | null
}

export type ProductSizeOptionRow = {
    id: string
    product_id: string
    name: string
    price_mode: 'absolute' | 'delta'
    price_value: number
    is_active: boolean
}

export type PricingLineInput = {
    cartKey?: string
    variantId: string
    sizeOptionId?: string | null
}

export type PriceSnapshot = {
    unitPrice: number
    productPrice: number
    variationPrice: number | null
    finalPrice: number
    sizePrice: number | null
    sizeOptionId: string | null
    sizeName: string | null
}

type PriceTableContext = {
    discountPercentage: number
    overrides: Record<string, number>
}

function unwrapRelation<T>(value: VariantPricingRelation<T>): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function normalizeVariantPricingRow(variant: RawVariantPricingRow): VariantPricingRow {
    return {
        id: variant.id,
        is_active: variant.is_active,
        price_override: variant.price_override,
        product: unwrapRelation(variant.product),
        fabric: unwrapRelation(variant.fabric),
        color: unwrapRelation(variant.color),
    }
}

export function buildPricingCartKey(variantId: string, sizeOptionId: string | null) {
    return `${variantId}::${sizeOptionId || 'legacy'}`
}

export async function resolvePriceTableIdForStore(
    supabase: SupabaseServerClient,
    storeId: string,
    preferredPriceTableId?: string | null
) {
    const resolved = await resolveEffectivePriceTableIdForStore(supabase, {
        storeId,
        preferredPriceTableId: preferredPriceTableId || null,
    })

    return resolved.priceTableId
}

export async function getPriceTableContextForStore(
    supabase: SupabaseServerClient,
    storeId: string,
    variantIds: string[],
    preferredPriceTableId?: string | null
): Promise<PriceTableContext> {
    const tableId = await resolvePriceTableIdForStore(supabase, storeId, preferredPriceTableId)
    if (!tableId) return { discountPercentage: 0, overrides: {} }

    const { data: priceTable } = await supabase
        .from('price_tables')
        .select('id, discount_percentage, valid_from, valid_until, is_active')
        .eq('id', tableId)
        .single()

    if (!priceTable || !priceTable.is_active) {
        return { discountPercentage: 0, overrides: {} }
    }

    const now = new Date()
    const validFrom = priceTable.valid_from ? new Date(priceTable.valid_from) : null
    const validUntil = priceTable.valid_until ? new Date(priceTable.valid_until) : null
    const isStarted = !validFrom || now >= validFrom
    const isExpired = validUntil && now > validUntil

    if (!isStarted || isExpired) {
        return { discountPercentage: 0, overrides: {} }
    }

    const overrides: Record<string, number> = {}
    if (variantIds.length > 0) {
        const { data: customItems } = await supabase
            .from('price_table_items')
            .select('product_variant_id, custom_price')
            .eq('price_table_id', priceTable.id)
            .in('product_variant_id', variantIds)

        customItems?.forEach((item) => {
            overrides[item.product_variant_id] = item.custom_price
        })
    }

    return {
        discountPercentage: priceTable.discount_percentage || 0,
        overrides,
    }
}

export async function fetchVariantPricingRows(
    supabase: SupabaseServerClient,
    variantIds: string[]
) {
    if (!variantIds.length) return { variants: [] as VariantPricingRow[], error: false }

    const primaryQuery = await supabase
        .from('product_variants')
        .select(`
            id,
            is_active,
            price_override,
            product:products(id, base_price, has_size_variants, size, is_active),
            fabric:fabrics(price_modifier, is_active),
            color:fabric_colors!product_variants_fabric_color_fk(is_active)
        `)
        .in('id', variantIds)

    let data = primaryQuery.data as unknown as RawVariantPricingRow[] | null
    let error: { message?: string } | null = primaryQuery.error

    if (
        error &&
        typeof error.message === 'string' &&
        error.message.toLowerCase().includes('has_size_variants')
    ) {
        const fallbackQuery = await supabase
            .from('product_variants')
            .select(`
                id,
                is_active,
                price_override,
                product:products(id, base_price, size, is_active),
                fabric:fabrics(price_modifier, is_active),
                color:fabric_colors!product_variants_fabric_color_fk(is_active)
            `)
            .in('id', variantIds)

        data = fallbackQuery.data as unknown as RawVariantPricingRow[] | null
        error = fallbackQuery.error
    }

    if (error || !data) return { variants: [] as VariantPricingRow[], error: true }

    return {
        variants: (data as RawVariantPricingRow[]).map(normalizeVariantPricingRow),
        error: false,
    }
}

export async function fetchSizeOptionsById(
    supabase: SupabaseServerClient,
    sizeOptionIds: string[]
) {
    if (!sizeOptionIds.length) return new Map<string, ProductSizeOptionRow>()

    const { data, error } = await supabase
        .from('product_size_options')
        .select('id, product_id, name, price_mode, price_value, is_active')
        .in('id', sizeOptionIds)

    if (error || !data) return new Map<string, ProductSizeOptionRow>()

    const output = new Map<string, ProductSizeOptionRow>()
    ;(data as ProductSizeOptionRow[]).forEach((sizeOption) => {
        output.set(sizeOption.id, sizeOption)
    })
    return output
}

export async function getVariantPricingSnapshotsForStore(
    supabase: SupabaseServerClient,
    storeId: string,
    input: PricingLineInput[],
    preferredPriceTableId?: string | null
) {
    const pricingLines = input.filter((line) => Boolean(line.variantId))
    if (!pricingLines.length) {
        return { prices: {}, missingKeys: [], missingVariantIds: [] }
    }

    const variantIds = Array.from(new Set(pricingLines.map((line) => line.variantId)))
    const sizeOptionIds = Array.from(
        new Set(
            pricingLines
                .map((line) => line.sizeOptionId)
                .filter((value): value is string => Boolean(value))
        )
    )

    const [priceTableContext, variantsResult, sizeOptionMap] = await Promise.all([
        getPriceTableContextForStore(supabase, storeId, variantIds, preferredPriceTableId),
        fetchVariantPricingRows(supabase, variantIds),
        fetchSizeOptionsById(supabase, sizeOptionIds),
    ])

    if (variantsResult.error) {
        return { error: 'Falha ao validar os precos do pedido.' as const }
    }

    const variantMap = new Map<string, VariantPricingRow>()
    variantsResult.variants.forEach((variant) => variantMap.set(variant.id, variant))

    const prices: Record<string, PriceSnapshot> = {}
    const missingVariantIds: string[] = []
    const missingKeys: string[] = []

    pricingLines.forEach((line) => {
        const cartKey = line.cartKey || buildPricingCartKey(line.variantId, line.sizeOptionId ?? null)
        const dbVariant = variantMap.get(line.variantId)
        const isEffectivelyActive = Boolean(
            dbVariant?.is_active &&
            dbVariant?.product?.is_active &&
            dbVariant?.fabric?.is_active &&
            dbVariant?.color?.is_active
        )

        if (!dbVariant || !isEffectivelyActive) {
            missingVariantIds.push(line.variantId)
            missingKeys.push(cartKey)
            return
        }

        const product = dbVariant.product
        if (!product) {
            missingVariantIds.push(line.variantId)
            missingKeys.push(cartKey)
            return
        }

        const productHasSizeVariants = Boolean(product.has_size_variants)
        const requestedSizeOptionId = line.sizeOptionId ?? null
        const sizeOption = requestedSizeOptionId ? sizeOptionMap.get(requestedSizeOptionId) || null : null

        if (requestedSizeOptionId) {
            if (!sizeOption || !sizeOption.is_active || sizeOption.product_id !== product.id) {
                missingKeys.push(cartKey)
                return
            }
        }

        if (productHasSizeVariants && !sizeOption) {
            missingKeys.push(cartKey)
            return
        }

        const pricing = resolveVariantPricing({
            basePrice: product.base_price ?? 0,
            fabricModifier: dbVariant.fabric?.price_modifier ?? 0,
            variantPriceOverride: dbVariant.price_override ?? null,
            variantId: dbVariant.id,
            sizePriceMode: sizeOption?.price_mode ?? null,
            sizePriceValue: sizeOption?.price_value ?? null,
            priceTable: priceTableContext,
        })

        prices[cartKey] = {
            unitPrice: pricing.unitPrice,
            productPrice: pricing.productPrice,
            variationPrice: pricing.variationPrice,
            finalPrice: pricing.finalPrice,
            sizePrice: pricing.sizePrice,
            sizeOptionId: sizeOption?.id ?? null,
            sizeName: sizeOption?.name ?? product.size ?? null,
        }
    })

    const foundVariantIds = new Set(variantsResult.variants.map((variant) => variant.id))
    variantIds.forEach((variantId) => {
        if (!foundVariantIds.has(variantId)) {
            missingVariantIds.push(variantId)
        }
    })

    return {
        prices,
        missingKeys: Array.from(new Set(missingKeys)),
        missingVariantIds: Array.from(new Set(missingVariantIds)),
    }
}
