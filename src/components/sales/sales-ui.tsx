import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Tone = 'default' | 'navy' | 'bronze' | 'success'

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
