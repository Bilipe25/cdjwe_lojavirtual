import Link from 'next/link'
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
            <main id="main-content" className="flex-1">
                {children}
            </main>
            <CartDrawer />
            <footer className="border-t bg-muted/30" role="contentinfo">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        {/* Brand */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="h-8 w-8 rounded-lg gradient-bronze flex items-center justify-center">
                                    <span className="text-white font-bold text-xs">CJ</span>
                                </div>
                                <span className="font-semibold font-heading text-gradient-navy">CDJWE Estofados</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Estofados de alta qualidade para revenda. Fábrica própria com entrega para todo o Brasil.
                            </p>
                        </div>

                        {/* Navigation */}
                        <div>
                            <h3 className="font-semibold text-sm mb-3">Navegação</h3>
                            <nav className="flex flex-col gap-2">
                                <Link href="/catalog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Catálogo</Link>
                                <Link href="/favorites" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Favoritos</Link>
                                <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Meus Pedidos</Link>
                                <Link href="/cart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Carrinho</Link>
                                <Link href="/profile" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Meu Perfil</Link>
                            </nav>
                        </div>

                        {/* Contact */}
                        <div>
                            <h3 className="font-semibold text-sm mb-3">Contato</h3>
                            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                                <a href="https://wa.me/5500000000000" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                                    📱 WhatsApp
                                </a>
                                <a href="mailto:contato@cdjwe.com.br" className="hover:text-foreground transition-colors">
                                    ✉️ contato@cdjwe.com.br
                                </a>
                                <span>📍 São Paulo, SP</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t mt-8 pt-6 text-center text-xs text-muted-foreground">
                        <p>© {new Date().getFullYear()} CDJWE Estofados. Todos os direitos reservados.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
