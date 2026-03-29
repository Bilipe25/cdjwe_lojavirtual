'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
    Route,
    LayoutDashboard,
    User,
    Menu,
    X,
    LogOut,
    ChevronRight,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { logoutAction } from '@/app/(auth)/login/actions'

interface DriverShellProps {
    driverName: string
    driverEmail?: string
    children: React.ReactNode
}

const navItems = [
    { href: '/motorista', label: 'Início', icon: LayoutDashboard },
    { href: '/motorista/perfil', label: 'Perfil', icon: User },
]

export function DriverShell({ driverName, driverEmail, children }: DriverShellProps) {
    const pathname = usePathname()
    const router = useRouter()
    const [menuOpen, setMenuOpen] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)
    const [loggingOut, setLoggingOut] = useState(false)

    // Check if we're on an active route page
    const isActiveRoute = pathname.startsWith('/motorista/rota/')

    // Load company branding
    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
            if (data) setSettings(data)
        }
        load()
    }, [])

    const handleLogout = async () => {
        setLoggingOut(true)
        await logoutAction()
        router.push('/login')
    }

    // Get initials for avatar
    const initials = driverName
        .split(' ')
        .map(w => w[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Top Header */}
            <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
                <div className="flex items-center justify-between px-4 h-14">
                    {/* Company branding */}
                    <div className="flex items-center gap-3 min-w-0">
                        {settings?.logo_url ? (
                            <div className="relative h-8 w-8 shrink-0 rounded-lg overflow-hidden">
                                <Image
                                    priority
                                    src={settings.logo_url}
                                    alt={settings.system_name || 'Logo'}
                                    fill
                                    className="object-contain"
                                />
                            </div>
                        ) : (
                            <div className="h-8 w-8 rounded-lg bg-linear-to-br from-indigo-600 to-blue-700 flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-[10px]">
                                    {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                </span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-tight truncate">
                                {settings?.system_name || 'Logística'}
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-tight truncate">
                                Painel do Motorista
                            </p>
                        </div>
                    </div>

                    {/* Right: driver avatar + menu toggle */}
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                            {initials}
                        </div>
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition"
                        >
                            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {/* Dropdown menu */}
                {menuOpen && (
                    <>
                        {/* Backdrop */}
                        <div className="fixed inset-0 top-14 bg-black/20 z-40" onClick={() => setMenuOpen(false)} />

                        <div className="absolute top-14 right-0 left-0 bg-white border-b shadow-lg z-50">
                            {/* Driver info */}
                            <div className="px-4 py-3 border-b bg-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                        {initials}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">{driverName}</p>
                                        {driverEmail && (
                                            <p className="text-[11px] text-muted-foreground truncate">{driverEmail}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Nav links */}
                            <nav className="p-2 space-y-0.5">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setMenuOpen(false)}
                                        className={cn(
                                            'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition',
                                            pathname === item.href
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-slate-600 hover:bg-slate-50'
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon className="h-4 w-4" />
                                            {item.label}
                                        </div>
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                                    </Link>
                                ))}
                            </nav>

                            {/* Logout */}
                            <div className="p-2 border-t">
                                <button
                                    onClick={handleLogout}
                                    disabled={loggingOut}
                                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                    <LogOut className="h-4 w-4" />
                                    {loggingOut ? 'Saindo...' : 'Sair da conta'}
                                </button>
                            </div>
                        </div>
                    </>
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
