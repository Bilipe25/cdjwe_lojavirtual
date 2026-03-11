'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import type { CartItem } from '@/lib/types'

export async function checkoutAction(
    items: CartItem[], 
    selectedPaymentId: string, 
    notes: string
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
            price_override,
            product:products(base_price),
            fabric:fabrics(price_modifier)
        `)
        .in('id', variantIds)

    if (variantsError || !variantsData) {
        return { error: 'Falha ao validar os preços originais do catálogo.' }
    }

    // 3.1 Verify if Store has an active Price Table
    const { data: storeTablePivot } = await supabase
        .from('store_price_tables')
        .select('price_table_id')
        .eq('store_id', store.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    let globalDiscount = 0
    let customPricesMap: Record<string, number> = {}

    if (storeTablePivot && storeTablePivot.price_table_id) {
        const { data: priceTable } = await supabase
            .from('price_tables')
            .select('discount_percentage, valid_from, valid_until')
            .eq('id', storeTablePivot.price_table_id)
            .eq('is_active', true)
            .single()
            
        if (priceTable) {
            // Check Temporal Campaign Validity
            const now = new Date()
            const validFrom = priceTable.valid_from ? new Date(priceTable.valid_from) : null
            const validUntil = priceTable.valid_until ? new Date(priceTable.valid_until) : null
            
            const isStarted = !validFrom || now >= validFrom
            const isExpired = validUntil && now > validUntil
            
            if (isStarted && !isExpired) {
                globalDiscount = priceTable.discount_percentage
                
                // Fetch potential overriding Custom Prices for these items
                const { data: customItems } = await supabase
                    .from('price_table_items')
                    .select('product_variant_id, custom_price')
                    .eq('price_table_id', storeTablePivot.price_table_id)
                    .in('product_variant_id', variantIds)
                    
                if (customItems) {
                    customItems.forEach(item => {
                        customPricesMap[item.product_variant_id] = item.custom_price
                    })
                }
            }
        }
    }

    let secureSubtotal = 0;
    const validatedItems = items.map(clientItem => {
        // Find the database variant
        const dbVariant = variantsData.find(v => v.id === clientItem.variantId)
        if (!dbVariant) throw new Error(`Produto não encontrado no sistema: ${clientItem.productName}`)
        
        // 1. Is there an absolute custom price mapped for this specific variant inside the Price Table?
        const customPriceOverride = customPricesMap[clientItem.variantId]
        
        let realUnitPrice = 0;

        if (customPriceOverride !== undefined) {
            // Absolute winner. If custom_price rule exists, it completely bypasses standard math
            realUnitPrice = customPriceOverride;
        } else {
            // Standard Math calculation
            const basePrice = (dbVariant.product as any)?.base_price || 0
            const fabricMod = (dbVariant.fabric as any)?.price_modifier || 0
            
            const systemStandardPrice = dbVariant.price_override ?? (basePrice + fabricMod)
            
            // Apply Global Table Discount if applicable
            realUnitPrice = systemStandardPrice * (1 - (globalDiscount / 100))
        }

        const realSubtotal = realUnitPrice * clientItem.quantity

        secureSubtotal += realSubtotal

        return {
            ...clientItem,
            unitPrice: realUnitPrice,
            subtotal: realSubtotal
        }
    })

    // 4. Validate System Settings (Minimum Amount)
    const { data: settings } = await supabase.from('system_settings').select('min_order_amount').single()
    if (settings && settings.min_order_amount > 0 && secureSubtotal < settings.min_order_amount) {
        return { error: `Pedido mínimo obrigatório de R$ ${settings.min_order_amount.toFixed(2)}.` }
    }

    // 5. Calculate Payment Discounts and Surcharges
    const { data: paymentRule } = await supabase
        .from('payment_conditions')
        .select('discount_percentage, surcharge_percentage')
        .eq('id', selectedPaymentId)
        .single()

    const discountPercentage = paymentRule?.discount_percentage || 0
    const surchargePercentage = paymentRule?.surcharge_percentage || 0
    
    // Apply discount first
    const paymentDiscount = (secureSubtotal * discountPercentage) / 100
    let finalTotal = secureSubtotal - paymentDiscount
    
    // Then apply surcharge if any
    const paymentSurcharge = (finalTotal * surchargePercentage) / 100
    finalTotal = finalTotal + paymentSurcharge

    // 6. Execute Order Creation safely
    const { data: newOrder, error: insertError } = await supabase
        .from('orders')
        .insert({
            store_id: store.id,
            profile_id: user.id,
            status: 'pending',
            payment_status: 'pending',
            payment_condition_id: selectedPaymentId,
            subtotal: secureSubtotal,
            discount_amount: paymentDiscount,
            total: finalTotal,
            notes: notes || null,
        })
        .select('id')
        .single()

    if (insertError || !newOrder) {
        console.error('[CHECKOUT] Order insert error:', JSON.stringify(insertError, null, 2))
        return { error: 'Erro de comunicação ao formatar pedido principal.' }
    }

    // 7. Insert Validated Order Items mapping
    const orderItemsPayload = validatedItems.map(item => ({
        order_id: newOrder.id,
        product_variant_id: item.variantId,
        product_name: item.productName,
        fabric_name: item.fabricName,
        color_name: item.colorName,
        size: item.size,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
    }))

    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload)
    if (itemsError) {
        return { error: 'Erro ao associar itens de catálogo ao pedido.' }
    }

    // 8. Order Audit Trail Initiation
    await supabase.from('order_status_history').insert({
        order_id: newOrder.id,
        status: 'pending',
        notes: 'Pedido eletrônico submetido via carrinho.',
        changed_by: user.id,
    })

    // 9. Send Email Notifications (fire-and-forget)
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
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

        // Get order number
        const { data: orderDetail } = await supabase
            .from('orders')
            .select('order_number')
            .eq('id', newOrder.id)
            .single()

        const orderNumber = orderDetail?.order_number || newOrder.id
        const commonProps = { systemName, appUrl }

        // Email to Admin: New Order
        if (adminEmail) {
            const { default: NewOrderEmail } = await import('@/emails/NewOrderEmail')
            sendEmail({
                to: adminEmail,
                subject: `🛒 Novo pedido #${orderNumber} — ${systemName}`,
                senderName: systemName,
                react: React.createElement(NewOrderEmail, {
                    orderNumber,
                    clientName,
                    companyName,
                    itemCount: validatedItems.length,
                    total: finalTotal,
                    ...commonProps,
                }),
            }).catch(() => {})
        }

        // Email to Client: Order Confirmation
        if (clientEmail) {
            const { default: OrderConfirmationEmail } = await import('@/emails/OrderConfirmationEmail')
            sendEmail({
                to: clientEmail,
                subject: `📋 Pedido #${orderNumber} confirmado — ${systemName}`,
                senderName: systemName,
                react: React.createElement(OrderConfirmationEmail, {
                    orderNumber,
                    clientName,
                    items: validatedItems.map(item => ({
                        productName: item.productName,
                        fabricName: item.fabricName,
                        colorName: item.colorName,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        subtotal: item.subtotal,
                    })),
                    subtotal: secureSubtotal,
                    discount: paymentDiscount,
                    total: finalTotal,
                    ...commonProps,
                }),
            }).catch(() => {})
        }
    } catch (emailError) {
        // Email failures should never block checkout
        console.error('[CHECKOUT EMAIL] Error:', emailError)
    }

    return { success: true, orderId: newOrder.id }
}
