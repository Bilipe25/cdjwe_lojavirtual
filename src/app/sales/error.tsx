'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SalesErrorState } from '@/components/sales/sales-ui'

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
    <SalesErrorState
      title="Falha ao carregar o painel de representante"
      description="Tente novamente. Se o erro persistir, volte ao dashboard e reabra o fluxo."
      action={
        <>
        <Button onClick={reset} className="h-9 rounded-xl px-4 text-sm">
          Tentar novamente
        </Button>
        <Button asChild variant="outline" className="h-9 rounded-xl px-4 text-sm">
          <Link href="/sales/dashboard">Ir para dashboard</Link>
        </Button>
        </>
      }
    />
  )
}
