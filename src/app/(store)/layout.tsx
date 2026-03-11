import { StoreHeader } from '@/components/layout/store-header'
import { StoreFooter } from '@/components/layout/store-footer'
import { CartDrawer } from '@/components/cart/cart-drawer'

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col">
            <StoreHeader />
            <main id="main-content" className="flex-1">
                {children}
            </main>
            <CartDrawer />
            <StoreFooter />
        </div>
    )
}
