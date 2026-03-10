'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    Package,
    Palette,
    ClipboardList,
    Users,
    Settings,
    Tag,
    LogOut,
    Menu,
    CreditCard,
    BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const adminNavItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/products', label: 'Produtos', icon: Package },
    { href: '/admin/fabrics', label: 'Tecidos & Cores', icon: Palette },
    { href: '/admin/orders', label: 'Pedidos', icon: ClipboardList },
    { href: '/admin/customers', label: 'Clientes', icon: Users },
    { href: '/admin/price-tables', label: 'Tabelas de Preço', icon: Tag },
    { href: '/admin/payment', label: 'Pagamento', icon: CreditCard },
    { href: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
    { href: '/admin/settings', label: 'Configurações', icon: Settings },
]

export function AdminMobileHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }

    // Find active page title
    const activeItem = adminNavItems.find(item => pathname.startsWith(item.href))

    return (
        <header className="md:hidden sticky top-0 z-50 glass border-b px-4 h-14 flex items-center justify-between">
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Menu className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground">
                    <div className="flex flex-col h-full">
                        {/* Logo */}
                        <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-border">
                            <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center">
                                <span className="text-white font-bold text-sm">CJ</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold font-[family-name:var(--font-heading)]">CDJWE</span>
                                <span className="text-[10px] text-sidebar-foreground/60">Painel Admin</span>
                            </div>
                        </div>

                        {/* Nav */}
                        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                            {adminNavItems.map((item) => {
                                const isActive = pathname.startsWith(item.href)
                                return (
                                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                                        <Button
                                            variant="ghost"
                                            className={cn(
                                                'w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                                isActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
                                            )}
                                        >
                                            <item.icon className="h-5 w-5" />
                                            {item.label}
                                        </Button>
                                    </Link>
                                )
                            })}
                        </nav>

                        {/* Logout */}
                        <div className="border-t border-sidebar-border p-2">
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-5 w-5" />
                                Sair
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <span className="font-semibold font-[family-name:var(--font-heading)] text-sm">
                {activeItem?.label || 'Admin'}
            </span>

            <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center">
                <span className="text-white font-bold text-xs">CJ</span>
            </div>
        </header>
    )
}
