'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ClipboardList, Eye, Search, Filter, ChevronLeft, ChevronRight, RotateCcw, Loader2, Calendar } from 'lucide-react'
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
    return (
        <Suspense fallback={<OrderListSkeleton count={5} />}>
            <OrdersContent />
        </Suspense>
    )
}

function OrdersContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    
    // Pagination & Filter States from URL
    const statusFilter = searchParams.get('status') || 'all'
    const dateFilter = searchParams.get('date') || 'all'
    const debouncedSearch = searchParams.get('search') || ''
    
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [reorderingId, setReorderingId] = useState<string | null>(null)
    const { addItem, openCart } = useCartStore()
    const observerTarget = useRef<HTMLDivElement>(null)

    // Reset page and orders when search/filters change
    useEffect(() => {
        setOrders([])
        setCurrentPage(1)
        setHasMore(true)
    }, [statusFilter, dateFilter, debouncedSearch])

    useEffect(() => {
        const loadPaginatedOrders = async () => {
            if (!hasMore && currentPage !== 1) return
            
            setLoading(true)
            const supabase = createClient()
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

            if (statusFilter !== 'all') query = query.eq('status', statusFilter)
            if (debouncedSearch) query = query.ilike('order_number', `%${debouncedSearch}%`)
            if (dateFilter !== 'all') {
                const days = parseInt(dateFilter)
                const dateLimit = new Date()
                dateLimit.setDate(dateLimit.getDate() - days)
                query = query.gte('created_at', dateLimit.toISOString())
            }

            const from = (currentPage - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, count, error } = await query
            if (!error && data) {
                if (currentPage === 1) {
                    setOrders(data as any)
                } else {
                    setOrders(prev => [...prev, ...(data as any)])
                }
                setTotalCount(count || 0)
                setHasMore((count || 0) > (currentPage * PAGE_SIZE))
            }
            setLoading(false)
        }

        loadPaginatedOrders()
    }, [statusFilter, dateFilter, debouncedSearch, currentPage])

    // Intersection Observer for Infinite Scroll
    useEffect(() => {
        const target = observerTarget.current
        if (!target || !hasMore || loading) return

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    setCurrentPage(prev => prev + 1)
                }
            },
            { threshold: 0.1 }
        )

        observer.observe(target)
        return () => observer.disconnect()
    }, [hasMore, loading])

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const handleReorder = async (e: React.MouseEvent, orderId: string) => {
        e.preventDefault()
        e.stopPropagation()
        setReorderingId(orderId)
        try {
            const supabase = createClient()
            const { data: items } = await supabase
                .from('order_items')
                .select(`
                    *,
                    variant:product_variants(
                        product_id,
                        product:products(
                            id,
                            images:product_images(url, is_primary, sort_order)
                        )
                    )
                `)
                .eq('order_id', orderId)
            if (items && items.length > 0) {
                items.forEach((item: any) => {
                    const product = item.variant?.product
                    const primaryImage = product?.images?.find((img: any) => img.is_primary) || product?.images?.[0]
                    addItem({
                        variantId: item.product_variant_id,
                        productId: item.variant?.product_id || '',
                        productName: item.product_name,
                        fabricName: item.fabric_name,
                        colorName: item.color_name,
                        size: item.size,
                        imageUrl: primaryImage?.url || null,
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
                className="md:block"
            >
                <h1 className="text-3xl font-bold font-heading text-gradient-navy hidden md:block">
                    Meus Pedidos
                </h1>
                <p className="text-muted-foreground mt-1 md:mt-1">
                    Acompanhe o status dos seus pedidos
                </p>
            </motion.div>

            {/* Desktop Filters Only */}
            <div className="hidden md:flex flex-col sm:flex-row gap-3 mt-6 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por número do pedido..."
                        value={debouncedSearch}
                        onChange={(e) => {
                            const val = e.target.value
                            const params = new URLSearchParams(searchParams)
                            if (val) params.set('search', val)
                            else params.delete('search')
                            router.replace(`/orders?${params.toString()}`)
                        }}
                        className="pl-9 h-11 bg-white/60"
                    />
                </div>
                <Select value={statusFilter} onValueChange={(v: any) => {
                    const params = new URLSearchParams(searchParams)
                    if (v === 'all') params.delete('status')
                    else params.set('status', v)
                    router.push(`/orders?${params.toString()}`)
                    setCurrentPage(1)
                }}>
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
                <Select value={dateFilter} onValueChange={(v: any) => {
                    const params = new URLSearchParams(searchParams)
                    if (v === 'all') params.delete('date')
                    else params.set('date', v)
                    router.push(`/orders?${params.toString()}`)
                    setCurrentPage(1)
                }}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60">
                        <Calendar className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Últimos 7 dias</SelectItem>
                        <SelectItem value="30">Últimos 30 dias</SelectItem>
                        <SelectItem value="90">Últimos 90 dias</SelectItem>
                        <SelectItem value="180">Últimos 6 meses</SelectItem>
                        <SelectItem value="all">Todo o período</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Mobile Filter Summary Indicator */}
            {(statusFilter !== 'all' || dateFilter !== 'all' || debouncedSearch) && (
                <div className="flex md:hidden items-center gap-2 mt-4 mb-2">
                    <Badge variant="outline" className="text-[10px] font-medium bg-muted/30 border-border/40">
                        Ativos: {[statusFilter !== 'all', dateFilter !== 'all', !!debouncedSearch].filter(Boolean).length}
                    </Badge>
                </div>
            )}

            {/* Orders List */}
            <div className="flex-1 flex flex-col mt-4 md:mt-0">
                {loading ? (
                    <OrderListSkeleton count={4} />
                ) : orders.length === 0 ? (
                    <div className="text-center py-16 flex-1">
                        <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                            <ClipboardList className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
                        <p className="text-muted-foreground mt-1 mb-4">
                            {debouncedSearch || statusFilter !== 'all' || dateFilter !== 'all'
                                ? 'Nenhum resultado nos filtros atuais.'
                                : 'Você ainda não realizou nenhum pedido.'}
                        </p>
                        {(!debouncedSearch && statusFilter === 'all' && dateFilter === 'all') && (
                            <Button
                                className="mt-4 gradient-bronze border-0 text-white rounded-xl px-8"
                                onClick={() => router.push('/catalog')}
                            >
                                Ver Catálogo
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground mb-4">
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
                                        <Card className="glass-card border-0 hover:shadow-md transition-all active:scale-[0.98]">
                                            <Link href={`/orders/${order.id}`}>
                                                <CardContent className="p-4 sm:p-5">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0 space-y-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <h3 className="font-bold text-navy truncate">{order.order_number}</h3>
                                                                <Badge className={`text-[9px] font-bold uppercase tracking-wider h-5 px-2 rounded-md ${config.color}`}>
                                                                    {config.label}
                                                                </Badge>
                                                                {i === 0 && !debouncedSearch && (
                                                                     <Badge className="bg-blue-500/10 text-blue-600 border-blue-200/50 text-[9px] h-5 rounded-md">Mais Recente</Badge>
                                                                )}
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {format(new Date(order.created_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                                                                </p>
                                                                {order.payment_condition && (
                                                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight opacity-70">
                                                                        {(order.payment_condition as { name: string }).name}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="text-right shrink-0 space-y-2">
                                                            <div className="space-y-0.5">
                                                                <p className="text-sm font-bold text-gradient-bronze leading-none">
                                                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground leading-none">Total do pedido</p>
                                                            </div>
                                                            <div className="flex items-center justify-end gap-1.5 pt-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 rounded-lg bg-muted/40 hover:bg-primary/10 hover:text-primary"
                                                                    disabled={reorderingId === order.id}
                                                                    onClick={(e) => {
                                                                        e.preventDefault()
                                                                        handleReorder(e, order.id)
                                                                    }}
                                                                    title="Comprar novamente"
                                                                >
                                                                    {reorderingId === order.id
                                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                        : <RotateCcw className="h-3.5 w-3.5" />
                                                                    }
                                                                </Button>
                                                                <div className="h-8 w-8 rounded-lg bg-navy/5 flex items-center justify-center">
                                                                    <ChevronRight className="h-4 w-4 text-navy/40" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Link>
                                        </Card>
                                    </motion.div>
                                )
                            })}
                        </div>

                        {/* Infinite Scroll Target */}
                        <div ref={observerTarget} className="h-10 flex items-center justify-center mb-8">
                            {loading && orders.length > 0 && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center gap-2 text-muted-foreground"
                                >
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-xs font-medium">Carregando mais...</span>
                                </motion.div>
                            )}
                            {!hasMore && orders.length > 0 && (
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest opacity-40">
                                    Fim da lista de pedidos
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
