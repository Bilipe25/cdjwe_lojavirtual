'use server'

import { createClient } from '@/lib/supabase/server'
import type { CartItem } from '@/lib/types'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import {
    getAvailableCheckoutPayments,
    resolveCheckoutPaymentSelection,
} from '@/lib/payments/checkout-payment'
import {
    buildOrderCreatedAuditNote,
    buildOrderEmailItems,
    buildOrderSnapshotSummary,
} from '@/lib/orders/order-communication'

type PriceTableContext = {
    discountPercentage: number
    overrides: Record<string, number>
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
    }>
    fabric: VariantPricingRelation<{ price_modifier: number | null }>
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
    } | null
    fabric: { price_modifier: number | null } | null
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
    }
}

function buildCartKey(variantId: string, sizeOptionId: string | null) {
    return `${variantId}::${sizeOptionId || 'legacy'}`
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
    if (isDuplicateOrderNumber(errorMessage)) return 'Conflito temporario na numeracao do pedido. Tente novamente em instantes.'
    if (isMissingExtendedAtomicSignature(errorMessage)) {
        return 'Banco desatualizado para o checkout atomico. Aplique as migrations pendentes de pedidos e pagamentos (013, 023, 025, 027 e 028).'
    }
    return `Erro ao criar pedido de forma atomica: ${errorMessage}`
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
    const { data: pivot } = await supabase
        .from('store_price_tables')
        .select('price_table_id')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    let tableId = pivot?.price_table_id || null
    if (!tableId) {
        const { data: defaultTable } = await supabase
            .from('price_tables')
            .select('id')
            .eq('is_default', true)
            .single()
        tableId = defaultTable?.id || null
    }

    return tableId
}

async function getActivePriceTableContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    storeId: string,
    variantIds: string[]
): Promise<PriceTableContext> {
    const tableId = await resolveActivePriceTableId(supabase, storeId)
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
            product:products(id, base_price, has_size_variants, size),
            fabric:fabrics(price_modifier)
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
                product:products(id, base_price, size),
                fabric:fabrics(price_modifier)
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

export async function getAvailablePaymentRules(cartTotal: number) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { globalConditions: [] }

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
    if (!store) return { globalConditions: [] }

    let priceTableId = await resolveActivePriceTableId(supabase, store.id)

    if (priceTableId) {
        const { data: priceTable } = await supabase
            .from('price_tables')
            .select('is_active, valid_from, valid_until')
            .eq('id', priceTableId)
            .single()

        if (!priceTable || !priceTable.is_active) {
            priceTableId = null
        } else {
            const now = new Date()
            const validFrom = priceTable.valid_from ? new Date(priceTable.valid_from) : null
            const validUntil = priceTable.valid_until ? new Date(priceTable.valid_until) : null
            const isStarted = !validFrom || now >= validFrom
            const isExpired = validUntil && now > validUntil
            if (!isStarted || isExpired) {
                priceTableId = null
            }
        }
    }

    const availability = await getAvailableCheckoutPayments(supabase, {
        cartTotal,
        priceTableId,
    })

    return {
        priceTableRules: availability.priceTableRules,
        globalConditions: availability.globalConditions,
        paymentMethods: availability.methodGroups,
    }
}

