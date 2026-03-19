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
  Sparkles,
  Target,
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
  group: 'workspace' | 'history'
}

const navItems: NavItem[] = [
  { href: '/sales/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard, group: 'workspace' },
  { href: '/sales/orders/new', label: 'Novo pedido', shortLabel: 'Pedido', icon: ShoppingBag, group: 'workspace' },
  { href: '/sales/quotes/new', label: 'Novo orcamento', shortLabel: 'Orcamento', icon: FileText, group: 'workspace' },
  { href: '/sales/customers', label: 'Clientes', shortLabel: 'Clientes', icon: Users, group: 'workspace' },
  { href: '/sales/visits', label: 'Visitas', shortLabel: 'Visitas', icon: MapPinned, group: 'workspace' },
  { href: '/sales/orders', label: 'Pedidos realizados', shortLabel: 'Pedidos', icon: ClipboardCheck, group: 'history' },
  { href: '/sales/quotes', label: 'Orcamentos realizados', shortLabel: 'Orc.', icon: BarChart3, group: 'history' },
]

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/sales/dashboard': {
    title: 'Operacao comercial',
    subtitle: 'Carteira, visitas e documentos em um workspace rapido para atendimento presencial.',
  },
  '/sales/orders/new': {
    title: 'Novo pedido assistido',
    subtitle: 'Selecione o cliente, monte os itens e feche o pedido com contexto comercial completo.',
  },
  '/sales/quotes/new': {
    title: 'Novo orcamento',
    subtitle: 'Registre uma proposta comercial em campo e converta em pedido quando a negociacao amadurecer.',
  },
  '/sales/customers': {
    title: 'Clientes da carteira',
    subtitle: 'Busca rapida, contexto comercial e atalhos diretos para pedido, orcamento e relacionamento.',
  },
  '/sales/visits': {
    title: 'Visitas comerciais',
    subtitle: 'Documente cada contato com clareza, resultado e proximos passos da rotina em campo.',
  },
  '/sales/orders': {
    title: 'Pedidos realizados',
    subtitle: 'Acompanhe tudo o que foi gerado no atendimento presencial com leitura mais executiva.',
  },
  '/sales/quotes': {
    title: 'Orcamentos realizados',
    subtitle: 'Gerencie propostas em aberto e converta em pedido com agilidade quando o cliente aprovar.',
  },
}

function matchPageMeta(pathname: string) {
  const exact = pageMeta[pathname]
  if (exact) return exact

  if (pathname.startsWith('/sales/orders/')) {
    return {
      title: 'Detalhe do pedido',
      subtitle: 'Visao consolidada do documento, cliente, itens e fechamento comercial.',
    }
  }

  if (pathname.startsWith('/sales/quotes/')) {
    return {
      title: 'Detalhe do orcamento',
      subtitle: 'Revise proposta, condicoes e proxima acao de conversao de forma objetiva.',
    }
  }

  return pageMeta['/sales/dashboard']
}

export function SalesShell({ profile, isAdminPreview = false, children }: SalesShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const meta = useMemo(() => matchPageMeta(pathname), [pathname])
  const firstName = profile.full_name?.split(' ')[0] || 'Representante'
  const workspaceItems = navItems.filter((item) => item.group === 'workspace')
  const historyItems = navItems.filter((item) => item.group === 'history')

  const handleBackToAdmin = async () => {
    await setViewAsRepresentativeAction(false)
    router.push('/admin/dashboard')
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f7f5ef_38%,#ffffff_100%)] text-slate-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[286px] lg:flex-col lg:border-r lg:border-slate-200/80 lg:bg-white/88 lg:px-5 lg:py-5 lg:backdrop-blur-xl">
        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            <Sparkles className="h-3.5 w-3.5" />
            Modo representante
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-heading)] text-[28px] font-bold leading-tight text-slate-950">
            Vendas presenciais
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Workspace comercial para atendimento, negociacao e fechamento em campo sem depender do fluxo do cliente.
          </p>

          <div className="mt-5 grid gap-2">
            {isAdminPreview && (
              <Button
                variant="outline"
                className="h-11 rounded-2xl border-slate-200 bg-white"
                onClick={handleBackToAdmin}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao admin
              </Button>
            )}
            <Button asChild className="h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/sales/orders/new">Novo pedido</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
              <Link href="/sales/quotes/new">Novo orcamento</Link>
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-slate-200 bg-white/92 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
              {firstName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{profile.full_name}</p>
              <p className="truncate text-xs text-slate-500">{profile.email}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          <div className="space-y-5">
            <div>
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Operacao</p>
              <nav className="space-y-1.5">
                {workspaceItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all',
                        active
                          ? 'bg-slate-950 text-white shadow-[0_18px_32px_-22px_rgba(15,23,42,0.95)]'
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

            <div>
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Historico</p>
              <nav className="space-y-1.5">
                {historyItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all',
                        active
                          ? 'bg-slate-950 text-white shadow-[0_18px_32px_-22px_rgba(15,23,42,0.95)]'
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
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Target className="h-3.5 w-3.5" />
            Ritmo comercial
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">Tudo em poucos toques</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            O fluxo foi separado para pedidos, orcamentos e visitas sem competir com a navegacao do cliente final.
          </p>
        </div>
      </div>

      <div className="lg:pl-[286px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/84 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">
                    Representante
                  </span>
                  {isAdminPreview && (
                    <button
                      type="button"
                      onClick={handleBackToAdmin}
                      className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 transition-colors hover:bg-amber-100"
                    >
                      <ArrowLeft className="mr-1.5 h-3 w-3" />
                      Voltar ao admin
                    </button>
                  )}
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Campo ativo
                  </span>
                </div>
                <h1 className="mt-3 truncate font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight text-slate-950 sm:text-[32px]">
                  {meta.title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{meta.subtitle}</p>
              </div>

              <div className="hidden shrink-0 items-center gap-2 md:flex">
                {isAdminPreview && (
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-slate-200 bg-white/90"
                    onClick={handleBackToAdmin}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao admin
                  </Button>
                )}
                <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white/90">
                  <Link href="/sales/quotes/new">Novo orcamento</Link>
                </Button>
                <Button asChild className="h-11 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800">
                  <Link href="/sales/orders/new">Novo pedido</Link>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-[100px] pt-5 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-slate-200 bg-white/96 p-2 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {workspaceItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all',
                  active ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
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
