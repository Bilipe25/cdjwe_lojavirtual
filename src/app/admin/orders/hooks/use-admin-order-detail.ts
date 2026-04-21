'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OrderItem, OrderStatus } from '@/lib/types'

export interface AdminOrderHistoryRecord {
    id: string
    status: string
    created_at: string
    changed_by: string
    notes?: string | null
    profile?: {
        full_name?: string | null
    } | null
}

export interface AdminOrderInvoiceRecord {
    id: string
    invoice_number: string | null
    status: string | null
}

export interface AdminOrderRouteAssignmentRecord {
    id: string
    route_id: string
    route?: {
        route_number?: string | null
        status?: string | null
        is_deleted?: boolean | null
    } | null
}

export interface AdminOrderFiscalSummary {
    id: string
    document_status: string | null
    document_model: string | null
    numero_nf: number | null
}

export interface AdminOrderDetailRecord {
    id: string
    order_number: string
    status: OrderStatus
    payment_status?: string | null
    total: number
    subtotal: number
    discount_amount: number
    coupon_code?: string | null
    coupon_discount_type?: 'percentage' | 'fixed' | null
    coupon_discount_value?: number | null
    coupon_discount_amount?: number | null
    created_at: string
    updated_at?: string
    notes: string | null
    shipping_address?: string | null
    estimated_delivery?: string | null
    sales_channel?: 'customer_portal' | 'representative' | null
    payment_method_id?: string | null
    payment_method_name?: string | null
    payment_method_code?: string | null
    payment_condition_id?: string | null
    payment_condition_name?: string | null
    payment_condition_description?: string | null
    payment_installments?: number | null
    payment_discount_percentage?: number | null
    payment_surcharge_percentage?: number | null
    archived_at?: string | null
    archive_reason?: string | null
    store?: {
        company_name?: string | null
        cnpj?: string | null
    } | null
    profile?: {
        full_name?: string | null
        role?: string | null
    } | null
    customer_profile?: {
        full_name?: string | null
        role?: string | null
    } | null
    created_by_profile?: {
        full_name?: string | null
        role?: string | null
    } | null
    payment_condition?: {
        name?: string | null
        description?: string | null
        installments?: number | null
        discount_percentage?: number | null
        surcharge_percentage?: number | null
    } | null
    items?: OrderItem[]
}

const ORDER_DETAIL_SELECT = `
    id,
    order_number,
    status,
    payment_status,
    total,
    subtotal,
    discount_amount,
    coupon_code,
    coupon_discount_type,
    coupon_discount_value,
    coupon_discount_amount,
    created_at,
    updated_at,
    notes,
    shipping_address,
    estimated_delivery,
    sales_channel,
    payment_method_id,
    payment_method_name,
    payment_method_code,
    payment_condition_id,
    payment_condition_name,
    payment_condition_description,
    payment_installments,
    payment_discount_percentage,
    payment_surcharge_percentage,
    archived_at,
    archive_reason,
    store:stores(company_name, cnpj),
    profile:profiles!orders_profile_id_fkey(full_name, role),
    customer_profile:profiles!orders_profile_id_fkey(full_name, role),
    created_by_profile:profiles!orders_created_by_profile_id_fkey(full_name, role),
    payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage),
    items:order_items(*)
`

interface UseAdminOrderDetailOptions {
    orderId: string | null
    enabled?: boolean
    fallbackOrder?: AdminOrderDetailRecord | null
}

interface UseAdminOrderDetailResult {
    order: AdminOrderDetailRecord | null
    history: AdminOrderHistoryRecord[]
    fiscalSummary: AdminOrderFiscalSummary | null
    invoice: AdminOrderInvoiceRecord | null
    routeAssignment: AdminOrderRouteAssignmentRecord | null
    loading: boolean
    loadingHistory: boolean
    loadingMeta: boolean
    reload: () => Promise<void>
}

async function fetchOrderDetail(orderId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_DETAIL_SELECT)
        .eq('id', orderId)
        .single()

    if (error || !data) {
        throw error || new Error('Pedido nao encontrado.')
    }

    const resolved = data as AdminOrderDetailRecord

    if (!Array.isArray(resolved.items) || resolved.items.length === 0) {
        const { data: fallbackItems, error: itemsError } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at')

        if (!itemsError && fallbackItems) {
            resolved.items = fallbackItems as OrderItem[]
        }
    }

    return resolved
}

