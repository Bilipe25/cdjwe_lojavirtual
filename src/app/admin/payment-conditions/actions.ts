'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const paymentConditionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  description: z.string().nullable().optional(),
  installments: z.number().int().min(1).max(100),
  discount_percentage: z.number().min(0).max(100),
  surcharge_percentage: z.number().min(0).max(100),
  min_installment_value: z.number().min(0).default(0),
  min_order_value: z.number().min(0).default(0),
  max_order_value: z.number().min(0).nullable().optional(),
  icon: z.string().nullable().optional(),
  is_active: z.boolean(),
  sort_order: z.number().int().optional(),
})

export async function savePaymentCondition(formData: z.infer<typeof paymentConditionSchema>) {
  const result = paymentConditionSchema.safeParse(formData)
  if (!result.success) {
    return { error: 'Dados inválidos.', details: result.error.flatten().fieldErrors }
  }

  const { 
    id, name, description, installments, 
    discount_percentage, surcharge_percentage, 
    min_installment_value, min_order_value, max_order_value,
    icon, is_active 
  } = result.data
  const supabase = await createClient()

  try {
    if (id) {
      // Update
      const { error } = await supabase
        .from('payment_conditions')
        .update({
          name,
          description,
          installments,
          discount_percentage,
          surcharge_percentage,
          min_installment_value,
          min_order_value,
          max_order_value,
          icon,
          is_active
        })
        .eq('id', id)

      if (error) throw error
      revalidatePath('/admin/payment-conditions')
      return { success: true }
    } else {
      // Create - get max sort order first
      const { data: conditions } = await supabase
        .from('payment_conditions')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        
      const nextSortOrder = (conditions?.[0]?.sort_order || 0) + 1

      const { error } = await supabase
        .from('payment_conditions')
        .insert({
          name,
          description,
          installments,
          discount_percentage,
          surcharge_percentage,
          min_installment_value,
          min_order_value,
          max_order_value,
          icon,
          is_active,
          sort_order: nextSortOrder
        })

      if (error) throw error
      revalidatePath('/admin/payment-conditions')
      return { success: true }
    }
  } catch (error: any) {
    console.error('Save Payment Condition Error:', error)
    return { error: error.message || 'Falha ao salvar a condição de pagamento.' }
  }
}

export async function deletePaymentCondition(id: string) {
  const supabase = await createClient()

  try {
    // Check constraints first to avoid cryptic DB errors
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_condition_id', id)
      
    if (countError) throw countError
    
    if (count && count > 0) {
      return { error: `Não é possível excluir: Esta condição está vinculada a ${count} pedido(s). Em vez disso, marque-a como inativa.` }
    }

    const { error } = await supabase
      .from('payment_conditions')
      .delete()
      .eq('id', id)

    if (error) throw error
    revalidatePath('/admin/payment-conditions')
    return { success: true }
  } catch (error: any) {
    console.error('Delete Payment Condition Error:', error)
    return { error: error.message || 'Falha ao remover a condição de pagamento.' }
  }
}

export async function reorderPaymentConditions(updates: { id: string, sort_order: number }[]) {
  const supabase = await createClient()
  
  try {
    // Perform updates in parallel
    const promises = updates.map(update => 
      supabase
        .from('payment_conditions')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)
    )
    
    const results = await Promise.all(promises)
    const hasError = results.some((r: any) => r.error)
    
    if (hasError) throw new Error('Algumas atualizações falharam.')
    
    revalidatePath('/admin/payment-conditions')
    return { success: true }
  } catch (error: any) {
    console.error('Reorder Payment Conditions Error:', error)
    return { error: error.message || 'Falha ao reordenar as condições de pagamento.' }
  }
}
