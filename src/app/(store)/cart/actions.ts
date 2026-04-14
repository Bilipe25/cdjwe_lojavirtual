'use server'

import { createClient } from '@/lib/supabase/server'
import type { CartItem } from '@/lib/types'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import {
    applyCommercialPaymentAvailability,
    getStoreCommercialSettings,
    resolveEffectivePriceTableIdForStore,
    validateCheckoutSelectionAgainstCommercialSettings,
    validateStoreCreditLimitForOrder,
} from '@/lib/commercial/store-commercial'
import type { StoreCommercialSettings } from '@/lib/commercial/types'
import {
    getAvailableCheckoutPayments,
    resolveCheckoutPaymentSelection,
} from '@/lib/payments/checkout-payment'
import {
    buildOrderCreatedAuditNote,
    buildOrderEmailItems,
    buildOrderSnapshotSummary,
} from '@/lib/orders/order-communication'
import { isCheckoutV2Enabled } from '@/lib/flags/checkout'

type PriceTableContext = {
    discountPercentage: number
    overrides: Record<string, number>
}

type CheckoutSessionContext = {
    userId: string
    userEmail: string | null
    storeId: string
    commercialSettings: StoreCommercialSettings | null
    resolvedPriceTableId: string | null
}

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

type ProductSizeOptionRow = {
    id: string
    product_id: string
    name: string
    price_mode: 'absolute' | 'delta'
    price_value: number
    is_active: boolean
}

type PricingLineInput = {
    cartKey?: string
    variantId: string
    sizeOptionId?: string | null
}

type PriceSnapshot = {
    unitPrice: number
    productPrice: number
    variationPrice: number | null
    finalPrice: number
    sizePrice: number | null
    sizeOptionId: string | null
    sizeName: string | null
}

type CreateOrderAtomicResult = {
    order_id: string
    order_number: string
}

type CouponPreviewRow = {
    coupon_id: string
    coupon_code: string
    coupon_name: string | null
    discount_type: 'percentage' | 'fixed'
    discount_value: number
    max_discount_amount: number | null
    is_cumulative: boolean
    subtotal: number
    eligible_subtotal: number
    discount_amount: number
    payment_discount_blocked: boolean
}

export type CheckoutCouponPreview = {
    couponId: string
    couponCode: string
    couponName: string
    discountType: 'percentage' | 'fixed'
    discountValue: number
    maxDiscountAmount: number | null
    isCumulative: boolean
    subtotal: number
    eligibleSubtotal: number
    discountAmount: number
    paymentDiscountBlocked: boolean
}

export type CheckoutBootstrapPayload = {
    reconciledItems: CartItem[]
    missingKeys: string[]
    missingVariantIds: string[]
    priceChanged: boolean
    addresses: Awaited<ReturnType<typeof getAvailableStoreAddressesForStore>>
    defaultAddressId: string
    paymentCatalogMethods: Awaited<ReturnType<typeof getAvailableCheckoutPayments>>['methodGroups']
    paymentCatalogConditions: Awaited<ReturnType<typeof getAvailableCheckoutPayments>>['globalConditions']
    paymentCatalogRules: Awaited<ReturnType<typeof getAvailableCheckoutPayments>>['priceTableRules']
    financialProfile: StoreCommercialSettings['financial_profile'] | 'no_restriction'
    checkoutBlocked: boolean
    paymentRestrictionMessage: string | null
}

