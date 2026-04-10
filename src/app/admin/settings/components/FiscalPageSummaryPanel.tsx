'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface SummaryBadge {
  label: string
  tone?: BadgeTone
}

interface SummaryItem {
  label: string
  value: string
  detail?: string
}

interface FiscalPageSummaryPanelProps {
  badges: SummaryBadge[]
  items: SummaryItem[]
  helperText?: string
}

const toneClassMap: Record<BadgeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
}

export function FiscalPageSummaryPanel({
  badges,
  items,
  helperText,
}: FiscalPageSummaryPanelProps) {
  return (
    <Card className="glass-card border-0">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge
              key={badge.label}
              variant="outline"
              className={toneClassMap[badge.tone || 'neutral']}
            >
              {badge.label}
            </Badge>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl border bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{item.value}</div>
              {item.detail ? (
                <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
              ) : null}
            </div>
          ))}
        </div>

        {helperText ? <p className="text-sm text-muted-foreground">{helperText}</p> : null}
      </CardContent>
    </Card>
  )
}
