'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Home,
    ShoppingCart,
    Package,
    ClipboardList,
    User,
    Menu,
    X,
    LogOut,
    Search,
    Heart,
    Bell,
    Scissors,
    Building2,
    Megaphone,
    Gift,
    Info,
    CheckCheck,
    Clock,
    CheckCircle2,
    Factory,
    Truck,
    AlertCircle,
    DollarSign,
    type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useCartStore } from '@/lib/stores/cart-store'
import { logoutAction } from '@/app/(auth)/login/actions'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { useNotifications, type ClientNotification } from '@/lib/hooks/use-notifications'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'

const navItems = [
    { href: '/catalog', label: 'Catalogo', icon: Package },
    { href: '/fabrics', label: 'Tecidos', icon: Scissors },
    { href: '/orders', label: 'Meus Pedidos', icon: ClipboardList },
    { href: '/about', label: 'Sobre Nos', icon: Building2 },
]

const desktopNavItems = [
    { href: '/dashboard', label: 'Inicio', icon: Home },
    ...navItems,
]

const typeConfig: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
    order_status: { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Pedido' },
    campaign: { icon: Megaphone, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Campanha' },
    promo: { icon: Gift, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Promocao' },
    system: { icon: Info, color: 'text-slate-600', bg: 'bg-slate-50', label: 'Sistema' },
    financial: { icon: DollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Financeiro' },
}

const priorityConfig: Record<string, { label: string; className: string }> = {
    low: { label: 'Baixa', className: 'bg-slate-100 text-slate-700' },
    normal: { label: 'Normal', className: 'bg-blue-100 text-blue-700' },
    high: { label: 'Alta', className: 'bg-amber-100 text-amber-700' },
    critical: { label: 'Critica', className: 'bg-red-100 text-red-700' },
}

const statusIcons: Record<string, LucideIcon> = {
    pending: Clock,
    approved: CheckCircle2,
    in_production: Factory,
    shipped: Truck,
    delivered: CheckCircle2,
    cancelled: AlertCircle,
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function getNotificationKindLabel(kind: string | null): string | null {
    if (!kind) return null

    const labels: Record<string, string> = {
        invoice_generated: 'Fatura gerada',
        payment_recorded: 'Pagamento registrado',
        invoice_due_soon: 'Vencimento proximo',
        invoice_due_today: 'Vence hoje',
        invoice_overdue: 'Fatura vencida',
        payment_overdue: 'Pagamento em atraso',
        critical_overdue: 'Atraso critico',
        sla_breach: 'SLA violado',
        financial_update: 'Atualizacao financeira',
        order_status_update: 'Atualizacao de pedido',
    }

    return labels[kind] || kind.replace(/_/g, ' ')
}

export function StoreHeader() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const { isStandalone } = usePwaRuntime()
    const { totalItems, openCart } = useCartStore()
    const [compactMenuOpen, setCompactMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)
    const cartCount = totalItems()
    const favCount = useFavoritesStore((state) => state.favoriteIds.length)
    const [isMounted, setIsMounted] = useState(false)
    const [notifOpen, setNotifOpen] = useState(false)

    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
    } = useNotifications()

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const supabase = createClient()
                const { data } = await supabase
                    .from('system_settings')
                    .select('logo_url, system_name')
                    .limit(1)
                    .single()

                if (data) setSettings(data)
            } catch {
                // silent
            }
        }

        void loadSettings()
        void useFavoritesStore.getState().syncFromDb()

        const frame = window.requestAnimationFrame(() => setIsMounted(true))
        return () => window.cancelAnimationFrame(frame)
    }, [])

    useEffect(() => {
        const query = searchParams.get('search') || ''

        const frame = window.requestAnimationFrame(() => {
            setSearchQuery((current) => (current === query ? current : query))
        })

        return () => window.cancelAnimationFrame(frame)
    }, [searchParams])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const currentSearch = searchParams.get('search') || ''
            if (searchQuery === currentSearch) return

            const params = new URLSearchParams(searchParams.toString())
            if (searchQuery.trim()) {
                params.set('search', searchQuery.trim())
            } else {
                params.delete('search')
            }

            if (pathname.startsWith('/catalog')) {
                router.replace(`${pathname}?${params.toString()}`, { scroll: false })
            }
        }, 300)

        return () => window.clearTimeout(timer)
    }, [searchQuery, pathname, router, searchParams])

    const handleSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && searchQuery.trim() && !pathname.startsWith('/catalog')) {
            router.push(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`)
        }
    }

    const handleLogout = async () => {
        await logoutAction()
        router.push('/login')
    }

    const handleNotificationClick = (notification: ClientNotification) => {
        if (!notification.is_read) markAsRead(notification.id)
        setNotifOpen(false)
        if (notification.link) router.push(notification.link)
    }

    if (!isMounted) return null

    const displayNotifications = notifications.slice(0, 8)

    return (
        <motion.header
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            data-store-header
            className={`sticky top-0 z-50 hidden w-full md:block ${isStandalone ? 'px-4 pt-4 lg:px-6' : ''}`}
            role="banner"
        >
            <div className={isStandalone ? 'rounded-[24px] border border-white/70 bg-white/88 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl' : 'glass-card border-0 border-b'}>
                <div className={`mx-auto ${isStandalone ? 'max-w-[1440px] px-5 lg:px-6' : 'max-w-7xl px-4 sm:px-6 lg:px-8'}`}>
                    <div className={`flex items-center justify-between gap-4 ${isStandalone ? 'h-[68px]' : 'h-16'}`}>
                        <Link href="/catalog" className="flex shrink-0 items-center gap-3" aria-label={`${settings?.system_name || 'Loja'} - Pagina inicial`}>
                            {settings?.logo_url ? (
                                <div className="relative h-10 w-24 shrink-0 sm:w-32">
                                    <Image priority src={settings.logo_url} alt={settings.system_name || 'Loja'} fill className="object-contain object-left" />
                                </div>
                            ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-bronze">
                                    <span className="font-heading text-sm font-bold text-white">
                                        {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                    </span>
                                </div>
                            )}
                        </Link>

                        <nav className={`hidden items-center ${isStandalone ? 'gap-1.5 xl:flex' : 'gap-1 lg:flex'}`} aria-label="Navegacao principal">
                            {desktopNavItems.map((item) => {
                                const isActive = pathname.startsWith(item.href)
                                return (
                                    <Link key={item.href} href={item.href}>
                                        <Button
                                            variant={isActive ? 'secondary' : 'ghost'}
                                            size="sm"
                                            className={`gap-2 ${isActive ? 'bg-primary/10 text-primary' : ''} ${isStandalone ? 'rounded-xl px-3.5' : ''}`}
                                        >
                                            <item.icon className="h-4 w-4" />
                                            {item.label}
                                        </Button>
                                    </Link>
                                )
                            })}
                        </nav>

                        <div className={`hidden flex-1 ${isStandalone ? 'max-w-xl xl:flex' : 'max-w-md lg:flex'}`}>
                            <div className="relative w-full">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar produtos..."
                                    className={`pl-9 border-border/50 focus:bg-white ${isStandalone ? 'h-11 rounded-2xl bg-white/85 shadow-sm' : 'bg-white/60'}`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleSearch}
                                />
                            </div>
                        </div>

                        <div className={`flex items-center ${isStandalone ? 'gap-1.5' : 'gap-1'}`}>
                            <Link href="/favorites">
                                <Button variant="ghost" size="icon" className={`relative ${isStandalone ? 'rounded-xl' : ''}`}>
                                    <Heart className="h-5 w-5" />
                                    {favCount > 0 && (
                                        <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center border-0 bg-red-500 p-0 text-[9px] text-white">
                                            {favCount}
                                        </Badge>
                                    )}
                                </Button>
                            </Link>

                            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={`relative ${isStandalone ? 'rounded-xl' : ''}`} />}>
                                    <Bell className="h-5 w-5" />
                                    <AnimatePresence>
                                        {unreadCount > 0 && (
                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                                <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center border-0 bg-blue-500 p-0 text-[9px] text-white">
                                                    {unreadCount > 9 ? '9+' : unreadCount}
                                                </Badge>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-96 overflow-hidden rounded-xl border-border/50 p-0 shadow-xl">
                                    <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-bronze">
                                                <Bell className="h-3.5 w-3.5 text-white" />
                                            </div>
                                            <div>
                                                <p className="font-heading text-sm font-bold">Notificacoes</p>
                                                {unreadCount > 0 && (
                                                    <p className="-mt-0.5 text-[10px] font-medium text-primary">
                                                        {unreadCount} nao lida{unreadCount > 1 ? 's' : ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {unreadCount > 0 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    markAllAsRead()
                                                }}
                                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 hover:text-primary/80"
                                            >
                                                <CheckCheck className="h-3.5 w-3.5" />
                                                Ler tudo
                                            </button>
                                        )}
                                    </div>

                                    <div className="max-h-[400px] overflow-y-auto">
                                        {displayNotifications.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60">
                                                    <Bell className="h-5 w-5 text-muted-foreground/40" />
                                                </div>
                                                <p className="text-sm font-medium text-foreground">Nenhuma notificacao</p>
                                                <p className="mt-1 text-[11px] text-muted-foreground">Atualizacoes aparecerao aqui.</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-border/30">
                                                {displayNotifications.map((notification) => {
                                                    const config = typeConfig[notification.type] || typeConfig.system
                                                    const priority = priorityConfig[notification.priority] || priorityConfig.normal
                                                    const kindLabel = getNotificationKindLabel(notification.notification_kind)
                                                    const Icon = notification.type === 'order_status' && notification.metadata?.status
                                                        ? statusIcons[notification.metadata.status] || config.icon
                                                        : config.icon

                                                    return (
                                                        <div
                                                            key={notification.id}
                                                            onClick={() => handleNotificationClick(notification)}
                                                            className={`group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                                                                !notification.is_read ? 'bg-primary/2 hover:bg-primary/5' : 'hover:bg-muted/30'
                                                            }`}
                                                        >
                                                            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                                                                <Icon className={`h-4.5 w-4.5 ${config.color}`} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                                        <p className={`truncate text-[13px] ${!notification.is_read ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                                                                            {notification.title}
                                                                        </p>
                                                                        {!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                                                                    </div>
                                                                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(notification.created_at)}</span>
                                                                </div>
                                                                {notification.message && (
                                                                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
                                                                        {notification.message}
                                                                    </p>
                                                                )}
                                                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                                                    <span className={`inline-block text-[9px] font-semibold uppercase tracking-wider ${config.color}`}>
                                                                        {config.label}
                                                                    </span>
                                                                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${priority.className}`}>
                                                                        {priority.label}
                                                                    </span>
                                                                    {kindLabel && (
                                                                        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                                                                            {kindLabel}
                                                                        </span>
                                                                    )}
                                                                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${notification.is_read ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                                                                        {notification.is_read ? 'Lida' : 'Nao lida'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {notifications.length > 0 && (
                                        <div className="flex items-center justify-center border-t bg-muted/10 px-4 py-2.5">
                                            <Link href="/orders" onClick={() => setNotifOpen(false)} className="text-[11px] font-semibold text-primary hover:underline">
                                                Ver todas as notificacoes {'->'}
                                            </Link>
                                        </div>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button variant="ghost" size="icon" className={`relative ${isStandalone ? 'rounded-xl' : ''}`} onClick={openCart}>
                                <ShoppingCart className="h-5 w-5" />
                                {cartCount > 0 && (
                                    <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center border-0 p-0 text-[10px] text-white gradient-bronze">
                                        {cartCount > 99 ? '99+' : cartCount}
                                    </Badge>
                                )}
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={`hidden md:flex ${isStandalone ? 'rounded-xl' : ''}`} />}>
                                    <User className="h-5 w-5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem render={<Link href="/profile" className="cursor-pointer" />}>
                                        <User className="mr-2 h-4 w-4" />
                                        Meu Perfil
                                    </DropdownMenuItem>
                                    <DropdownMenuItem render={<Link href="/orders" className="cursor-pointer" />}>
                                        <ClipboardList className="mr-2 h-4 w-4" />
                                        Meus Pedidos
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Sair
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Sheet open={compactMenuOpen} onOpenChange={setCompactMenuOpen}>
                                <SheetTrigger render={<Button variant="ghost" size="icon" className={`xl:hidden ${isStandalone ? 'rounded-xl' : ''}`} />}>
                                    {compactMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                                </SheetTrigger>
                                <SheetContent side="right" className="w-80 p-0">
                                    <div className="flex h-full flex-col">
                                        <div className="border-b p-4">
                                            <div className="flex items-center gap-3">
                                                {settings?.logo_url ? (
                                                    <div className="relative h-10 w-24 shrink-0">
                                                        <Image priority src={settings.logo_url} alt={settings.system_name || 'Loja'} fill className="object-contain object-left" />
                                                    </div>
                                                ) : (
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-bronze">
                                                        <span className="font-heading text-sm font-bold text-white">
                                                            {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                                        </span>
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-heading text-sm font-bold text-foreground">Portal B2B</p>
                                                    <p className="text-xs text-muted-foreground">Acesso rapido em janela propria</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-4">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                <Input
                                                    placeholder="Buscar produtos..."
                                                    className="pl-9"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onKeyDown={handleSearch}
                                                />
                                            </div>
                                        </div>

                                        <nav className="flex flex-col gap-1 px-2">
                                            {navItems.map((item) => {
                                                const isActive = pathname.startsWith(item.href)
                                                return (
                                                    <Link key={item.href} href={item.href} onClick={() => setCompactMenuOpen(false)}>
                                                        <Button
                                                            variant={isActive ? 'secondary' : 'ghost'}
                                                            className={`w-full justify-start gap-3 ${isActive ? 'bg-primary/10 text-primary' : ''}`}
                                                        >
                                                            <item.icon className="h-5 w-5" />
                                                            {item.label}
                                                        </Button>
                                                    </Link>
                                                )
                                            })}
                                        </nav>

                                        <div className="mt-2 px-2">
                                            <Link href="/favorites" onClick={() => setCompactMenuOpen(false)}>
                                                <Button
                                                    variant={pathname.startsWith('/favorites') ? 'secondary' : 'ghost'}
                                                    className={`w-full justify-start gap-3 ${pathname.startsWith('/favorites') ? 'bg-primary/10 text-primary' : ''}`}
                                                >
                                                    <Heart className="h-5 w-5" />
                                                    Favoritos
                                                    {favCount > 0 && (
                                                        <Badge className="ml-auto flex h-5 w-5 items-center justify-center border-0 bg-red-500 p-0 text-[9px] text-white">
                                                            {favCount}
                                                        </Badge>
                                                    )}
                                                </Button>
                                            </Link>
                                        </div>

                                        <div className="mt-auto space-y-2 border-t p-4">
                                            <Link href="/profile" onClick={() => setCompactMenuOpen(false)}>
                                                <Button variant="ghost" className="w-full justify-start gap-3">
                                                    <User className="h-5 w-5" />
                                                    Meu Perfil
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start gap-3 text-destructive"
                                                onClick={handleLogout}
                                            >
                                                <LogOut className="h-5 w-5" />
                                                Sair
                                            </Button>
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>
                </div>
            </div>
        </motion.header>
    )
}
