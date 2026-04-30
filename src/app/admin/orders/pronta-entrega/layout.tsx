'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PackageCheck, Boxes, ArrowLeftRight, Activity, ReceiptText, CalendarCheck2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/admin/orders/pronta-entrega/estoque', label: 'Estoque', icon: Boxes },
  { href: '/admin/orders/pronta-entrega/transferir', label: 'Transferir', icon: ArrowLeftRight },
  { href: '/admin/orders/pronta-entrega/movimentacoes', label: 'Movimentações', icon: Activity },
  { href: '/admin/orders/pronta-entrega/recebimentos', label: 'Recebimentos', icon: ReceiptText },
  { href: '/admin/orders/pronta-entrega/fechamentos', label: 'Fechamentos', icon: CalendarCheck2 },
] as const

export default function ReadyDeliveryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800">
            <PackageCheck className="h-4 w-4" />
          </span>
          <Badge variant="outline" className="border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
            Pronta Entrega
          </Badge>
        </div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Gestão de Pronta Entrega
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Controle operacional de estoque físico, transferências, movimentações, recebimentos e fechamentos dos representantes.
        </p>
      </div>

      {/* Tab Navigation */}
      <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-border/50 pb-px scrollbar-none">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-card text-foreground shadow-sm border border-b-0 border-border/50'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-px bg-card" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Page Content */}
      {children}
    </div>
  )
}
