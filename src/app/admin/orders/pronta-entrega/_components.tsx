import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Data helpers (shared across admin & sales) ───

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0)
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

export function formatDateBR(value?: string | null) {
  if (!value) return '-'
  // Handles ISO date strings like "2026-04-30" without timezone shift
  const [year, month, day] = value.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

export function getRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

type VariantRow = {
  product_variant?: {
    sku?: string | null
    image_url?: string | null
    product?: { name?: string | null } | { name?: string | null }[] | null
    fabric?: { name?: string | null } | { name?: string | null }[] | null
    fabric_color?: { name?: string | null; hex_code?: string | null } | { name?: string | null; hex_code?: string | null }[] | null
  } | {
    sku?: string | null
    image_url?: string | null
    product?: { name?: string | null } | { name?: string | null }[] | null
    fabric?: { name?: string | null } | { name?: string | null }[] | null
    fabric_color?: { name?: string | null; hex_code?: string | null } | { name?: string | null; hex_code?: string | null }[] | null
  }[] | null
  size_option?: { name?: string | null } | { name?: string | null }[] | null
}

export function getVariantLabel(row: VariantRow) {
  const variant = getRelation(row.product_variant)
  const product = getRelation(variant?.product)
  const fabric = getRelation(variant?.fabric)
  const color = getRelation(variant?.fabric_color)
  const size = getRelation(row.size_option)

  return {
    title: product?.name || variant?.sku || 'Produto sem nome',
    subtitle: [fabric?.name, color?.name, size?.name, variant?.sku ? `SKU ${variant.sku}` : null]
      .filter(Boolean)
      .join(' · '),
    imageUrl: variant?.image_url || null,
    hexCode: color?.hex_code || null,
  }
}

// ─── UI Components ───

export function ReadyDeliveryStat({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  helper?: string
  icon?: LucideIcon
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  const toneClasses = {
    neutral: 'border-border/50 bg-card',
    success: 'border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20',
    warning: 'border-amber-200/60 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20',
    danger: 'border-red-200/60 bg-red-50/50 dark:border-red-800/40 dark:bg-red-950/20',
  }

  const iconToneClasses = {
    neutral: 'text-muted-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  }

  return (
    <div className={cn('rounded-lg border px-4 py-3', toneClasses[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4', iconToneClasses[tone])} />}
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p> : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: LucideIcon
  message: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  action,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {children}
    </div>
  )
}

export function MovementBadge({ type, label }: { type: string; label: string }) {
  const isPositive = ['TRANSFER_IN', 'RESERVATION_RELEASE', 'RESERVATION_EXPIRE', 'SALE_CANCEL_REVERSAL'].includes(type)
  const isReservation = ['RESERVATION_CREATE', 'RESERVATION_RELEASE', 'RESERVATION_EXPIRE'].includes(type)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        isReservation
          ? 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800/40'
          : isPositive
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800/40'
            : 'bg-red-50 text-red-700 ring-red-200/60 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800/40'
      )}
    >
      {label}
    </span>
  )
}

export function StatusBadge({
  status,
  label,
}: {
  status: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  label: string
}) {
  const classes = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800/40',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800/40',
    danger: 'bg-red-50 text-red-700 ring-red-200/60 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800/40',
    neutral: 'bg-muted text-muted-foreground ring-border/60',
    info: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-800/40',
  }

  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', classes[status])}>
      {label}
    </span>
  )
}
