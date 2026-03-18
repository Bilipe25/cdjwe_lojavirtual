'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
    { href: '/catalog', label: 'Catálogo', icon: Package },
    { href: '/fabrics', label: 'Tecidos', icon: Scissors },
    { href: '/orders', label: 'Meus Pedidos', icon: ClipboardList },
    { href: '/about', label: 'Sobre Nós', icon: Building2 },
]

const typeConfig: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
    order_status: { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Pedido' },
    campaign: { icon: Megaphone, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Campanha' },
    promo: { icon: Gift, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Promoção' },
    system: { icon: Info, color: 'text-slate-600', bg: 'bg-slate-50', label: 'Sistema' },
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

export function StoreHeader() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const { isStandalone } = usePwaRuntime()
    const { totalItems, openCart } = useCartStore()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)
    const cartCount = totalItems()
    const favCount = useFavoritesStore((s) => s.favoriteIds.length)
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
                const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
                if (data) setSettings(data)
            } catch { /* silent */ }
        }
        loadSettings()
        
        // Sync favorites from database on mount
        useFavoritesStore.getState().syncFromDb()
        
        const frame = window.requestAnimationFrame(() => setIsMounted(true))

        return () => window.cancelAnimationFrame(frame)
    }, [])

    // Live Search Sync with URL
    useEffect(() => {
        const query = searchParams.get('search') || ''
        if (query === searchQuery) return

        const frame = window.requestAnimationFrame(() => setSearchQuery(query))
        return () => window.cancelAnimationFrame(frame)
    }, [searchParams, searchQuery])

    useEffect(() => {
        const timer = setTimeout(() => {
            const currentSearch = searchParams.get('search') || ''
            if (searchQuery !== currentSearch) {
                const params = new URLSearchParams(searchParams.toString())
                if (searchQuery.trim()) {
                    params.set('search', searchQuery.trim())
                } else {
                    params.delete('search')
                }
                
                if (pathname.startsWith('/catalog')) {
                    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
                }
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery, pathname, router, searchParams])

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            if (!pathname.startsWith('/catalog')) {
                router.push(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`)
            }
        }
    }

    const handleLogout = async () => {
        await logoutAction()
        router.push('/login')
    }

    const handleNotificationClick = (n: ClientNotification) => {
        if (!n.is_read) markAsRead(n.id)
        setNotifOpen(false)
        if (n.link) router.push(n.link)
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
                    <div className={`flex items-center justify-between ${isStandalone ? 'h-[68px]' : 'h-16'}`}>
                    <Link href="/catalog" className="flex items-center shrink-0 gap-3" aria-label={`${settings?.system_name || 'Loja'} - Página inicial`}>
                        {isMounted && settings?.logo_url ? (
                            <div className="h-10 w-24 sm:w-32 shrink-0 relative">
                                <Image priority src={settings.logo_url} alt={settings.system_name || 'Loja'} fill className="object-contain object-left" />
                            </div>
                        ) : (
                            <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-sm font-heading">
                                    {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                </span>
                            </div>
                        )}
                    </Link>

                    {/* Desktop Nav */}
                    <nav className={`hidden md:flex items-center ${isStandalone ? 'gap-1.5' : 'gap-1'}`} aria-label="Navegação principal">
                        {navItems.map((item) => {
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

                    {/* Search (Desktop) */}
                    <div className={`hidden lg:flex flex-1 ${isStandalone ? 'max-w-lg px-4' : 'max-w-md'}`}>
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar produtos..."
                                className={`pl-9 border-border/50 focus:bg-white ${isStandalone ? 'h-11 rounded-2xl bg-white/85 shadow-sm' : 'bg-white/60'}`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleSearch}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className={`flex items-center ${isStandalone ? 'gap-1.5' : 'gap-1'}`}>
                        {/* Favorites */}
                        <Link href="/favorites">
                            <Button variant="ghost" size="icon" className="relative">
                                <Heart className="h-5 w-5" />
                                {isMounted && favCount > 0 && (
                                    <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-red-500 border-0 text-white">
                                        {favCount}
                                    </Badge>
                                )}
                            </Button>
                        </Link>

                        {/* Notifications bell — Professional Panel */}
                        <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
                                <Bell className="h-5 w-5" />
                                <AnimatePresence>
                                    {unreadCount > 0 && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                        >
                                            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-blue-500 border-0 text-white">
                                                {unreadCount > 9 ? '9+' : unreadCount}
                                            </Badge>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-96 p-0 rounded-xl shadow-xl border-border/50 overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                                    <div className="flex items-center gap-2.5">
                                        <div className="h-7 w-7 rounded-lg gradient-bronze flex items-center justify-center">
                                            <Bell className="h-3.5 w-3.5 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold font-heading">Notificações</p>
                                            {unreadCount > 0 && (
                                                <p className="text-[10px] text-primary font-medium -mt-0.5">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</p>
                                            )}
                                        </div>
                                    </div>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); markAllAsRead() }}
                                            className="text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-primary/5 transition-colors"
                                        >
                                            <CheckCheck className="h-3.5 w-3.5" />
                                            Ler tudo
                                        </button>
                                    )}
                                </div>

                                {/* Notification List */}
                                <div className="max-h-[400px] overflow-y-auto">
                                    {displayNotifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-10 text-center">
                                            <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center mb-3">
                                                <Bell className="h-5 w-5 text-muted-foreground/40" />
                                            </div>
                                            <p className="text-sm font-medium text-foreground">Nenhuma notificação</p>
                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                Atualizações aparecerão aqui.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-border/30">
                                            {displayNotifications.map((n) => {
                                                const config = typeConfig[n.type] || typeConfig.system
                                                const Icon = n.type === 'order_status' && n.metadata?.status
                                                    ? (statusIcons[n.metadata.status] || config.icon)
                                                    : config.icon

                                                return (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => handleNotificationClick(n)}
                                                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors group ${
                                                            !n.is_read
                                                                ? 'bg-primary/2 hover:bg-primary/5'
                                                                : 'hover:bg-muted/30'
                                                        }`}
                                                    >
                                                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${config.bg}`}>
                                                            <Icon className={`h-4.5 w-4.5 ${config.color}`} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <p className={`text-[13px] truncate ${!n.is_read ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                                                                        {n.title}
                                                                    </p>
                                                                    {!n.is_read && (
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground shrink-0">
                                                                    {timeAgo(n.created_at)}
                                                                </span>
                                                            </div>
                                                            {n.message && (
                                                                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-1">
                                                                    {n.message}
                                                                </p>
                                                            )}
                                                            <span className={`text-[9px] font-semibold uppercase tracking-wider ${config.color} mt-1 inline-block`}>
                                                                {config.label}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                {notifications.length > 0 && (
                                    <div className="border-t bg-muted/10 px-4 py-2.5 flex items-center justify-center">
                                        <Link
                                            href="/orders"
                                            onClick={() => setNotifOpen(false)}
                                            className="text-[11px] text-primary font-semibold hover:underline"
                                        >
                                            Ver todas as notificações →
                                        </Link>
                                    </div>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Cart Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative"
                            onClick={openCart}
                        >
                            <ShoppingCart className="h-5 w-5" />
                            {isMounted && cartCount > 0 && (
                                <Badge
                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] gradient-bronze border-0 text-white"
                                >
                                    {cartCount > 99 ? '99+' : cartCount}
                                </Badge>
                            )}
                        </Button>

                        {/* User Menu (Desktop) */}
                        <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="hidden md:flex" />}>
                                <User className="h-5 w-5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem render={<Link href="/profile" className="cursor-pointer" />}>
                                    <User className="h-4 w-4 mr-2" />
                                    Meu Perfil
                                </DropdownMenuItem>
                                <DropdownMenuItem render={<Link href="/orders" className="cursor-pointer" />}>
                                        <ClipboardList className="h-4 w-4 mr-2" />
                                        Meus Pedidos
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Sair
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Mobile Menu */}
                        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
                                    {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                            </SheetTrigger>
                            <SheetContent side="right" className="w-72 p-0">
                                <div className="flex flex-col h-full">
                                    <div className="p-4 border-b">
                                        <div className="flex items-center">
                                            {settings?.logo_url ? (
                                                <div className="h-10 w-24 shrink-0 relative">
                                                    <Image priority src={settings.logo_url} alt={settings.system_name || 'Loja'} fill className="object-contain object-left" />
                                                </div>
                                            ) : (
                                                <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center">
                                                    <span className="text-white font-bold text-sm font-heading">
                                                        {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <div className="p-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Buscar produtos..."
                                                className="pl-9"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyDown={handleSearch}
                                            />
                                        </div>
                                    </div>

                                    {/* Nav links */}
                                    <nav className="flex flex-col gap-1 px-2">
                                        {navItems.map((item) => {
                                            const isActive = pathname.startsWith(item.href)
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={() => setMobileMenuOpen(false)}
                                                >
                                                    <Button
                                                        variant={isActive ? 'secondary' : 'ghost'}
                                                        className={`w-full justify-start gap-3 ${isActive ? 'bg-primary/10 text-primary' : ''
                                                            }`}
                                                    >
                                                        <item.icon className="h-5 w-5" />
                                                        {item.label}
                                                    </Button>
                                                </Link>
                                            )
                                        })}
                                    </nav>

                                    {/* Favorites link */}
                                    <div className="px-2 mt-2">
                                        <Link href="/favorites" onClick={() => setMobileMenuOpen(false)}>
                                            <Button
                                                variant={pathname.startsWith('/favorites') ? 'secondary' : 'ghost'}
                                                className={`w-full justify-start gap-3 ${pathname.startsWith('/favorites') ? 'bg-primary/10 text-primary' : ''}`}
                                            >
                                                <Heart className="h-5 w-5" />
                                                Favoritos
                                                {isMounted && favCount > 0 && (
                                                    <Badge className="ml-auto h-5 w-5 p-0 flex items-center justify-center text-[9px] bg-red-500 border-0 text-white">
                                                        {favCount}
                                                    </Badge>
                                                )}
                                            </Button>
                                        </Link>
                                    </div>

                                    {/* Bottom Actions */}
                                    <div className="mt-auto p-4 border-t space-y-2">
                                        <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
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



