'use client'

import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BuilderValidationMessage = {
  id: string
  tone: 'warning' | 'info' | 'success'
  title: string
  description?: string
}

const validationToneClasses: Record<BuilderValidationMessage['tone'], string> = {
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-border/50 bg-muted/30 text-muted-foreground',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

const validationIconClasses: Record<BuilderValidationMessage['tone'], string> = {
  warning: 'text-amber-600',
  info: 'text-muted-foreground',
  success: 'text-emerald-600',
}

function ValidationIcon({ tone }: { tone: BuilderValidationMessage['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className={cn('h-4 w-4', validationIconClasses[tone])} />
  if (tone === 'warning') return <AlertCircle className={cn('h-4 w-4', validationIconClasses[tone])} />
  return <Info className={cn('h-4 w-4', validationIconClasses[tone])} />
}

export function OrderBuilderValidationPanel({
  messages,
  compact,
  maxMessages,
}: {
  messages: BuilderValidationMessage[]
  compact?: boolean
  maxMessages?: number
}) {
  if (messages.length === 0) return null

  const visibleMessages = typeof maxMessages === 'number' ? messages.slice(0, maxMessages) : messages
  const hiddenCount = messages.length - visibleMessages.length

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      {visibleMessages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5',
            validationToneClasses[message.tone]
          )}
        >
          <span className="mt-0.5 shrink-0">
            <ValidationIcon tone={message.tone} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{message.title}</span>
            {message.description ? <span className="block opacity-80">{message.description}</span> : null}
          </span>
        </div>
      ))}
      {hiddenCount > 0 ? (
        <p className="px-1 text-[11px] font-medium text-muted-foreground">
          + {hiddenCount} pendencia{hiddenCount > 1 ? 's' : ''} para finalizar
        </p>
      ) : null}
    </div>
  )
}
