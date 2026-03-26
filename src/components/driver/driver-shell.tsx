'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
    Route,
    LayoutDashboard,
    User,
    Menu,
    X,
    Truck,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface DriverShellProps {
    driverName: string
    children: React.ReactNode
}

const navItems = [
    { href: '/motorista', label: 'Início', icon: LayoutDashboard },
    { href: '/motorista/perfil', label: 'Perfil', icon: User },
]

export function DriverShell({ driverName, children }: DriverShellProps) {
    const pathname = usePathname()
    const [menuOpen, setMenuOpen] = useState(false)

    // Check if we're on an active route page
    const isActiveRoute = pathname.startsWith('/motorista/rota/')

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Top Header */}
            <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
                <div className="flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-linear-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                            <Truck className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900 leading-tight">Minhas Rotas</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">{driverName}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition"
                    >
                        {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </button>
                </div>

                {/* Dropdown menu */}
                {menuOpen && (
                    <div className="absolute top-14 right-0 left-0 bg-white border-b shadow-lg z-50">
                        <nav className="p-2 space-y-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMenuOpen(false)}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition',
                                        pathname === item.href
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-slate-600 hover:bg-slate-50'
                                    )}
                                >
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 pb-20">
                {children}
            </main>

            {/* Bottom Navigation (hidden during active route) */}
            {!isActiveRoute && (
                <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-40 safe-area-pb">
                    <div className="flex items-center justify-around h-16">
                        <Link
                            href="/motorista"
                            className={cn(
                                'flex flex-col items-center gap-0.5 text-[10px] font-medium transition py-1 px-3',
                                pathname === '/motorista'
                                    ? 'text-blue-700'
                                    : 'text-slate-400 hover:text-slate-600'
                            )}
                        >
                            <Route className="h-5 w-5" />
                            Rotas
                        </Link>
                        <Link
                            href="/motorista/perfil"
                            className={cn(
                                'flex flex-col items-center gap-0.5 text-[10px] font-medium transition py-1 px-3',
                                pathname === '/motorista/perfil'
                                    ? 'text-blue-700'
                                    : 'text-slate-400 hover:text-slate-600'
                            )}
                        >
                            <User className="h-5 w-5" />
                            Perfil
                        </Link>
                    </div>
                </nav>
            )}
        </div>
    )
}
