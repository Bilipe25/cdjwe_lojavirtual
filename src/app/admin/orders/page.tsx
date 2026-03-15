'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { OrderStatus } from '@/lib/types'
import { buildOrderStatusAuditNote } from '@/lib/orders/order-communication'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Components
import { OrderFilters, statusConfig } from './components/OrderFilters'
import { OrderList, OrderWithDetails } from './components/OrderList'
import { OrderDetailModal } from './components/OrderDetailModal'

// Actions
import { deleteOrderAction } from './actions'

const ITEMS_PER_PAGE = 15;

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<OrderWithDetails[]>([])
    const [loading, setLoading] = useState(true)
    
    // Server-Side Search & Filters
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    // Interactivity
    const [selectedOrders, setSelectedOrders] = useState<string[]>([])
    const [selectedOrderDetail, setSelectedOrderDetail] = useState<OrderWithDetails | null>(null)

    const loadOrders = useCallback(async () => {
        setLoading(true)
        const supabase = createClient()
        
        let query = supabase
            .from('orders')
            .select(`
                *,
                store:stores(company_name, cnpj),
                profile:profiles(full_name),
                items:order_items(*),
                payment_condition:payment_conditions(name)
            `, { count: 'exact' })
            
        // Filters
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter)
        }
        
        // Complex Server-Side Search (ilike crossing multiple fields)
        if (search) {
            query = query.or(`order_number.ilike.%${search}%, notes.ilike.%${search}%`)
            // Ideally backend would have full-text search capability configured to join names,
            // As Fallback we are using standard ilike on the main table for safety.
        }

        // Pagination
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE - 1;
        
        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(start, end)

        if (error) {
            toast.error('Erro ao carregar os pedidos do servidor.')
        } else {
            // Further in-memory filter if cross-table search is needed (workaround for Supabase .or relationship limits without RPC)
            let finalData = data as OrderWithDetails[];
            if (search) {
                const s = search.toLowerCase();
                finalData = (data as OrderWithDetails[]).filter(o => 
                    o.order_number.toLowerCase().includes(s) ||
                    o.store?.company_name?.toLowerCase().includes(s) ||
                    o.store?.cnpj?.includes(s) ||
                    o.profile?.full_name?.toLowerCase().includes(s)
                );
            }
            setOrders(finalData)
            setTotalCount(count || 0)
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
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId)

        if (error) {
            toast.error('Erro ao atualizar status do pedido ' + orderId)
            return false;
        }

        // Add to history (The Audit Trail)
        if (user) {
            await supabase.from('order_status_history').insert({
                order_id: orderId,
                status: newStatus,
                notes: buildOrderStatusAuditNote(newStatus),
                changed_by: user.id,
            })
        }

        // Send status update email to client
        const order = orders.find(o => o.id === orderId)
        if (order?.order_number) {
            // Fetch client email from order's profile
            const { data: orderData } = await supabase
                .from('orders')
                .select('profile_id, profiles:profile_id(email, full_name)')
                .eq('id', orderId)
                .single()

            const clientProfile = (orderData as { profiles?: { email?: string | null; full_name?: string | null } | null } | null)?.profiles
            if (clientProfile?.email) {
                fetch('/api/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'order_status',
                        payload: {
                            orderId,
                            orderNumber: order.order_number,
                            clientName: clientProfile.full_name,
                            clientEmail: clientProfile.email,
                            newStatus,
                        },
                    }),
                }).catch(() => {})
            }
        }

        if (!skipRefresh) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
            if (selectedOrderDetail?.id === orderId) {
                setSelectedOrderDetail(prev => prev ? { ...prev, status: newStatus } : null)
            }
            toast.success(`Pedido atualizado para: ${statusConfig[newStatus].label}`)
        }
        return true;
    }

    // Enterprise Feature: Bulk Actions
    const handleBulkUpdateStatus = async (newStatus: OrderStatus) => {
        if (selectedOrders.length === 0) return;
        
        const confirm = window.confirm(`Tem certeza que deseja marcar ${selectedOrders.length} pedido(s) como "${statusConfig[newStatus].label}"?`);
        if (!confirm) return;

        const promises = selectedOrders.map(id => updateOrderStatus(id, newStatus, true));
        await Promise.all(promises);
        
        toast.success(`${selectedOrders.length} pedido(s) atualizado(s) com sucesso para "${statusConfig[newStatus].label}"!`);
        setSelectedOrders([]);
        loadOrders(); // Bruteforce refresh to get accurate data and timeline configs
    }

    const deleteOrder = async (orderId: string) => {
        const result = await deleteOrderAction(orderId)

        if (result.error) {
            toast.error(result.error)
            return false
        }

        setOrders(prev => prev.filter(o => o.id !== orderId))
        if (selectedOrderDetail?.id === orderId) {
            setSelectedOrderDetail(null)
        }
        toast.success('Pedido excluído com sucesso.')
        return true
    }

    const toggleSelectOrder = (id: string) => {
        setSelectedOrders(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    // CSV Download directly from DB state instead of limited local memory
    const exportCSV = async () => {
        toast.message('Preparando arquivo CSV...', { description: 'Buscando todos os registros...' })
        const supabase = createClient()
        
        let query = supabase.from('orders').select(`
            *, store:stores(company_name, cnpj), profile:profiles(full_name)
        `)
        if (statusFilter !== 'all') query = query.eq('status', statusFilter)

        const { data, error } = await query;
        if (error || !data) {
            toast.error('Erro ao exportar base de dados.')
            return;
        }

        const csv = [
            ['ID', 'Pedido', 'Cliente', 'CNPJ/Empresa', 'Status', 'Total', 'Data'].join(','),
            ...data.map(o => [
                o.id,
                o.order_number,
                `"${o.profile?.full_name || ''}"`,
                `"${o.store?.cnpj || ''} - ${o.store?.company_name || ''}"`,
                statusConfig[o.status as OrderStatus]?.label || o.status,
                o.total.toFixed(2),
                format(new Date(o.created_at), 'dd/MM/yyyy'),
            ].join(','))
        ].join('\n')

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `relatorio_pedidos_${format(new Date(), 'yyyy-MM-dd')}.csv`
        a.click()
        toast.success('Arquivo CSV baixado com sucesso!')
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
                selectedOrders={selectedOrders}
                onToggleSelect={toggleSelectOrder}
                onViewDetail={setSelectedOrderDetail}
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

            {/* Enterprise Detail Drawer Modal */}
            <OrderDetailModal 
                order={selectedOrderDetail}
                open={!!selectedOrderDetail}
                onOpenChange={(open) => !open && setSelectedOrderDetail(null)}
                onDelete={deleteOrder}
            />
        </div>
    )
}
