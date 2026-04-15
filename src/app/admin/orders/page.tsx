'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { OrderStatus } from '@/lib/types'
import { buildOrderStatusAuditNote } from '@/lib/orders/order-communication'
import { canTransitionOrderStatus } from '@/lib/orders/order-status-transition'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Components
import { OrderFilters, statusConfig } from './components/OrderFilters'
import { OrderList, OrderWithDetails } from './components/OrderList'

// Actions
import { deleteOrderAction } from './actions'

const ITEMS_PER_PAGE = 15;

type AdminOrdersSearchRpcRow = {
    id: string
    order_number: string
    status: string
    total: number
    subtotal: number
    discount_amount: number
    created_at: string
    notes: string | null
    store_company_name: string | null
    store_cnpj: string | null
    profile_full_name: string | null
    payment_condition_name: string | null
    item_count: number | null
    total_count: number | null
    sales_channel?: string | null
    created_by_full_name?: string | null
}

type AdminOrderStatusUpdateRpcRow = {
    order_id: string
    order_number: string
    previous_status: string
    new_status: string
    profile_id: string | null
    client_email: string | null
    client_name: string | null
    changed: boolean
}

type AdminOrderBulkStatusUpdateRpcRow = {
    order_id: string
    order_number: string | null
    previous_status: string | null
    new_status: string | null
    client_email: string | null
    client_name: string | null
    changed: boolean
    success: boolean
    error_message: string | null
}

