'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
    getAvailableCheckoutPayments,
    resolveCheckoutPaymentSelection,
} from '@/lib/payments/checkout-payment'
import {
    PRODUCT_VARIANT_DETAIL_SELECT,
    buildProductFabricGroups,
} from '@/lib/products/product-detail'
import {
    buildPricingCartKey,
    getPriceTableContextForStore,
    getVariantPricingSnapshotsForStore,
} from '@/lib/pricing/server-pricing'
import type {
    Order,
    PriceTable,
    Product,
    Profile,
    RepresentativeVisit,
    SalesQuote,
    Store,
    StoreAddress,
} from '@/lib/types'

type RepresentativeBootstrapCustomer = Store & {
    profile?: Profile | null
    addresses?: StoreAddress[]
    assigned_price_tables?: PriceTable[]
    last_order?: Pick<Order, 'id' | 'order_number' | 'created_at' | 'total' | 'status'> | null
}

type RepresentativeCatalogProduct = Product & {
    images?: { url: string; is_primary: boolean; sort_order?: number }[]
}

type RepresentativeDraftLine = {
    cartKey?: string
    variantId: string
    productId: string
    productName: string
    fabricName: string
    colorName: string
    sizeName?: string | null
    sizeOptionId?: string | null
    imageUrl?: string | null
    quantity: number
}

type RepresentativeDocumentPayload = {
    storeId: string
    priceTableId?: string | null
    selectedPaymentId?: string | null
    isTableRule?: boolean
    selectedAddressId?: string | null
    notes?: string | null
    negotiationDiscountType?: 'percent' | 'value' | null
    negotiationDiscountValue?: number | null
    negotiationSurchargeAmount?: number | null
    negotiationReason?: string | null
    items: RepresentativeDraftLine[]
}

type SalesOrderLikeResult = {
    order_id?: string
    order_number?: string
    quote_id?: string
    quote_number?: string
}

function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Credenciais server-side do Supabase nao configuradas.')
    }

    return createServiceClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    })
}

async function requireRepresentativeContext() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Usuario nao autenticado.')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'representative') {
        throw new Error('Acesso restrito ao modo representante.')
    }

    if (profile.status !== 'approved') {
        throw new Error('Representante sem aprovacao para operar.')
    }

    return {
        supabase,
        admin: getAdminClient(),
        user,
        profile: profile as Profile,
    }
}

function toNumber(value: number | string | null | undefined) {
    const parsed = Number(value || 0)
    return Number.isFinite(parsed) ? parsed : 0
}

function formatAddress(address?: StoreAddress | null) {
    if (!address) return null

    return `${address.title ? `[${address.title}] ` : ''}${address.address}${address.number ? `, ${address.number}` : ''}${address.complement ? ` - ${address.complement}` : ''}, ${address.neighborhood ? `${address.neighborhood}, ` : ''}${address.city} - ${address.state}, CEP: ${address.zip_code}`
}

function computeNegotiation(
    subtotal: number,
    discountType?: 'percent' | 'value' | null,
    discountValue?: number | null,
    surchargeAmount?: number | null
) {
    const safeSubtotal = Math.max(0, toNumber(subtotal))
    const safeDiscountValue = Math.max(0, toNumber(discountValue))
    const safeSurchargeAmount = Math.max(0, toNumber(surchargeAmount))

    let discountPercentage = 0
    let discountAmount = 0

    if (discountType === 'percent') {
        discountPercentage = Math.min(100, safeDiscountValue)
        discountAmount = safeSubtotal * (discountPercentage / 100)
    } else if (discountType === 'value') {
        discountAmount = Math.min(safeSubtotal, safeDiscountValue)
    }

    const adjustedSubtotal = Math.max(0, safeSubtotal - discountAmount + safeSurchargeAmount)

    return {
        adjustedSubtotal,
        discountPercentage,
        discountAmount,
        surchargeAmount: safeSurchargeAmount,
    }
}

