'use server'

import { createClient } from '@/lib/supabase/server'
import type { CartItem, PriceTablePaymentRule, PaymentCondition } from '@/lib/types'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import {
    buildOrderCreatedAuditNote,
    buildOrderEmailItems,
    buildOrderSnapshotSummary,
} from '@/lib/orders/order-communication'

type PriceTableContext = {
    discountPercentage: number
    overrides: Record<string, number>
}


type VariantPricingRow = {
    id: string
    is_active: boolean
    price_override: number | null
    product: { base_price: number | null } | null
    fabric: { price_modifier: number | null } | null
}

type VariantPricingRelation<T> = T | T[] | null

type RawVariantPricingRow = {
    id: string
    is_active: boolean
    price_override: number | null
    product: VariantPricingRelation<{ base_price: number | null }>
    fabric: VariantPricingRelation<{ price_modifier: number | null }>
}

type CreateOrderAtomicResult = {
    order_id: string
    order_number: string
}

function unwrapRelation<T>(value: VariantPricingRelation<T>): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null
    }

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

async function resolveActivePriceTableId(supabase: Awaited<ReturnType<typeof createClient>>, storeId: string) {
    const { data: pivot } = await supabase
        .from('store_price_tables')
        .select('price_table_id')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    let tableId = pivot?.price_table_id

    if (!tableId) {
        const { data: defaultTable } = await supabase
            .from('price_tables')
            .select('id')
            .eq('is_default', true)
            .single()

        tableId = defaultTable?.id
    }

    return tableId || null
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

        customItems?.forEach(item => {
            overrides[item.product_variant_id] = item.custom_price
        })
    }

    return { discountPercentage: priceTable.discount_percentage || 0, overrides }
}

export async function getAvailablePaymentRules(cartTotal: number) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    // 1. Fetch Table Specific Rules
    let tableRules: PriceTablePaymentRule[] = []
    if (priceTableId) {
        const { data: rules } = await supabase
            .from('price_table_payment_rules')
            .select('*')
            .eq('price_table_id', priceTableId)
            .order('min_order_value', { ascending: true })

        if (rules && rules.length > 0) {
            tableRules = (rules as PriceTablePaymentRule[]).filter(r => 
                cartTotal >= r.min_order_value && 
                (!r.max_order_value || cartTotal <= r.max_order_value)
            )
        }
    }

    // 2. Fetch Global Conditions filtered by value range
    const { data: globals } = await supabase
        .from('payment_conditions')
        .select('*')
        .eq('is_active', true)
        .lte('min_order_value', cartTotal)
        .order('sort_order')

    const validGlobals = (globals as PaymentCondition[] || []).filter(g => 
        !g.max_order_value || cartTotal <= g.max_order_value
    )

    // IMPORTANT: If there are table rules for THIS value range, they take priority.
    // However, the user might want a mix. The instruction says Table Rule > Global Condition.
    // We will return both but the UI will decide how to show them.
    // In our logic, if Table Rules exist, they usually "win" for those specific installments.
    
    return { 
        priceTableRules: tableRules,
        globalConditions: validGlobals 
    }
}

export async function getAvailableStoreAddresses() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado.' }

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()

    if (!store) return { error: 'Loja do usuário não localizada.' }

    const { data: newAddress, error } = await supabase
        .from('store_addresses')
        .insert({
            ...data,
            store_id: store.id
        })
        .select('*')
        .single()

    if (error) {
        console.error('[CART_ACTIONS] Create address error:', error)
        return { error: 'Erro ao criar endereço.' }
    }

    return { success: true, address: newAddress }
}

export async function getCurrentVariantPricing(variantIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado.' }

    const cleanVariantIds = Array.from(new Set(variantIds)).filter(Boolean)
    if (cleanVariantIds.length === 0) return { prices: {}, missingVariantIds: [] }

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()

    if (!store) return { error: 'Loja do usuário não localizada.' }

    const priceTableContext = await getActivePriceTableContext(supabase, store.id, cleanVariantIds)

    const { data: variantsData, error: variantsError } = await supabase
        .from('product_variants')
        .select(`
            id,
            is_active,
            price_override,
            product:products(base_price),
            fabric:fabrics(price_modifier)
        `)
        .in('id', cleanVariantIds)

    if (variantsError || !variantsData) {
        return { error: 'Falha ao validar os preços do carrinho.' }
    }

    const normalizedVariants = (variantsData as RawVariantPricingRow[]).map(normalizeVariantPricingRow)
    const prices: Record<string, { unitPrice: number; productPrice: number; variationPrice: number | null; finalPrice: number }> = {}
    const missingVariantIds: string[] = []

    const foundIds = new Set(normalizedVariants.map(v => v.id))
    cleanVariantIds.forEach(id => {
        if (!foundIds.has(id)) missingVariantIds.push(id)
    })

    normalizedVariants.forEach((variant) => {
        if (!variant?.is_active) {
            missingVariantIds.push(variant.id)
            return
        }

        const basePrice = variant?.product?.base_price ?? 0
        const fabricMod = variant?.fabric?.price_modifier ?? 0
        const variationPrice = variant?.price_override ?? null

        const pricing = resolveVariantPricing({
            basePrice,
            fabricModifier: fabricMod,
            variantPriceOverride: variationPrice,
            variantId: variant.id,
            priceTable: priceTableContext,
        })

        prices[variant.id] = {
            unitPrice: pricing.unitPrice,
            productPrice: pricing.productPrice,
            variationPrice: pricing.variationPrice,
            finalPrice: pricing.finalPrice,
        }
    })

    return { prices, missingVariantIds: Array.from(new Set(missingVariantIds)) }
}

