'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useCartStore } from '@/lib/stores/cart-store'
import { logoutAction } from '@/app/(auth)/login/actions'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { setViewAsCustomerAction } from '@/app/admin/actions/view-as-customer'

const navItems = [
    { href: '/catalog', label: 'Catálogo', icon: Package },
    { href: '/orders', label: 'Meus Pedidos', icon: ClipboardList },
]

const statusLabels: Record<string, string> = {
    pending: 'Em Análise',
    approved: 'Aprovado',
    in_production: 'Em Produção',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
}

export function StoreHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const { totalItems, openCart } = useCartStore()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [notifications, setNotifications] = useState<{ id: string; order_number: string; status: string; created_at: string }[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [lastChecked, setLastChecked] = useState<string | null>(null)
    const [isViewingAsCustomer, setIsViewingAsCustomer] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)
    const cartCount = totalItems()
    const favCount = useFavoritesStore((s) => s.favoriteIds.length)
    const [isMounted, setIsMounted] = useState(false)

    // Poll for order status changes
    const fetchNotifications = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('order_status_history')
                .select('id, status, created_at, order:orders(order_number)')
                .order('created_at', { ascending: false })
                .limit(10)
            if (data) {
                const mapped = data.map((n: any) => ({
                    id: n.id,
                    order_number: n.order?.order_number || '',
                    status: n.status,
                    created_at: n.created_at,
                }))
                setNotifications(mapped)
                if (lastChecked) {
                    const newCount = mapped.filter((n: any) => n.created_at > lastChecked).length
                    setUnreadCount(newCount)
                }
            }
        } catch { /* silent */ }
    }, [lastChecked])

    useEffect(() => {
        let isMountedRef = true

        const initialize = () => {
            if (isMountedRef) {
                setLastChecked(new Date().toISOString())
                fetchNotifications()
            }
        }

        initialize()
        const interval = setInterval(() => {
            if (isMountedRef) {
                fetchNotifications()
            }
        }, 30000) // Poll every 30s
        
        // Handle View as Customer cookie detection
        const checkViewAsCustomer = () => {
            const hasCookie = document.cookie.includes('view_as_customer=true')
            setIsViewingAsCustomer(hasCookie)
        }
        checkViewAsCustomer()

        // Load Settings for Logo
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
        
        setIsMounted(true)
        
        return () => {
            isMountedRef = false
            clearInterval(interval)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            router.push(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`)
            setSearchQuery('')
            setMobileMenuOpen(false)
        }
    }

    const handleLogout = async () => {
        await logoutAction()
        router.push('/login')
    }

    const handleReturnToAdmin = async () => {
        await setViewAsCustomerAction(false)
        router.push('/admin/dashboard')
    }

    return (
        <motion.header
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 w-full"
            role="banner"
        >
            {isViewingAsCustomer && (
                <div className="bg-linear-to-r from-orange-500 to-amber-600 text-white w-full py-1.5 px-4 text-xs font-semibold flex items-center justify-between z-50 rounded-b shadow-sm relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPHBhdGggZD0iTTAgMEw4IDhaTTAgOEw4IDBaIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-30"></div>
                    <div className="flex items-center gap-2 max-w-7xl mx-auto w-full justify-between relative z-10 px-0 sm:px-4">
                        <span className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                            MODO DE VISUALIZAÇÃO: CLIENTE
                        </span>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-6 text-[10px] bg-white text-orange-600 hover:bg-orange-50 border-white/20 hover:text-orange-700 shadow-sm px-3 ml-2 shrink-0 transition-colors"
                            onClick={handleReturnToAdmin}
                        >
                            Retornar ao Painel
                        </Button>
                    </div>
                </div>
            )}
            <div className="glass-card border-0 border-b">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                    <Link href="/catalog" className="flex items-center gap-3 shrink-0" aria-label={`${settings?.system_name || 'Loja'} - Página inicial`}>
                        {settings?.logo_url ? (
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-24 sm:w-32 shrink-0 relative">
                                    <Image priority src={settings.logo_url} alt={settings.system_name || 'Loja'} fill className="object-contain object-left" />
                                </div>
                                <span className="hidden sm:block text-lg font-semibold font-heading text-gradient-navy truncate max-w-[150px]">
                                    {settings?.system_name || 'CDJWE'}
                                </span>
                            </div>
                        ) : (
                            <>
                                <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                                    <span className="text-white font-bold text-sm font-heading">
                                        {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                    </span>
                                </div>
                                <span className="hidden sm:block text-lg font-semibold font-heading text-gradient-navy truncate max-w-[150px]">
                                    {settings?.system_name || 'CDJWE'}
                                </span>
                            </>
                        )}
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-1" aria-label="Navegação principal">
                        {navItems.map((item) => {
                            const isActive = pathname.startsWith(item.href)
                            return (
                                <Link key={item.href} href={item.href}>
                                    <Button
                                        variant={isActive ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className={`gap-2 ${isActive ? 'bg-primary/10 text-primary' : ''}`}
                                    >
                                        <item.icon className="h-4 w-4" />
                                        {item.label}
                                    </Button>
                                </Link>
                            )
                        })}
                    </nav>

                    {/* Search (Desktop) */}
                    <div className="hidden lg:flex flex-1 max-w-md">
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar produtos..."
                                className="pl-9 bg-white/60 border-border/50 focus:bg-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleSearch}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
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

                        {/* Notifications bell */}
                        <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
                                <Bell className="h-5 w-5" />
                                {unreadCount > 0 && (
                                    <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-blue-500 border-0 text-white">
                                        {unreadCount}
                                    </Badge>
                                )}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72">
                                <div className="px-3 py-2 border-b">
                                    <p className="text-sm font-semibold">Notificações</p>
                                </div>
                                {notifications.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma atualização</div>
                                ) : (
                                    notifications.slice(0, 5).map((n) => (
                                        <DropdownMenuItem key={n.id} render={<Link href={`/orders`} className="cursor-pointer" />}>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-medium">Pedido {n.order_number}</span>
                                                <span className="text-[10px] text-muted-foreground">Status: {statusLabels[n.status] || n.status}</span>
                                            </div>
                                        </DropdownMenuItem>
                                    ))
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    render={<Link href="/orders" className="cursor-pointer text-center" />}
                                    onClick={() => { setUnreadCount(0); setLastChecked(new Date().toISOString()) }}
                                >
                                    <span className="text-xs text-primary w-full text-center">Ver todos os pedidos</span>
                                </DropdownMenuItem>
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
                                        <div className="flex items-center gap-3">
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
                                            <span className="text-lg font-semibold font-heading text-gradient-navy truncate max-w-[150px]">
                                                {settings?.system_name || 'CDJWE'}
                                            </span>
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
