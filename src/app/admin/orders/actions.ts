'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

type FiscalDocumentStorageRow = {
    id: string
    xml_envio_path: string | null
    xml_retorno_path: string | null
    xml_processado_path: string | null
    danfe_path: string | null
}

async function ensureAdminOrderAccess() {
    const supabase = await createServerClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Nao autorizado. Faca login novamente.' as const }
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || profile?.role !== 'admin') {
        return { error: 'Permissao negada para excluir pedidos.' as const }
    }

    return { supabase, userId: user.id as string }
}

export async function deleteOrderAction(orderId: string) {
    try {
        const access = await ensureAdminOrderAccess()
        if ('error' in access) {
            return { error: access.error }
        }
        const { supabase } = access

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

        const { data, error } = await supabase.rpc('admin_delete_order', {
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
                normalizedMessage.includes('pedido possui fatura vinculada') ||
                normalizedMessage.includes('invoices_order_id_fkey') ||
                (normalizedMessage.includes('table "invoices"') && normalizedMessage.includes('foreign key'))
            ) {
                return {
                    error: 'Este pedido possui fatura vinculada no financeiro e nao pode ser excluido ate a remocao ou cancelamento da fatura.',
                }
            }

            if (
                normalizedMessage.includes('pedido possui parada logistica ativa') ||
                normalizedMessage.includes('delivery_route_stops_order_id_fkey') ||
                (normalizedMessage.includes('table "delivery_route_stops"') && normalizedMessage.includes('foreign key'))
            ) {
                return {
                    error: 'Este pedido ainda possui uma parada logistica vinculada. Se a rota ja foi excluida, atualize a pagina e tente novamente; se a rota estiver ativa, remova a parada antes de excluir o pedido.',
                }
            }

            if (
                normalizedMessage.includes('fiscal_documents_order_id_fkey') ||
                (normalizedMessage.includes('table "fiscal_documents"') && normalizedMessage.includes('foreign key'))
            ) {
                return {
                    error: 'Este pedido possui NF-e vinculada e agora deve ser arquivado, nao excluido fisicamente. A migration de arquivamento fiscal do banco precisa ser aplicada antes de repetir a operacao.',
                }
            }

            return { error: error.message || 'Falha ao excluir o pedido no banco de dados.' }
        }

        const mode = typeof data === 'string' ? data : Array.isArray(data) ? data[0] : null

        if (mode === 'already_archived') {
            return { success: true, mode: 'archived' as const, alreadyArchived: true }
        }

        if (mode === 'archived') {
            return { success: true, mode: 'archived' as const }
        }

        return { success: true, mode: 'deleted' as const }
    } catch (e: unknown) {
        console.error('Erro na acao de exclusao de pedido:', e)
        return { error: 'Ocorreu um erro inesperado ao excluir o pedido.' }
    }
}

export async function hardDeleteArchivedOrderAction(orderId: string) {
    try {
        const access = await ensureAdminOrderAccess()
        if ('error' in access) {
            return { error: access.error }
        }

        const { supabase } = access
        const adminSupabase = createServiceRoleClient()

        const { data: orderRow, error: orderError } = await supabase
            .from('orders')
            .select('id, archived_at')
            .eq('id', orderId)
            .maybeSingle()

        if (orderError) {
            console.error('Falha ao validar pedido para hard delete:', orderError)
            return { error: 'Nao foi possivel validar o pedido antes do hard delete definitivo.' }
        }

        if (!orderRow) {
            return { success: true, alreadyDeleted: true }
        }

        if (!orderRow.archived_at) {
            return { error: 'Somente pedidos arquivados podem ser apagados definitivamente.' }
        }

        const { data: fiscalDocuments, error: fiscalDocumentsError } = await adminSupabase
            .from('fiscal_documents')
            .select('id, xml_envio_path, xml_retorno_path, xml_processado_path, danfe_path')
            .eq('order_id', orderId)

        if (fiscalDocumentsError) {
            console.error('Falha ao carregar documentos fiscais para hard delete:', fiscalDocumentsError)
            return { error: 'Nao foi possivel carregar os arquivos fiscais do pedido para limpeza definitiva.' }
        }

        const storagePaths = Array.from(
            new Set(
                ((fiscalDocuments || []) as FiscalDocumentStorageRow[])
                    .flatMap((document) => [
                        document.xml_envio_path,
                        document.xml_retorno_path,
                        document.xml_processado_path,
                        document.danfe_path,
                    ])
                    .map((path) => (path || '').trim())
                    .filter((path) => path.length > 0)
            )
        )

        if (storagePaths.length > 0) {
            const { error: storageError } = await adminSupabase.storage.from('fiscal-xml').remove(storagePaths)

            if (storageError) {
                console.error('Falha ao remover arquivos fiscais do storage:', storageError)
                return {
                    error: 'Falha ao remover DANFE/XML do storage fiscal. O hard delete foi bloqueado para evitar limpeza parcial.',
                }
            }
        }

        const { data, error } = await supabase.rpc('admin_hard_delete_archived_order', {
            p_order_id: orderId,
        })

        if (error) {
            console.error('Falha ao executar hard delete definitivo do pedido:', error)
            const normalizedMessage = (error.message || '').toLowerCase()

            if (normalizedMessage.includes('pedido nao encontrado')) {
                return { success: true, alreadyDeleted: true }
            }

            if (normalizedMessage.includes('arquivado')) {
                return { error: 'Somente pedidos arquivados podem ser apagados definitivamente.' }
            }

            return { error: error.message || 'Falha ao apagar definitivamente o pedido no banco de dados.' }
        }

        const mode = typeof data === 'string' ? data : Array.isArray(data) ? data[0] : null
        if (mode === 'already_deleted') {
            return { success: true, alreadyDeleted: true }
        }

        return { success: true, mode: 'hard_deleted' as const }
    } catch (e: unknown) {
        console.error('Erro na acao de hard delete definitivo do pedido:', e)
        return { error: 'Ocorreu um erro inesperado ao apagar definitivamente o pedido.' }
    }
}
