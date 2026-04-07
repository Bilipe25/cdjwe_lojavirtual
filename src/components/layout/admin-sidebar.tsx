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
    ChevronDown,
    FolderClosed,
    Store,
    Megaphone,
    Bell,
    Send,
    Image as ImageIcon,
    History,
    BriefcaseBusiness,
    Wallet,
    Truck,
    MapPin,
    Route,
    PackageCheck,
    UserCircle,
    Warehouse,
    DollarSign,
    TicketPercent,
    ShieldCheck,
    Database,
} from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/login/actions'
import { setViewAsCustomerAction, setViewAsRepresentativeAction } from '@/app/admin/actions/view-as-customer'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const topNavItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const cadastrosNavItems = [
    { href: '/admin/categories', label: 'Categorias', icon: Layers },
    { href: '/admin/products', label: 'Produtos', icon: Package },
    { href: '/admin/product-tax-profiles', label: 'Perfis Tributarios', icon: ShieldCheck },
    { href: '/admin/fiscal-bases', label: 'Bases Fiscais', icon: Database },
    { href: '/admin/fabrics', label: 'Tecidos & Cores', icon: Palette },
    { href: '/admin/price-tables', label: 'Tabelas de Preço', icon: Tag },
    { href: '/admin/payment-conditions', label: 'Meios de Pagamento', icon: CreditCard },
]

const marketingNavItems = [
    { href: '/admin/marketing/campaigns', label: 'Campanhas', icon: Megaphone },
    { href: '/admin/marketing/coupons', label: 'Cupons', icon: TicketPercent },
    { href: '/admin/marketing/notifications', label: 'Notificações', icon: Bell },
    { href: '/admin/marketing/push', label: 'Push Notifications', icon: Send },
    { href: '/admin/marketing/popups', label: 'Popups', icon: ImageIcon },
    { href: '/admin/marketing/history', label: 'Histórico', icon: History },
]

const financeiroNavItems = [
    { href: '/admin/financeiro/contas-a-receber', label: 'Contas a Receber', icon: Wallet },
    { href: '/admin/financeiro/relatorio', label: 'Relatório', icon: BarChart3 },
]

const logisticaNavItems = [
    { href: '/admin/logistica/pedidos', label: 'Pedidos p/ Rota', icon: PackageCheck },
    { href: '/admin/logistica/rotas', label: 'Central de Rotas', icon: Route },
    { href: '/admin/logistica/historico', label: 'Histórico', icon: History },
    { href: '/admin/logistica/veiculos', label: 'Veículos', icon: Truck },
    { href: '/admin/logistica/motoristas', label: 'Motoristas', icon: UserCircle },
    { href: '/admin/logistica/centros', label: 'Centros', icon: Warehouse },
    { href: '/admin/logistica/regioes', label: 'Regiões', icon: MapPin },
    { href: '/admin/logistica/custos', label: 'Custos', icon: DollarSign },
]

