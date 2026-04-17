import 'server-only'

import type { FiscalDocumentPayload, ItemTaxBreakdown } from '../motor/types'

export interface FiscalDocumentSnapshot extends FiscalDocumentPayload {
  order: {
    orderId: string
    orderNumber?: string | null
    paymentMethodCode?: string | null
    paymentMethodName?: string | null
    paymentInstallments?: number | null
    notes?: string | null
    shippingAddress?: string | null
    total?: number | null
  }
  document: {
    modelo: '55' | '65'
    numero: number
    serie: string
    chaveAcesso: string
    naturezaOperacao: string
    ambiente: 'homologacao' | 'producao'
    emittedAt: string
    emittedBy: string | null
    protocolo: string | null
    dataAutorizacao: string | null
    codigoStatus: number | null
    motivoStatus: string | null
    digestValue: string | null
  }
}

export function buildFiscalDocumentSnapshot(params: {
  payload: FiscalDocumentPayload
  order: {
    orderId: string
    orderNumber?: string | null
    paymentMethodCode?: string | null
    paymentMethodName?: string | null
    paymentInstallments?: number | null
    notes?: string | null
    shippingAddress?: string | null
    total?: number | null
  }
  document: {
    modelo: '55' | '65'
    numero: number
    serie: string
    chaveAcesso: string
    naturezaOperacao: string
    ambiente: 'homologacao' | 'producao'
    emittedAt: string
    emittedBy: string | null
    protocolo: string | null
    dataAutorizacao: string | null
    codigoStatus: number | null
    motivoStatus: string | null
    digestValue: string | null
  }
}): FiscalDocumentSnapshot {
  return {
    ...params.payload,
    order: params.order,
    document: params.document,
  }
}

export function parseFiscalDocumentSnapshot(value: unknown): FiscalDocumentSnapshot | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<FiscalDocumentSnapshot>
  if (!candidate.context || !candidate.totals || !Array.isArray(candidate.items) || !candidate.document) {
    return null
  }

  return candidate as FiscalDocumentSnapshot
}

export function getSnapshotAdditionalInfo(snapshot: FiscalDocumentSnapshot | null): string | null {
  if (!snapshot) return null

  const paymentSummary = [
    snapshot.order.paymentMethodName,
    snapshot.order.paymentInstallments && snapshot.order.paymentInstallments > 1
      ? `${snapshot.order.paymentInstallments} parcelas`
      : null,
  ].filter(Boolean).join(' - ')

  const parts = [
    snapshot.order.orderNumber ? `Pedido: ${snapshot.order.orderNumber}` : null,
    paymentSummary ? `Pagamento: ${paymentSummary}` : null,
    snapshot.context.operation.natureza_operacao_descricao
      ? `Natureza: ${snapshot.context.operation.natureza_operacao_descricao}`
      : null,
    snapshot.totals.vTotTrib > 0
      ? `Tributos aproximados (Lei 12.741): R$ ${Number(snapshot.totals.vTotTrib || 0).toFixed(2)}`
      : null,
    snapshot.order.notes,
    snapshot.order.shippingAddress ? `Endereco de entrega: ${snapshot.order.shippingAddress}` : null,
  ]
    .map((value) => (value || '').trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.join(' | ') : null
}

export function snapshotItemToDanfeItem(item: ItemTaxBreakdown) {
  return {
    code: item.product_variant_id.substring(0, 14),
    description: item.product_name,
    ncm: item.ncm,
    cfop: item.cfop,
    unit: item.commercial_unit || item.tax_unit || 'UN',
    quantity: item.quantity,
    unitPrice: item.fiscal_unit_value,
    totalValue: item.fiscal_total_value,
    icmsBase: item.icms.base,
    icmsValue: item.icms.value,
    icmsRate: item.icms.rate,
    ipiValue: item.ipi.value,
  }
}
