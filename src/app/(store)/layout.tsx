import { Suspense } from 'react'
import { StoreHeader } from '@/components/layout/store-header'
import { StoreFooter } from '@/components/layout/store-footer'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { CartDrawer } from '@/components/cart/cart-drawer'

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col">
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
    )
}