export async function getAvailableStoreAddresses() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
    if (!store) return []

    const { data: addresses } = await supabase
        .from('store_addresses')
        .select('*')
        .eq('store_id', store.id)
        .order('is_main', { ascending: false })
        .order('created_at', { ascending: true })

    return addresses || []
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
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuario nao autenticado.' as const }

    const pricingLines = normalizePricingLines(input)
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

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
    if (!store) return { error: 'Loja do usuario nao localizada.' as const }

    const [priceTableContext, variantsResult, sizeOptionMap] = await Promise.all([
        getActivePriceTableContext(supabase, store.id, variantIds),
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

        if (!dbVariant || !dbVariant.is_active) {
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

        // Legacy compatibility for code paths still keyed only by variant id.
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

export async function checkoutAction(
    items: CartItem[],
    selectedPaymentId: string,
    notes: string,
    isTableRule = false,
    selectedAddressId?: string | null
) {
    if (!items?.length) return { error: 'O carrinho esta vazio.' }
    if (!selectedPaymentId) return { error: 'Condicao de pagamento obrigatoria.' }

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
        .filter((variant) => !variant.is_active)
        .map((variant) => variant.id)
    if (missingIds.length > 0 || inactiveIds.length > 0) {
        return { error: 'Alguns itens nao estao mais disponiveis. Revise o carrinho antes de finalizar.' }
    }

    const priceTableContext = await getActivePriceTableContext(supabase, store.id, variantIds)

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

    const activePriceTableId = await resolveActivePriceTableId(supabase, store.id)
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
    const discountPercentage = paymentSelection.paymentDiscountPercentage
    const surchargePercentage = paymentSelection.paymentSurchargePercentage
    const paymentRuleId = paymentSelection.paymentRuleId
    const paymentConditionId = paymentSelection.paymentConditionId

    const paymentDiscount = (secureSubtotal * discountPercentage) / 100
    let finalTotal = secureSubtotal - paymentDiscount
    const paymentSurcharge = (finalTotal * surchargePercentage) / 100
    finalTotal += paymentSurcharge

    let shippingAddressStr: string | null = null
    let addressQuery = supabase.from('store_addresses').select('*').eq('store_id', store.id)
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

    const orderItemsPayload = validatedItems.map((item) => ({
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

    const atomicPayloadBase = {
        p_store_id: store.id,
        p_profile_id: user.id,
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
        p_items: orderItemsPayload,
    }

    const executeAtomicOrderRpc = async (withCreatedNote: boolean) =>
        supabase.rpc('client_create_order_atomic', {
            ...atomicPayloadBase,
            ...(withCreatedNote
                ? { p_created_note: buildOrderCreatedAuditNote(validatedItems.length, finalTotal) }
                : {}),
        })

    let usedLegacySignature = false
    let { data: orderCreateResult, error: createOrderError } = await executeAtomicOrderRpc(true)
    let createOrderErrorMessage = getRpcErrorMessage(createOrderError)

    // Backward compatibility when DB has old function signature without p_created_note.
    if (createOrderError && isMissingExtendedAtomicSignature(createOrderErrorMessage)) {
        usedLegacySignature = true
        const legacyCall = await executeAtomicOrderRpc(false)
        orderCreateResult = legacyCall.data
        createOrderError = legacyCall.error
        createOrderErrorMessage = getRpcErrorMessage(createOrderError)
    }

    // Retry once for eventual order_number race condition.
    if (createOrderError && isDuplicateOrderNumber(createOrderErrorMessage)) {
        const retryCall = await executeAtomicOrderRpc(!usedLegacySignature)
        orderCreateResult = retryCall.data
        createOrderError = retryCall.error
        createOrderErrorMessage = getRpcErrorMessage(createOrderError)
    }

    const createdOrder = Array.isArray(orderCreateResult)
        ? (orderCreateResult[0] as CreateOrderAtomicResult | undefined)
        : (orderCreateResult as CreateOrderAtomicResult | null)

    if (createOrderError || !createdOrder?.order_id) {
        console.error('[CHECKOUT] Atomic order creation error:', {
            error: createOrderError,
            payload: {
                ...atomicPayloadBase,
                p_items_count: orderItemsPayload.length,
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
            supabase.from('profiles').select('full_name, email').eq('id', user.id).single(),
            supabase.from('stores').select('company_name').eq('profile_id', user.id).single(),
        ])

        const systemName = settingsRes.data?.system_name || 'CDJWE'
        const adminEmail = settingsRes.data?.email
        const clientName = profileRes.data?.full_name || 'Cliente'
        const clientEmail = profileRes.data?.email || user.email
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
                    discount: paymentDiscount,
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