async function getRepresentativeCustomersInternal(representativeId: string) {
    const admin = getAdminClient()

    const { data: stores } = await admin
        .from('stores')
        .select(`
            *,
            profile:profiles!stores_profile_id_fkey(*),
            addresses:store_addresses(*),
            price_table_links:store_price_tables(
                price_table:price_tables(*)
            )
        `)
        .eq('representative_id', representativeId)
        .order('company_name')

    const normalizedStores = ((stores || []) as Array<Store & {
        profile?: Profile | null
        addresses?: StoreAddress[]
        price_table_links?: Array<{ price_table?: PriceTable | null }>
    }>).map((store) => ({
        ...store,
        assigned_price_tables: (store.price_table_links || [])
            .map((item) => item.price_table)
            .filter((value): value is PriceTable => Boolean(value)),
        addresses: (store.addresses || []).sort((a, b) => Number(b.is_main) - Number(a.is_main)),
    }))

    const storeIds = normalizedStores.map((store) => store.id)
    const lastOrders = new Map<string, RepresentativeBootstrapCustomer['last_order']>()

    if (storeIds.length > 0) {
        const { data: orders } = await admin
            .from('orders')
            .select('id, order_number, created_at, total, status, store_id')
            .in('store_id', storeIds)
            .order('created_at', { ascending: false })

        ;(orders || []).forEach((order) => {
            if (!lastOrders.has(order.store_id)) {
                lastOrders.set(order.store_id, {
                    id: order.id,
                    order_number: order.order_number,
                    created_at: order.created_at,
                    total: order.total,
                    status: order.status,
                })
            }
        })
    }

    return normalizedStores.map((store) => ({
        ...store,
        last_order: lastOrders.get(store.id) || null,
    })) as RepresentativeBootstrapCustomer[]
}

export async function getRepresentativeShellData() {
    const { profile } = await requireRepresentativeContext()
    return { profile }
}

