'use client'

import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ReadyDeliveryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Erro ao carregar dados</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || 'Ocorreu um erro inesperado ao carregar esta seção de pronta entrega.'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset} className="gap-2">
        <RotateCcw className="h-3.5 w-3.5" />
        Tentar novamente
      </Button>
    </div>
  )
}
