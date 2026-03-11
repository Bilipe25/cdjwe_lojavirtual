'use server'

import { createClient } from '@/lib/supabase/server'

export type DashboardPeriod = 'today' | '7d' | '30d' | '12m' | 'all'

export interface RecentOrder {
    id: string
    order_number: string
    total: number
    status: string
    created_at: string
    store: { company_name: string } | null
}

export interface DashboardStats {
    totalOrders: number
    pendingOrders: number
    totalRevenue: number
    totalCustomers: number
    pendingCustomers: number
    totalProducts: number
    averageTicket: number
    recentOrders: RecentOrder[]
}

function getDateFilter(period: DashboardPeriod): string | null {
    const now = new Date()
    switch (period) {
        case 'today': {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            return start.toISOString()
        }
        case '7d': {
            const d = new Date(now)
            d.setDate(d.getDate() - 7)
            return d.toISOString()
        }
        case '30d': {
            const d = new Date(now)
            d.setDate(d.getDate() - 30)
            return d.toISOString()
        }
        case '12m': {
            const d = new Date(now)
            d.setFullYear(d.getFullYear() - 1)
            return d.toISOString()
        }
        case 'all':
        default:
            return null
    }
}

export async function loadDashboardStats(period: DashboardPeriod = 'all'): Promise<{ data: DashboardStats | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const dateFilter = getDateFilter(period)

        // Build queries with optional date filtering
        let ordersQuery = supabase.from('orders').select('id', { count: 'exact', head: true })
        let pendingOrdersQuery = supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        let revenueQuery = supabase.from('orders').select('total').not('status', 'eq', 'cancelled')
        let recentQuery = supabase.from('orders').select('id, order_number, total, status, created_at, store:stores(company_name)').order('created_at', { ascending: false }).limit(5)

        if (dateFilter) {
            ordersQuery = ordersQuery.gte('created_at', dateFilter)
            pendingOrdersQuery = pendingOrdersQuery.gte('created_at', dateFilter)
            revenueQuery = revenueQuery.gte('created_at', dateFilter)
            recentQuery = recentQuery.gte('created_at', dateFilter)
        }

        // These are always global (not filtered by period)
        const customersQuery = supabase.from('stores').select('id', { count: 'exact', head: true })
        const pendingCustQuery = supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('role', 'client')
        const productsQuery = supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true)

        const [ordersRes, pendingOrdersRes, revenueRes, customersRes, pendingCustRes, productsRes, recentRes] = await Promise.all([
            ordersQuery,
            pendingOrdersQuery,
            revenueQuery,
            customersQuery,
            pendingCustQuery,
            productsQuery,
            recentQuery,
        ])

        const totalRevenue = revenueRes.data?.reduce((sum, o) => sum + (o.total || 0), 0) || 0
        const totalOrders = ordersRes.count || 0
        const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0

        const recentOrders: RecentOrder[] = (recentRes.data || []).map((order: Record<string, unknown>) => ({
            id: order.id as string,
            order_number: order.order_number as string,
            total: order.total as number,
            status: order.status as string,
            created_at: order.created_at as string,
            store: order.store as { company_name: string } | null,
        }))

        return {
            data: {
                totalOrders,
                pendingOrders: pendingOrdersRes.count || 0,
                totalRevenue,
                totalCustomers: customersRes.count || 0,
                pendingCustomers: pendingCustRes.count || 0,
                totalProducts: productsRes.count || 0,
                averageTicket,
                recentOrders,
            },
            error: null,
        }
    } catch (err) {
        console.error('Dashboard load error:', err)
        return { data: null, error: 'Erro ao carregar dados do dashboard.' }
    }
}
