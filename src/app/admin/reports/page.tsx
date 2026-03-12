'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, ShoppingBag, Users as UsersIcon, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, startOfMonth, startOfYear, parseISO, isAfter, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts'

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value)
}

const COLORS = ['#1e293b', '#b48a58', '#475569', '#d4bfa5', '#64748b', '#0f172a']

export default function ReportsPage() {
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState('30d') // '7d', '30d', 'month', 'year'

    // KPI State
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [prevRevenue, setPrevRevenue] = useState(0)
    const [totalOrders, setTotalOrders] = useState(0)
    const [avgTicket, setAvgTicket] = useState(0)

    // Chart Data
    const [revenueData, setRevenueData] = useState<any[]>([])
    const [statusData, setStatusData] = useState<any[]>([])
    const [topProducts, setTopProducts] = useState<any[]>([])
    const [topCustomers, setTopCustomers] = useState<any[]>([])

    useEffect(() => {
        loadReportData()
    }, [period])

    const loadReportData = async () => {
        setLoading(true)
        const supabase = createClient()

        let startDate = new Date()
        let prevStartDate = new Date()

        if (period === '7d') {
            startDate = subDays(new Date(), 7)
            prevStartDate = subDays(new Date(), 14)
        } else if (period === '30d') {
            startDate = subDays(new Date(), 30)
            prevStartDate = subDays(new Date(), 60)
        } else if (period === 'month') {
            startDate = startOfMonth(new Date())
            prevStartDate = startOfMonth(subDays(startDate, 1))
        } else if (period === 'year') {
            startDate = startOfYear(new Date())
            prevStartDate = startOfYear(subDays(startDate, 1))
        }

        const startDateIso = startDate.toISOString()
        const prevStartDateIso = prevStartDate.toISOString()
        const nowIso = new Date().toISOString()

        try {
            // 1. Fetch Orders (Current Period)
            const { data: currentOrders, error: err1 } = await supabase
                .from('orders')
                .select('*, order_items(*), profiles(full_name, stores(company_name))')
                .gte('created_at', startDateIso)
                .lte('created_at', nowIso)

            if (err1) throw err1

            // 2. Fetch Orders (Previous Period for comparison)
            const { data: previousOrders, error: err2 } = await supabase
                .from('orders')
                .select('total')
                .gte('created_at', prevStartDateIso)
                .lt('created_at', startDateIso)

            if (err2) throw err2

            processData(currentOrders || [], previousOrders || [], startDate)

        } catch (error) {
            console.error('Erro ao buscar relatórios:', error)
        } finally {
            setLoading(false)
        }
    }

    const processData = (orders: any[], prevOrders: any[], periodStart: Date) => {
        // Only consider valid orders for revenue (exclude cancelled/pending if strict, but let's include approved/production/shipped/delivered)
        const validStatuses = ['approved', 'in_production', 'shipped', 'delivered']
        const validOrders = orders.filter(o => validStatuses.includes(o.status))
        const prevValidOrders = prevOrders.filter((o: any) => o.total > 0) // rough check

        // KPIs
        const tRevenue = validOrders.reduce((acc, curr) => acc + Number(curr.total), 0)
        const pRevenue = prevValidOrders.reduce((acc, curr) => acc + Number(curr.total), 0)
        const tOrders = validOrders.length

        setTotalRevenue(tRevenue)
        setPrevRevenue(pRevenue)
        setTotalOrders(tOrders)
        setAvgTicket(tOrders > 0 ? tRevenue / tOrders : 0)

        // Revenue Over Time Chart (Group by Day)
        const revMap = new Map<string, number>()
        validOrders.forEach(o => {
            const day = format(parseISO(o.created_at), 'dd/MM')
            revMap.set(day, (revMap.get(day) || 0) + Number(o.total))
        })

        // Sort and map to array
        const revArr = Array.from(revMap.entries())
            .map(([date, total]) => ({ date, total }))
            .sort((a, b) => {
                // Simplistic sort, assuming within same year for short periods
                return a.date > b.date ? 1 : -1
            })
        setRevenueData(revArr)

        // Status Distribution Chart
        const statMap = new Map<string, number>()
        const statusNames: Record<string, string> = {
            pending: 'Pendente',
            approved: 'Aprovado',
            in_production: 'Em Produção',
            shipped: 'Enviado',
            delivered: 'Entregue',
            cancelled: 'Cancelado'
        }
        orders.forEach(o => {
            const sName = statusNames[o.status] || o.status
            statMap.set(sName, (statMap.get(sName) || 0) + 1)
        })
        setStatusData(Array.from(statMap.entries()).map(([name, value]) => ({ name, value })))

        // Top Products
        const prodMap = new Map<string, number>()
        validOrders.forEach(o => {
            o.order_items?.forEach((item: any) => {
                const pName = `${item.product_name} (${item.fabric_name})`
                prodMap.set(pName, (prodMap.get(pName) || 0) + item.quantity)
            })
        })
        const prodArr = Array.from(prodMap.entries())
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5) // Top 5
        setTopProducts(prodArr)

        // Top Customers
        const custMap = new Map<string, { total: number, name: string, company: string }>()
        validOrders.forEach(o => {
            const id = o.profile_id
            const profile = o.profiles
            if (!profile) return

            const company = profile.stores?.[0]?.company_name || 'Sem Empresa'
            const ex = custMap.get(id) || { total: 0, name: profile.full_name, company }

            ex.total += Number(o.total)
            custMap.set(id, ex)
        })
        const custArr = Array.from(custMap.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 5) // Top 5
        setTopCustomers(custArr)
    }

    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 100

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <BarChart3 className="h-8 w-8 text-bronze" />
                        Relatórios Analíticos
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Acompanhe o desempenho de vendas e comportamento dos clientes
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
                        <SelectTrigger className="w-[180px] bg-white/60">
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent align="end">
                            <SelectItem value="7d">Últimos 7 dias</SelectItem>
                            <SelectItem value="30d">Últimos 30 dias</SelectItem>
                            <SelectItem value="month">Este Mês</SelectItem>
                            <SelectItem value="year">Este Ano</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loading ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <Card key={i} className="glass-card border-0"><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="glass-card border-0"><CardContent className="h-[300px] p-6"><Skeleton className="h-full w-full" /></CardContent></Card>
                        <Card className="glass-card border-0"><CardContent className="h-[300px] p-6"><Skeleton className="h-full w-full" /></CardContent></Card>
                    </div>
                </>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ staggerChildren: 0.1 }}
                    className="space-y-6"
                >
                    {/* KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="glass-card border-0 relative overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-muted-foreground">Faturamento Aprovado</p>
                                        <h3 className="text-3xl font-bold text-navy">{formatCurrency(totalRevenue)}</h3>
                                    </div>
                                    <div className="h-10 w-10 rounded-full bg-bronze/10 flex items-center justify-center text-bronze">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center text-sm">
                                    <span className={`flex items-center font-medium ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {revenueGrowth >= 0 ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                                        {Math.abs(revenueGrowth).toFixed(1)}%
                                    </span>
                                    <span className="text-muted-foreground ml-2">vs período anterior</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-card border-0">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-muted-foreground">Pedidos (Válidos)</p>
                                        <h3 className="text-3xl font-bold text-navy">{totalOrders}</h3>
                                    </div>
                                    <div className="h-10 w-10 rounded-full bg-navy/10 flex items-center justify-center text-navy">
                                        <ShoppingBag className="h-5 w-5" />
                                    </div>
                                </div>
                                <div className="mt-4 text-sm text-muted-foreground">
                                    Pedidos concluídos e em andamento
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-card border-0">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-muted-foreground">Ticket Médio</p>
                                        <h3 className="text-3xl font-bold text-navy">{formatCurrency(avgTicket)}</h3>
                                    </div>
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                        <BarChart3 className="h-5 w-5" />
                                    </div>
                                </div>
                                <div className="mt-4 text-sm text-muted-foreground">
                                    Valor médio por pedido válido
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-7 gap-6">
                        {/* Revenue Area Chart */}
                        <Card className="glass-card border-0 lg:col-span-1 xl:col-span-4 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-lg text-navy">Faturamento (R$)</CardTitle>
                                <CardDescription>Evolução de valores aprovados no período</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[300px] w-full">
                                    {revenueData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#1e293b" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#1e293b" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                                    tickFormatter={(val) => `R$ ${val / 1000}k`}
                                                />
                                                <RechartsTooltip
                                                    formatter={(value: any) => [formatCurrency(Number(value)), 'Faturamento']}
                                                    labelStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                />
                                                <Area type="monotone" dataKey="total" stroke="#1e293b" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground">
                                            Sem dados suficientes no período.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Status Donut Chart */}
                        <Card className="glass-card border-0 lg:col-span-1 xl:col-span-3 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-lg text-navy">Distribuição por Status</CardTitle>
                                <CardDescription>Todos os pedidos do período</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[300px] w-full">
                                    {statusData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={statusData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={70}
                                                    outerRadius={100}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                >
                                                    {statusData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                />
                                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground">
                                            Sem dados suficientes no período.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Lists */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Top Products */}
                        <Card className="glass-card border-0 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-lg text-navy">Produtos Mais Vendidos</CardTitle>
                                <CardDescription>Top 5 itens por quantidade (Pedidos Válidos)</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {topProducts.length > 0 ? (
                                    <div className="space-y-4">
                                        {topProducts.map((prod, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-md bg-bronze/10 text-bronze font-bold flex items-center justify-center text-sm">
                                                        #{i + 1}
                                                    </div>
                                                    <span className="font-medium text-sm truncate max-w-[200px] sm:max-w-xs">{prod.name}</span>
                                                </div>
                                                <div className="font-bold text-navy">
                                                    {prod.quantity} <span className="text-xs text-muted-foreground font-normal">un</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-muted-foreground">Sem vendas no período</div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Top Customers */}
                        <Card className="glass-card border-0 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-lg text-navy flex items-center justify-between">
                                    <span>Melhores Clientes</span>
                                    <UsersIcon className="h-5 w-5 text-muted-foreground" />
                                </CardTitle>
                                <CardDescription>Top 5 empresas por faturamento (Válidos)</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {topCustomers.length > 0 ? (
                                    <div className="space-y-4">
                                        {topCustomers.map((cust, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <div className="flex flex-col min-w-0 pr-4">
                                                    <span className="font-semibold text-sm text-navy truncate">{cust.company}</span>
                                                    <span className="text-xs text-muted-foreground truncate">{cust.name}</span>
                                                </div>
                                                <div className="font-bold text-green-700 whitespace-nowrap">
                                                    {formatCurrency(cust.total)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-muted-foreground">Sem clientes no período</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                </motion.div>
            )}
        </div>
    )
}