async function fetchOrderHistory(orderId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('order_status_history')
        .select(`
            id,
            status,
            created_at,
            changed_by,
            notes,
            profile:profiles!changed_by(full_name)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })

    if (error) {
        throw error
    }

    return (data || []) as AdminOrderHistoryRecord[]
}

async function fetchOrderOperationalMeta(orderId: string) {
    const supabase = createClient()

    const [invoiceRes, routeRes, fiscalRes] = await Promise.all([
        supabase
            .from('invoices')
            .select('id, invoice_number, status')
            .eq('order_id', orderId)
            .limit(1)
            .maybeSingle(),
        supabase
            .from('delivery_route_stops')
            .select('id, route_id, route:delivery_routes(route_number, status, is_deleted)')
            .eq('order_id', orderId)
            .limit(20),
        supabase
            .from('fiscal_documents')
            .select('id, document_status, document_model, numero_nf')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    if (invoiceRes.error) throw invoiceRes.error
    if (routeRes.error) throw routeRes.error
    if (fiscalRes.error) throw fiscalRes.error

    const assignments = (Array.isArray(routeRes.data) ? routeRes.data : []) as AdminOrderRouteAssignmentRecord[]
    const activeRouteAssignment =
        assignments.find((assignment) => !assignment.route?.is_deleted) || null

    return {
        invoice: (invoiceRes.data as AdminOrderInvoiceRecord | null) || null,
        routeAssignment: activeRouteAssignment,
        fiscalSummary: (fiscalRes.data as AdminOrderFiscalSummary | null) || null,
    }
}

export function useAdminOrderDetail({
    orderId,
    enabled = true,
    fallbackOrder = null,
}: UseAdminOrderDetailOptions): UseAdminOrderDetailResult {
    const [order, setOrder] = useState<AdminOrderDetailRecord | null>(fallbackOrder)
    const [history, setHistory] = useState<AdminOrderHistoryRecord[]>([])
    const [fiscalSummary, setFiscalSummary] = useState<AdminOrderFiscalSummary | null>(null)
    const [invoice, setInvoice] = useState<AdminOrderInvoiceRecord | null>(null)
    const [routeAssignment, setRouteAssignment] = useState<AdminOrderRouteAssignmentRecord | null>(null)
    const [loading, setLoading] = useState(Boolean(enabled && orderId))
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [loadingMeta, setLoadingMeta] = useState(false)

    const reload = useCallback(async () => {
        if (!enabled || !orderId) {
            setOrder(fallbackOrder)
            setHistory([])
            setFiscalSummary(null)
            setInvoice(null)
            setRouteAssignment(null)
            setLoading(false)
            setLoadingHistory(false)
            setLoadingMeta(false)
            return
        }

        setLoading(true)
        setLoadingHistory(true)
        setLoadingMeta(true)

        try {
            const [orderResult, historyResult, metaResult] = await Promise.all([
                fetchOrderDetail(orderId),
                fetchOrderHistory(orderId),
                fetchOrderOperationalMeta(orderId),
            ])

            setOrder(orderResult)
            setHistory(historyResult)
            setInvoice(metaResult.invoice)
            setRouteAssignment(metaResult.routeAssignment)
            setFiscalSummary(metaResult.fiscalSummary)
        } catch (error) {
            console.error('[ADMIN ORDER DETAIL] Falha ao carregar contexto do pedido:', error)
            setOrder(fallbackOrder)
            setHistory([])
            setInvoice(null)
            setRouteAssignment(null)
            setFiscalSummary(null)
        } finally {
            setLoading(false)
            setLoadingHistory(false)
            setLoadingMeta(false)
        }
    }, [enabled, fallbackOrder, orderId])

    useEffect(() => {
        void reload()
    }, [reload])

    return {
        order,
        history,
        fiscalSummary,
        invoice,
        routeAssignment,
        loading,
        loadingHistory,
        loadingMeta,
        reload,
    }
}