type AdminOrderListEnrichmentRow = {
    id: string
    sales_channel: 'customer_portal' | 'representative' | null
    customer_profile?: { full_name?: string | null } | null
    created_by_profile?: { full_name?: string | null; role?: string | null } | null
    items?: Array<{ count?: number | null }>
    invoices?: Array<{ id: string }>
}

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<OrderWithDetails[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingOrderIds, setDeletingOrderIds] = useState<string[]>([])
    const deletingOrderIdsRef = useRef<Set<string>>(new Set())
    
    // Server-Side Search & Filters
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    // Interactivity
    const [selectedOrders, setSelectedOrders] = useState<string[]>([])

    const loadOrders = useCallback(async () => {
        setLoading(true)
        const supabase = createClient()
        const searchTerm = search.trim()

        const { data, error } = await supabase.rpc('admin_search_orders_paginated', {
            p_search: searchTerm.length > 0 ? searchTerm : null,
            p_status: statusFilter === 'all' ? null : statusFilter,
            p_page: currentPage,
            p_page_size: ITEMS_PER_PAGE,
        })

        if (error) {
            toast.error('Erro ao carregar os pedidos do servidor.')
        } else {
            const rows = (data || []) as AdminOrdersSearchRpcRow[]
            const orderIds = rows.map((row) => row.id)
            const enrichmentById = new Map<string, {
                salesChannel: 'customer_portal' | 'representative' | null
                customerName: string
                representativeName: string
                itemCount: number
                hasInvoice: boolean
            }>()

            if (orderIds.length > 0) {
                const { data: enrichmentData, error: enrichmentError } = await supabase
                    .from('orders')
                    .select(`
                        id,
                        sales_channel,
                        customer_profile:profiles!orders_profile_id_fkey(full_name),
                        created_by_profile:profiles!orders_created_by_profile_id_fkey(full_name, role),
                        items:order_items(count),
                        invoices(id)
                    `)
                    .in('id', orderIds)

                if (enrichmentError) {
                    console.error('[ADMIN ORDERS] Falha ao enriquecer lista de pedidos:', enrichmentError)
                } else {
                    ;((enrichmentData || []) as AdminOrderListEnrichmentRow[]).forEach((row) => {
                        enrichmentById.set(row.id, {
                            salesChannel: row.sales_channel || null,
                            customerName: row.customer_profile?.full_name || '',
                            representativeName: row.created_by_profile?.full_name || '',
                            itemCount: Number(row.items?.[0]?.count || 0),
                            hasInvoice: Array.isArray(row.invoices) && row.invoices.length > 0,
                        })
                    })
                }
            }

            // Fiscal enrichment: get latest fiscal document status per order
            const fiscalStatusById = new Map<string, string>()
            if (orderIds.length > 0) {
                const { data: fiscalData } = await supabase
                    .from('fiscal_documents')
                    .select('order_id, document_status')
                    .in('order_id', orderIds)
                    .order('created_at', { ascending: false })

                if (fiscalData) {
                    // Only keep the most recent per order
                    for (const fd of fiscalData) {
                        if (!fiscalStatusById.has(fd.order_id)) {
                            fiscalStatusById.set(fd.order_id, fd.document_status)
                        }
                    }
                }
            }

            const mapped = rows.map((order) => {
                const enrichment = enrichmentById.get(order.id)
                const customerName = order.profile_full_name || enrichment?.customerName || ''
                const representativeName = order.created_by_full_name || enrichment?.representativeName || ''
                const salesChannel = (order.sales_channel || enrichment?.salesChannel || 'customer_portal') as 'customer_portal' | 'representative'
                const itemCount = enrichment ? enrichment.itemCount : Number(order.item_count || 0)

                return {
                    id: order.id,
                    order_number: order.order_number,
                    status: order.status as OrderStatus,
                    total: Number(order.total || 0),
                    subtotal: Number(order.subtotal || 0),
                    discount_amount: Number(order.discount_amount || 0),
                    created_at: order.created_at,
                    notes: order.notes,
                    store: {
                        company_name: order.store_company_name || '',
                        cnpj: order.store_cnpj || '',
                    },
                    profile: {
                        full_name: customerName,
                    },
                    customer_profile: {
                        full_name: customerName,
                    },
                    created_by_profile: representativeName
                        ? { full_name: representativeName }
                        : undefined,
                    payment_condition: {
                        name: order.payment_condition_name || '',
                    },
                    item_count: itemCount,
                    sales_channel: salesChannel,
                    fiscal_status: fiscalStatusById.get(order.id) || null,
                    has_invoice: Boolean(enrichment?.hasInvoice),
                }
            })
            setOrders(mapped)
            setTotalCount(rows.length > 0 ? Number(rows[0].total_count || 0) : 0)
        }
        
        setLoading(false)
        setSelectedOrders([]) // Reset selection on page change
    }, [currentPage, search, statusFilter])

    // Re-fetch when dependencies change
    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadOrders()
        }, 0)

        return () => window.clearTimeout(timer)
    }, [loadOrders])

    const updateOrderStatus = async (orderId: string, newStatus: OrderStatus, skipRefresh = false) => {
        const currentStatus =
            orders.find((order) => order.id === orderId)?.status || null

        if (currentStatus) {
            if (currentStatus === newStatus) return true
            if (!canTransitionOrderStatus(currentStatus, newStatus)) {
                toast.error('Transição de status inválida para este pedido.')
                return false
            }
        }

        const supabase = createClient()
        const { data: rpcData, error } = await supabase.rpc('admin_update_order_status_atomic', {
            p_order_id: orderId,
            p_new_status: newStatus,
            p_notes: buildOrderStatusAuditNote(newStatus),
        })

        if (error) {
            toast.error(error.message || 'Erro ao atualizar status do pedido.')
            return false
        }

        const rpcRow = (rpcData as AdminOrderStatusUpdateRpcRow[] | null)?.[0] || null
        if (!rpcRow) {
            toast.error('Resposta invalida ao atualizar status do pedido.')
            return false
        }

        // Send status update email to client
        if (rpcRow.changed && rpcRow.client_email) {
            const localOrder = orders.find((o) => o.id === orderId)
            const orderNumber = rpcRow.order_number || localOrder?.order_number
            if (orderNumber) {
                fetch('/api/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'order_status',
                        payload: {
                            orderId,
                            orderNumber,
                            clientName: rpcRow.client_name,
                            clientEmail: rpcRow.client_email,
                            newStatus,
                        },
                    }),
                }).catch(() => {})
            }
        }

        if (!skipRefresh) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
            toast.success(`Pedido atualizado para: ${statusConfig[newStatus].label}`)
        }
        return true;
    }

    // Enterprise Feature: Bulk Actions
    const handleBulkUpdateStatus = async (newStatus: OrderStatus) => {
        if (selectedOrders.length === 0) return;
        
        const confirm = window.confirm(`Tem certeza que deseja marcar ${selectedOrders.length} pedido(s) como "${statusConfig[newStatus].label}"?`);
        if (!confirm) return;

        const supabase = createClient()
        const { data, error } = await supabase.rpc('admin_bulk_update_order_status_atomic', {
            p_order_ids: selectedOrders,
            p_new_status: newStatus,
            p_notes: buildOrderStatusAuditNote(newStatus),
        })

        if (error) {
            toast.error(error.message || 'Erro ao atualizar pedidos em lote.')
            return
        }

        const rows = (data || []) as AdminOrderBulkStatusUpdateRpcRow[]
        const successRows = rows.filter((row) => row.success)
        const changedRows = successRows.filter((row) => row.changed)
        const failedRows = rows.filter((row) => !row.success)

        changedRows.forEach((row) => {
            const orderNumber = row.order_number || orders.find((order) => order.id === row.order_id)?.order_number
            if (!orderNumber || !row.client_email) return
            fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'order_status',
                    payload: {
                        orderId: row.order_id,
                        orderNumber,
                        clientName: row.client_name,
                        clientEmail: row.client_email,
                        newStatus,
                    },
                }),
            }).catch(() => {})
        })

        const changedIds = new Set(changedRows.map((row) => row.order_id))
        if (changedIds.size > 0) {
            setOrders((prev) => prev.map((order) => (
                changedIds.has(order.id) ? { ...order, status: newStatus } : order
            )))
        }

        if (changedRows.length > 0) {
            toast.success(`${changedRows.length} pedido(s) atualizado(s) para "${statusConfig[newStatus].label}".`)
        }
        if (failedRows.length > 0) {
            const firstError = failedRows[0]?.error_message ? ` (${failedRows[0].error_message})` : ''
            toast.error(`${failedRows.length} pedido(s) não puderam ser atualizados${firstError}`)
        } else if (changedRows.length === 0 && successRows.length > 0) {
            toast.message('Nenhum pedido precisou de alteração de status.')
        }

        setSelectedOrders([])
        void loadOrders()
    }

    const deleteOrder = async (orderId: string) => {
        if (deletingOrderIdsRef.current.has(orderId)) {
            return false
        }

        deletingOrderIdsRef.current.add(orderId)
        setDeletingOrderIds((prev) => [...prev, orderId])

        try {
            const result = await deleteOrderAction(orderId)

            if (result.error) {
                toast.error(result.error)
                return false
            }

            setOrders((prev) => prev.filter((order) => order.id !== orderId))
            setSelectedOrders((prev) => prev.filter((id) => id !== orderId))

            toast.success(
                'alreadyDeleted' in result && result.alreadyDeleted
                    ? 'Pedido ja havia sido excluido e a tela foi sincronizada.'
                    : 'Pedido excluido com sucesso.'
            )
            return true
        } finally {
            deletingOrderIdsRef.current.delete(orderId)
            setDeletingOrderIds((prev) => prev.filter((id) => id !== orderId))
        }
    }

    const toggleSelectOrder = (id: string) => {
        setSelectedOrders(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    // CSV Download directly from DB state instead of limited local memory
    const exportCSV = async () => {
        toast.message('Preparando arquivo CSV...', { description: 'Buscando todos os registros no servidor...' })
        const params = new URLSearchParams()
        const searchTerm = search.trim()
        if (searchTerm) params.set('q', searchTerm)
        if (statusFilter !== 'all') params.set('status', statusFilter)

        try {
            const query = params.toString()
            const response = await fetch(`/api/admin/orders/export${query ? `?${query}` : ''}`, {
                method: 'GET',
                credentials: 'include',
            })

            if (!response.ok) {
                const body = await response.json().catch(() => null)
                throw new Error(body?.error || 'Erro ao exportar base de dados.')
            }

            const csv = await response.text()
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url

            const disposition = response.headers.get('Content-Disposition') || ''
            const fileNameMatch = disposition.match(/filename=\"?([^"]+)\"?/)
            link.download = fileNameMatch?.[1] || 'relatorio_pedidos.csv'

            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
            toast.success('Arquivo CSV baixado com sucesso!')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao exportar base de dados.'
            toast.error(message)
        }
    }

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Pedidos
                    </h1>
                    <p className="text-muted-foreground mt-1">Gerencie a entrada financeira da loja de forma unificada.</p>
                </div>
            </div>

            {/* Smart Filters Header */}
            <OrderFilters 
                currentSearch={search}
                onSearch={(term) => { setSearch(term); setCurrentPage(1); }}
                currentStatus={statusFilter}
                onStatusChange={(status) => { setStatusFilter(status || 'all'); setCurrentPage(1); }}
                onExport={exportCSV}
                selectedCount={selectedOrders.length}
                onBulkUpdateStatus={handleBulkUpdateStatus}
            />

            {/* Card List Area */}
            <OrderList 
                orders={orders}
                loading={loading}
                deletingOrderIds={deletingOrderIds}
                selectedOrders={selectedOrders}
                onToggleSelect={toggleSelectOrder}
                onUpdateStatus={updateOrderStatus}
                onDelete={deleteOrder}
            />

            {/* Next/Prev Server Pagination */}
            {!loading && totalCount > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                        Mostrando <span className="font-medium text-navy">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> a <span className="font-medium text-navy">{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> de <span className="font-bold">{totalCount}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                            Próxima <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

        </div>
    )
}


