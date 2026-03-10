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
} from 'lucide-react'
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
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const navItems = [
    { href: '/catalog', label: 'Catálogo', icon: Package },
    { href: '/orders', label: 'Meus Pedidos', icon: ClipboardList },
]

export function StoreHeader() {
    const pathname = usePathname()
    const router = useRouter()
    const { totalItems, openCart } = useCartStore()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const cartCount = totalItems()

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <motion.header
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 glass border-b border-border/50"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">
                    {/* Logo */}
                    <Link href="/catalog" className="flex items-center gap-2 shrink-0">
                        <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center">
                            <span className="text-white font-bold text-sm font-[family-name:var(--font-heading)]">CJ</span>
                        </div>
                        <span className="hidden sm:block text-lg font-semibold font-[family-name:var(--font-heading)] text-gradient-navy">
                            CDJWE
                        </span>
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-1">
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
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* Cart Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative"
                            onClick={openCart}
                        >
                            <ShoppingCart className="h-5 w-5" />
                            {cartCount > 0 && (
                                <Badge
                                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] gradient-bronze border-0 text-white"
                                >
                                    {cartCount > 99 ? '99+' : cartCount}
                                </Badge>
                            )}
                        </Button>

                        {/* User Menu (Desktop) */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="hidden md:flex">
                                    <User className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem asChild>
                                    <Link href="/profile" className="cursor-pointer">
                                        <User className="h-4 w-4 mr-2" />
                                        Meu Perfil
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/orders" className="cursor-pointer">
                                        <ClipboardList className="h-4 w-4 mr-2" />
                                        Meus Pedidos
                                    </Link>
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
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-72 p-0">
                                <div className="flex flex-col h-full">
                                    <div className="p-4 border-b">
                                        <div className="flex items-center gap-2">
                                            <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center">
                                                <span className="text-white font-bold text-sm">CJ</span>
                                            </div>
                                            <span className="text-lg font-semibold font-[family-name:var(--font-heading)]">CDJWE</span>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <div className="p-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input placeholder="Buscar produtos..." className="pl-9" />
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
        </motion.header>
    )
}