type RpcErrorLike = {
    message?: string
    details?: string
    hint?: string
    code?: string
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

function buildCartKey(variantId: string, sizeOptionId: string | null) {
    return `${variantId}::${sizeOptionId || 'legacy'}`
}

function normalizeCouponCodeInput(value: string | null | undefined) {
    return (value || '').trim().toUpperCase()
}

function getRpcErrorMessage(error: RpcErrorLike | null) {
    const parts = [error?.message, error?.details, error?.hint]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    return parts.join(' | ')
}

function isMissingExtendedAtomicSignature(errorMessage: string) {
    const normalized = errorMessage.toLowerCase()
    return (
        normalized.includes('function public.client_create_order_atomic') &&
        normalized.includes('does not exist')
    )
}

function isMissingV2AtomicFunction(errorMessage: string) {
    const normalized = errorMessage.toLowerCase()
    return (
        normalized.includes('function public.client_create_order_atomic_v2') &&
        normalized.includes('does not exist')
    )
}

function isDuplicateOrderNumber(errorMessage: string) {
    const normalized = errorMessage.toLowerCase()
    return (
        normalized.includes('orders_order_number_key') ||
        normalized.includes('duplicate key value violates unique constraint')
    )
}

function mapAtomicOrderErrorToUserMessage(errorMessage: string) {
    const normalized = errorMessage.toLowerCase()
    if (!normalized) return 'Erro ao criar pedido de forma atomica.'
    if (normalized.includes('nao autenticado')) return 'Sua sessao expirou. Entre novamente para finalizar.'
    if (normalized.includes('loja nao encontrada')) return 'Sua loja nao foi localizada. Atualize a pagina e tente novamente.'
    if (normalized.includes('loja nao pertence ao perfil')) return 'Nao foi possivel validar sua loja. Atualize a pagina e tente novamente.'
    if (normalized.includes('itens do pedido sao obrigatorios')) return 'Seu carrinho ficou vazio durante a validacao. Revise e tente novamente.'
    if (normalized.includes('vendas restritas')) return 'Este cliente esta com vendas restritas para novos pedidos.'
    if (normalized.includes('somente a vista')) return 'Este cliente pode comprar somente a vista (1 parcela).'
    if (normalized.includes('limite de credito excedido')) return 'Limite de credito excedido para este cliente.'
    if (normalized.includes('politica comercial do cliente')) return 'Pagamento invalido para a politica comercial deste cliente.'
    if (normalized.includes('cupom')) return errorMessage
    if (isDuplicateOrderNumber(errorMessage)) return 'Conflito temporario na numeracao do pedido. Tente novamente em instantes.'
    if (isMissingV2AtomicFunction(errorMessage)) {
        return 'Checkout V2 indisponivel no banco. Aplique as migrations mais recentes (incluindo 055) ou desative CHECKOUT_V2_ENABLED.'
    }
    if (isMissingExtendedAtomicSignature(errorMessage)) {
        return 'Banco desatualizado para o checkout atomico. Aplique as migrations pendentes de pedidos e pagamentos (013, 023, 025, 027 e 028).'
    }
    return `Erro ao criar pedido de forma atomica: ${errorMessage}`
}

function mapCouponPreviewErrorToUserMessage(errorMessage: string) {
    const normalized = errorMessage.toLowerCase()
    if (!normalized) return 'Nao foi possivel validar o cupom informado.'
    if (normalized.includes('nao autenticado')) return 'Sua sessao expirou. Entre novamente para continuar.'
    if (normalized.includes('loja nao encontrada')) return 'Nao foi possivel localizar sua loja para validar o cupom.'
    if (normalized.includes('loja nao pertence ao perfil')) return 'Nao foi possivel validar a loja do seu perfil.'
    if (normalized.includes('itens do pedido sao obrigatorios')) return 'Adicione itens no carrinho para aplicar cupom.'
    if (normalized.includes('codigo de cupom obrigatorio')) return 'Informe um codigo de cupom.'
    if (
        normalized.includes('record "v_size_option" is not assigned yet') ||
        normalized.includes('tuple structure of a not-yet-assigned record is indeterminate')
    ) {
        return 'Validacao de cupom indisponivel por atualizacao pendente no checkout. Aplique a migration 062 de correcao e tente novamente.'
    }
    if (normalized.includes('invalid input syntax for type numeric') && normalized.includes('"t"')) {
        return 'Validacao de cupom indisponivel por correcao pendente no checkout. Aplique a migration 063 e tente novamente.'
    }
    if (normalized.includes('function public.client_preview_coupon_for_order') && normalized.includes('does not exist')) {
        return 'Validacao de cupom indisponivel no banco. Aplique a migration 061 do modulo de cupons.'
    }
    if (normalized.includes('function public.checkout_resolve_item_snapshot_v2') && normalized.includes('does not exist')) {
        return 'Validacao de cupom indisponivel no banco. Aplique as migrations de checkout v2 (055) e cupons (061).'
    }
    if (normalized.includes('cupom')) return errorMessage
    return `Falha ao validar cupom: ${errorMessage}`
}

function normalizePricingLines(input: Array<PricingLineInput> | string[]): PricingLineInput[] {
    if (!input.length) return []

    if (typeof input[0] === 'string') {
        return (input as string[]).map((variantId) => ({
            variantId,
            sizeOptionId: null,
            cartKey: buildCartKey(variantId, null),
        }))
    }

    return (input as Array<PricingLineInput>)
        .filter((line) => Boolean(line.variantId))
        .map((line) => {
            const sizeOptionId = line.sizeOptionId ?? null
            return {
                variantId: line.variantId,
                sizeOptionId,
                cartKey: line.cartKey || buildCartKey(line.variantId, sizeOptionId),
            }
        })
}

async function resolveActivePriceTableId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    storeId: string
) {
    const resolved = await resolveEffectivePriceTableIdForStore(supabase, { storeId })
    return resolved.priceTableId
}

async function getPriceTableContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    tableId: string | null,
    variantIds: string[]
): Promise<PriceTableContext> {
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

async function getActivePriceTableContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    storeId: string,
    variantIds: string[],
    resolvedPriceTableId?: string | null
): Promise<PriceTableContext> {
    const tableId =
        resolvedPriceTableId === undefined
            ? await resolveActivePriceTableId(supabase, storeId)
            : resolvedPriceTableId
    return getPriceTableContext(supabase, tableId, variantIds)
}

