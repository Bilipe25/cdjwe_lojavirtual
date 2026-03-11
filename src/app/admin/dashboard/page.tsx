'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
    Package,
    Users,
    ClipboardList,
    DollarSign,
    Clock,
    AlertCircle,
    ArrowUpRight,
    ShoppingBag,
    BarChart3,
    RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { loadDashboardStats, type DashboardPeriod, type DashboardStats } from './actions'

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

const periodLabels: Record<DashboardPeriod, string> = {
    today: 'Hoje',
    '7d': '7 dias',
    '30d': '30 dias',
    '12m': '12 meses',
    all: 'Tudo',
}

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [period, setPeriod] = useState<DashboardPeriod>('30d')

    const fetchStats = useCallback(async (p: DashboardPeriod) => {
        setLoading(true)
        setError(null)
        const result = await loadDashboardStats(p)
        if (result.error) {
            setError(result.error)
        } else {
            setStats(result.data)
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchStats(period)
    }, [period, fetchStats])

    const handlePeriodChange = (p: DashboardPeriod) => {
        setPeriod(p)
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
            title: 'Ticket Médio',
            value: `R$ ${stats.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            icon: BarChart3,
            color: 'text-orange-600 bg-orange-100',
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Dashboard
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Visão geral do sistema
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Period Filter */}
                    <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                        {(Object.entries(periodLabels) as [DashboardPeriod, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => handlePeriodChange(key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    period === key
                                        ? 'bg-white shadow-sm text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fetchStats(period)}
                        disabled={loading}
                        className="h-8 w-8"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <Card className="border-destructive bg-destructive/5">
                    <CardContent className="py-6 text-center">
                        <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
                        <p className="text-destructive font-medium">{error}</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchStats(period)}>
                            Tentar novamente
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
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
                            transition={{ delay: i * 0.08 }}
                        >
                            <Card className="glass-card border-0 hover:shadow-md transition-shadow">
                                <CardContent className="p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted-foreground">{kpi.title}</span>
                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${kpi.color}`}>
                                            <kpi.icon className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-xl font-bold font-heading">
                                        {kpi.value}
                                    </p>
                                    {kpi.badge && (
                                        <Badge variant="secondary" className="mt-2 text-[10px] bg-amber-100 text-amber-800">
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
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
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
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
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
                                Nenhum pedido neste período
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {stats?.recentOrders.map((order) => (
                                    <Link key={order.id} href={`/admin/orders?highlight=${order.id}`}>
                                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                    <ClipboardList className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium truncate">{order.order_number}</p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {order.store?.company_name || 'Cliente'} • {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
