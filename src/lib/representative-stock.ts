import type { RepresentativeStockMovementType, RepresentativeStockTransferStatus } from '@/lib/types'

export type RepresentativeStockKeyInput = {
  productVariantId: string
  sizeOptionId?: string | null
}

export function getRepresentativeStockKey(input: RepresentativeStockKeyInput) {
  return `${input.productVariantId}::${input.sizeOptionId || 'legacy'}`
}

export function getRepresentativeStockStatus(quantityAvailable: number) {
  if (quantityAvailable <= 0) {
    return {
      label: 'Indisponivel',
      tone: 'danger' as const,
    }
  }

  if (quantityAvailable <= 3) {
    return {
      label: `${quantityAvailable} disponivel${quantityAvailable === 1 ? '' : 's'}`,
      tone: 'warning' as const,
    }
  }

  return {
    label: `${quantityAvailable} disponiveis`,
    tone: 'success' as const,
  }
}

export function getRepresentativeStockMovementLabel(type: RepresentativeStockMovementType) {
  const labels: Record<RepresentativeStockMovementType, string> = {
    TRANSFER_IN: 'Transferencia recebida',
    RESERVATION_CREATE: 'Reserva criada',
    RESERVATION_RELEASE: 'Reserva liberada',
    RESERVATION_EXPIRE: 'Reserva expirada',
    READY_DELIVERY_SALE: 'Venda pronta entrega',
    SALE_CANCEL_REVERSAL: 'Estorno de cancelamento',
    RETURN_QUARANTINE: 'Devolucao em quarentena',
    ADJUSTMENT: 'Ajuste manual',
    DAY_CLOSING: 'Fechamento',
  }

  return labels[type] || type
}

export function getRepresentativeStockTransferStatusLabel(status: RepresentativeStockTransferStatus) {
  const labels: Record<RepresentativeStockTransferStatus, string> = {
    draft: 'Rascunho',
    sent: 'Enviado',
    received: 'Recebido',
    cancelled: 'Cancelado',
  }

  return labels[status] || status
}
