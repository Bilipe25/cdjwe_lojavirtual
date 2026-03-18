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
import { useNotifications } from '@/lib/hooks/use-notifications'
import { useState, useEffect } from 'react'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'

export function MobileBottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    const { isStandalone } = usePwaRuntime()
    const { totalItems } = useCartStore()
    const [isMounted, setIsMounted] = useState(false)
    const [notifOpen, setNotifOpen] = useState(false)

    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
    } = useNotifications()

    const cartCount = totalItems()

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => setIsMounted(true))
        return () => window.cancelAnimationFrame(frame)
    }, [])

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
        if (href === '/catalog') return pathname.startsWith('/catalog')
        return pathname.startsWith(href)
    }

    return (
        <>
            <nav
                data-mobile-bottom-nav
                className={`fixed bottom-0 left-0 right-0 z-40 md:hidden ${isStandalone ? 'safe-x pb-2' : ''}`}
                style={{ paddingBottom: isStandalone ? 'max(env(safe-area-inset-bottom, 0px), 8px)' : 'env(safe-area-inset-bottom, 0px)' }}
                role="navigation"
                aria-label="Navegacao principal mobile"
            >
                <div
                    data-mobile-bottom-nav-inner
                    className={`flex items-center justify-around h-(--bottom-nav-height) ${
                        isStandalone
                            ? 'mx-auto max-w-md rounded-[24px] border border-white/65 bg-white/92 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl'
                            : 'glass-nav'
                    }`}
                >
                    <Link
                        href="/dashboard"
                        className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 mobile-touch-target"
                        aria-label="Dashboard"
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <LayoutGrid className={`h-5 w-5 transition-colors duration-200 ${isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`} />
                        </motion.div>
                        <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`}>
                            Dashboard
                        </span>
                        {isActive('/dashboard') && (
                            <motion.div layoutId="bottomNavIndicator" className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full gradient-bronze" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                        )}
                    </Link>

                    <Link
                        href="/catalog"
                        className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 mobile-touch-target"
                        aria-label="Catalogo"
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <Package className={`h-5 w-5 transition-colors duration-200 ${isActive('/catalog') ? 'text-primary' : 'text-muted-foreground'}`} />
                        </motion.div>
                        <span className={`text-[10px] font-medium transition-colors duration-200 ${isActive('/catalog') ? 'text-primary' : 'text-muted-foreground'}`}>
                            Catalogo
                        </span>
                        {isActive('/catalog') && (
                            <motion.div layoutId="bottomNavIndicator" className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full gradient-bronze" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                        )}
                    </Link>

                    <button
                        onClick={() => { setNotifOpen(true); markAllAsRead() }}
                        className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 mobile-touch-target"
                        aria-label={`Notificacoes${unreadCount > 0 ? ` - ${unreadCount} nao lidas` : ''}`}
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
                                        <Badge className="flex h-4 min-w-4 items-center justify-center border-0 bg-blue-500 px-1 p-0 text-[9px] text-white">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </Badge>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                        <span className="text-[10px] font-medium text-muted-foreground transition-colors duration-200">
                            Notificacoes
                        </span>
                    </button>

                    <button
                        onClick={() => router.push('/cart')}
                        className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 mobile-touch-target"
                        aria-label="Carrinho"
                    >
                        <motion.div whileTap={{ scale: 0.82 }} className="relative">
                            <ShoppingCart className={`h-5 w-5 transition-colors duration-200 ${isActive('/cart') ? 'text-primary' : 'text-muted-foreground'}`} />
                            <AnimatePresence>
                                {isMounted && cartCount > 0 && (
                                    <motion.div
                                        key={`cartbadge-${cartCount}`}
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 500,
                                            damping: 15,
                                            mass: 0.5,
                                        }}
                                        className="absolute -top-2 -right-2"
                                    >
                                        <Badge className="flex h-4 min-w-4 items-center justify-center border-0 px-1 p-0 text-[9px] text-white gradient-bronze">
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
                            <motion.div layoutId="bottomNavIndicator" className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full gradient-bronze" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                        )}
                    </button>
                </div>
            </nav>

            <NotificationsBottomSheet
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAllRead={markAllAsRead}
                onRemove={removeNotification}
                onClearAll={clearAll}
                onMarkRead={markAsRead}
            />
        </>
    )
}
