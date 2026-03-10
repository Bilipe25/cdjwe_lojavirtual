'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Package,
    Users,
    ClipboardList,
    TrendingUp,
    DollarSign,
    Clock,
    AlertCircle,
    ArrowUpRight,
    ShoppingBag,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DashboardStats {
    totalOrders: number
    pendingOrders: number
    totalRevenue: number
    totalCustomers: number
    pendingCustomers: number
    totalProducts: number
    recentOrders: Array<{
        id: string
        order_number: string
        total: number
        status: string
        created_at: string
        store: { company_name: string } | null
    }>
}

const statusLabels: Record<string, string> = {
    pending: 'Em Análise',
    approved: 'Aprovado',
    in_production: 'Em Produção',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
}

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-blue-100 text-blue-800',
    in_production: 'bg-purple-100 text-purple-800',
    shipped: 'bg-cyan-100 text-cyan-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
}

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadStats()
    }, [])

    const loadStats = async () => {
        const supabase = createClient()

        const [ordersRes, pendingOrdersRes, revenueRes, customersRes, pendingCustRes, productsRes, recentRes] = await Promise.all([
            supabase.from('orders').select('id', { count: 'exact', head: true }),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('orders').select('total').not('status', 'eq', 'cancelled'),
            supabase.from('stores').select('id', { count: 'exact', head: true }),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('role', 'client'),
            supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
            supabase.from('orders').select('id, order_number, total, status, created_at, store:stores(company_name)').order('created_at', { ascending: false }).limit(5),
        ])

        const totalRevenue = revenueRes.data?.reduce((sum, o) => sum + (o.total || 0), 0) || 0

        setStats({
            totalOrders: ordersRes.count || 0,
            pendingOrders: pendingOrdersRes.count || 0,
            totalRevenue,
            totalCustomers: customersRes.count || 0,
            pendingCustomers: pendingCustRes.count || 0,
            totalProducts: productsRes.count || 0,
            recentOrders: (recentRes.data as any) || [],
        })
        setLoading(false)
    }

    const kpis = stats ? [
        {
            title: 'Receita Total',
            value: `R$ ${stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            icon: DollarSign,
            color: 'text-green-600 bg-green-100',
        },
        {
            title: 'Total de Pedidos',
            value: stats.totalOrders.toString(),
            icon: ShoppingBag,
            color: 'text-blue-600 bg-blue-100',
            badge: stats.pendingOrders > 0 ? `${stats.pendingOrders} pendentes` : undefined,
        },
        {
            title: 'Clientes',
            value: stats.totalCustomers.toString(),
            icon: Users,
            color: 'text-purple-600 bg-purple-100',
            badge: stats.pendingCustomers > 0 ? `${stats.pendingCustomers} aguardando` : undefined,
        },
        {
            title: 'Produtos Ativos',
            value: stats.totalProducts.toString(),
            icon: Package,
            color: 'text-bronze bg-amber-100',
        },
    ] : []

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                    Dashboard
                </h1>
                <p className="text-muted-foreground mt-1">
                    Visão geral do sistema
                </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="glass-card border-0">
                            <CardContent className="p-6">
                                <Skeleton className="h-4 w-24 mb-2" />
                                <Skeleton className="h-8 w-32" />
                            </CardContent>
                        </Card>
                    ))
                    : kpis.map((kpi, i) => (
                        <motion.div
                            key={kpi.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <Card className="glass-card border-0 hover:shadow-md transition-shadow">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-muted-foreground">{kpi.title}</span>
                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${kpi.color}`}>
                                            <kpi.icon className="h-5 w-5" />
                                        </div>
                                    </div>
                                    <p className="text-2xl font-bold font-[family-name:var(--font-heading)]">
                                        {kpi.value}
                                    </p>
                                    {kpi.badge && (
                                        <Badge variant="secondary" className="mt-2 text-xs bg-amber-100 text-amber-800">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            {kpi.badge}
                                        </Badge>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
            </div>

            {/* Alerts & Recent Orders */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Alerts */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            Ações Pendentes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {loading ? (
                            <Skeleton className="h-20 w-full" />
                        ) : (
                            <>
                                {stats && stats.pendingCustomers > 0 && (
                                    <Link href="/admin/customers">
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <Users className="h-4 w-4 text-amber-600" />
                                                <span className="text-sm text-amber-800">
                                                    {stats.pendingCustomers} {stats.pendingCustomers === 1 ? 'cadastro' : 'cadastros'} pendente{stats.pendingCustomers === 1 ? '' : 's'}
                                                </span>
                                            </div>
                                            <ArrowUpRight className="h-4 w-4 text-amber-600" />
                                        </div>
                                    </Link>
                                )}
                                {stats && stats.pendingOrders > 0 && (
                                    <Link href="/admin/orders">
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <ClipboardList className="h-4 w-4 text-blue-600" />
                                                <span className="text-sm text-blue-800">
                                                    {stats.pendingOrders} {stats.pendingOrders === 1 ? 'pedido' : 'pedidos'} para analisar
                                                </span>
                                            </div>
                                            <ArrowUpRight className="h-4 w-4 text-blue-600" />
                                        </div>
                                    </Link>
                                )}
                                {stats && stats.pendingCustomers === 0 && stats.pendingOrders === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Nenhuma ação pendente 🎉
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Orders */}
                <Card className="glass-card border-0 lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                            Pedidos Recentes
                        </CardTitle>
                        <Link href="/admin/orders">
                            <Button variant="ghost" size="sm" className="gap-1">
                                Ver todos
                                <ArrowUpRight className="h-3 w-3" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-14 w-full" />
                                ))}
                            </div>
                        ) : stats?.recentOrders.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                Nenhum pedido realizado ainda
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {(stats?.recentOrders as any)?.map((order: any) => (
                                    <Link key={order.id} href={`/admin/orders`}>
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                    <ClipboardList className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium truncate">{order.order_number}</p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {order.store?.company_name || 'Cliente'} • {format(new Date(order.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <Badge className={`text-[10px] ${statusColors[order.status]}`}>
                                                    {statusLabels[order.status]}
                                                </Badge>
                                                <span className="text-sm font-semibold">
                                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
