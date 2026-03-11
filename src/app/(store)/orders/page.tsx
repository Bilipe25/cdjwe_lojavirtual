'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ClipboardList, Eye, Search, Filter, ChevronLeft, ChevronRight, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OrderListSkeleton } from '@/components/ui/skeletons'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus } from '@/lib/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useCartStore } from '@/lib/stores/cart-store'
import { toast } from 'sonner'
import type { CartItem } from '@/lib/types'

const PAGE_SIZE = 15

const statusConfig: Record<OrderStatus, { label: string; color: string }> = {
    pending: { label: 'Em Análise', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    in_production: { label: 'Em Produção', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    shipped: { label: 'Enviado', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200' },
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    
    // Pagination & Filter States
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [reorderingId, setReorderingId] = useState<string | null>(null)
    const { addItem, openCart } = useCartStore()

    // Debounce the text input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
            setCurrentPage(1)
        }, 500)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => {
        const loadPaginatedOrders = async () => {
            setLoading(true)
            const supabase = createClient()
            
            // First we need user id to only fetch their orders
            const { data: { user } } = await supabase.auth.getUser()
            
            if (!user) {
                setLoading(false)
                return
            }

            let query = supabase
                .from('orders')
                .select(`
                    *,
                    items:order_items(count),
                    payment_condition:payment_conditions(name)
                `, { count: 'exact' })
                .eq('profile_id', user.id)
                .order('created_at', { ascending: false })

            // Apply Server-Side Filters
            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter)
            }
            if (debouncedSearch) {
                query = query.ilike('order_number', `%${debouncedSearch}%`)
            }

            // Apply Strict Pagination
            const from = (currentPage - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, count, error } = await query

            if (!error && data) {
                setOrders(data as any)
                setTotalCount(count || 0)
            }
            setLoading(false)
        }

        loadPaginatedOrders()
    }, [statusFilter, debouncedSearch, currentPage])

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const handleReorder = async (e: React.MouseEvent, orderId: string) => {
        e.preventDefault()
        e.stopPropagation()
        setReorderingId(orderId)
        try {
            const supabase = createClient()
            const { data: items } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId)
            if (items && items.length > 0) {
                items.forEach(item => {
                    addItem({
                        variantId: item.product_variant_id,
                        productId: '',
                        productName: item.product_name,
                        fabricName: item.fabric_name,
                        colorName: item.color_name,
                        size: item.size,
                        imageUrl: null,
                        quantity: item.quantity,
                        unitPrice: item.unit_price,
                    })
                })
                toast.success(`${items.length} itens adicionados ao carrinho!`)
                openCart()
            }
        } catch {
            toast.error('Erro ao refazer pedido.')
        }
        setReorderingId(null)
    }

    return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex flex-col min-h-[85vh]">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                    Meus Pedidos
                </h1>
                <p className="text-muted-foreground mt-1">
                    Acompanhe o status dos seus pedidos
                </p>
            </motion.div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por número do pedido..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-11 bg-white/60"
                    />
                </div>
                <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(Object.keys(statusConfig) as OrderStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                                {statusConfig[status].label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Orders List */}
            <div className="flex-1 flex flex-col">
                {loading ? (
                    <OrderListSkeleton count={4} />
                ) : orders.length === 0 ? (
                    <div className="text-center py-16 flex-1">
                        <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                            <ClipboardList className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
                        <p className="text-muted-foreground mt-1 mb-4">
                            {debouncedSearch || statusFilter !== 'all'
                                ? 'Nenhum resultado nos filtros atuais.'
                                : 'Você ainda não realizou nenhum pedido.'}
                        </p>
                        {(!debouncedSearch && statusFilter === 'all') && (
                            <Button
                                className="mt-4 gradient-bronze border-0 text-white"
                                onClick={() => window.location.href = '/catalog'}
                            >
                                Ver Catálogo
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground mb-4">
                            Exibindo {orders.length} de {totalCount} pedidos
                        </p>
                        <div className="space-y-3 mb-8">
                            {orders.map((order, i) => {
                                const config = statusConfig[order.status as OrderStatus]
                                return (
                                    <motion.div
                                        key={order.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <Link href={`/orders/${order.id}`}>
                                            <Card className="glass-card border-0 cursor-pointer hover:shadow-md transition-shadow">
                                                <CardContent className="p-4">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-semibold">{order.order_number}</h3>
                                                                <Badge className={`text-[10px] border ${config.color}`}>
                                                                    {config.label}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground">
                                                                {format(new Date(order.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                                            </p>
                                                            {order.payment_condition && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {(order.payment_condition as { name: string }).name}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-right">
                                                                <p className="text-lg font-bold text-gradient-bronze">
                                                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </p>
                                                                <span className="text-xs text-muted-foreground hidden sm:block mt-1">
                                                                    Ver detalhes
                                                                </span>
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="shrink-0 bg-muted/50">
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="shrink-0 bg-muted/50"
                                                                disabled={reorderingId === order.id}
                                                                onClick={(e) => handleReorder(e, order.id)}
                                                                title="Comprar novamente"
                                                            >
                                                                {reorderingId === order.id
                                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                    : <RotateCcw className="h-4 w-4" />
                                                                }
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </Link>
                                    </motion.div>
                                )
                            })}
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="mt-auto pt-6 flex items-center justify-center gap-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="bg-white/60 hover:bg-white"
                                >
                                    <ChevronLeft className="h-4 w-4 mr-2" /> Anterior
                                </Button>
                                <span className="text-sm text-muted-foreground font-medium">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="bg-white/60 hover:bg-white"
                                >
                                    Próxima <ChevronRight className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
