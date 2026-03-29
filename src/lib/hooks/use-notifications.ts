'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type ClientNotificationType =
    | 'order_status'
    | 'campaign'
    | 'system'
    | 'promo'
    | 'financial'

export type ClientNotificationPriority = 'low' | 'normal' | 'high' | 'critical'

export interface ClientNotification {
    id: string
    profile_id: string
    type: ClientNotificationType
    priority: ClientNotificationPriority
    notification_kind: string | null
    title: string
    message: string | null
    image_url: string | null
    link: string | null
    is_read: boolean
    read_at: string | null
    campaign_id: string | null
    order_id: string | null
    metadata: ({ status?: string; notification_kind?: string } & Record<string, unknown>) | null
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

const validTypes = new Set<ClientNotificationType>([
    'order_status',
    'campaign',
    'system',
    'promo',
    'financial',
])

const validPriorities = new Set<ClientNotificationPriority>([
    'low',
    'normal',
    'high',
    'critical',
])

function normalizeNotificationRow(raw: Record<string, unknown>): ClientNotification {
    const fallbackType = 'system' as const
    const rowType = String(raw.type || fallbackType) as ClientNotificationType
    const type = validTypes.has(rowType) ? rowType : fallbackType

    const rowPriority = String(raw.priority || '') as ClientNotificationPriority
    const priority = validPriorities.has(rowPriority)
        ? rowPriority
        : 'normal'

    const metadata = (raw.metadata && typeof raw.metadata === 'object'
        ? (raw.metadata as ({ status?: string; notification_kind?: string } & Record<string, unknown>))
        : null)

    const rowNotificationKind =
        typeof raw.notification_kind === 'string'
            ? raw.notification_kind
            : metadata?.notification_kind || null

    return {
        id: String(raw.id || ''),
        profile_id: String(raw.profile_id || ''),
        type,
        priority,
        notification_kind: rowNotificationKind,
        title: String(raw.title || ''),
        message: raw.message ? String(raw.message) : null,
        image_url: raw.image_url ? String(raw.image_url) : null,
        link: raw.link ? String(raw.link) : null,
        is_read: Boolean(raw.is_read),
        read_at: raw.read_at ? String(raw.read_at) : null,
        campaign_id: raw.campaign_id ? String(raw.campaign_id) : null,
        order_id: raw.order_id ? String(raw.order_id) : null,
        metadata,
        created_at: String(raw.created_at || new Date().toISOString()),
    }
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
                        priority: 'normal',
                        notification_kind: 'order_status_update',
                        title: `Pedido ${orderRelation?.order_number || ''}`,
                        message: `Status atualizado para ${statusLabels[notification.status] || notification.status}`,
                        image_url: null,
                        link: `/orders/${notification.order_id}`,
                        is_read: false,
                        read_at: null,
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
                } else {
                    setUnreadCount(mapped.length)
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
                const normalized = data.map((row) => normalizeNotificationRow(row as unknown as Record<string, unknown>))
                setNotifications(normalized)
                setUnreadCount(normalized.filter((notification) => !notification.is_read).length)
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
        const now = new Date().toISOString()

        try {
            const supabase = createClient()
            await supabase.from('client_notifications').update({ is_read: true }).eq('id', id)

            setNotifications((previous) =>
                previous.map((notification) =>
                    notification.id === id
                        ? { ...notification, is_read: true, read_at: notification.read_at || now }
                        : notification
                )
            )
            setUnreadCount((previous) => Math.max(0, previous - 1))
        } catch {
            localStorage.setItem('notifications_last_checked', now)
        }
    }, [])

    const markAllAsRead = useCallback(async () => {
        const now = new Date().toISOString()

        try {
            const supabase = createClient()
            const unreadIds = notifications
                .filter((notification) => !notification.is_read)
                .map((notification) => notification.id)

            if (unreadIds.length > 0) {
                await supabase.from('client_notifications').update({ is_read: true }).in('id', unreadIds)
            }

            setNotifications((previous) =>
                previous.map((notification) => ({
                    ...notification,
                    is_read: true,
                    read_at: notification.read_at || now,
                }))
            )
            setUnreadCount(0)
        } catch {
            localStorage.setItem('notifications_last_checked', now)
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
