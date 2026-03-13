'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PriceTablePaymentRule } from '@/lib/types'

export async function getPaymentRulesAction(priceTableId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('price_table_payment_rules')
        .select('*')
        .eq('price_table_id', priceTableId)
        .order('min_order_value', { ascending: true })

    if (error) {
        console.error('Error fetching payment rules:', error)
        return { error: 'Erro ao buscar regras de pagamento' }
    }

    return { data: data as PriceTablePaymentRule[] }
}

export async function savePaymentRuleAction(rule: Partial<PriceTablePaymentRule> & { price_table_id: string }) {
    const supabase = await createClient()
    
    // Convert comma separated days to array if needed or keep as string
    // The schema says TEXT for installment_days, we'll keep it simple
    
    const ruleId = rule.id
    const payload = { ...rule }
    delete payload.id

    if (ruleId) {
        const { error } = await supabase
            .from('price_table_payment_rules')
            .update(payload)
            .eq('id', ruleId)

        if (error) {
            console.error('Error updating payment rule:', error)
            return { error: 'Erro ao atualizar regra de pagamento' }
        }
    } else {
        const { error } = await supabase
            .from('price_table_payment_rules')
            .insert(payload)

        if (error) {
            console.error('Error creating payment rule:', error)
            return { error: 'Erro ao criar regra de pagamento' }
        }
    }

    revalidatePath('/admin/price-tables')
    return { success: true }
}

export async function deletePaymentRuleAction(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('price_table_payment_rules')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting payment rule:', error)
        return { error: 'Erro ao excluir regra de pagamento' }
    }

    revalidatePath('/admin/price-tables')
    return { success: true }
}
