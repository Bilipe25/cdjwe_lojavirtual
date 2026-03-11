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
    ChevronLeft,
    ChevronRight,
    CreditCard,
    BarChart3,
    Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/login/actions'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const adminNavItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/categories', label: 'Categorias', icon: Layers },
    { href: '/admin/products', label: 'Produtos', icon: Package },
    { href: '/admin/fabrics', label: 'Tecidos & Cores', icon: Palette },
    { href: '/admin/orders', label: 'Pedidos', icon: ClipboardList },
    { href: '/admin/customers', label: 'Clientes', icon: Users },
    { href: '/admin/price-tables', label: 'Tabelas de Preço', icon: Tag },
    { href: '/admin/payment-conditions', label: 'Pagamento', icon: CreditCard },
    { href: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
    { href: '/admin/settings', label: 'Configurações', icon: Settings },
]

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [collapsed, setCollapsed] = useState(false)

    const handleLogout = async () => {
        await logoutAction()
        router.push('/login')
    }

    return (
        <TooltipProvider>
            <aside
                className={cn(
                    'hidden md:flex flex-col h-screen sticky top-0 border-r transition-all duration-300 ease-in-out',
                    'bg-sidebar text-sidebar-foreground',
                    collapsed ? 'w-[68px]' : 'w-64'
                )}
            >
                {/* Logo */}
                <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-border shrink-0">
                    <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                        <span className="text-white font-bold text-sm">CJ</span>
                    </div>
                    {!collapsed && (
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold font-[family-name:var(--font-heading)] text-sidebar-foreground">
                                CDJWE
                            </span>
                            <span className="text-[10px] text-sidebar-foreground/60">Painel Admin</span>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                    {adminNavItems.map((item) => {
                        const isActive = pathname.startsWith(item.href)
                        const button = (
                            <Link key={item.href} href={item.href}>
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        'w-full gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                        collapsed ? 'justify-center px-2' : 'justify-start',
                                        isActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
                                    )}
                                >
                                    <item.icon className="h-5 w-5 shrink-0" />
                                    {!collapsed && <span className="truncate">{item.label}</span>}
                                </Button>
                            </Link>
                        )

                        if (collapsed) {
                            return (
                                <Tooltip key={item.href}>
                                    <TooltipTrigger render={button} />
                                    <TooltipContent side="right">
                                        <p>{item.label}</p>
                                    </TooltipContent>
                                </Tooltip>
                            )
                        }

                        return button
                    })}
                </nav>

                {/* Bottom Actions */}
                <div className="border-t border-sidebar-border p-2 space-y-1">
                    {collapsed ? (
                        <Tooltip>
                            <TooltipTrigger 
                                render={(
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-center px-2 text-sidebar-foreground/70 hover:text-destructive"
                                        onClick={handleLogout}
                                    />
                                )}
                            >
                                <LogOut className="h-5 w-5" />
                            </TooltipTrigger>
                            <TooltipContent side="right">Sair</TooltipContent>
                        </Tooltip>
                    ) : (
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
                            onClick={handleLogout}
                        >
                            <LogOut className="h-5 w-5" />
                            <span>Sair</span>
                        </Button>
                    )}
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm"
                >
                    {collapsed ? (
                        <ChevronRight className="h-3 w-3" />
                    ) : (
                        <ChevronLeft className="h-3 w-3" />
                    )}
                </button>
            </aside>
        </TooltipProvider>
    )
}
