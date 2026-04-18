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
    snapshot.context.transport.freight_value > 0
      ? `Frete: R$ ${Number(snapshot.context.transport.freight_value || 0).toFixed(2)}`
      : null,
    snapshot.context.transport.insurance_value > 0
      ? `Seguro: R$ ${Number(snapshot.context.transport.insurance_value || 0).toFixed(2)}`
      : null,
    snapshot.context.transport.other_expenses_value > 0
      ? `Outras despesas: R$ ${Number(snapshot.context.transport.other_expenses_value || 0).toFixed(2)}`
      : null,
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

function isUuidLike(value: string | null | undefined) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function buildItemVariantDescription(item: ItemTaxBreakdown) {
  const variantParts = [
    item.fabric_name ? `Tecido: ${item.fabric_name}` : null,
    item.color_name ? `Cor: ${item.color_name}` : null,
    item.size_name ? `Tamanho: ${item.size_name}` : item.size ? `Tamanho: ${item.size}` : null,
  ].filter(Boolean)

  return variantParts.length > 0 ? `${item.product_name}\n${variantParts.join(' | ')}` : item.product_name
}

export function snapshotItemToDanfeItem(item: ItemTaxBreakdown, index: number = 0) {
  const fallbackCode = String(index + 1).padStart(3, '0')
  const rawCode = item.product_variant_id || item.order_item_id || ''
  const code = isUuidLike(rawCode) ? fallbackCode : rawCode.substring(0, 14)

  return {
    code,
    description: buildItemVariantDescription(item),
    ncm: item.ncm,
    cst: item.cst_icms || item.icms.cst,
    cfop: item.cfop,
    unit: item.commercial_unit || item.tax_unit || 'UN',
    quantity: item.quantity,
    unitPrice: item.fiscal_unit_value,
    totalValue: item.fiscal_total_value,
    icmsBase: item.icms.base,
    icmsValue: item.icms.value,
    icmsRate: item.aliquota_icms || item.icms.rate,
    ipiValue: item.ipi.value,
    ipiRate: item.aliquota_ipi || item.ipi.rate,
    additionalInfo: item.inf_ad_prod || null,
  }
}
