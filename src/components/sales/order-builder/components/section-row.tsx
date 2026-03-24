'use client'

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionRow({
  label,
  value,
  highlight,
  onClick,
}: {
  label: string
  value?: string
  highlight?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 border-b border-border/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/40',
        highlight && 'bg-primary/5'
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {value ? (
          <p className={cn('mt-0.5 text-sm font-semibold', highlight ? 'text-primary' : 'text-foreground')}>
            {value}
          </p>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}