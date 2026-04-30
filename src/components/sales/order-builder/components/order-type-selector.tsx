'use client'

import { CalendarClock, PackageCheck, type LucideIcon } from 'lucide-react'
import type { OrderType } from '@/lib/types'
import { cn } from '@/lib/utils'

const orderTypeOptions = [
  {
    value: 'PRE_VENDA',
    label: 'Pedido Pre-venda',
    description: 'Pedido com entrega futura. Requer endereco de entrega.',
    icon: CalendarClock,
  },
  {
    value: 'PRONTA_ENTREGA',
    label: 'Pronta Entrega',
    description: 'Pedido entregue diretamente pelo representante. Nao requer endereco de entrega.',
    icon: PackageCheck,
  },
] satisfies Array<{
  value: OrderType
  label: string
  description: string
  icon: LucideIcon
}>

export function getOrderTypeLabel(value?: OrderType | null) {
  return orderTypeOptions.find((option) => option.value === value)?.label || 'Pedido Pre-venda'
}

export function OrderTypeSelector({
  value,
  onChange,
}: {
  value: OrderType
  onChange: (value: OrderType) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {orderTypeOptions.map((option) => {
        const selected = option.value === value
        const Icon = option.icon

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-[92px] items-start gap-3 rounded-xl border px-3 py-3 text-left transition',
              selected
                ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
                : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30'
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                selected ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border bg-muted/40 text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{option.label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
