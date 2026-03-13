'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ClientNotification {
    id: string
    profile_id: string
    type: 'order_status' | 'campaign' | 'system' | 'promo'
    title: string
    message: string | null
    image_url: string | null
    link: string | null
    is_read: boolean
    campaign_id: string | null
    order_id: string | null
    metadata: Record<string, any> | null
    created_at: string
}

interface UseNotificationsReturn {
    notifications: ClientNotification[]
    unreadCount: number
    isLoading: boolean
    markAsRead: (id: string) => Promise<void>
    markAllAsRead: () => Promise<void>
    removeNotification: (id: string) => Promise<void>
    clearAll: () => Promise<void>
    refresh: () => Promise<void>
}

export function useNotifications(): UseNotificationsReturn {
    const [notifications, setNotifications] = useState<ClientNotification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isLoading, setIsLoading] = useState(true)

    const fetchNotifications = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('client_notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) {
                // Fallback: if client_notifications table doesn't exist yet,
                // fall back to the legacy order_status_history approach
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    await fetchLegacyNotifications()
                    return
                }
                throw error
            }

            if (data) {
                setNotifications(data)
                setUnreadCount(data.filter(n => !n.is_read).length)
            }
        } catch {
            // Silent fallback to legacy
            await fetchLegacyNotifications()
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Legacy fallback: fetch from order_status_history (existing behavior)
    const fetchLegacyNotifications = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('order_status_history')
                .select('id, status, created_at, order_id, order:orders(order_number)')
                .order('created_at', { ascending: false })
                .limit(20)

            if (data) {
                const statusLabels: Record<string, string> = {
                    pending: 'Em Análise',
                    approved: 'Aprovado',
                    in_production: 'Em Produção',
                    shipped: 'Enviado',
                    delivered: 'Entregue',
                    cancelled: 'Cancelado',
                }
                const mapped: ClientNotification[] = data.map((n: any) => ({
                    id: n.id,
                    profile_id: '',
                    type: 'order_status' as const,
                    title: `Pedido ${n.order?.order_number || ''}`,
                    message: `Status atualizado para ${statusLabels[n.status] || n.status}`,
                    image_url: null,
                    link: `/orders/${n.order_id}`,
                    is_read: false,
                    campaign_id: null,
                    order_id: n.order_id,
                    metadata: { status: n.status },
                    created_at: n.created_at,
                }))
                setNotifications(mapped)

                // Use localStorage to determine unread
                const lastChecked = localStorage.getItem('notifications_last_checked')
                if (lastChecked) {
                    setUnreadCount(mapped.filter(n => n.created_at > lastChecked).length)
                }
            }
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        fetchNotifications()
        
        // Only poll if the tab is currently visible to save database reads
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchNotifications()
            }
        }, 30000)
        
        return () => clearInterval(interval)
    }, [fetchNotifications])

    const markAsRead = useCallback(async (id: string) => {
        try {
            const supabase = createClient()
            await supabase
                .from('client_notifications')
                .update({ is_read: true })
                .eq('id', id)

            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, is_read: true } : n)
            )
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch {
            // Fallback for legacy mode
            localStorage.setItem('notifications_last_checked', new Date().toISOString())
        }
    }, [])

    const markAllAsRead = useCallback(async () => {
        try {
            const supabase = createClient()
            const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
            if (unreadIds.length > 0) {
                await supabase
                    .from('client_notifications')
                    .update({ is_read: true })
                    .in('id', unreadIds)
            }

            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
            setUnreadCount(0)
        } catch {
            localStorage.setItem('notifications_last_checked', new Date().toISOString())
            setUnreadCount(0)
        }
    }, [notifications])

    const removeNotification = useCallback(async (id: string) => {
        try {
            const supabase = createClient()
            await supabase
                .from('client_notifications')
                .delete()
                .eq('id', id)
        } catch { /* silent */ }

        setNotifications(prev => {
            const removed = prev.find(n => n.id === id)
            if (removed && !removed.is_read) {
                setUnreadCount(c => Math.max(0, c - 1))
            }
            return prev.filter(n => n.id !== id)
        })
    }, [])

    const clearAll = useCallback(async () => {
        try {
            const supabase = createClient()
            const ids = notifications.map(n => n.id)
            if (ids.length > 0) {
                await supabase
                    .from('client_notifications')
                    .delete()
                    .in('id', ids)
            }
        } catch { /* silent */ }

        setNotifications([])
        setUnreadCount(0)
    }, [notifications])

    return {
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
        refresh: fetchNotifications,
    }
}
