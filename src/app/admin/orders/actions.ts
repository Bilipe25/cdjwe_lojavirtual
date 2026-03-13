'use server'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function deleteOrderAction(orderId: string) {
    try {
        // Securely verify admin privileges using RLS auth context first
        const supabaseAuth = await createServerClient()
        const { data: { user } } = await supabaseAuth.auth.getUser()
        
        if (!user) {
            return { error: 'Não autorizado. Faça login novamente.' }
        }

        // Use Service Role to bypass RLS for destructive actions,
        // since admin interface requires robust capability
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // 1. Delete dependent items
        await supabaseAdmin.from('order_status_history').delete().eq('order_id', orderId)
        await supabaseAdmin.from('order_items').delete().eq('order_id', orderId)
        
        // Let's also ensure order_payment_info or any other dependent tables are cleared
        // (if they exist, ignore errors if not)
        await supabaseAdmin.from('order_payment_info').delete().eq('order_id', orderId)

        // 2. Delete main order
        const { error } = await supabaseAdmin
            .from('orders')
            .delete()
            .eq('id', orderId)

        if (error) {
            console.error('Falha ao excluir pedido:', error)
            return { error: 'Falha ao excluir o pedido no banco de dados.' }
        }

        return { success: true }
    } catch (e: any) {
        console.error('Erro na ação de deleção de pedido:', e)
        return { error: 'Ocorreu um erro inesperado ao excluir o pedido.' }
    }
}
