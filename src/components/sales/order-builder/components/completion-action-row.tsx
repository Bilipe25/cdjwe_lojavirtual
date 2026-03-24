'use client'

import type { ComponentType } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CompletionActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  busy,
  last,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  description?: string
  onClick: () => void
  busy?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(busy)}
      className={cn(
        'group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60',
        !last && 'border-b border-border/40'
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Icon className="h-5 w-5 text-primary" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  )
}