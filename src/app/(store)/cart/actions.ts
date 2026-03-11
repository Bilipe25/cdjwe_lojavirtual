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

    let secureSubtotal = 0;
    const validatedItems = items.map(clientItem => {
        // Find the database variant
        const dbVariant = variantsData.find(v => v.id === clientItem.variantId)
        if (!dbVariant) throw new Error(`Produto não encontrado no sistema: ${clientItem.productName}`)
        
        const basePrice = (dbVariant.product as any)?.base_price || 0
        const fabricMod = (dbVariant.fabric as any)?.price_modifier || 0
        
        // Exact same pricing logic applied to frontend, but enforced at the hardware level
        const realUnitPrice = dbVariant.price_override ?? (basePrice + fabricMod)
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

    // 5. Calculate Payment Discounts
    const { data: paymentRule } = await supabase
        .from('payment_conditions')
        .select('discount_percentage')
        .eq('id', selectedPaymentId)
        .single()

    const discountPercentage = paymentRule?.discount_percentage || 0
    const paymentDiscount = (secureSubtotal * discountPercentage) / 100
    const finalTotal = secureSubtotal - paymentDiscount

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

    return { success: true, orderId: newOrder.id }
}
