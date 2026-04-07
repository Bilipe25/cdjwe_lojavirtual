'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'

type RouteStopRouteRecord = {
    route_number?: string | null
    status?: string | null
    is_deleted?: boolean | null
}

type RouteStopRecord = {
    id: string
    route_id: string
    route?: RouteStopRouteRecord | RouteStopRouteRecord[] | null
}

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

        const { data: existingInvoice, error: invoiceError } = await supabase
            .from('invoices')
            .select('id, invoice_number, status')
            .eq('order_id', orderId)
            .limit(1)
            .maybeSingle()

        if (invoiceError) {
            console.error('Falha ao verificar fatura vinculada ao pedido:', invoiceError)
            return { error: 'Nao foi possivel validar se o pedido possui fatura vinculada.' }
        }

        if (existingInvoice) {
            return {
                error: `Este pedido possui a fatura ${existingInvoice.invoice_number || existingInvoice.id} vinculada. Exclua ou cancele a fatura primeiro no financeiro.`,
            }
        }

        const { data: routeStops, error: routeStopError } = await supabase
            .from('delivery_route_stops')
            .select('id, route_id, route:delivery_routes(route_number, status, is_deleted)')
            .eq('order_id', orderId)
            .limit(20)

        if (routeStopError) {
            console.error('Falha ao verificar rota vinculada ao pedido:', routeStopError)
            return { error: 'Nao foi possivel validar se o pedido esta vinculado a uma rota de entrega.' }
        }

        const routeStopRows = ((Array.isArray(routeStops) ? routeStops : []) as RouteStopRecord[]).map((routeStop) => {
            const resolvedRoute = Array.isArray(routeStop.route) ? (routeStop.route[0] || null) : (routeStop.route || null)
            return {
                ...routeStop,
                route: resolvedRoute,
            }
        })
        const activeRouteStop = routeStopRows.find((routeStop) => !routeStop.route?.is_deleted)

        if (activeRouteStop) {
            return {
                error: `Este pedido esta vinculado a uma rota de entrega (${activeRouteStop.route?.route_number || activeRouteStop.route_id}). Remova a parada da rota antes de excluir o pedido.`,
            }
        }

        const { error } = await supabase.rpc('admin_delete_order', {
            p_order_id: orderId,
        })

        if (error) {
            console.error('Falha ao excluir pedido:', error)
            const normalizedMessage = (error.message || '').toLowerCase()

            if (normalizedMessage.includes('pedido nao encontrado') || normalizedMessage.includes('pedido nao encontrado')) {
                return { success: true, alreadyDeleted: true }
            }

            if (normalizedMessage.includes('order_status_history') && normalizedMessage.includes('append-only')) {
                return {
                    error: 'A exclusao foi bloqueada pela protecao append-only do historico do pedido. A migration corretiva do banco precisa ser aplicada.',
                }
            }

            if (normalizedMessage.includes('route_events') && normalizedMessage.includes('append-only')) {
                return {
                    error: 'A exclusao encontrou um vinculo residual em historico logistico append-only. A migration corretiva do banco para limpeza de paradas de rotas excluidas precisa ser aplicada.',
                }
            }

            if (
                normalizedMessage.includes('invoices_order_id_fkey') ||
                (normalizedMessage.includes('table "invoices"') && normalizedMessage.includes('foreign key'))
            ) {
                return {
                    error: 'Este pedido possui fatura vinculada no financeiro e nao pode ser excluido ate a remocao ou cancelamento da fatura.',
                }
            }

            if (
                normalizedMessage.includes('delivery_route_stops_order_id_fkey') ||
                (normalizedMessage.includes('table "delivery_route_stops"') && normalizedMessage.includes('foreign key'))
            ) {
                return {
                    error: 'Este pedido ainda possui uma parada logistica vinculada. Se a rota ja foi excluida, atualize a pagina e tente novamente; se a rota estiver ativa, remova a parada antes de excluir o pedido.',
                }
            }

            return { error: error.message || 'Falha ao excluir o pedido no banco de dados.' }
        }

        return { success: true }
    } catch (e: unknown) {
        console.error('Erro na acao de exclusao de pedido:', e)
        return { error: 'Ocorreu um erro inesperado ao excluir o pedido.' }
    }
}
