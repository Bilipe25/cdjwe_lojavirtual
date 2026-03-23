'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SalesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[SALES_PANEL_ERROR]', error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-border/40 bg-card p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Falha ao carregar o painel de representante</h2>
        <p className="text-sm text-muted-foreground">
          Tente novamente. Se o erro persistir, volte ao dashboard e reabra o fluxo.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} className="h-9 rounded-xl px-4 text-sm">
          Tentar novamente
        </Button>
        <Button asChild variant="outline" className="h-9 rounded-xl px-4 text-sm">
          <Link href="/sales/dashboard">Ir para dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
