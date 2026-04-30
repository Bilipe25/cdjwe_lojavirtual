'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPinned,
  MoreHorizontal,
  PackageCheck,
  Palette,
  ShoppingBag,
  Sofa,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { setViewAsRepresentativeAction } from '@/app/admin/actions/view-as-customer'
import { logoutAction } from '@/app/(auth)/login/actions'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'
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

const mainNavItems: NavItem[] = [
  { href: '/sales/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard },
  { href: '/sales/orders/new', label: 'Novo Pedido', shortLabel: 'Pedido', icon: ShoppingBag },
  { href: '/sales/customers', label: 'Clientes', shortLabel: 'Clientes', icon: Users },
  { href: '/sales/visits', label: 'Visitas', shortLabel: 'Visitas', icon: MapPinned },
]

const moreNavItems: NavItem[] = [
  { href: '/sales/quotes/new', label: 'Novo Orcamento', shortLabel: 'Orcam.', icon: FileText },
  { href: '/sales/orders', label: 'Pedidos Realizados', shortLabel: 'Pedidos', icon: ClipboardCheck },
  { href: '/sales/stock', label: 'Meu Estoque', shortLabel: 'Estoque', icon: PackageCheck },
  { href: '/sales/quotes', label: 'Orcamentos Salvos', shortLabel: 'Orcam.', icon: BarChart3 },
  { href: '/sales/catalog', label: 'Catalogo de Produtos', shortLabel: 'Catalogo', icon: Sofa },
  { href: '/sales/fabrics', label: 'Catalogo de Tecidos', shortLabel: 'Tecidos', icon: Palette },
]

const allNavItems = [...mainNavItems, ...moreNavItems]

const pageTitles: Record<string, string> = {
  '/sales/dashboard': 'Dashboard',
  '/sales/orders/new': 'Novo Pedido',
  '/sales/quotes/new': 'Novo Orcamento',
  '/sales/customers': 'Clientes',
  '/sales/visits': 'Visitas',
  '/sales/orders': 'Pedidos',
  '/sales/stock': 'Meu Estoque',
  '/sales/quotes': 'Orcamentos',
  '/sales/catalog': 'Catalogo de Produtos',
  '/sales/fabrics': 'Catalogo de Tecidos',
}

function matchPageTitle(pathname: string) {
  const exact = pageTitles[pathname]
  if (exact) return exact
  if (pathname.startsWith('/sales/orders/')) return 'Detalhe do Pedido'
  if (pathname.startsWith('/sales/quotes/')) return 'Detalhe do Orcamento'
  if (pathname.startsWith('/sales/catalog/')) return 'Detalhe do Produto'
  return 'Vendas'
}

export function SalesShell({ profile, isAdminPreview = false, children }: SalesShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isStandalone } = usePwaRuntime()
  const title = useMemo(() => matchPageTitle(pathname), [pathname])
  const firstName = profile.full_name?.split(' ')[0] || 'Representante'
  const [moreOpen, setMoreOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const isDashboard = pathname === '/sales/dashboard'
  const showBack = !isDashboard

  const handleBackToAdmin = async () => {
    await setViewAsRepresentativeAction(false)
    router.push('/admin/dashboard')
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logoutAction()
      router.push('/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const isActive = (href: string) => {
    if (href === '/sales/dashboard') return pathname === '/sales/dashboard'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const isOnMorePage = moreNavItems.some((item) => isActive(item.href))

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background text-foreground">
      {isAdminPreview && (
        <div className="relative z-60 flex items-center justify-between overflow-hidden bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
          <span className="flex items-center gap-1.5 truncate">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            MODO REPRESENTANTE (ADMIN)
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-2 h-6 shrink-0 border-white/20 bg-white px-3 text-[10px] text-orange-600 shadow-sm transition-colors hover:bg-orange-50 hover:text-orange-700"
            onClick={handleBackToAdmin}
          >
            Retornar ao Painel
          </Button>
        </div>
      )}

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[240px] lg:flex-col" style={{ background: 'var(--sidebar)', color: 'var(--sidebar-foreground)' }}>
        <div className="flex items-center gap-3 border-b px-4 py-4" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl font-bold text-xs gradient-bronze text-white">
            {firstName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--sidebar-foreground)' }}>{profile.full_name}</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--sidebar-primary)' }}>Representante</p>
            <p className="truncate text-[10px] opacity-70" style={{ color: 'var(--sidebar-foreground)' }}>{profile.email}</p>
          </div>
        </div>

        <div className="space-y-1.5 px-3 pt-4">
          <Button asChild size="sm" className="h-9 w-full rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
            <Link href="/sales/orders/new">+ Novo Pedido</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-xl border-white/10 bg-white/5 text-xs hover:bg-white/10" style={{ color: 'var(--sidebar-foreground)' }}>
            <Link href="/sales/quotes/new">+ Novo Orcamento</Link>
          </Button>
        </div>

        <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--sidebar-primary)' }}>Menu</p>
          {allNavItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all',
                  active
                    ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]'
                    : 'text-[var(--sidebar-foreground)] opacity-70 hover:bg-[var(--sidebar-accent)] hover:opacity-100'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="space-y-2 border-t px-3 py-3" style={{ borderColor: 'var(--sidebar-border)' }}>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full rounded-xl border-white/10 bg-white/5 text-xs font-medium hover:bg-white/10"
            style={{ color: 'var(--sidebar-foreground)' }}
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            {isLoggingOut ? 'Saindo...' : 'Sair da sessao'}
          </Button>
          {isAdminPreview && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full rounded-xl border-white/10 bg-white/5 text-xs font-medium hover:bg-white/10"
              style={{ color: 'var(--sidebar-foreground)' }}
              onClick={handleBackToAdmin}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Voltar ao Admin
            </Button>
          )}
        </div>
      </aside>

      <header
        data-mobile-top-bar
        className={cn(
          'sticky top-0 z-50 w-full border-b border-border/30 lg:hidden',
          isStandalone
            ? 'bg-background/92 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl'
            : 'glass-nav'
        )}
      >
        <div className={cn('flex items-center gap-3 px-4', isStandalone ? 'min-h-14' : 'h-12')}>
          {showBack ? (
            <button
              onClick={() => router.back()}
              className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/60"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md gradient-bronze shrink-0">
              <span className="text-[10px] font-bold font-heading text-white">JW</span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold font-heading text-foreground">{title}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isDashboard && (
              <Button asChild size="sm" className="h-8 rounded-xl border-0 text-[11px] font-bold gradient-bronze text-white hover:opacity-90">
                <Link href="/sales/orders/new">+ Pedido</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 lg:pl-[240px]">
        <header className="sticky top-0 z-20 hidden border-b border-border/30 bg-background/90 backdrop-blur-lg lg:block">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-6">
            <h1 className="truncate text-lg font-bold font-heading text-gradient-navy">{title}</h1>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild variant="outline" size="sm" className="h-8 rounded-xl border-border text-xs">
                <Link href="/sales/quotes/new">Novo Orcamento</Link>
              </Button>
              <Button asChild size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
                <Link href="/sales/orders/new">Novo Pedido</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav
        data-mobile-bottom-nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 lg:hidden',
          isStandalone ? 'safe-x pb-2' : ''
        )}
        style={{ paddingBottom: isStandalone ? 'max(env(safe-area-inset-bottom, 0px), 8px)' : 'env(safe-area-inset-bottom, 0px)' }}
        role="navigation"
        aria-label="Navegacao principal representante"
      >
        <div
          data-mobile-bottom-nav-inner
          className={cn(
            'flex items-center justify-around h-[var(--bottom-nav-height)]',
            isStandalone
              ? 'mx-auto max-w-md rounded-[24px] border border-white/65 bg-white/92 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl'
              : 'glass-nav'
          )}
        >
          {mainNavItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 mobile-touch-target"
                aria-label={item.label}
              >
                <motion.div whileTap={{ scale: 0.82 }} className="relative">
                  <Icon className={cn('h-5 w-5 transition-colors duration-200', active ? 'text-primary' : 'text-muted-foreground')} />
                </motion.div>
                <span className={cn('text-[10px] font-medium transition-colors duration-200', active ? 'text-primary' : 'text-muted-foreground')}>
                  {item.shortLabel}
                </span>
                {active && (
                  <motion.div
                    layoutId="salesBottomNavIndicator"
                    className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full gradient-bronze"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 mobile-touch-target"
                aria-label="Mais opcoes"
              >
                <motion.div whileTap={{ scale: 0.82 }} className="relative">
                  <MoreHorizontal className={cn('h-5 w-5 transition-colors duration-200', (moreOpen || isOnMorePage) ? 'text-primary' : 'text-muted-foreground')} />
                </motion.div>
                <span className={cn('text-[10px] font-medium transition-colors duration-200', (moreOpen || isOnMorePage) ? 'text-primary' : 'text-muted-foreground')}>
                  Mais
                </span>
                {isOnMorePage && !moreOpen && (
                  <motion.div
                    layoutId="salesBottomNavIndicator"
                    className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full gradient-bronze"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/30 bg-background p-0">
              <SheetHeader className="border-b border-border/30 px-5 py-4">
                <SheetTitle className="text-base font-bold font-heading text-gradient-navy">Mais opcoes</SheetTitle>
              </SheetHeader>
              <div className="divide-y divide-border/30 px-1 py-2">
                {moreNavItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors hover:bg-muted/60"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="flex-1 text-sm font-semibold text-foreground">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  )
                })}
              </div>
              <div className="border-t border-border/30 px-4 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-xl text-sm"
                  onClick={() => {
                    setMoreOpen(false)
                    void handleLogout()
                  }}
                  disabled={isLoggingOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isLoggingOut ? 'Saindo...' : 'Sair da sessao'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}



