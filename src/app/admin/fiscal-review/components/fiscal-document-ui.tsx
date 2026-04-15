'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FiscalDocumentStatus } from '../types'

export function FiscalDocumentStatusBadge({
  status,
  className,
}: {
  status: FiscalDocumentStatus
  className?: string
}) {
  const tone = documentStatusTone(status)

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase',
        tone,
        className
      )}
    >
      {humanizeDocumentStatus(status)}
    </Badge>
  )
}

export function SectionShell({
  eyebrow,
  title,
  description,
  children,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="glass-card rounded-[28px] border border-white/30 p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bronze">
              {eyebrow}
            </p>
          ) : null}
          <div>
            <h2 className="text-2xl font-semibold text-gradient-navy">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function KpiCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string | number
  helper: string
}) {
  return (
    <article className="glass-card rounded-[24px] border border-white/25 p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <strong className="mt-3 block text-3xl font-semibold text-foreground">{value}</strong>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{helper}</p>
    </article>
  )
}

export function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn('mt-2 text-sm text-foreground', mono && 'font-mono text-xs break-all')}>{value}</p>
    </div>
  )
}

export function ArtifactBadge({
  label,
  available,
}: {
  label: string
  available: boolean
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-medium',
        available
          ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
          : 'border-border/80 bg-background/50 text-muted-foreground'
      )}
    >
      {label}
    </Badge>
  )
}

export function TimelineTone({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'success' | 'warning' | 'error' | 'neutral'
}) {
  return (
    <article
      className={cn(
        'rounded-[24px] border-l-4 bg-background/70 p-4 shadow-sm',
        tone === 'success' && 'border-l-emerald-500 border border-emerald-300/20',
        tone === 'warning' && 'border-l-amber-500 border border-amber-300/20',
        tone === 'error' && 'border-l-rose-500 border border-rose-300/20',
        tone === 'neutral' && 'border-l-slate-400 border border-border/70'
      )}
    >
      {children}
    </article>
  )
}

export function EventStatusBadge({
  status,
}: {
  status: string | null
}) {
  const tone = eventTone(status)

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]',
        tone === 'success' && 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
        tone === 'warning' && 'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200',
        tone === 'error' && 'border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-200',
        tone === 'neutral' && 'border-border/80 bg-background/50 text-muted-foreground'
      )}
    >
      {humanizeEventStatus(status)}
    </Badge>
  )
}

export function humanizeDocumentStatus(status: string | null) {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    processing: 'Processando',
    authorized: 'Autorizada',
    denied: 'Negada',
    cancelled: 'Cancelada',
    correction: 'Carta enviada',
    inutilized: 'Inutilizada',
    error: 'Com erro',
  }

  if (!status) return 'Sem status'
  return labels[status] || status
}

export function documentStatusTone(status: string | null) {
  if (status === 'authorized') return 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
  if (status === 'cancelled') return 'border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-200'
  if (status === 'pending' || status === 'processing') return 'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200'
  if (status === 'error' || status === 'denied') return 'border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-200'
  return 'border-border/80 bg-background/50 text-muted-foreground'
}

export function eventTone(status: string | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'success') return 'success'
  if (status === 'warning' || status === 'pending') return 'warning'
  if (status === 'failure' || status === 'error') return 'error'
  return 'neutral'
}

export function humanizeEventType(type: string | null) {
  const labels: Record<string, string> = {
    authorization: 'Autorizacao',
    consultation: 'Consulta',
    cancellation: 'Cancelamento',
    correction: 'Carta de correcao',
    inutilization: 'Inutilizacao',
    danfe_generation: 'Geracao de DANFE',
    calculation: 'Calculo',
    validation: 'Validacao',
    status_check: 'Status SEFAZ',
  }

  if (!type) return 'Evento tecnico'
  return labels[type] || type.replace(/_/g, ' ')
}

export function humanizeEventStatus(status: string | null) {
  const labels: Record<string, string> = {
    success: 'Sucesso',
    failure: 'Falha',
    warning: 'Alerta',
    pending: 'Pendente',
  }

  if (!status) return 'Sem status'
  return labels[status] || status
}

export function humanizeEnvironment(value: string | null) {
  return value === 'producao' ? 'Producao' : 'Homologacao'
}

export function humanizeModel(model: string | null) {
  return model === '65' ? 'NFC-e' : 'NF-e'
}

export function humanizeOrderStatus(status: string | null) {
  if (!status) return 'Nao informado'
  return status.replace(/_/g, ' ')
}

export function formatCurrency(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatOrderNumber(value: string | null | undefined) {
  if (!value) return '----'
  return String(value).padStart(6, '0')
}

export function getEffectiveDocumentDate(value: {
  emittedAt?: string | null
  createdAt?: string | null
}) {
  return value.emittedAt || value.createdAt || null
}

export function getSnapshotItemCount(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return 0
  const items = (snapshot as { items?: unknown }).items
  return Array.isArray(items) ? items.length : 0
}

export function getSnapshotAdditionalInfo(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const root = snapshot as Record<string, unknown>
  const context = root.context as Record<string, unknown> | undefined
  const emitter = context?.emitter as Record<string, unknown> | undefined
  const store = context?.store as Record<string, unknown> | undefined

  return {
    emitterName: emitter?.razao_social ? String(emitter.razao_social) : null,
    recipientName: store?.nome ? String(store.nome) : null,
  }
}
