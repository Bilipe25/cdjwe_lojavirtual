'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    LayoutGrid,
    Package,
    Bell,
    ShoppingCart,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useCartStore } from '@/lib/stores/cart-store'
import { NotificationsBottomSheet } from '@/components/layout/notifications-bottom-sheet'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export function MobileBottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    const { totalItems, openCart } = useCartStore()
    const [isMounted, setIsMounted] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const [lastChecked, setLastChecked] = useState<string | null>(null)
    const [dismissedIds, setDismissedIds] = useState<string[]>([])
    const [notifications, setNotifications] = useState<{ id: string; order_id: string; order_number: string; status: string; created_at: string }[]>([])
    const [notifOpen, setNotifOpen] = useState(false)

    const cartCount = totalItems()

    const fetchNotifications = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('order_status_history')
                .select('id, status, created_at, order_id, order:orders(order_number)')
                .order('created_at', { ascending: false })
                .limit(20)
            if (data) {
                // Get current dismissed ids from state (which is synced with localStorage)
                const mapped = data
                    .map((n: any) => ({
                        id: n.id,
                        order_id: n.order_id,
                        order_number: n.order?.order_number || '',
                        status: n.status,
                        created_at: n.created_at,
                    }))
                    .filter((n: any) => !dismissedIds.includes(n.id))
                
                setNotifications(mapped)
                
                if (lastChecked) {
                    const newCount = mapped.filter((n) => n.created_at > lastChecked).length
                    setUnreadCount(newCount)
                }
            }
        } catch { /* silent */ }
    }, [lastChecked, dismissedIds])

    useEffect(() => {
        setIsMounted(true)
        // Load dismissed ids AND lastChecked from localStorage once on mount
        const storedDismissed = localStorage.getItem('dismissed_notifications')
        if (storedDismissed) {
            try {
                setDismissedIds(JSON.parse(storedDismissed))
            } catch { /* silent */ }
        }

        const storedLastChecked = localStorage.getItem('notifications_last_checked')
        if (storedLastChecked) {
            setLastChecked(storedLastChecked)
        } else {
            // If first time, set to now but don't show any as unread yet
            const now = new Date().toISOString()
            setLastChecked(now)
            localStorage.setItem('notifications_last_checked', now)
        }
    }, [])

    useEffect(() => {
        if (!isMounted) return
        
        fetchNotifications()
        const interval = setInterval(fetchNotifications, 30000)
        return () => clearInterval(interval)
    }, [fetchNotifications, isMounted])

    const handleMarkRead = () => {
        const now = new Date().toISOString()
        setUnreadCount(0)
        setLastChecked(now)
        localStorage.setItem('notifications_last_checked', now)
    }

    const handleRemoveNotification = (id: string) => {
        const updated = [...dismissedIds, id]
        setDismissedIds(updated)
        localStorage.setItem('dismissed_notifications', JSON.stringify(updated))
        setNotifications(prev => prev.filter(n => n.id !== id))
    }

    const handleClearAll = () => {
        const allIds = notifications.map(n => n.id)
        const updated = [...dismissedIds, ...allIds]
        setDismissedIds(updated)
        localStorage.setItem('dismissed_notifications', JSON.stringify(updated))
        setNotifications([])
    }

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
        if (href === '/catalog') return pathname.startsWith('/catalog')
        return pathname.startsWith(href)
    }

    return (
        <>
            <nav
                className="fixed bottom-0 left-0 right-0 z-40 glass-nav md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                role="navigation"
                aria-label="Navegação principal mobile"
            >
                <div className="flex items-center justify-around h-(--bottom-nav-height)">

                    {/* Dashboard */}
                    <Link
                        href="/dashboard"
                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative mobile-touch-target"
                        aria-label="Dashboard"
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <LayoutGrid className={`h-5 w-5 transition-colors duration-200 ${isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`} />
                        </motion.div>
                        <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`}>
                            Dashboard
                        </span>
                        {isActive('/dashboard') && (
                            <motion.div layoutId="bottomNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full gradient-bronze" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                        )}
                    </Link>

                    {/* Catálogo */}
                    <Link
                        href="/catalog"
                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative mobile-touch-target"
                        aria-label="Catálogo"
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <Package className={`h-5 w-5 transition-colors duration-200 ${isActive('/catalog') ? 'text-primary' : 'text-muted-foreground'}`} />
                        </motion.div>
                        <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive('/catalog') ? 'text-primary' : 'text-muted-foreground'}`}>
                            Catálogo
                        </span>
                        {isActive('/catalog') && (
                            <motion.div layoutId="bottomNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full gradient-bronze" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                        )}
                    </Link>

                    {/* Notificações — Opens Bottom Sheet */}
                    <button
                        onClick={() => { setNotifOpen(true); handleMarkRead() }}
                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative mobile-touch-target"
                        aria-label={`Notificações${unreadCount > 0 ? ` — ${unreadCount} não lidas` : ''}`}
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <Bell className="h-5 w-5 text-muted-foreground transition-colors duration-200" />
                            <AnimatePresence>
                                {isMounted && unreadCount > 0 && (
                                    <motion.div
                                        key="badge"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        className="absolute -top-2 -right-2"
                                    >
                                        <Badge className="h-4 min-w-4 px-1 p-0 flex items-center justify-center text-[9px] bg-blue-500 border-0 text-white">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </Badge>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                        <span className="text-[10px] font-medium text-muted-foreground transition-colors duration-200">
                            Notificações
                        </span>
                    </button>

                    {/* Carrinho */}
                    <button
                        onClick={() => router.push('/cart')}
                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative mobile-touch-target"
                        aria-label="Carrinho"
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <ShoppingCart className={`h-5 w-5 transition-colors duration-200 ${isActive('/cart') ? 'text-primary' : 'text-muted-foreground'}`} />
                            <AnimatePresence>
                                {isMounted && cartCount > 0 && (
                                    <motion.div
                                        key="cartbadge"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        className="absolute -top-2 -right-2"
                                    >
                                        <Badge className="h-4 min-w-4 px-1 p-0 flex items-center justify-center text-[9px] gradient-bronze border-0 text-white">
                                            {cartCount > 99 ? '99+' : cartCount}
                                        </Badge>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                        <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive('/cart') ? 'text-primary' : 'text-muted-foreground'}`}>
                            Carrinho
                        </span>
                        {isActive('/cart') && (
                            <motion.div layoutId="bottomNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full gradient-bronze" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                        )}
                    </button>

                </div>
            </nav>

            {/* Notifications Bottom Sheet */}
            <NotificationsBottomSheet
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkRead={handleMarkRead}
                onRemove={handleRemoveNotification}
                onClearAll={handleClearAll}
                lastChecked={lastChecked}
            />
        </>
    )
}
