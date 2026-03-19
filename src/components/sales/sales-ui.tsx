import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Tone = 'slate' | 'blue' | 'emerald' | 'amber'

const toneClasses: Record<Tone, { icon: string; value: string }> = {
  slate: {
    icon: 'border-slate-200 bg-slate-100 text-slate-700',
    value: 'text-slate-950',
  },
  blue: {
    icon: 'border-blue-200 bg-blue-50 text-blue-700',
    value: 'text-blue-950',
  },
  emerald: {
    icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    value: 'text-emerald-950',
  },
  amber: {
    icon: 'border-amber-200 bg-amber-50 text-amber-700',
    value: 'text-amber-950',
  },
}

export function SalesMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'slate',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  helper?: string
  tone?: Tone
}) {
  const styles = toneClasses[tone]

  return (
    <Card className="rounded-[28px] border border-slate-200 bg-white/95 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <div className={cn('mt-3 text-3xl font-bold tracking-tight', styles.value)}>{value}</div>
          {helper ? <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p> : null}
        </div>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm', styles.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
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
    <Card className="rounded-[28px] border border-dashed border-slate-300 bg-white/85 shadow-sm">
      <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-950">{title}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardContent>
    </Card>
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  )
}
