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
    Layers,
    Store,
    Megaphone,
    Bell,
    Send,
    Image as ImageIcon,
    History,
} from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/login/actions'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { setViewAsCustomerAction } from '@/app/admin/actions/view-as-customer'

const adminNavItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/categories', label: 'Categorias', icon: Layers },
    { href: '/admin/products', label: 'Produtos', icon: Package },
    { href: '/admin/fabrics', label: 'Tecidos & Cores', icon: Palette },
    { href: '/admin/orders', label: 'Pedidos', icon: ClipboardList },
    { href: '/admin/customers', label: 'Clientes', icon: Users },
    { href: '/admin/price-tables', label: 'Tabelas de Preço', icon: Tag },
    { href: '/admin/payment-conditions', label: 'Meios de Pagamento', icon: CreditCard },
    { href: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
    { href: '/admin/settings', label: 'Configurações', icon: Settings },
]

const marketingNavItems = [
    { href: '/admin/marketing/campaigns', label: 'Campanhas', icon: Megaphone },
    { href: '/admin/marketing/notifications', label: 'Notificações', icon: Bell },
    { href: '/admin/marketing/push', label: 'Push Notifications', icon: Send },
    { href: '/admin/marketing/popups', label: 'Popups', icon: ImageIcon },
    { href: '/admin/marketing/history', label: 'Histórico', icon: History },
]

export function AdminMobileHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)

    useEffect(() => {
        const loadSettings = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
            if (data) setSettings(data)
        }
        loadSettings()
    }, [])

    const handleLogout = async () => {
        await logoutAction()
        router.push('/login')
    }

    const handleViewAsCustomer = async () => {
        await setViewAsCustomerAction(true)
        router.push('/catalog')
    }

    // Find active page title
    const activeItem = [...adminNavItems, ...marketingNavItems].find(item => pathname.startsWith(item.href))

    return (
        <header className="md:hidden sticky top-0 z-50 glass border-b px-4 h-14 flex items-center justify-between">
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger render={<Button variant="ghost" size="icon" />}>
                    <Menu className="h-5 w-5" />
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground">
                    <div className="flex flex-col h-full">
                        {/* Logo */}
                        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
                            {settings?.logo_url ? (
                                <div className="h-10 w-24 shrink-0 relative">
                                    <Image priority src={settings.logo_url} alt={settings.system_name || 'Admin'} fill className="object-contain object-left" />
                                </div>
                            ) : (
                                <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                                    <span className="text-white font-bold text-sm">
                                        {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-semibold font-heading truncate">
                                    {settings?.system_name || 'CDJWE'}
                                </span>
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

                            {/* Marketing Section */}
                            <div className="pt-3 mt-3 border-t border-sidebar-border">
                                <div className="px-3 pb-2">
                                    <span className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Marketing</span>
                                </div>
                                {marketingNavItems.map((item) => {
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
                            </div>
                        </nav>

                        {/* Bottom Actions */}
                        <div className="border-t border-sidebar-border p-2 space-y-1">
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent"
                                onClick={handleViewAsCustomer}
                            >
                                <Store className="h-5 w-5" />
                                <span>Ver como Cliente</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-5 w-5" />
                                <span>Sair</span>
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <span className="font-semibold font-heading text-lg text-gradient-navy">
                {activeItem?.label || 'Admin'}
            </span>

            {settings?.logo_url ? (
                <div className="h-8 w-8 relative shrink-0">
                    <Image priority src={settings.logo_url} alt={settings.system_name || 'Admin'} fill className="object-contain" />
                </div>
            ) : (
                <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center">
                    <span className="text-white font-bold text-xs">
                        {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                    </span>
                </div>
            )}
        </header>
    )
}
