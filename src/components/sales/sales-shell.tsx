'use client'

import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  MapPinned,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setViewAsRepresentativeAction } from '@/app/admin/actions/view-as-customer'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

type SalesShellProps = {
  profile: Profile
  isAdminPreview?: boolean
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
  { href: '/sales/quotes/new', label: 'Novo orçamento', shortLabel: 'Orçam.', icon: FileText },
  { href: '/sales/customers', label: 'Clientes', shortLabel: 'Clientes', icon: Users },
  { href: '/sales/visits', label: 'Visitas', shortLabel: 'Visitas', icon: MapPinned },
  { href: '/sales/orders', label: 'Pedidos', shortLabel: 'Pedidos', icon: ClipboardCheck },
  { href: '/sales/quotes', label: 'Orçamentos', shortLabel: 'Orçam.', icon: BarChart3 },
]

const pageTitles: Record<string, string> = {
  '/sales/dashboard': 'Dashboard',
  '/sales/orders/new': 'Novo pedido',
  '/sales/quotes/new': 'Novo orçamento',
  '/sales/customers': 'Clientes',
  '/sales/visits': 'Visitas',
  '/sales/orders': 'Pedidos',
  '/sales/quotes': 'Orçamentos',
}

function matchPageTitle(pathname: string) {
  const exact = pageTitles[pathname]
  if (exact) return exact
  if (pathname.startsWith('/sales/orders/')) return 'Detalhe do pedido'
  if (pathname.startsWith('/sales/quotes/')) return 'Detalhe do orçamento'
  return 'Dashboard'
}

export function SalesShell({ profile, isAdminPreview = false, children }: SalesShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const title = useMemo(() => matchPageTitle(pathname), [pathname])
  const firstName = profile.full_name?.split(' ')[0] || 'Representante'

  const handleBackToAdmin = async () => {
    await setViewAsRepresentativeAction(false)
    router.push('/admin/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {/* ─── Desktop sidebar ─── */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[240px] lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white lg:px-3 lg:py-4">
        {/* Profile + branding */}
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white">
            {firstName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-950">{profile.full_name}</p>
            <p className="truncate text-[11px] text-slate-400">Representante</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-4 grid gap-1.5 px-1">
          {isAdminPreview && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-slate-200 bg-white text-xs"
              onClick={handleBackToAdmin}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Voltar ao admin
            </Button>
          )}
          <Button asChild size="sm" className="h-9 rounded-xl border-0 bg-slate-950 text-xs text-white hover:bg-slate-800">
            <Link href="/sales/orders/new">+ Novo pedido</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 rounded-xl border-slate-200 bg-white text-xs">
            <Link href="/sales/quotes/new">+ Novo orçamento</Link>
          </Button>
        </div>

        {/* Navigation */}
        <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-1">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Menu</p>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all',
                  active
                    ? 'bg-slate-950 text-white'
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

      {/* ─── Main content ─── */}
      <div className="lg:pl-[240px]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-950">{title}</h1>
              {isAdminPreview && (
                <button
                  type="button"
                  onClick={handleBackToAdmin}
                  className="hidden shrink-0 items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase text-amber-700 transition-colors hover:bg-amber-100 sm:inline-flex"
                >
                  <ArrowLeft className="mr-1 h-3 w-3" />
                  Admin
                </button>
              )}
            </div>

            <div className="hidden shrink-0 items-center gap-2 md:flex">
              <Button asChild variant="outline" size="sm" className="h-8 rounded-xl border-slate-200 bg-white text-xs">
                <Link href="/sales/quotes/new">Novo orçamento</Link>
              </Button>
              <Button asChild size="sm" className="h-8 rounded-xl border-0 bg-slate-950 text-xs text-white hover:bg-slate-800">
                <Link href="/sales/orders/new">Novo pedido</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
          {children}
        </main>
      </div>

      {/* ─── Mobile bottom nav ─── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-7">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-slate-950' : 'text-slate-400'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'text-slate-950')} />
                <span className="leading-tight">{item.shortLabel}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