export async function getRepresentativeDashboardData() {
    const { user, profile, admin } = await requireRepresentativeContext()
    const [customers, recentOrdersRes, recentQuotesRes, visitsRes, ordersCountRes, quotesCountRes] = await Promise.all([
        getRepresentativeCustomersInternal(user.id),
        admin
            .from('orders')
            .select(`
                id,
                order_number,
                created_at,
                total,
                status,
                store:stores(id, customer_code, company_name, trade_name)
            `)
            .eq('created_by_profile_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
        admin
            .from('sales_quotes')
            .select(`
                id,
                quote_number,
                created_at,
                total,
                status,
                store:stores(id, customer_code, company_name, trade_name)
            `)
            .eq('representative_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
        admin
            .from('sales_visits')
            .select('id', { count: 'exact', head: true })
            .eq('representative_id', user.id),
        admin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('created_by_profile_id', user.id),
        admin
            .from('sales_quotes')
            .select('id', { count: 'exact', head: true })
            .eq('representative_id', user.id),
    ])

    return {
        profile,
        metrics: {
            customers: customers.length,
            orders: ordersCountRes.count || 0,
            quotes: quotesCountRes.count || 0,
            visits: visitsRes.count || 0,
        },
        recentOrders: recentOrdersRes.data || [],
        recentQuotes: recentQuotesRes.data || [],
        customers,
    }
}

export async function getRepresentativeCustomersData() {
    const { user } = await requireRepresentativeContext()
    return getRepresentativeCustomersInternal(user.id)
}

export async function getRepresentativeOrdersData() {
    const { user, admin } = await requireRepresentativeContext()
    const { data } = await admin
        .from('orders')
        .select(`
            *,
            store:stores(*),
            profile:profiles!orders_profile_id_fkey(*),
            created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at)
        `)
        .eq('created_by_profile_id', user.id)
        .order('created_at', { ascending: false })

    return (data || []) as Order[]
}

export async function getRepresentativeOrderDetail(orderId: string) {
    const { user, admin } = await requireRepresentativeContext()
    const { data } = await admin
        .from('orders')
        .select(`
            *,
            store:stores(*),
            profile:profiles!orders_profile_id_fkey(*),
            created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at),
            items:order_items(*),
            status_history:order_status_history(*, changed_by_profile:profiles!order_status_history_changed_by_fkey(id, full_name, role))
        `)
        .eq('id', orderId)
        .eq('created_by_profile_id', user.id)
        .single()

    return (data || null) as Order | null
}

export async function getRepresentativeQuotesData() {
    const { user, admin } = await requireRepresentativeContext()
    const { data } = await admin
        .from('sales_quotes')
        .select(`
            *,
            store:stores(*),
            customer_profile:profiles!sales_quotes_customer_profile_id_fkey(*),
            representative:profiles!sales_quotes_representative_id_fkey(*),
            items:sales_quote_items(*)
        `)
        .eq('representative_id', user.id)
        .order('created_at', { ascending: false })

    return (data || []) as SalesQuote[]
}

export async function getRepresentativeQuoteDetail(quoteId: string) {
    const { user, admin } = await requireRepresentativeContext()
    const { data } = await admin
        .from('sales_quotes')
        .select(`
            *,
            store:stores(*),
            customer_profile:profiles!sales_quotes_customer_profile_id_fkey(*),
            representative:profiles!sales_quotes_representative_id_fkey(*),
            items:sales_quote_items(*)
        `)
        .eq('id', quoteId)
        .eq('representative_id', user.id)
        .single()

    return (data || null) as SalesQuote | null
}

export async function getRepresentativeVisitsData() {
    const { user, admin } = await requireRepresentativeContext()
    const { data } = await admin
        .from('sales_visits')
        .select(`
            *,
            store:stores(*),
            customer_profile:profiles!sales_visits_customer_profile_id_fkey(*),
            representative:profiles!sales_visits_representative_id_fkey(*)
        `)
        .eq('representative_id', user.id)
        .order('visited_at', { ascending: false })

    return (data || []) as RepresentativeVisit[]
}

export async function getRepresentativeOrderBuilderData() {
    const { user, profile, admin } = await requireRepresentativeContext()
    const [customers, productsRes, categoriesRes, priceTablesRes] = await Promise.all([
        getRepresentativeCustomersInternal(user.id),
        admin
            .from('products')
            .select('*, category:categories(*), images:product_images(url, is_primary, sort_order), size_options:product_size_options(*)')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        admin.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        admin.from('price_tables').select('*').eq('is_active', true).order('name', { ascending: true }),
    ])

    return {
        profile,
        customers,
        products: (productsRes.data || []) as RepresentativeCatalogProduct[],
        categories: categoriesRes.data || [],
        priceTables: (priceTablesRes.data || []) as PriceTable[],
    }
}

export async function getRepresentativeProductConfiguratorData(input: {
    storeId: string
    productId: string
    priceTableId?: string | null
}) {
    const { user, admin } = await requireRepresentativeContext()

    const { data: store } = await admin
        .from('stores')
        .select('id, representative_id')
        .eq('id', input.storeId)
        .eq('representative_id', user.id)
        .single()

    if (!store) {
        return { error: 'Cliente nao disponivel para este representante.' }
    }

    const { data: product } = await admin
        .from('products')
        .select('*, images:product_images(*), size_options:product_size_options(*)')
        .eq('id', input.productId)
        .single()

    if (!product || !product.is_active) {
        return { error: 'Produto nao encontrado.' }
    }

    const { data: variants } = await admin
        .from('product_variants')
        .select(PRODUCT_VARIANT_DETAIL_SELECT)
        .eq('product_id', input.productId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

    const variantIds = ((variants || []) as Array<{ id: string }>).map((variant) => variant.id)
    const priceTableContext = await getPriceTableContextForStore(admin as never, input.storeId, variantIds, input.priceTableId)

    return {
        product,
        variants: variants || [],
        fabrics: buildProductFabricGroups((variants || []) as never),
        priceTableContext,
    }
}

export async function getRepresentativePaymentOptions(input: {
    storeId: string
    subtotal: number
    priceTableId?: string | null
}) {
    const { user, admin } = await requireRepresentativeContext()

    const { data: store } = await admin
        .from('stores')
        .select('id, representative_id')
        .eq('id', input.storeId)
        .eq('representative_id', user.id)
        .single()

    if (!store) {
        return { error: 'Cliente nao disponivel para este representante.' }
    }

    const availability = await getAvailableCheckoutPayments(admin as never, {
        cartTotal: toNumber(input.subtotal),
        priceTableId: input.priceTableId || null,
    })

    return {
        paymentMethods: availability.methodGroups,
        globalConditions: availability.globalConditions,
        priceTableRules: availability.priceTableRules,
    }
}

export async function validateRepresentativeDraftPricingAction(input: {
    storeId: string
    priceTableId?: string | null
    lines: Array<{ cartKey?: string; variantId: string; sizeOptionId?: string | null }>
}) {
    const { user, admin } = await requireRepresentativeContext()

    const { data: store } = await admin
        .from('stores')
        .select('id, representative_id')
        .eq('id', input.storeId)
        .eq('representative_id', user.id)
        .single()

    if (!store) {
        return { error: 'Cliente nao disponivel para este representante.' }
    }

    return getVariantPricingSnapshotsForStore(
        admin as never,
        input.storeId,
        input.lines.map((line) => ({
            cartKey: line.cartKey || buildPricingCartKey(line.variantId, line.sizeOptionId ?? null),
            variantId: line.variantId,
            sizeOptionId: line.sizeOptionId ?? null,
        })),
        input.priceTableId || null
    )
}

export async function createRepresentativeVisitAction(payload: {
    storeId: string
    visitedAt?: string | null
    notes?: string | null
    resultSummary?: string | null
    nextStep?: string | null
    outcome?: RepresentativeVisit['outcome']
    generatedQuoteId?: string | null
    generatedOrderId?: string | null
}) {
    try {
        const { user, admin } = await requireRepresentativeContext()

        const { data: store } = await admin
            .from('stores')
            .select('id, profile_id, representative_id')
            .eq('id', payload.storeId)
            .eq('representative_id', user.id)
            .single()

        if (!store) {
            return { error: 'Cliente nao disponivel para este representante.' }
        }

        const { data, error } = await admin
            .from('sales_visits')
            .insert({
                representative_id: user.id,
                store_id: store.id,
                customer_profile_id: store.profile_id,
                visited_at: payload.visitedAt || new Date().toISOString(),
                notes: payload.notes || null,
                result_summary: payload.resultSummary || null,
                next_step: payload.nextStep || null,
                outcome: payload.outcome || 'planned',
                generated_quote_id: payload.generatedQuoteId || null,
                generated_order_id: payload.generatedOrderId || null,
            })
            .select('*')
            .single()

        if (error || !data) {
            return { error: error?.message || 'Falha ao registrar visita.' }
        }

        return { success: true, visit: data }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao registrar visita.' }
    }
}

async function persistRepresentativeDocument(
    mode: 'order' | 'quote',
    payload: RepresentativeDocumentPayload
) {
    try {
        const { user, admin, supabase } = await requireRepresentativeContext()

        const { data: store } = await admin
            .from('stores')
            .select('id, profile_id, representative_id')
            .eq('id', payload.storeId)
            .eq('representative_id', user.id)
            .single()

        if (!store) {
            return { error: 'Cliente nao disponivel para este representante.' }
        }

        if (!payload.items?.length) {
            return { error: mode === 'order' ? 'Adicione itens ao pedido.' : 'Adicione itens ao orcamento.' }
        }

        const pricingResult = await getVariantPricingSnapshotsForStore(
            admin as never,
            store.id,
            payload.items.map((item) => ({
                cartKey: item.cartKey || buildPricingCartKey(item.variantId, item.sizeOptionId ?? null),
                variantId: item.variantId,
                sizeOptionId: item.sizeOptionId ?? null,
            })),
            payload.priceTableId || null
        )

        if ('error' in pricingResult && pricingResult.error) {
            return { error: pricingResult.error }
        }

        if (pricingResult.missingKeys.length > 0 || pricingResult.missingVariantIds.length > 0) {
            return { error: 'Alguns itens nao estao mais disponiveis. Revise o documento antes de salvar.' }
        }

        const validatedItems = payload.items.map((item) => {
            const cartKey = item.cartKey || buildPricingCartKey(item.variantId, item.sizeOptionId ?? null)
            const price = pricingResult.prices[cartKey]
            if (!price) {
                throw new Error(`Preco nao localizado para ${item.productName}.`)
            }

            return {
                cartKey,
                ...item,
                sizeName: price.sizeName ?? item.sizeName ?? null,
                unitPrice: price.unitPrice,
                productPrice: price.productPrice,
                variationPrice: price.variationPrice,
                sizePrice: price.sizePrice,
                finalPrice: price.finalPrice,
                subtotal: price.unitPrice * item.quantity,
            }
        })

        const subtotal = validatedItems.reduce((sum, item) => sum + item.subtotal, 0)
        const negotiation = computeNegotiation(
            subtotal,
            payload.negotiationDiscountType,
            payload.negotiationDiscountValue,
            payload.negotiationSurchargeAmount
        )

        const paymentSelection = payload.selectedPaymentId
            ? await resolveCheckoutPaymentSelection(supabase as never, {
                cartTotal: negotiation.adjustedSubtotal,
                selectedPaymentId: payload.selectedPaymentId,
                isTableRule: Boolean(payload.isTableRule),
                priceTableId: payload.priceTableId || null,
            })
            : { data: null, error: null }

        if (paymentSelection.error) {
            return { error: paymentSelection.error }
        }

        const paymentDiscountPercentage = paymentSelection.data?.paymentDiscountPercentage || 0
        const paymentSurchargePercentage = paymentSelection.data?.paymentSurchargePercentage || 0
        const paymentDiscountAmount = negotiation.adjustedSubtotal * (paymentDiscountPercentage / 100)
        const afterPaymentDiscount = Math.max(0, negotiation.adjustedSubtotal - paymentDiscountAmount)
        const paymentSurchargeAmount = afterPaymentDiscount * (paymentSurchargePercentage / 100)
        const total = Math.max(0, afterPaymentDiscount + paymentSurchargeAmount)

        let shippingAddress: string | null = null
        if (payload.selectedAddressId) {
            const { data: address } = await admin
                .from('store_addresses')
                .select('*')
                .eq('id', payload.selectedAddressId)
                .eq('store_id', store.id)
                .single()
            shippingAddress = formatAddress(address as StoreAddress | null)
        } else {
            const { data: address } = await admin
                .from('store_addresses')
                .select('*')
                .eq('store_id', store.id)
                .eq('is_main', true)
                .single()
            shippingAddress = formatAddress(address as StoreAddress | null)
        }

        const itemsPayload = validatedItems.map((item) => ({
            product_variant_id: item.variantId,
            size_option_id: item.sizeOptionId || null,
            product_name: item.productName,
            fabric_name: item.fabricName,
            color_name: item.colorName,
            size: item.sizeName || null,
            size_name: item.sizeName || null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            product_price: item.productPrice,
            size_price: item.sizePrice,
            variation_price: item.variationPrice,
            final_price: item.finalPrice,
            subtotal: item.subtotal,
        }))

        if (mode === 'order') {
            const { data, error } = await supabase.rpc('representative_create_order_atomic', {
                p_store_id: store.id,
                p_price_table_id: payload.priceTableId || null,
                p_payment_method_id: paymentSelection.data?.paymentMethodId || null,
                p_payment_condition_id: paymentSelection.data?.paymentConditionId || null,
                p_payment_rule_id: paymentSelection.data?.paymentRuleId || null,
                p_payment_method_condition_id: paymentSelection.data?.paymentMethodConditionId || null,
                p_payment_method_code: paymentSelection.data?.paymentMethodCode || null,
                p_payment_method_name: paymentSelection.data?.paymentMethodName || null,
                p_payment_condition_name: paymentSelection.data?.paymentConditionName || null,
                p_payment_condition_description: paymentSelection.data?.paymentConditionDescription || null,
                p_payment_installments: paymentSelection.data?.paymentInstallments || null,
                p_payment_discount_percentage: paymentDiscountPercentage,
                p_payment_surcharge_percentage: paymentSurchargePercentage,
                p_subtotal: subtotal,
                p_payment_discount_amount: paymentDiscountAmount,
                p_negotiation_discount_percentage: negotiation.discountPercentage,
                p_negotiation_discount_amount: negotiation.discountAmount,
                p_negotiation_surcharge_amount: negotiation.surchargeAmount,
                p_total: total,
                p_shipping_address: shippingAddress,
                p_notes: payload.notes || null,
                p_negotiation_reason: payload.negotiationReason || null,
                p_items: itemsPayload,
                p_created_note: 'Pedido criado pelo representante em vendas presenciais.',
                p_source_quote_id: null,
            })

            const result = Array.isArray(data) ? (data[0] as SalesOrderLikeResult | undefined) : (data as SalesOrderLikeResult | null)
            if (error || !result?.order_id) {
                return { error: error?.message || 'Falha ao criar pedido do representante.' }
            }

            return { success: true, orderId: result.order_id, orderNumber: result.order_number }
        }

        const { data, error } = await supabase.rpc('representative_create_quote_atomic', {
            p_store_id: store.id,
            p_price_table_id: payload.priceTableId || null,
            p_payment_method_id: paymentSelection.data?.paymentMethodId || null,
            p_payment_condition_id: paymentSelection.data?.paymentConditionId || null,
            p_payment_rule_id: paymentSelection.data?.paymentRuleId || null,
            p_payment_method_condition_id: paymentSelection.data?.paymentMethodConditionId || null,
            p_payment_method_code: paymentSelection.data?.paymentMethodCode || null,
            p_payment_method_name: paymentSelection.data?.paymentMethodName || null,
            p_payment_condition_name: paymentSelection.data?.paymentConditionName || null,
            p_payment_condition_description: paymentSelection.data?.paymentConditionDescription || null,
            p_payment_installments: paymentSelection.data?.paymentInstallments || null,
            p_payment_discount_percentage: paymentDiscountPercentage,
            p_payment_surcharge_percentage: paymentSurchargePercentage,
            p_subtotal: subtotal,
            p_payment_discount_amount: paymentDiscountAmount,
            p_negotiation_discount_percentage: negotiation.discountPercentage,
            p_negotiation_discount_amount: negotiation.discountAmount,
            p_negotiation_surcharge_amount: negotiation.surchargeAmount,
            p_total: total,
            p_shipping_address: shippingAddress,
            p_notes: payload.notes || null,
            p_negotiation_reason: payload.negotiationReason || null,
            p_items: itemsPayload,
            p_status: 'draft',
        })

        const result = Array.isArray(data) ? (data[0] as SalesOrderLikeResult | undefined) : (data as SalesOrderLikeResult | null)
        if (error || !result?.quote_id) {
            return { error: error?.message || 'Falha ao criar orcamento do representante.' }
        }

        return { success: true, quoteId: result.quote_id, quoteNumber: result.quote_number }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao salvar documento comercial.' }
    }
}

export async function createRepresentativeOrderAction(payload: RepresentativeDocumentPayload) {
    return persistRepresentativeDocument('order', payload)
}

export async function saveRepresentativeQuoteAction(payload: RepresentativeDocumentPayload) {
    return persistRepresentativeDocument('quote', payload)
}

export async function convertRepresentativeQuoteToOrderAction(quoteId: string) {
    try {
        const { supabase } = await requireRepresentativeContext()
        const { data, error } = await supabase.rpc('representative_convert_quote_to_order_atomic', {
            p_quote_id: quoteId,
            p_created_note: 'Pedido gerado a partir de orcamento no modo representante.',
        })

        const result = Array.isArray(data) ? (data[0] as SalesOrderLikeResult | undefined) : (data as SalesOrderLikeResult | null)
        if (error || !result?.order_id) {
            return { error: error?.message || 'Falha ao converter orcamento em pedido.' }
        }

        return { success: true, orderId: result.order_id, orderNumber: result.order_number }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao converter orcamento.' }
    }
}