async function fetchVariantPricingRows(
    supabase: Awaited<ReturnType<typeof createClient>>,
    variantIds: string[]
) {
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

    // Backward compatibility for environments where has_size_variants is not migrated yet.
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

    const normalized = (data as RawVariantPricingRow[]).map(normalizeVariantPricingRow)
    return { variants: normalized, error: false }
}

async function fetchSizeOptionsById(
    supabase: Awaited<ReturnType<typeof createClient>>,
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

async function resolveCheckoutSessionContext(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<CheckoutSessionContext | { error: string }> {
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuario nao autenticado.' }

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
    if (!store) {
        return { error: 'Loja do usuario nao localizada.' }
    }

    const commercialSettings = await getStoreCommercialSettings(supabase, store.id)
    const resolvedPriceTable = await resolveEffectivePriceTableIdForStore(supabase, {
        storeId: store.id,
        settings: commercialSettings,
    })

    return {
        userId: user.id,
        userEmail: user.email ?? null,
        storeId: store.id,
        commercialSettings,
        resolvedPriceTableId: resolvedPriceTable.priceTableId,
    }
}

async function getAvailableStoreAddressesForStore(
    supabase: Awaited<ReturnType<typeof createClient>>,
    storeId: string
) {
    const { data: addresses } = await supabase
        .from('store_addresses')
        .select('*')
        .eq('store_id', storeId)
        .order('is_main', { ascending: false })
        .order('created_at', { ascending: true })

    return addresses || []
}

async function getAvailablePaymentRulesForContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    params: {
        cartTotal: number
        commercialSettings: StoreCommercialSettings | null
        resolvedPriceTableId: string | null
        applyCartTotalFilter?: boolean
    }
) {
    const availability = await getAvailableCheckoutPayments(supabase, {
        cartTotal: params.cartTotal,
        priceTableId: params.resolvedPriceTableId,
        applyCartTotalFilter: params.applyCartTotalFilter,
    })
    const filteredAvailability = applyCommercialPaymentAvailability(
        availability,
        params.commercialSettings
    )

    return {
        priceTableRules: filteredAvailability.priceTableRules,
        globalConditions: filteredAvailability.globalConditions,
        paymentMethods: filteredAvailability.methodGroups,
        financialProfile: params.commercialSettings?.financial_profile || 'no_restriction',
        checkoutBlocked: filteredAvailability.blocked,
        paymentRestrictionMessage: filteredAvailability.reason,
    }
}

async function getCurrentVariantPricingForContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    params: {
        storeId: string
        resolvedPriceTableId: string | null
        input: Array<PricingLineInput> | string[]
    }
) {
    const pricingLines = normalizePricingLines(params.input)
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
        getActivePriceTableContext(
            supabase,
            params.storeId,
            variantIds,
            params.resolvedPriceTableId
        ),
        fetchVariantPricingRows(supabase, variantIds),
        fetchSizeOptionsById(supabase, sizeOptionIds),
    ])

    if (variantsResult.error) {
        return { error: 'Falha ao validar os precos do carrinho.' as const }
    }

    const variantMap = new Map<string, VariantPricingRow>()
    variantsResult.variants.forEach((variant) => variantMap.set(variant.id, variant))

    const prices: Record<string, PriceSnapshot> = {}
    const missingVariantIds: string[] = []
    const missingKeys: string[] = []

    pricingLines.forEach((line) => {
        const cartKey = line.cartKey || buildCartKey(line.variantId, line.sizeOptionId ?? null)
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
        const sizeOption = requestedSizeOptionId
            ? sizeOptionMap.get(requestedSizeOptionId) || null
            : null

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

        const snapshot: PriceSnapshot = {
            unitPrice: pricing.unitPrice,
            productPrice: pricing.productPrice,
            variationPrice: pricing.variationPrice,
            finalPrice: pricing.finalPrice,
            sizePrice: pricing.sizePrice,
            sizeOptionId: sizeOption?.id ?? null,
            sizeName: sizeOption?.name ?? product.size ?? null,
        }

        prices[cartKey] = snapshot

        if (!requestedSizeOptionId && !prices[line.variantId]) {
            prices[line.variantId] = snapshot
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

export async function getAvailablePaymentRules(cartTotal: number) {
    const supabase = await createClient()
    const context = await resolveCheckoutSessionContext(supabase)
    if ('error' in context) {
        return {
            priceTableRules: [],
            globalConditions: [],
            paymentMethods: [],
            financialProfile: 'no_restriction',
            checkoutBlocked: false,
            paymentRestrictionMessage: null as string | null,
        }
    }

    return getAvailablePaymentRulesForContext(supabase, {
        cartTotal,
        commercialSettings: context.commercialSettings,
        resolvedPriceTableId: context.resolvedPriceTableId,
    })
}

export async function getAvailableStoreAddresses() {
    const supabase = await createClient()
    const context = await resolveCheckoutSessionContext(supabase)
    if ('error' in context) return []

    return getAvailableStoreAddressesForStore(supabase, context.storeId)
}

export async function createStoreAddress(data: {
    title: string
    zip_code: string
    address: string
    number?: string
    complement?: string
    neighborhood?: string
    city: string
    state: string
    is_main?: boolean
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuario nao autenticado.' }

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
    if (!store) return { error: 'Loja do usuario nao localizada.' }

    const { data: newAddress, error } = await supabase
        .from('store_addresses')
        .insert({
            ...data,
            store_id: store.id,
        })
        .select('*')
        .single()

    if (error) {
        console.error('[CART_ACTIONS] Create address error:', error)
        return { error: 'Erro ao criar endereco.' }
    }

    return { success: true, address: newAddress }
}

export async function getCurrentVariantPricing(input: Array<PricingLineInput> | string[]) {
    const supabase = await createClient()
    const context = await resolveCheckoutSessionContext(supabase)
    if ('error' in context) return { error: context.error }

    return getCurrentVariantPricingForContext(supabase, {
        storeId: context.storeId,
        resolvedPriceTableId: context.resolvedPriceTableId,
        input,
    })
}

export async function getCheckoutBootstrap(items: CartItem[]) {
    const supabase = await createClient()
    const context = await resolveCheckoutSessionContext(supabase)
    if ('error' in context) return { error: context.error }

    const pricingResult = await getCurrentVariantPricingForContext(supabase, {
        storeId: context.storeId,
        resolvedPriceTableId: context.resolvedPriceTableId,
        input: items.map((item) => ({
            cartKey: item.cartKey || buildCartKey(item.variantId, item.sizeOptionId ?? null),
            variantId: item.variantId,
            sizeOptionId: item.sizeOptionId ?? null,
        })),
    })

    if ('error' in pricingResult) {
        return { error: pricingResult.error }
    }

    const updatedAt = new Date().toISOString()
    let priceChanged = false
    const missingKeys = pricingResult.missingKeys || []
    const reconciledItems = items
        .filter((item) => !missingKeys.includes(item.cartKey || buildCartKey(item.variantId, item.sizeOptionId ?? null)))
        .map((item) => {
            const currentKey = item.cartKey || buildCartKey(item.variantId, item.sizeOptionId ?? null)
            const priceInfo = pricingResult.prices?.[currentKey]
            if (!priceInfo) return item

            const nextCartKey = buildCartKey(item.variantId, priceInfo.sizeOptionId ?? null)
            const hasChanged =
                priceInfo.unitPrice !== item.unitPrice ||
                (priceInfo.sizeOptionId ?? null) !== (item.sizeOptionId ?? null) ||
                (priceInfo.sizeName || item.size || null) !== (item.size || null) ||
                (priceInfo.sizePrice ?? null) !== (item.sizePrice ?? null) ||
                nextCartKey !== currentKey

            if (!hasChanged) return item

            priceChanged = true
            return {
                ...item,
                unitPrice: priceInfo.unitPrice,
                sizeOptionId: priceInfo.sizeOptionId,
                size: priceInfo.sizeName || item.size,
                sizePrice: priceInfo.sizePrice,
                cartKey: nextCartKey,
                updatedAt,
            }
        })

    const recalculatedSubtotal = reconciledItems.reduce(
        (acc, item) => acc + item.unitPrice * item.quantity,
        0
    )

    const [addresses, paymentAvailability] = await Promise.all([
        getAvailableStoreAddressesForStore(supabase, context.storeId),
        getAvailablePaymentRulesForContext(supabase, {
            cartTotal: recalculatedSubtotal,
            commercialSettings: context.commercialSettings,
            resolvedPriceTableId: context.resolvedPriceTableId,
            applyCartTotalFilter: false,
        }),
    ])

    const defaultAddressId = addresses.find((address) => address.is_main)?.id || addresses[0]?.id || ''

    const payload: CheckoutBootstrapPayload = {
        reconciledItems,
        missingKeys,
        missingVariantIds: pricingResult.missingVariantIds || [],
        priceChanged,
        addresses,
        defaultAddressId,
        paymentCatalogMethods: paymentAvailability.paymentMethods,
        paymentCatalogConditions: paymentAvailability.globalConditions,
        paymentCatalogRules: paymentAvailability.priceTableRules,
        financialProfile: paymentAvailability.financialProfile,
        checkoutBlocked: paymentAvailability.checkoutBlocked,
        paymentRestrictionMessage: paymentAvailability.paymentRestrictionMessage,
    }

    return { data: payload }
}

export async function previewCouponForOrder(items: CartItem[], couponCode: string) {
    if (!items?.length) {
        return { error: 'Adicione itens no carrinho para aplicar cupom.' }
    }

    const normalizedCouponCode = normalizeCouponCodeInput(couponCode)
    if (!normalizedCouponCode) {
        return { error: 'Informe um codigo de cupom.' }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuario nao autenticado.' }

    const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
    if (!store || storeError) return { error: 'Loja do usuario nao localizada no sistema.' }

    const itemsPayload = items.map((item) => ({
        product_variant_id: item.variantId,
        size_option_id: item.sizeOptionId ?? null,
        quantity: item.quantity,
    }))

    const { data, error } = await supabase.rpc('client_preview_coupon_for_order', {
        p_store_id: store.id,
        p_profile_id: user.id,
        p_coupon_code: normalizedCouponCode,
        p_items: itemsPayload,
    })

    const errorMessage = getRpcErrorMessage(error as RpcErrorLike | null)
    if (error) {
        return { error: mapCouponPreviewErrorToUserMessage(errorMessage || 'Erro ao validar cupom.') }
    }

    const previewRow = Array.isArray(data) ? (data[0] as CouponPreviewRow | undefined) : (data as CouponPreviewRow | null)
    if (!previewRow?.coupon_id) {
        return { error: 'Nao foi possivel validar o cupom informado.' }
    }

    const preview: CheckoutCouponPreview = {
        couponId: previewRow.coupon_id,
        couponCode: previewRow.coupon_code,
        couponName: previewRow.coupon_name || previewRow.coupon_code,
        discountType: previewRow.discount_type,
        discountValue: Number(previewRow.discount_value || 0),
        maxDiscountAmount: previewRow.max_discount_amount === null ? null : Number(previewRow.max_discount_amount),
        isCumulative: Boolean(previewRow.is_cumulative),
        subtotal: Number(previewRow.subtotal || 0),
        eligibleSubtotal: Number(previewRow.eligible_subtotal || 0),
        discountAmount: Number(previewRow.discount_amount || 0),
        paymentDiscountBlocked: Boolean(previewRow.payment_discount_blocked),
    }

    return { data: preview }
}

export async function checkoutAction(
    items: CartItem[],
    selectedPaymentId: string,
    notes: string,
    isTableRule = false,
    selectedAddressId?: string | null,
    couponCode?: string | null
) {
    if (!items?.length) return { error: 'O carrinho esta vazio.' }
    if (!selectedPaymentId) return { error: 'Condicao de pagamento obrigatoria.' }

    const supabase = await createClient()
    const context = await resolveCheckoutSessionContext(supabase)
    if ('error' in context) return { error: context.error }
    const normalizedCouponCode = normalizeCouponCodeInput(couponCode)

    const commercialSettings = context.commercialSettings
    if (commercialSettings?.financial_profile === 'block_sales') {
        return { error: 'Este cliente esta com vendas restritas e nao pode finalizar novos pedidos.' }
    }

    const variantIds = Array.from(new Set(items.map((item) => item.variantId)))
    const sizeOptionIds = Array.from(
        new Set(items.map((item) => item.sizeOptionId).filter((value): value is string => Boolean(value)))
    )

    const [variantsResult, sizeOptionMap] = await Promise.all([
        fetchVariantPricingRows(supabase, variantIds),
        fetchSizeOptionsById(supabase, sizeOptionIds),
    ])

    if (variantsResult.error) {
        return { error: 'Falha ao validar os precos originais do catalogo.' }
    }

    const variantMap = new Map<string, VariantPricingRow>()
    variantsResult.variants.forEach((variant) => variantMap.set(variant.id, variant))

    const missingIds = variantIds.filter((variantId) => !variantMap.has(variantId))
    const inactiveIds = variantsResult.variants
        .filter(
            (variant) =>
                !variant.is_active ||
                !variant.product?.is_active ||
                !variant.fabric?.is_active ||
                !variant.color?.is_active
        )
        .map((variant) => variant.id)
    if (missingIds.length > 0 || inactiveIds.length > 0) {
        return { error: 'Alguns itens nao estao mais disponiveis. Revise o carrinho antes de finalizar.' }
    }

    const priceTableContext = await getActivePriceTableContext(
        supabase,
        context.storeId,
        variantIds,
        context.resolvedPriceTableId
    )

    let secureSubtotal = 0
    const validatedItems = items.map((clientItem) => {
        const dbVariant = variantMap.get(clientItem.variantId)
        if (!dbVariant || !dbVariant.product) {
            throw new Error(`Produto nao encontrado no sistema: ${clientItem.productName}`)
        }

        const product = dbVariant.product
        const requestedSizeOptionId = clientItem.sizeOptionId ?? null
        const sizeOption = requestedSizeOptionId ? sizeOptionMap.get(requestedSizeOptionId) || null : null

        if (requestedSizeOptionId) {
            if (!sizeOption || !sizeOption.is_active || sizeOption.product_id !== product.id) {
                throw new Error(`Tamanho selecionado nao e valido para ${clientItem.productName}.`)
            }
        }

        if (product.has_size_variants && !sizeOption) {
            throw new Error(`Selecione um tamanho valido para ${clientItem.productName}.`)
        }

        const pricing = resolveVariantPricing({
            basePrice: product.base_price ?? 0,
            fabricModifier: dbVariant.fabric?.price_modifier ?? 0,
            variantPriceOverride: dbVariant.price_override ?? null,
            variantId: clientItem.variantId,
            sizePriceMode: sizeOption?.price_mode ?? null,
            sizePriceValue: sizeOption?.price_value ?? null,
            priceTable: priceTableContext,
        })

        const realSubtotal = pricing.unitPrice * clientItem.quantity
        secureSubtotal += realSubtotal

        return {
            ...clientItem,
            cartKey: clientItem.cartKey || buildCartKey(clientItem.variantId, requestedSizeOptionId),
            sizeOptionId: sizeOption?.id ?? null,
            sizeName: sizeOption?.name ?? clientItem.size ?? product.size ?? null,
            sizePrice: pricing.sizePrice,
            productPrice: pricing.productPrice,
            variationPrice: pricing.variationPrice,
            finalPrice: pricing.finalPrice,
            unitPrice: pricing.unitPrice,
            subtotal: realSubtotal,
        }
    })

    const { data: settings } = await supabase.from('system_settings').select('min_order_amount').single()
    if (settings && settings.min_order_amount > 0 && secureSubtotal < settings.min_order_amount) {
        return { error: `Pedido minimo obrigatorio de R$ ${settings.min_order_amount.toFixed(2)}.` }
    }

    const activePriceTableId = context.resolvedPriceTableId
    const resolvedPayment = await resolveCheckoutPaymentSelection(supabase, {
        cartTotal: secureSubtotal,
        selectedPaymentId,
        isTableRule,
        priceTableId: activePriceTableId,
    })

    if (resolvedPayment.error || !resolvedPayment.data) {
        return { error: resolvedPayment.error || 'Nao foi possivel validar o pagamento escolhido.' }
    }

    const paymentSelection = resolvedPayment.data
    const commercialPaymentValidationMessage = validateCheckoutSelectionAgainstCommercialSettings({
        settings: commercialSettings,
        paymentMethodId: paymentSelection.paymentMethodId,
        paymentConditionId: paymentSelection.paymentConditionId,
        paymentInstallments: paymentSelection.paymentInstallments,
    })
    if (commercialPaymentValidationMessage) {
        return { error: commercialPaymentValidationMessage }
    }

    const discountPercentage = paymentSelection.paymentDiscountPercentage
    const surchargePercentage = paymentSelection.paymentSurchargePercentage
    const paymentRuleId = paymentSelection.paymentRuleId
    const paymentConditionId = paymentSelection.paymentConditionId

    const couponPreviewItemsPayload = validatedItems.map((item) => ({
        product_variant_id: item.variantId,
        size_option_id: item.sizeOptionId ?? null,
        quantity: item.quantity,
    }))

    let couponDiscountAmount = 0
    let paymentDiscountBlockedByCoupon = false

    if (normalizedCouponCode) {
        const { data: couponPreviewData, error: couponPreviewError } = await supabase.rpc('client_preview_coupon_for_order', {
            p_store_id: context.storeId,
            p_profile_id: context.userId,
            p_coupon_code: normalizedCouponCode,
            p_items: couponPreviewItemsPayload,
        })

        const couponPreviewErrorMessage = getRpcErrorMessage(couponPreviewError as RpcErrorLike | null)
        if (couponPreviewError) {
            return { error: mapCouponPreviewErrorToUserMessage(couponPreviewErrorMessage || 'Erro ao validar cupom.') }
        }

        const couponPreviewRow = Array.isArray(couponPreviewData)
            ? (couponPreviewData[0] as CouponPreviewRow | undefined)
            : (couponPreviewData as CouponPreviewRow | null)

        if (!couponPreviewRow?.coupon_id) {
            return { error: 'Nao foi possivel validar o cupom informado.' }
        }

        couponDiscountAmount = Number(couponPreviewRow.discount_amount || 0)
        paymentDiscountBlockedByCoupon = Boolean(couponPreviewRow.payment_discount_blocked)
    }

    const effectivePaymentDiscountPercentage = paymentDiscountBlockedByCoupon ? 0 : discountPercentage
    const subtotalAfterCoupon = Math.max(0, secureSubtotal - couponDiscountAmount)
    const paymentDiscount = (subtotalAfterCoupon * effectivePaymentDiscountPercentage) / 100
    let finalTotal = subtotalAfterCoupon - paymentDiscount
    const paymentSurcharge = (finalTotal * surchargePercentage) / 100
    finalTotal += paymentSurcharge

    const creditLimitMessage = await validateStoreCreditLimitForOrder({
        supabase,
        storeId: context.storeId,
        settings: commercialSettings,
        orderTotal: finalTotal,
    })
    if (creditLimitMessage) {
        return { error: creditLimitMessage }
    }

    let shippingAddressStr: string | null = null
    let addressQuery = supabase.from('store_addresses').select('*').eq('store_id', context.storeId)
    addressQuery = selectedAddressId
        ? addressQuery.eq('id', selectedAddressId)
        : addressQuery.eq('is_main', true)

    const { data: addressData } = await addressQuery.limit(1).single()
    if (addressData) {
        shippingAddressStr =
            `${addressData.title ? `[${addressData.title}] ` : ''}` +
            `${addressData.address}${addressData.number ? `, ${addressData.number}` : ''}` +
            `${addressData.complement ? ` - ${addressData.complement}` : ''}, ` +
            `${addressData.neighborhood ? `${addressData.neighborhood}, ` : ''}` +
            `${addressData.city} - ${addressData.state}, CEP: ${addressData.zip_code}`
    }

    const legacyOrderItemsPayload = validatedItems.map((item) => ({
        product_variant_id: item.variantId,
        size_option_id: item.sizeOptionId,
        product_name: item.productName,
        fabric_name: item.fabricName,
        color_name: item.colorName,
        size: item.sizeName,
        size_name: item.sizeName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        product_price: item.productPrice,
        size_price: item.sizePrice,
        variation_price: item.variationPrice,
        final_price: item.finalPrice,
        subtotal: item.subtotal,
    }))

    const checkoutItemsPayloadV2 = validatedItems.map((item) => ({
        product_variant_id: item.variantId,
        size_option_id: item.sizeOptionId,
        quantity: item.quantity,
    }))

    const atomicPayloadBase = {
        p_store_id: context.storeId,
        p_profile_id: context.userId,
        p_payment_method_id: paymentSelection.paymentMethodId,
        p_payment_condition_id: paymentConditionId,
        p_payment_rule_id: paymentRuleId,
        p_payment_method_condition_id: paymentSelection.paymentMethodConditionId,
        p_payment_method_code: paymentSelection.paymentMethodCode,
        p_payment_method_name: paymentSelection.paymentMethodName,
        p_payment_condition_name: paymentSelection.paymentConditionName,
        p_payment_condition_description: paymentSelection.paymentConditionDescription,
        p_payment_installments: paymentSelection.paymentInstallments,
        p_payment_discount_percentage: paymentSelection.paymentDiscountPercentage,
        p_payment_surcharge_percentage: paymentSelection.paymentSurchargePercentage,
        p_subtotal: secureSubtotal,
        p_discount_amount: paymentDiscount,
        p_total: finalTotal,
        p_shipping_address: shippingAddressStr,
        p_notes: notes || null,
        p_items: legacyOrderItemsPayload,
        p_coupon_code: normalizedCouponCode || null,
    }

    const atomicPayloadV2 = {
        p_store_id: context.storeId,
        p_profile_id: context.userId,
        p_payment_method_id: paymentSelection.paymentMethodId,
        p_payment_condition_id: paymentConditionId,
        p_payment_rule_id: paymentRuleId,
        p_payment_method_condition_id: paymentSelection.paymentMethodConditionId,
        p_payment_method_code: paymentSelection.paymentMethodCode,
        p_payment_method_name: paymentSelection.paymentMethodName,
        p_payment_condition_name: paymentSelection.paymentConditionName,
        p_payment_condition_description: paymentSelection.paymentConditionDescription,
        p_payment_installments: paymentSelection.paymentInstallments,
        p_payment_discount_percentage: paymentSelection.paymentDiscountPercentage,
        p_payment_surcharge_percentage: paymentSelection.paymentSurchargePercentage,
        p_shipping_address: shippingAddressStr,
        p_notes: notes || null,
        p_items: checkoutItemsPayloadV2,
        p_coupon_code: normalizedCouponCode || null,
    }

    const createdNoteLegacy = buildOrderCreatedAuditNote(validatedItems.length, finalTotal)
    const createdNoteV2 = `${createdNoteLegacy} [checkout_v2]`

    const executeAtomicOrderRpc = async (withCreatedNote: boolean) =>
        supabase.rpc('client_create_order_atomic', {
            ...atomicPayloadBase,
            ...(withCreatedNote ? { p_created_note: createdNoteLegacy } : {}),
        })

    const executeAtomicOrderRpcV2 = () =>
        supabase.rpc('client_create_order_atomic_v2', {
            ...atomicPayloadV2,
            p_created_note: createdNoteV2,
        })

    let usedLegacySignature = false
    let orderCreateResult: CreateOrderAtomicResult | CreateOrderAtomicResult[] | null = null
    let createOrderError: RpcErrorLike | null = null
    let createOrderErrorMessage = ''
    const checkoutV2Enabled = isCheckoutV2Enabled()
    let shouldUseLegacyCheckout = !checkoutV2Enabled

    if (checkoutV2Enabled) {
        const v2Call = await executeAtomicOrderRpcV2()
        orderCreateResult = v2Call.data as CreateOrderAtomicResult | CreateOrderAtomicResult[] | null
        createOrderError = v2Call.error as RpcErrorLike | null
        createOrderErrorMessage = getRpcErrorMessage(createOrderError)

        if (createOrderError && isDuplicateOrderNumber(createOrderErrorMessage)) {
            const retryV2Call = await executeAtomicOrderRpcV2()
            orderCreateResult = retryV2Call.data as CreateOrderAtomicResult | CreateOrderAtomicResult[] | null
            createOrderError = retryV2Call.error as RpcErrorLike | null
            createOrderErrorMessage = getRpcErrorMessage(createOrderError)
        }

        if (createOrderError && isMissingV2AtomicFunction(createOrderErrorMessage)) {
            shouldUseLegacyCheckout = true
            createOrderError = null
            createOrderErrorMessage = ''
        }
    }

    if (shouldUseLegacyCheckout) {
        const legacyCall = await executeAtomicOrderRpc(true)
        orderCreateResult = legacyCall.data as CreateOrderAtomicResult | CreateOrderAtomicResult[] | null
        createOrderError = legacyCall.error as RpcErrorLike | null
        createOrderErrorMessage = getRpcErrorMessage(createOrderError)

        // Backward compatibility when DB has old function signature without p_created_note.
        if (createOrderError && isMissingExtendedAtomicSignature(createOrderErrorMessage)) {
            usedLegacySignature = true
            const fallbackLegacyCall = await executeAtomicOrderRpc(false)
            orderCreateResult = fallbackLegacyCall.data as CreateOrderAtomicResult | CreateOrderAtomicResult[] | null
            createOrderError = fallbackLegacyCall.error as RpcErrorLike | null
            createOrderErrorMessage = getRpcErrorMessage(createOrderError)
        }

        // Retry once for eventual order_number race condition.
        if (createOrderError && isDuplicateOrderNumber(createOrderErrorMessage)) {
            const retryLegacyCall = await executeAtomicOrderRpc(!usedLegacySignature)
            orderCreateResult = retryLegacyCall.data as CreateOrderAtomicResult | CreateOrderAtomicResult[] | null
            createOrderError = retryLegacyCall.error as RpcErrorLike | null
            createOrderErrorMessage = getRpcErrorMessage(createOrderError)
        }
    }

    const createdOrder = Array.isArray(orderCreateResult)
        ? (orderCreateResult[0] as CreateOrderAtomicResult | undefined)
        : (orderCreateResult as CreateOrderAtomicResult | null)

    if (createOrderError || !createdOrder?.order_id) {
        console.error('[CHECKOUT] Atomic order creation error:', {
            error: createOrderError,
            payload: {
                ...(shouldUseLegacyCheckout ? atomicPayloadBase : atomicPayloadV2),
                p_items_count: shouldUseLegacyCheckout
                    ? legacyOrderItemsPayload.length
                    : checkoutItemsPayloadV2.length,
            },
        })
        return {
            error: mapAtomicOrderErrorToUserMessage(
                createOrderErrorMessage || 'Erro desconhecido no RPC de checkout.'
            ),
        }
    }

    const createdOrderId = createdOrder.order_id
    const createdOrderNumber = createdOrder.order_number || createdOrderId

    try {
        const { sendEmail } = await import('@/lib/email')
        const React = (await import('react')).default

        const [settingsRes, profileRes, storeDataRes] = await Promise.all([
            supabase.from('system_settings').select('system_name, email').limit(1).single(),
            supabase.from('profiles').select('full_name, email').eq('id', context.userId).single(),
            supabase.from('stores').select('company_name').eq('profile_id', context.userId).single(),
        ])

        const systemName = settingsRes.data?.system_name || 'CDJWE'
        const adminEmail = settingsRes.data?.email
        const clientName = profileRes.data?.full_name || 'Cliente'
        const clientEmail = profileRes.data?.email || context.userEmail || undefined
        const companyName = storeDataRes.data?.company_name || 'N/A'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'

        const commonProps = { systemName, appUrl }
        const emailItems = buildOrderEmailItems(validatedItems)
        const snapshotSummary = buildOrderSnapshotSummary(emailItems)

        if (adminEmail) {
            const { default: NewOrderEmail } = await import('@/emails/NewOrderEmail')
            sendEmail({
                to: adminEmail,
                subject: `Novo pedido #${createdOrderNumber} - ${systemName}`,
                senderName: systemName,
                react: React.createElement(NewOrderEmail, {
                    orderId: createdOrderId,
                    orderNumber: createdOrderNumber,
                    clientName,
                    companyName,
                    itemCount: validatedItems.length,
                    total: finalTotal,
                    pricingSummary: snapshotSummary,
                    ...commonProps,
                }),
            }).catch(() => {})
        }

        if (clientEmail) {
            const { default: OrderConfirmationEmail } = await import('@/emails/OrderConfirmationEmail')
            sendEmail({
                to: clientEmail,
                subject: `Pedido #${createdOrderNumber} confirmado - ${systemName}`,
                senderName: systemName,
                react: React.createElement(OrderConfirmationEmail, {
                    orderId: createdOrderId,
                    orderNumber: createdOrderNumber,
                    clientName,
                    items: emailItems,
                    subtotal: secureSubtotal,
                    discount: couponDiscountAmount + paymentDiscount,
                    total: finalTotal,
                    snapshotSummary,
                    ...commonProps,
                }),
            }).catch(() => {})
        }
    } catch (emailError) {
        console.error('[CHECKOUT EMAIL] Error:', emailError)
    }

    return { success: true, orderId: createdOrderId }
}
