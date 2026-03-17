'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

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
    metadata: ({ status?: string } & Record<string, unknown>) | null
    created_at: string
}

interface LegacyStatusNotificationRow {
    id: string
    status: string
    created_at: string
    order_id: string
    order:
        | {
              order_number: string | null
          }
        | Array<{
              order_number: string | null
          }>
        | null
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

    const fetchLegacyNotifications = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('order_status_history')
                .select('id, status, created_at, order_id, order:orders(order_number)')
                .order('created_at', { ascending: false })
                .limit(20)

            if (data) {
                const rows = data as LegacyStatusNotificationRow[]
                const statusLabels: Record<string, string> = {
                    pending: 'Em analise',
                    approved: 'Aprovado',
                    in_production: 'Em producao',
                    shipped: 'Enviado',
                    delivered: 'Entregue',
                    cancelled: 'Cancelado',
                }

                const mapped: ClientNotification[] = rows.map((notification) => {
                    const orderRelation = Array.isArray(notification.order)
                        ? (notification.order[0] ?? null)
                        : notification.order

                    return {
                        id: notification.id,
                        profile_id: '',
                        type: 'order_status',
                        title: `Pedido ${orderRelation?.order_number || ''}`,
                        message: `Status atualizado para ${statusLabels[notification.status] || notification.status}`,
                        image_url: null,
                        link: `/orders/${notification.order_id}`,
                        is_read: false,
                        campaign_id: null,
                        order_id: notification.order_id,
                        metadata: { status: notification.status },
                        created_at: notification.created_at,
                    }
                })

                setNotifications(mapped)

                const lastChecked = localStorage.getItem('notifications_last_checked')
                if (lastChecked) {
                    setUnreadCount(mapped.filter((notification) => notification.created_at > lastChecked).length)
                }
            }
        } catch {
            // silent
        }
    }, [])

    const fetchNotifications = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('client_notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) {
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    await fetchLegacyNotifications()
                    return
                }
                throw error
            }

            if (data) {
                setNotifications(data)
                setUnreadCount(data.filter((notification) => !notification.is_read).length)
            }
        } catch {
            await fetchLegacyNotifications()
        } finally {
            setIsLoading(false)
        }
    }, [fetchLegacyNotifications])

    useEffect(() => {
        const supabase = createClient()
        let notificationsChannel: RealtimeChannel | null = null

        void fetchNotifications()

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                void fetchNotifications()
            }
        }, 30000)

        const initRealtime = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser()
            if (!user) return

            notificationsChannel = supabase
                .channel(`client-notifications-${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'client_notifications',
                        filter: `profile_id=eq.${user.id}`,
                    },
                    () => {
                        void fetchNotifications()
                    }
                )
                .subscribe()
        }

        void initRealtime()

        return () => {
            clearInterval(interval)
            if (notificationsChannel) {
                void supabase.removeChannel(notificationsChannel)
            }
        }
    }, [fetchNotifications])

    const markAsRead = useCallback(async (id: string) => {
        try {
            const supabase = createClient()
            await supabase.from('client_notifications').update({ is_read: true }).eq('id', id)

            setNotifications((previous) =>
                previous.map((notification) =>
                    notification.id === id ? { ...notification, is_read: true } : notification
                )
            )
            setUnreadCount((previous) => Math.max(0, previous - 1))
        } catch {
            localStorage.setItem('notifications_last_checked', new Date().toISOString())
        }
    }, [])

    const markAllAsRead = useCallback(async () => {
        try {
            const supabase = createClient()
            const unreadIds = notifications.filter((notification) => !notification.is_read).map((notification) => notification.id)
            if (unreadIds.length > 0) {
                await supabase.from('client_notifications').update({ is_read: true }).in('id', unreadIds)
            }

            setNotifications((previous) => previous.map((notification) => ({ ...notification, is_read: true })))
            setUnreadCount(0)
        } catch {
            localStorage.setItem('notifications_last_checked', new Date().toISOString())
            setUnreadCount(0)
        }
    }, [notifications])

    const removeNotification = useCallback(async (id: string) => {
        try {
            const supabase = createClient()
            await supabase.from('client_notifications').delete().eq('id', id)
        } catch {
            // silent
        }

        setNotifications((previous) => {
            const removed = previous.find((notification) => notification.id === id)
            if (removed && !removed.is_read) {
                setUnreadCount((count) => Math.max(0, count - 1))
            }
            return previous.filter((notification) => notification.id !== id)
        })
    }, [])

    const clearAll = useCallback(async () => {
        try {
            const supabase = createClient()
            const ids = notifications.map((notification) => notification.id)
            if (ids.length > 0) {
                await supabase.from('client_notifications').delete().in('id', ids)
            }
        } catch {
            // silent
        }

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
