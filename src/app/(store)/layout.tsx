import { StoreHeader } from '@/components/layout/store-header'
import { CartDrawer } from '@/components/cart/cart-drawer'

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col">
            <StoreHeader />
            <main className="flex-1">
                {children}
            </main>
            <CartDrawer />
            <footer className="border-t py-6 text-center text-sm text-muted-foreground">
                <p>© {new Date().getFullYear()} CDJWE Estofados. Todos os direitos reservados.</p>
            </footer>
        </div>
    )
}
