import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Tone = 'default' | 'navy' | 'bronze' | 'success'
type BadgeTone = 'neutral' | 'navy' | 'bronze' | 'success' | 'warning' | 'danger'

const toneClasses: Record<Tone, { icon: string; value: string }> = {
  default: {
    icon: 'border-border bg-muted/60 text-foreground',
    value: 'text-foreground',
  },
  navy: {
    icon: 'border-primary/20 bg-primary/5 text-primary',
    value: 'text-primary',
  },
  bronze: {
    icon: 'border-bronze/20 bg-bronze/10 text-bronze-dark',
    value: 'text-bronze-dark',
  },
  success: {
    icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    value: 'text-emerald-950',
  },
}

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  navy: 'border-primary/20 bg-primary/5 text-primary',
  bronze: 'border-bronze/20 bg-bronze/10 text-bronze-dark',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
}

export function SalesPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm', className)}>
      {children}
    </section>
  )
}

export function SalesPanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold font-heading text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function SalesStatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-4',
      badgeToneClasses[tone],
      className
    )}>
      {children}
    </span>
  )
}

export function SalesRecordLink({
  href,
  title,
  subtitle,
  meta,
  amount,
  badges,
}: {
  href: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  amount?: ReactNode
  badges?: ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badges}
        </div>
        {(subtitle || meta) ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {subtitle ? <span className="min-w-0 truncate">{subtitle}</span> : null}
            {meta ? <span>{meta}</span> : null}
          </div>
        ) : null}
      </div>
      {amount ? <span className="shrink-0 text-sm font-bold font-heading text-foreground">{amount}</span> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

export function SalesPagination({
  page,
  totalPages,
  previousHref,
  nextHref,
  label,
}: {
  page: number
  totalPages: number
  previousHref: string
  nextHref: string
  label: ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card p-3">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-border px-3 text-xs"
        disabled={page <= 1}
      >
        <Link href={previousHref} aria-disabled={page <= 1}>
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Anterior
        </Link>
      </Button>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-border px-3 text-xs"
        disabled={page >= totalPages}
      >
        <Link href={nextHref} aria-disabled={page >= totalPages}>
          Proxima
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

export function SalesPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl border border-border/40 bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-border/40 bg-card" />
    </div>
  )
}

export function SalesErrorState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-border/40 bg-card p-8 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}

export function SalesMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  helper?: string
  tone?: Tone
}) {
  const styles = toneClasses[tone]

  return (
    <Card className="rounded-2xl border-border/40 bg-card shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <div className={cn('mt-2 text-2xl font-bold font-heading tracking-tight', styles.value)}>{value}</div>
          {helper ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p> : null}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm', styles.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export function SalesKpiStrip({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 rounded-xl border border-border/40 bg-card px-3 py-2 shadow-sm">
          <span className="text-[11px] text-muted-foreground">{item.label}</span>
          <span className="text-sm font-bold font-heading text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export function SalesEmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function SalesInfoPill({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}
