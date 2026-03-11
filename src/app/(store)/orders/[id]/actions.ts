'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { revalidatePath } from 'next/cache'

export async function cancelOrderAction(orderId: string) {
    try {
        const supabase = await createClient()
        
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Não autenticado.' }

        // Fetch order to verify ownership
        const { data: order } = await supabase
            .from('orders')
            .select('id, status, profile_id')
            .eq('id', orderId)
            .single()

        if (!order) return { error: 'Pedido não encontrado.' }
        if (order.profile_id !== user.id) return { error: 'Acesso negado.' }
        if (order.status !== 'pending') return { error: 'Apenas pedidos "Em Análise" podem ser cancelados.' }

        // Use service role to bypass RLS for updating the order
        const adminSupabase = createServiceRoleClient()
        
        const { error: updateError } = await adminSupabase
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('id', orderId)

        if (updateError) throw updateError

        // Add history
        await adminSupabase
            .from('order_status_history')
            .insert({
                order_id: orderId,
                status: 'cancelled',
                notes: 'Cancelado pelo cliente',
                changed_by: user.id
            })

        revalidatePath(`/orders/${orderId}`)
        revalidatePath('/orders')
        return { success: true }
    } catch (err: any) {
        return { error: err.message || 'Erro ao cancelar pedido.' }
    }
}
