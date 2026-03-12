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

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isOnline } = useNetworkStatus()

    return (
        <SettingsProvider>
            <ErrorBoundary>
                <div className="min-h-screen flex flex-col relative">
                    <AnimatePresence>
                        {!isOnline && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="bg-destructive text-destructive-foreground text-[10px] font-bold py-1 px-4 flex items-center justify-center gap-2 sticky top-0 z-100"
                            >
                                <WifiOff className="h-3 w-3" />
                                Você está offline. Algumas funções podem não funcionar.
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Desktop Header - hidden on mobile */}
                    <div className="hidden md:block">
                        <StoreHeader />
                    </div>

                    {/* Mobile TopBar - hidden on desktop */}
                    <Suspense fallback={<div className="h-12 border-b bg-muted/20 animate-pulse md:hidden" />}>
                        <MobileTopBar />
                    </Suspense>

                    <main id="main-content" className="flex-1 pb-(--bottom-nav-height) md:pb-0">
                        {children}
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
