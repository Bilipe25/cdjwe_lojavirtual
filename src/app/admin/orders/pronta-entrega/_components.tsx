import Link from 'next/link'
import { ArrowRight, PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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

export function getRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

export function getVariantLabel(row: {
  product_variant?: {
    sku?: string | null
    product?: { name?: string | null } | { name?: string | null }[] | null
    fabric?: { name?: string | null } | { name?: string | null }[] | null
    fabric_color?: { name?: string | null } | { name?: string | null }[] | null
  } | {
    sku?: string | null
    product?: { name?: string | null } | { name?: string | null }[] | null
    fabric?: { name?: string | null } | { name?: string | null }[] | null
    fabric_color?: { name?: string | null } | { name?: string | null }[] | null
  }[] | null
  size_option?: { name?: string | null } | { name?: string | null }[] | null
}) {
  const variant = getRelation(row.product_variant)
  const product = getRelation(variant?.product)
  const fabric = getRelation(variant?.fabric)
  const color = getRelation(variant?.fabric_color)
  const size = getRelation(row.size_option)

  return {
    title: product?.name || variant?.sku || 'Produto sem nome',
    subtitle: [fabric?.name, color?.name, size?.name, variant?.sku ? `SKU ${variant.sku}` : null]
      .filter(Boolean)
      .join(' / '),
  }
}

export function ReadyDeliveryHeader({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <PackageCheck className="h-4 w-4" />
          </span>
          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
            Pronta Entrega
          </Badge>
        </div>
        <h1 className="text-2xl font-bold font-heading text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      {actionHref && actionLabel ? (
        <Button asChild className="h-10 rounded-lg">
          <Link href={actionHref}>
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

export function ReadyDeliveryStat({
  label,
  value,
  helper,
}: {
  label: string
  value: string | number
  helper?: string
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p> : null}
    </div>
  )
}
