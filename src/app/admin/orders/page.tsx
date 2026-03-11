'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    ClipboardList,
    Search,
    MoreHorizontal,
    Eye,
    CheckCircle,
    Truck,
    Factory,
    XCircle,
    Package,
    Download,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Order, OrderStatus } from '@/lib/types'

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Em Análise', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: ClipboardList },
    approved: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle },
    in_production: { label: 'Em Produção', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Factory },
    shipped: { label: 'Enviado', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: Truck },
    delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200', icon: Package },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
}

const statusFlow: OrderStatus[] = ['pending', 'approved', 'in_production', 'shipped', 'delivered']

type OrderWithDetails = Order & {
    store?: { company_name: string }
    profile?: { full_name: string }
    items?: Array<{
        id: string
        product_name: string
        fabric_name: string
        color_name: string
        size: string | null
        quantity: number
        unit_price: number
        subtotal: number
    }>
    payment_condition?: { name: string }
}

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<OrderWithDetails[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null)

    useEffect(() => {
        loadOrders()
    }, [])

    const loadOrders = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data } = await supabase
            .from('orders')
            .select(`
        *,
        store:stores(company_name),
        profile:profiles(full_name),
        items:order_items(*),
        payment_condition:payment_conditions(name)
      `)
            .order('created_at', { ascending: false })

        if (data) setOrders(data as OrderWithDetails[])
        setLoading(false)
    }

    const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId)

        if (error) {
            toast.error('Erro ao atualizar status')
            return
        }

        // Add to history
        if (user) {
            await supabase.from('order_status_history').insert({
                order_id: orderId,
                status: newStatus,
                changed_by: user.id,
            })
        }

        setOrders(prev =>
            prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
        )
        if (selectedOrder?.id === orderId) {
            setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null)
        }
        toast.success(`Pedido atualizado para: ${statusConfig[newStatus].label}`)
    }

    const exportCSV = () => {
        const csv = [
            ['Pedido', 'Cliente', 'Empresa', 'Status', 'Total', 'Data'].join(','),
            ...filtered.map(o => [
                o.order_number,
                o.profile?.full_name || '',
                o.store?.company_name || '',
                statusConfig[o.status as OrderStatus]?.label || o.status,
                o.total.toFixed(2),
                format(new Date(o.created_at), 'dd/MM/yyyy'),
            ].join(','))
        ].join('\n')

        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `pedidos_${format(new Date(), 'yyyy-MM-dd')}.csv`
        a.click()
        toast.success('CSV exportado!')
    }

    const filtered = orders.filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false
        if (search) {
            const s = search.toLowerCase()
            return (
                o.order_number.toLowerCase().includes(s) ||
                o.store?.company_name?.toLowerCase().includes(s) ||
                o.profile?.full_name?.toLowerCase().includes(s)
            )
        }
        return true
    })

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                        Pedidos
                    </h1>
                    <p className="text-muted-foreground mt-1">Gerencie todos os pedidos</p>
                </div>
                <Button variant="outline" className="gap-2" onClick={exportCSV}>
                    <Download className="h-4 w-4" />
                    Exportar CSV
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por nº, cliente, empresa..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-9 h-11 bg-white/60" />
                </div>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(Object.keys(statusConfig) as OrderStatus[]).map(s => (
                            <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Status Summary */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {(Object.keys(statusConfig) as OrderStatus[]).map(s => {
                    const count = orders.filter(o => o.status === s).length
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${statusFilter === s ? statusConfig[s].color + ' shadow-sm' : 'bg-white/60 text-muted-foreground border-border hover:bg-muted'
                                }`}
                        >
                            {statusConfig[s].label} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Orders List */}
            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Card key={i} className="glass-card border-0"><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                        <ClipboardList className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((order, i) => {
                        const config = statusConfig[order.status as OrderStatus]
                        return (
                            <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                                <Card className="glass-card border-0 hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                                                    <config.icon className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="font-semibold">{order.order_number}</h3>
                                                        <Badge className={`text-[10px] border ${config.color}`}>{config.label}</Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground truncate">
                                                        {order.store?.company_name || 'Cliente'} • {order.profile?.full_name} • {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'itens'} • {order.payment_condition?.name || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-lg font-bold text-gradient-bronze">
                                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                                                            <Eye className="h-4 w-4 mr-2" />Ver Detalhes
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        {statusFlow.map((s) => {
                                                            if (s === order.status) return null
                                                            return (
                                                                <DropdownMenuItem key={s} onClick={() => updateOrderStatus(order.id, s)}>
                                                                    {React.createElement(statusConfig[s].icon, { className: 'h-4 w-4 mr-2' })}
                                                                    {statusConfig[s].label}
                                                                </DropdownMenuItem>
                                                            )
                                                        })}
                                                        {order.status !== 'cancelled' && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'cancelled')} className="text-destructive">
                                                                    <XCircle className="h-4 w-4 mr-2" />Cancelar
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            {/* Order Detail Dialog */}
            <Dialog open={!!selectedOrder} onOpenChange={(o: boolean) => !o && setSelectedOrder(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)]">
                            Pedido {selectedOrder?.order_number}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedOrder && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><p className="text-muted-foreground">Cliente</p><p className="font-medium">{selectedOrder.profile?.full_name}</p></div>
                                <div><p className="text-muted-foreground">Empresa</p><p className="font-medium">{selectedOrder.store?.company_name}</p></div>
                                <div><p className="text-muted-foreground">Data</p><p className="font-medium">{format(new Date(selectedOrder.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p></div>
                                <div><p className="text-muted-foreground">Pagamento</p><p className="font-medium">{selectedOrder.payment_condition?.name || 'N/A'}</p></div>
                            </div>
                            <Separator />
                            <h4 className="font-semibold">Itens do Pedido</h4>
                            <div className="space-y-2">
                                {selectedOrder.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
                                        <div>
                                            <p className="font-medium">{item.product_name}</p>
                                            <p className="text-xs text-muted-foreground">{item.fabric_name} — {item.color_name}{item.size ? ` • ${item.size}` : ''}</p>
                                        </div>
                                        <div className="text-right">
                                            <p>{item.quantity}x R$ {item.unit_price.toFixed(2)}</p>
                                            <p className="font-semibold">R$ {item.subtotal.toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Separator />
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {selectedOrder.subtotal.toFixed(2)}</span></div>
                                {selectedOrder.discount_amount > 0 && (
                                    <div className="flex justify-between text-green-600"><span>Desconto</span><span>- R$ {selectedOrder.discount_amount.toFixed(2)}</span></div>
                                )}
                                <div className="flex justify-between font-bold text-lg pt-2"><span>Total</span><span className="text-gradient-bronze">R$ {selectedOrder.total.toFixed(2)}</span></div>
                            </div>
                            {selectedOrder.notes && (
                                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                    <p className="text-muted-foreground mb-1">Observações:</p>
                                    <p>{selectedOrder.notes}</p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
