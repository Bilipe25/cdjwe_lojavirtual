'use client'

import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
    BarChart3,
    ClipboardCheck,
    FileText,
    LayoutDashboard,
    MapPinned,
    ShoppingBag,
    Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

type SalesShellProps = {
    profile: Profile
    children: ReactNode
}

type NavItem = {
    href: string
    label: string
    shortLabel: string
    icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
    { href: '/sales/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard },
    { href: '/sales/orders/new', label: 'Novo pedido', shortLabel: 'Pedido', icon: ShoppingBag },
    { href: '/sales/quotes/new', label: 'Novo orcamento', shortLabel: 'Orcamento', icon: FileText },
    { href: '/sales/customers', label: 'Clientes', shortLabel: 'Clientes', icon: Users },
    { href: '/sales/visits', label: 'Visitas', shortLabel: 'Visitas', icon: MapPinned },
    { href: '/sales/orders', label: 'Pedidos realizados', shortLabel: 'Pedidos', icon: ClipboardCheck },
    { href: '/sales/quotes', label: 'Orcamentos realizados', shortLabel: 'Orc.', icon: BarChart3 },
]

const pageMeta: Record<string, { title: string; subtitle: string }> = {
    '/sales/dashboard': {
        title: 'Operacao comercial',
        subtitle: 'Acompanhe clientes, visitas e documentos em um fluxo rapido de campo.',
    },
    '/sales/orders/new': {
        title: 'Novo pedido assistido',
        subtitle: 'Monte um pedido em nome do cliente com contexto comercial e negociacao.',
    },
    '/sales/quotes/new': {
        title: 'Novo orcamento',
        subtitle: 'Registre uma proposta comercial completa e converta em pedido depois.',
    },
    '/sales/customers': {
        title: 'Clientes da carteira',
        subtitle: 'Consulte clientes, tabela de preco, historico rapido e inicie novas acoes.',
    },
    '/sales/visits': {
        title: 'Visitas comerciais',
        subtitle: 'Registre visitas, resultado da conversa e proximos passos da negociacao.',
    },
    '/sales/orders': {
        title: 'Pedidos realizados',
        subtitle: 'Acompanhe os pedidos criados em campo pelo representante.',
    },
    '/sales/quotes': {
        title: 'Orcamentos realizados',
        subtitle: 'Gerencie orcamentos, acompanhe status e converta em pedido com agilidade.',
    },
}

function matchPageMeta(pathname: string) {
    const exact = pageMeta[pathname]
    if (exact) return exact

    if (pathname.startsWith('/sales/orders/')) {
        return {
            title: 'Detalhe do pedido',
            subtitle: 'Consulte o documento comercial com contexto, itens e historico.',
        }
    }

    if (pathname.startsWith('/sales/quotes/')) {
        return {
            title: 'Detalhe do orcamento',
            subtitle: 'Revise o orcamento salvo, condicoes e proximos passos da negociacao.',
        }
    }

    return pageMeta['/sales/dashboard']
}

export function SalesShell({ profile, children }: SalesShellProps) {
    const pathname = usePathname()
    const meta = useMemo(() => matchPageMeta(pathname), [pathname])
    const firstName = profile.full_name?.split(' ')[0] || 'Representante'

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#f5f7fb_48%,#ffffff_100%)] text-slate-950">
            <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[260px] lg:flex-col lg:border-r lg:border-slate-200/80 lg:bg-white/88 lg:px-5 lg:py-6 lg:backdrop-blur-xl">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Modo representante
                    </p>
                    <h1 className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-bold text-slate-950">
                        Vendas presenciais
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        Operacao comercial assistida para pedidos, orcamentos e visitas em campo.
                    </p>
                </div>

                <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Representante
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{profile.full_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{profile.email}</p>
                </div>

                <nav className="mt-8 space-y-1.5">
                    {navItems.map((item) => {
                        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all',
                                    active
                                        ? 'bg-slate-950 text-white shadow-[0_14px_30px_-20px_rgba(15,23,42,0.8)]'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="lg:pl-[260px]">
                <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">
                                Representante
                            </p>
                            <h1 className="truncate font-[family-name:var(--font-heading)] text-xl font-bold text-slate-950 sm:text-2xl">
                                {meta.title}
                            </h1>
                            <p className="mt-1 hidden text-sm leading-6 text-slate-500 md:block">
                                {meta.subtitle}
                            </p>
                        </div>

                        <div className="hidden items-center gap-2 md:flex">
                            <Button asChild variant="outline" className="rounded-xl border-slate-200 bg-white/90">
                                <Link href="/sales/quotes/new">Novo orcamento</Link>
                            </Button>
                            <Button asChild className="rounded-xl border-0 bg-slate-950 text-white hover:bg-slate-800">
                                <Link href="/sales/orders/new">Novo pedido</Link>
                            </Button>
                        </div>

                        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 md:hidden">
                            {firstName}
                        </div>
                    </div>
                </header>

                <main className="mx-auto max-w-7xl px-4 pb-[96px] pt-5 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8">
                    {children}
                </main>
            </div>

            <nav className="fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-slate-200 bg-white/96 p-2 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:hidden">
                <div className="grid grid-cols-5 gap-1">
                    {navItems.slice(0, 5).map((item) => {
                        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all',
                                    active
                                        ? 'bg-slate-950 text-white'
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="text-center leading-tight">{item.shortLabel}</span>
                            </Link>
                        )
                    })}
                </div>
            </nav>
        </div>
    )
}
