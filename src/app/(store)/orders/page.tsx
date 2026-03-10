'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { ClipboardList, Eye, Search, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus } from '@/lib/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [search, setSearch] = useState('')

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
        items:order_items(count),
        payment_condition:payment_conditions(name)
      `)
            .order('created_at', { ascending: false })

        if (data) setOrders(data)
        setLoading(false)
    }

    const filtered = orders.filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false
        if (search && !o.order_number.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
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
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
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
            {loading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="glass-card border-0">
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-2">
                                        <Skeleton className="h-5 w-32" />
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-4 w-20" />
                                    </div>
                                    <Skeleton className="h-8 w-24" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                        <ClipboardList className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
                    <p className="text-muted-foreground mt-1">
                        {orders.length === 0
                            ? 'Você ainda não realizou nenhum pedido'
                            : 'Tente alterar os filtros'}
                    </p>
                    {orders.length === 0 && (
                        <Button
                            className="mt-4 gradient-bronze border-0 text-white"
                            onClick={() => window.location.href = '/catalog'}
                        >
                            Ver Catálogo
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((order, i) => {
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
                                                    </div>
                                                    <Button variant="ghost" size="icon">
                                                        <Eye className="h-4 w-4" />
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
            )}
        </div>
    )
}
