'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { loadFiscalReadinessAction } from '../fiscal-readiness-actions'

type FiscalReadinessStatus = 'ok' | 'missing' | 'warning'

interface FiscalReadinessItem {
  key: string
  label: string
  status: FiscalReadinessStatus
  href: string
  detail?: string
  blocking: boolean
}

interface FiscalReadinessSummary {
  items: FiscalReadinessItem[]
  completedCount: number
  totalCount: number
  blockingCount: number
  warningCount: number
  isReadyForEmission: boolean
  isReadyForProduction: boolean
}

export function FiscalReadinessCard() {
  const [summary, setSummary] = useState<FiscalReadinessSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const result = await loadFiscalReadinessAction()
      setSummary(result.data)
      setError(result.error)
      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Verificando prontidão fiscal...</span>
        </CardContent>
      </Card>
    )
  }

  if (error || !summary) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm font-medium text-destructive">
            {error || 'Não foi possível avaliar a prontidão fiscal.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-bronze hover:text-bronze/80"
          >
            Tentar novamente
          </button>
        </CardContent>
      </Card>
    )
  }

  const { items, completedCount, totalCount, warningCount, blockingCount, isReadyForEmission } =
    summary
  const percentage = Math.round((completedCount / totalCount) * 100)

  const renderIcon = (item: FiscalReadinessItem) => {
    if (item.status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
    if (item.status === 'warning') {
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
    }
    return <XCircle className="h-4 w-4 text-red-400 shrink-0" />
  }

  return (
    <Card className="glass-card border-0 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-heading flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${isReadyForEmission ? 'text-emerald-500' : 'text-amber-500'}`} />
          Prontidão Fiscal
          <span
            className={`ml-auto text-sm font-normal px-2.5 py-0.5 rounded-full ${
              isReadyForEmission
                ? 'bg-emerald-50 text-emerald-700'
                : blockingCount === 0
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {completedCount}/{totalCount}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`absolute inset-y-0 left-0 rounded-full ${
              isReadyForEmission
                ? 'bg-linear-to-r from-emerald-400 to-emerald-500'
                : blockingCount === 0
                  ? 'bg-linear-to-r from-amber-400 to-amber-500'
                  : 'bg-linear-to-r from-red-400 to-red-500'
            }`}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Bloqueios</div>
            <div className="mt-1 text-xl font-semibold text-red-600">{blockingCount}</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Alertas</div>
            <div className="mt-1 text-xl font-semibold text-amber-600">{warningCount}</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Emissão</div>
            <div className="mt-1 text-sm font-semibold">
              {isReadyForEmission ? 'Apta para ativação' : 'Ainda bloqueada'}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.key} className="flex items-start gap-2.5 py-1.5 group">
              {renderIcon(item)}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm ${
                    item.status === 'ok' ? 'text-muted-foreground' : 'text-foreground font-medium'
                  }`}
                >
                  {item.label}
                </div>
                {item.detail ? (
                  <div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div>
                ) : null}
              </div>
              {item.status !== 'ok' ? (
                <Link
                  href={item.href}
                  className="text-xs text-bronze hover:text-bronze/80 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Revisar
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        {isReadyForEmission ? (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm"
          >
            <ShieldCheck className="h-4 w-4" />
            Base do emitente pronta para habilitar emissão fiscal.
          </motion.div>
        ) : (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              A emissão em produção deve permanecer bloqueada até resolver os bloqueios críticos acima.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
