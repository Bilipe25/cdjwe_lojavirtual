import 'server-only'

import type { FiscalDocumentPayload, ItemTaxBreakdown } from '../motor/types'
import { normalizeAdditionalInfoPart, normalizeAdditionalInfoText } from '@/lib/fiscal/additional-info'

export interface FiscalBillingDuplicateSnapshot {
  numero: string
  vencimento: string
  vencimentoIso?: string | null
  valor: number
}

export interface FiscalBillingSnapshot {
  invoiceId?: string | null
  invoiceNumber?: string | null
  issueDate?: string | null
  paymentMethodName?: string | null
  paymentConditionName?: string | null
  installmentCount?: number | null
  valueOriginal?: number | null
  valueDiscount?: number | null
  valueNet?: number | null
  duplicates?: FiscalBillingDuplicateSnapshot[]
}

export interface FiscalDocumentSnapshot extends FiscalDocumentPayload {
  order: {
    orderId: string
    orderNumber?: string | null
    paymentMethodCode?: string | null
    paymentMethodName?: string | null
    paymentInstallments?: number | null
    fiscalObservation?: string | null
    notes?: string | null
    shippingAddress?: string | null
    total?: number | null
    billing?: FiscalBillingSnapshot | null
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
    additionalInfoResolved?: string | null
    fiscalAuthorityInfoResolved?: string | null
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
    fiscalObservation?: string | null
    notes?: string | null
    shippingAddress?: string | null
    total?: number | null
    billing?: FiscalBillingSnapshot | null
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
    additionalInfoResolved?: string | null
    fiscalAuthorityInfoResolved?: string | null
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

  if (Object.prototype.hasOwnProperty.call(snapshot.document, 'additionalInfoResolved')) {
    return normalizeAdditionalInfoText(snapshot.document.additionalInfoResolved)
  }

  const hasFiscalObservation = Object.prototype.hasOwnProperty.call(snapshot.order, 'fiscalObservation')
  const freeTextObservation = hasFiscalObservation
    ? snapshot.order.fiscalObservation
    : snapshot.order.notes

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
    freeTextObservation,
    snapshot.order.shippingAddress ? `Endereco de entrega: ${snapshot.order.shippingAddress}` : null,
  ]
    .map((value) => normalizeAdditionalInfoPart(value))
    .filter(Boolean)

  return parts.length > 0 ? parts.join('\n') : null
}

function isUuidLike(value: string | null | undefined) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function buildItemVariantDescription(item: ItemTaxBreakdown) {
  const primaryLine = item.resolved_product_description || item.product_name

  const lines: string[] = [primaryLine]

  if (item.inf_ad_prod) {
    lines.push(
      ...item.inf_ad_prod
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((part) => part.trim())
        .filter(Boolean)
    )
  }

  return lines.join('\n')
}

export function snapshotItemToDanfeItem(item: ItemTaxBreakdown, index: number = 0) {
  const fallbackCode = String(index + 1).padStart(3, '0')
  const resolvedCode = (item.resolved_product_code || '').trim()
  const sku = (item.sku || '').trim()
  const rawCode = resolvedCode || sku || item.product_variant_id || item.order_item_id || ''
  const code = rawCode && !isUuidLike(rawCode) ? rawCode.substring(0, 60) : fallbackCode

  return {
    code,
    description: buildItemVariantDescription(item),
    ncm: item.ncm,
    cst: item.cst_icms || item.icms.cst,
    cfop: item.cfop,
    unit: item.commercial_unit || item.tax_unit || 'UN',
    quantity: item.quantity,
    unitPrice: item.fiscal_unit_value,
    discountValue: item.fiscal_discount_value,
    totalValue: item.fiscal_total_value,
    icmsBase: item.icms.base,
    icmsValue: item.icms.value,
    icmsRate: item.aliquota_icms || item.icms.rate,
    ipiValue: item.ipi.value,
    ipiRate: item.aliquota_ipi || item.ipi.rate,
    totalTributos: item.total_tributos,
    additionalInfo: item.inf_ad_prod || null,
  }
}