export async function checkoutAction(
    items: CartItem[], 
    selectedPaymentId: string, 
    notes: string,
    isTableRule: boolean = false,
    selectedAddressId?: string | null
) {
    if (!items || items.length === 0) {
        return { error: 'O carrinho está vazio.' }
    }
    if (!selectedPaymentId) {
        return { error: 'Condição de pagamento obrigatória.' }
    }

    const supabase = await createClient()

    // 1. Verify User Authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Usuário não autenticado.' }
    }

    // 2. Locate User's Store
    const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()

    if (!store || storeError) {
        return { error: 'Loja do usuário não localizada no sistema.' }
    }

    // 3. SECURE PRICE RECALCULATION (Server-Side)
    // Fetch real prices directly from Database instead of trusting client numbers
    const variantIds = items.map(i => i.variantId)
    const { data: variantsData, error: variantsError } = await supabase
        .from('product_variants')
        .select(`
            id,
            is_active,
            price_override,
            product:products(base_price),
            fabric:fabrics(price_modifier)
        `)
        .in('id', variantIds)

    if (variantsError || !variantsData) {
        return { error: 'Falha ao validar os preços originais do catálogo.' }
    }

    const normalizedVariants = (variantsData as RawVariantPricingRow[]).map(normalizeVariantPricingRow)
    const foundIds = new Set(normalizedVariants.map(v => v.id))
    const missingIds = variantIds.filter(id => !foundIds.has(id))
    const inactiveIds = normalizedVariants.filter(v => v.is_active === false).map(v => v.id)

    if (missingIds.length > 0 || inactiveIds.length > 0) {
        return { error: 'Alguns itens não estão mais disponíveis. Revise o carrinho antes de finalizar.' }
    }

    // 3.1 Resolve active Price Table context (store-specific or default)
    const priceTableContext = await getActivePriceTableContext(supabase, store.id, variantIds)

    let secureSubtotal = 0;
    const validatedItems = items.map(clientItem => {
        // Find the database variant
        const dbVariant = normalizedVariants.find(v => v.id === clientItem.variantId)
        if (!dbVariant) throw new Error(`Produto não encontrado no sistema: ${clientItem.productName}`)
        
        const basePrice = dbVariant.product?.base_price || 0
        const fabricMod = dbVariant.fabric?.price_modifier || 0
        const variantPriceOverride = dbVariant.price_override ?? null

        const pricing = resolveVariantPricing({
            basePrice,
            fabricModifier: fabricMod,
            variantPriceOverride,
            variantId: clientItem.variantId,
            priceTable: priceTableContext,
        })

        const realSubtotal = pricing.unitPrice * clientItem.quantity

        secureSubtotal += realSubtotal

        return {
            ...clientItem,
            productPrice: pricing.productPrice,
            variationPrice: pricing.variationPrice,
            finalPrice: pricing.finalPrice,
            unitPrice: pricing.unitPrice,
            subtotal: realSubtotal
        }
    })

    // 4. Validate System Settings (Minimum Amount)
    const { data: settings } = await supabase.from('system_settings').select('min_order_amount').single()
    if (settings && settings.min_order_amount > 0 && secureSubtotal < settings.min_order_amount) {
        return { error: `Pedido mínimo obrigatório de R$ ${settings.min_order_amount.toFixed(2)}.` }
    }

    // 5. Calculate Payment Discounts and Surcharges
    let discountPercentage = 0
    let surchargePercentage = 0
    let paymentRuleId: string | null = null
    let paymentConditionId: string | null = null

    if (isTableRule) {
        const { data: rule } = await supabase
            .from('price_table_payment_rules')
            .select('*')
            .eq('id', selectedPaymentId)
            .single()
        
        if (!rule) return { error: 'Regra de pagamento vinculada à tabela não encontrada.' }
        
        // Final Range Validation on Server
        if (secureSubtotal < rule.min_order_value || (rule.max_order_value && secureSubtotal > rule.max_order_value)) {
            return { error: 'O valor do pedido não é mais válido para esta regra de pagamento.' }
        }

        discountPercentage = rule.discount_percentage
        paymentRuleId = rule.id
    } else {
        const { data: paymentCondition } = await supabase
            .from('payment_conditions')
            .select('*')
            .eq('id', selectedPaymentId)
            .single()

        if (!paymentCondition) return { error: 'Condição de pagamento global não encontrada.' }
        
        // Final Range Validation on Server
        if (secureSubtotal < paymentCondition.min_order_value || (paymentCondition.max_order_value && secureSubtotal > paymentCondition.max_order_value)) {
            return { error: 'O valor do pedido não é mais válido para esta condição de pagamento.' }
        }

        discountPercentage = paymentCondition.discount_percentage
        surchargePercentage = paymentCondition.surcharge_percentage || 0
        paymentConditionId = paymentCondition.id
    }
    
    // Apply discount first
    const paymentDiscount = (secureSubtotal * discountPercentage) / 100
    let finalTotal = secureSubtotal - paymentDiscount
    
    // Then apply surcharge if any
    const paymentSurcharge = (finalTotal * surchargePercentage) / 100
    finalTotal = finalTotal + paymentSurcharge

    // 5.5 Fetch/Format Shipping Address
    let shippingAddressStr = null;
    let addressQuery = supabase.from('store_addresses').select('*').eq('store_id', store.id)
    
    if (selectedAddressId) {
        addressQuery = addressQuery.eq('id', selectedAddressId)
    } else {
        addressQuery = addressQuery.eq('is_main', true)
    }

    const { data: addressData } = await addressQuery.limit(1).single()
    
    if (addressData) {
        shippingAddressStr = `${addressData.title ? `[${addressData.title}] ` : ''}${addressData.address}${addressData.number ? `, ${addressData.number}` : ''}${addressData.complement ? ` - ${addressData.complement}` : ''}, ${addressData.neighborhood ? `${addressData.neighborhood}, ` : ''}${addressData.city} - ${addressData.state}, CEP: ${addressData.zip_code}`
    }
    const orderItemsPayload = validatedItems.map(item => ({
        product_variant_id: item.variantId,
        product_name: item.productName,
        fabric_name: item.fabricName,
        color_name: item.colorName,
        size: item.size,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        product_price: item.productPrice,
        variation_price: item.variationPrice,
        final_price: item.finalPrice,
        subtotal: item.subtotal,
    }))

    // 6. Atomic Order Creation (order + items + status history)
    const { data: orderCreateResult, error: createOrderError } = await supabase.rpc(
        'client_create_order_atomic',
        {
            p_store_id: store.id,
            p_profile_id: user.id,
            p_payment_condition_id: paymentConditionId,
            p_payment_rule_id: paymentRuleId,
            p_subtotal: secureSubtotal,
            p_discount_amount: paymentDiscount,
            p_total: finalTotal,
            p_shipping_address: shippingAddressStr,
            p_notes: notes || null,
            p_items: orderItemsPayload,
            p_created_note: buildOrderCreatedAuditNote(validatedItems.length, finalTotal),
        }
    )

    const createdOrder = Array.isArray(orderCreateResult)
        ? (orderCreateResult[0] as CreateOrderAtomicResult | undefined)
        : (orderCreateResult as CreateOrderAtomicResult | null)

    if (createOrderError || !createdOrder?.order_id) {
        console.error('[CHECKOUT] Atomic order creation error:', createOrderError)
        return { error: 'Erro ao criar pedido de forma atomica.' }
    }

    const createdOrderId = createdOrder.order_id
    const createdOrderNumber = createdOrder.order_number || createdOrderId

    // 7. Send Email Notifications (fire-and-forget)
    try {
        const { sendEmail } = await import('@/lib/email')
        const React = (await import('react')).default

        // Fetch system settings and client profile
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

        // Email to Admin: New Order
        if (adminEmail) {
            const { default: NewOrderEmail } = await import('@/emails/NewOrderEmail')
            sendEmail({
                to: adminEmail,
                subject: `🛒 Novo pedido #${createdOrderNumber} — ${systemName}`,
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

        // Email to Client: Order Confirmation
        if (clientEmail) {
            const { default: OrderConfirmationEmail } = await import('@/emails/OrderConfirmationEmail')
            sendEmail({
                to: clientEmail,
                subject: `📋 Pedido #${createdOrderNumber} confirmado — ${systemName}`,
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
        // Email failures should never block checkout
        console.error('[CHECKOUT EMAIL] Error:', emailError)
    }

    return { success: true, orderId: createdOrderId }
}
