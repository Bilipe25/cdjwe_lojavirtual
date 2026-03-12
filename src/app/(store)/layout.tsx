'use client'

import { Suspense } from 'react'
import { StoreHeader } from '@/components/layout/store-header'
import { StoreFooter } from '@/components/layout/store-footer'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { useSettings } from '@/components/providers/settings-provider'

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isOnline } = useNetworkStatus()
    const pathname = usePathname()

    return (
        <SettingsProvider>
            <ErrorBoundary>
                <div className="min-h-screen flex flex-col relative">
                    {/* Sticky Header Group */}
                    <div className="sticky top-0 z-50 w-full">
                        <AnimatePresence>
                            {!isOnline && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="bg-destructive text-destructive-foreground text-[10px] font-bold py-1 px-4 flex items-center justify-center gap-2 border-b border-destructive/20"
                                >
                                    <WifiOff className="h-3 w-3" />
                                    Você está offline. Algumas funções podem não funcionar.
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Desktop Header */}
                        <Suspense fallback={<div className="h-16 border-b bg-muted/10 animate-pulse hidden md:block" />}>
                            <StoreHeader />
                        </Suspense>

                        {/* Mobile TopBar */}
                        <Suspense fallback={<div className="h-12 border-b bg-muted/20 animate-pulse md:hidden" />}>
                            <MobileTopBar />
                        </Suspense>
                    </div>

                    <main id="main-content" className="flex-1 pb-(--bottom-nav-height) md:pb-0">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={pathname}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="w-full h-full"
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    </main>

                    <CartDrawer />

                    {/* Desktop Footer - hidden on mobile */}
                    <div className="hidden md:block">
                        <StoreFooter />
                    </div>

                    {/* Mobile Bottom Nav - hidden on desktop */}
                    <MobileBottomNav />
                </div>
            </ErrorBoundary>
        </SettingsProvider>
    )
}
