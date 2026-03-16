'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'

export async function deleteOrderAction(orderId: string) {
    try {
        const supabase = await createServerClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return { error: 'Nao autorizado. Faca login novamente.' }
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profileError || profile?.role !== 'admin') {
            return { error: 'Permissao negada para excluir pedidos.' }
        }

        const { error } = await supabase.rpc('admin_delete_order', {
            p_order_id: orderId,
        })

        if (error) {
            console.error('Falha ao excluir pedido:', error)
            return { error: 'Falha ao excluir o pedido no banco de dados.' }
        }

        return { success: true }
    } catch (e: unknown) {
        console.error('Erro na acao de exclusao de pedido:', e)
        return { error: 'Ocorreu um erro inesperado ao excluir o pedido.' }
    }
}
