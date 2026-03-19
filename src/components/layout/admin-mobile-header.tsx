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
    BriefcaseBusiness,
    ChevronDown,
    FolderClosed,
} from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/login/actions'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { setViewAsCustomerAction, setViewAsRepresentativeAction } from '@/app/admin/actions/view-as-customer'

const topNavItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const cadastrosNavItems = [
    { href: '/admin/categories', label: 'Categorias', icon: Layers },
    { href: '/admin/products', label: 'Produtos', icon: Package },
    { href: '/admin/fabrics', label: 'Tecidos & Cores', icon: Palette },
    { href: '/admin/price-tables', label: 'Tabelas de Preço', icon: Tag },
    { href: '/admin/payment-conditions', label: 'Meios de Pagamento', icon: CreditCard },
]

const marketingNavItems = [
    { href: '/admin/marketing/campaigns', label: 'Campanhas', icon: Megaphone },
    { href: '/admin/marketing/notifications', label: 'Notificações', icon: Bell },
    { href: '/admin/marketing/push', label: 'Push Notifications', icon: Send },
    { href: '/admin/marketing/popups', label: 'Popups', icon: ImageIcon },
    { href: '/admin/marketing/history', label: 'Histórico', icon: History },
]

const bottomNavItems = [
    { href: '/admin/orders', label: 'Pedidos', icon: ClipboardList },
    { href: '/admin/customers', label: 'Clientes', icon: Users },
    { href: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
    { href: '/admin/settings', label: 'Configurações', icon: Settings },
]

export function AdminMobileHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)
    const [cadastrosOpen, setCadastrosOpen] = useState(false)
    const [marketingOpen, setMarketingOpen] = useState(false)

    const isCadastroActive = cadastrosNavItems.some(item => pathname.startsWith(item.href))
    const isMarketingActive = marketingNavItems.some(item => pathname.startsWith(item.href))
    const effectiveCadastrosOpen = cadastrosOpen || isCadastroActive
    const effectiveMarketingOpen = marketingOpen || isMarketingActive

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

    const handleViewAsRepresentative = async () => {
        setOpen(false)
        await setViewAsRepresentativeAction(true)
        router.push('/sales/dashboard')
    }

    // Find active page title
    const activeItem = [...topNavItems, ...cadastrosNavItems, ...marketingNavItems, ...bottomNavItems].find(item => pathname.startsWith(item.href))

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
                        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border shrink-0">
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
                            {/* Top Items */}
                            {topNavItems.map((item) => {
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
                                            <item.icon className="h-5 w-5 shrink-0" />
                                            {item.label}
                                        </Button>
                                    </Link>
                                )
                            })}

                            {/* Cadastros Group */}
                            <div className="pt-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => setCadastrosOpen(!cadastrosOpen)}
                                    className={cn(
                                        'w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                        isCadastroActive && !cadastrosOpen && 'text-sidebar-foreground font-medium'
                                    )}
                                >
                                    <FolderClosed className="h-5 w-5 shrink-0" />
                                    <span className="flex-1 text-left truncate">Cadastros</span>
                                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", effectiveCadastrosOpen && "rotate-180")} />
                                </Button>
                                <div className={cn(
                                    "grid transition-all duration-200 ease-in-out",
                                    effectiveCadastrosOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                )}>
                                    <div className="overflow-hidden">
                                        <div className="pl-9 pr-2 py-1 space-y-1 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-px before:bg-sidebar-border">
                                            {cadastrosNavItems.map((item) => {
                                                const isActive = pathname.startsWith(item.href)
                                                return (
                                                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block relative">
                                                        {isActive && (
                                                            <div className="absolute -left-[17px] top-1/2 -translate-y-1/2 w-[2px] h-4 bg-primary rounded-full" />
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className={cn(
                                                                'w-full justify-start gap-3 h-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent shadow-none',
                                                                isActive && 'bg-sidebar-accent/50 text-sidebar-primary font-medium'
                                                            )}
                                                        >
                                                            <span className="truncate">{item.label}</span>
                                                        </Button>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Marketing Group */}
                            <div className="pt-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => setMarketingOpen(!marketingOpen)}
                                    className={cn(
                                        'w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                        isMarketingActive && !marketingOpen && 'text-sidebar-foreground font-medium'
                                    )}
                                >
                                    <Megaphone className="h-5 w-5 shrink-0" />
                                    <span className="flex-1 text-left truncate">Marketing</span>
                                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", effectiveMarketingOpen && "rotate-180")} />
                                </Button>
                                <div className={cn(
                                    "grid transition-all duration-200 ease-in-out",
                                    effectiveMarketingOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                )}>
                                    <div className="overflow-hidden">
                                        <div className="pl-9 pr-2 py-1 space-y-1 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-px before:bg-sidebar-border">
                                            {marketingNavItems.map((item) => {
                                                const isActive = pathname.startsWith(item.href)
                                                return (
                                                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block relative">
                                                        {isActive && (
                                                            <div className="absolute -left-[17px] top-1/2 -translate-y-1/2 w-[2px] h-4 bg-primary rounded-full" />
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className={cn(
                                                                'w-full justify-start gap-3 h-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent shadow-none',
                                                                isActive && 'bg-sidebar-accent/50 text-sidebar-primary font-medium'
                                                            )}
                                                        >
                                                            <span className="truncate">{item.label}</span>
                                                        </Button>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Items */}
                            <div className="pt-1">
                                {bottomNavItems.map((item) => {
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
                                                <item.icon className="h-5 w-5 shrink-0" />
                                                {item.label}
                                            </Button>
                                        </Link>
                                    )
                                })}
                            </div>
                        </nav>

                        {/* Bottom Actions */}
                        <div className="border-t border-sidebar-border p-2 space-y-1 shrink-0">
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent"
                                onClick={handleViewAsCustomer}
                            >
                                <Store className="h-5 w-5 shrink-0" />
                                <span>Ver como Cliente</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent"
                                onClick={handleViewAsRepresentative}
                            >
                                <BriefcaseBusiness className="h-5 w-5 shrink-0" />
                                <span>Modo Representante</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-5 w-5 shrink-0" />
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
                <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-xs">
                        {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                    </span>
                </div>
            )}
        </header>
    )
}