const bottomNavItems = [
    { href: '/admin/orders', label: 'Pedidos', icon: ClipboardList },
    { href: '/admin/customers', label: 'Clientes', icon: Users },
    { href: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
    { href: '/admin/settings', label: 'Configurações', icon: Settings },
]

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [collapsed, setCollapsed] = useState(false)
    const [cadastrosOpen, setCadastrosOpen] = useState(false)
    const [marketingOpen, setMarketingOpen] = useState(false)
    const [financeiroOpen, setFinanceiroOpen] = useState(false)
    const [logisticaOpen, setLogisticaOpen] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)

    const isCadastroActive = cadastrosNavItems.some(item => pathname.startsWith(item.href))
    const isMarketingActive = marketingNavItems.some(item => pathname.startsWith(item.href))
    const isFinanceiroActive = financeiroNavItems.some(item => pathname.startsWith(item.href))
    const isLogisticaActive = logisticaNavItems.some(item => pathname.startsWith(item.href))
    const effectiveCadastrosOpen = !collapsed && (cadastrosOpen || isCadastroActive)
    const effectiveMarketingOpen = !collapsed && (marketingOpen || isMarketingActive)
    const effectiveFinanceiroOpen = !collapsed && (financeiroOpen || isFinanceiroActive)
    const effectiveLogisticaOpen = !collapsed && (logisticaOpen || isLogisticaActive)

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
        await setViewAsRepresentativeAction(true)
        router.push('/sales/dashboard')
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
                <div className="flex items-center justify-center h-16 border-b border-sidebar-border shrink-0">
                    {settings?.logo_url ? (
                        <div className={`relative shrink-0 transition-all duration-300 ${collapsed ? 'h-10 w-12' : 'h-10 w-44 pr-4 ml-4'}`}>
                            <Image
                                priority
                                src={settings.logo_url}
                                alt={settings.system_name || 'Admin'}
                                fill
                                sizes={collapsed ? '48px' : '176px'}
                                className={`object-contain ${collapsed ? 'object-center' : 'object-left'}`}
                            />
                        </div>
                    ) : (
                        <div className={`flex items-center gap-2 ${collapsed ? '' : 'px-4 w-full'}`}>
                            <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-sm">
                                    {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                </span>
                            </div>
                            {!collapsed && (
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-sm font-semibold truncate font-heading text-sidebar-foreground">
                                        {settings?.system_name || 'CDJWE'}
                                    </span>
                                    <span className="text-[10px] text-sidebar-foreground/60">Painel Admin</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                    {/* Top Items */}
                    {topNavItems.map((item) => {
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

                    {/* Cadastros Group */}
                    <div className="pt-1">
                        {collapsed ? (
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger render={(
                                        <DropdownMenuTrigger render={(
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-center px-2 gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                                    isCadastroActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
                                                )}
                                            >
                                                <FolderClosed className="h-5 w-5 shrink-0" />
                                            </Button>
                                        )} />
                                    )} />
                                    <TooltipContent side="right">
                                        <p>Cadastros</p>
                                    </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent side="right" sideOffset={16} align="start" className="w-56">
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Cadastros
                                    </div>
                                    {cadastrosNavItems.map((item) => {
                                        const isActive = pathname.startsWith(item.href)
                                        return (
                                            <DropdownMenuItem key={item.href} render={(
                                                <Link href={item.href} className={cn(
                                                    "cursor-pointer flex items-center gap-2",
                                                    isActive && "bg-accent text-accent-foreground font-medium"
                                                )}>
                                                    <item.icon className="h-4 w-4 shrink-0" />
                                                    {item.label}
                                                </Link>
                                            )} />
                                        )
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="space-y-1">
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
                                                    <Link key={item.href} href={item.href} className="block relative">
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
                        )}
                    </div>

                    {/* Marketing Group */}
                    <div className="pt-1">
                        {collapsed ? (
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger render={(
                                        <DropdownMenuTrigger render={(
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-center px-2 gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                                    isMarketingActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
                                                )}
                                            >
                                                <Megaphone className="h-5 w-5 shrink-0" />
                                            </Button>
                                        )} />
                                    )} />
                                    <TooltipContent side="right">
                                        <p>Marketing</p>
                                    </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent side="right" sideOffset={16} align="start" className="w-56">
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Marketing
                                    </div>
                                    {marketingNavItems.map((item) => {
                                        const isActive = pathname.startsWith(item.href)
                                        return (
                                            <DropdownMenuItem key={item.href} render={(
                                                <Link href={item.href} className={cn(
                                                    "cursor-pointer flex items-center gap-2",
                                                    isActive && "bg-accent text-accent-foreground font-medium"
                                                )}>
                                                    <item.icon className="h-4 w-4 shrink-0" />
                                                    {item.label}
                                                </Link>
                                            )} />
                                        )
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="space-y-1">
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
                                                    <Link key={item.href} href={item.href} className="block relative">
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
                        )}
                    </div>

                    {/* Financeiro Group */}
                    <div className="pt-1">
                        {collapsed ? (
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger render={(
                                        <DropdownMenuTrigger render={(
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-center px-2 gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                                    isFinanceiroActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
                                                )}
                                            >
                                                <Wallet className="h-5 w-5 shrink-0" />
                                            </Button>
                                        )} />
                                    )} />
                                    <TooltipContent side="right">
                                        <p>Financeiro</p>
                                    </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent side="right" sideOffset={16} align="start" className="w-56">
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Financeiro
                                    </div>
                                    {financeiroNavItems.map((item) => {
                                        const isActive = pathname.startsWith(item.href)
                                        return (
                                            <DropdownMenuItem key={item.href} render={(
                                                <Link href={item.href} className={cn(
                                                    "cursor-pointer flex items-center gap-2",
                                                    isActive && "bg-accent text-accent-foreground font-medium"
                                                )}>
                                                    <item.icon className="h-4 w-4 shrink-0" />
                                                    {item.label}
                                                </Link>
                                            )} />
                                        )
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="space-y-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => setFinanceiroOpen(!financeiroOpen)}
                                    className={cn(
                                        'w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                        isFinanceiroActive && !financeiroOpen && 'text-sidebar-foreground font-medium'
                                    )}
                                >
                                    <Wallet className="h-5 w-5 shrink-0" />
                                    <span className="flex-1 text-left truncate">Financeiro</span>
                                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", effectiveFinanceiroOpen && "rotate-180")} />
                                </Button>
                                <div className={cn(
                                    "grid transition-all duration-200 ease-in-out",
                                    effectiveFinanceiroOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                )}>
                                    <div className="overflow-hidden">
                                        <div className="pl-9 pr-2 py-1 space-y-1 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-px before:bg-sidebar-border">
                                            {financeiroNavItems.map((item) => {
                                                const isActive = pathname.startsWith(item.href)
                                                return (
                                                    <Link key={item.href} href={item.href} className="block relative">
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
                        )}
                    </div>

                    {/* Logística Group */}
                    <div className="pt-1">
                        {collapsed ? (
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger render={(
                                        <DropdownMenuTrigger render={(
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    'w-full justify-center px-2 gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                                    isLogisticaActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
                                                )}
                                            >
                                                <Truck className="h-5 w-5 shrink-0" />
                                            </Button>
                                        )} />
                                    )} />
                                    <TooltipContent side="right">
                                        <p>Logística</p>
                                    </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent side="right" sideOffset={16} align="start" className="w-56">
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Logística
                                    </div>
                                    {logisticaNavItems.map((item) => {
                                        const isActive = pathname.startsWith(item.href)
                                        return (
                                            <DropdownMenuItem key={item.href} render={(
                                                <Link href={item.href} className={cn(
                                                    "cursor-pointer flex items-center gap-2",
                                                    isActive && "bg-accent text-accent-foreground font-medium"
                                                )}>
                                                    <item.icon className="h-4 w-4 shrink-0" />
                                                    {item.label}
                                                </Link>
                                            )} />
                                        )
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="space-y-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => setLogisticaOpen(!logisticaOpen)}
                                    className={cn(
                                        'w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
                                        isLogisticaActive && !logisticaOpen && 'text-sidebar-foreground font-medium'
                                    )}
                                >
                                    <Truck className="h-5 w-5 shrink-0" />
                                    <span className="flex-1 text-left truncate">Logística</span>
                                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", effectiveLogisticaOpen && "rotate-180")} />
                                </Button>
                                <div className={cn(
                                    "grid transition-all duration-200 ease-in-out",
                                    effectiveLogisticaOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                )}>
                                    <div className="overflow-hidden">
                                        <div className="pl-9 pr-2 py-1 space-y-1 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-px before:bg-sidebar-border">
                                            {logisticaNavItems.map((item) => {
                                                const isActive = pathname.startsWith(item.href)
                                                return (
                                                    <Link key={item.href} href={item.href} className="block relative">
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
                        )}
                    </div>

                    {/* Bottom Items */}
                    <div className="pt-1">
                        {bottomNavItems.map((item) => {
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
                    </div>
                </nav>

                {/* Bottom Actions */}
                <div className="border-t border-sidebar-border p-2 space-y-1">
                    {collapsed ? (
                        <>
                            <Tooltip>
                                <TooltipTrigger
                                    render={(
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-center px-2 text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent"
                                            onClick={handleViewAsCustomer}
                                        />
                                    )}
                                >
                                    <Store className="h-5 w-5" />
                                </TooltipTrigger>
                                <TooltipContent side="right">Ver como Cliente</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger
                                    render={(
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-center px-2 text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent"
                                            onClick={handleViewAsRepresentative}
                                        />
                                    )}
                                >
                                    <BriefcaseBusiness className="h-5 w-5" />
                                </TooltipTrigger>
                                <TooltipContent side="right">Modo Representante</TooltipContent>
                            </Tooltip>
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
                        </>
                    ) : (
                        <>
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
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-foreground hover:bg-sidebar-accent"
                                onClick={handleViewAsRepresentative}
                            >
                                <BriefcaseBusiness className="h-5 w-5" />
                                <span>Modo Representante</span>
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-5 w-5" />
                                <span>Sair</span>
                            </Button>
                        </>
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
