'use client'

import type { OrderType } from '@/lib/types'
import {
  getOrderTypeFullLabel,
  getOrderTypeLabel as getCentralOrderTypeLabel,
} from '@/lib/orders/order-type'
import { cn } from '@/lib/utils'

const orderTypeOptions: Array<{ value: OrderType; label: string }> = [
  { value: 'PRE_VENDA', label: getOrderTypeFullLabel('PRE_VENDA') },
  { value: 'PRONTA_ENTREGA', label: getOrderTypeFullLabel('PRONTA_ENTREGA') },
]

export function getOrderTypeLabel(value?: OrderType | null) {
  return getCentralOrderTypeLabel(value)
}

export function OrderTypeSelector({
  value,
  onChange,
}: {
  value: OrderType
  onChange: (value: OrderType) => void
}) {
  return (
    <div className="relative flex h-10 w-full rounded-xl border border-border bg-muted/40 p-1">
      {/* Animated background pill */}
      <div
        className={cn(
          'absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-card shadow-sm ring-1 ring-border/20 transition-all duration-200 ease-out',
          value === 'PRONTA_ENTREGA' ? 'left-[calc(50%+2px)]' : 'left-1'
        )}
      />
      {orderTypeOptions.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center rounded-lg text-xs font-semibold transition-colors duration-150',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
