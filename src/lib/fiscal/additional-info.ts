import type { FiscalDocumentPayload, FiscalTransportContext } from './motor/types'
import type { CompanyFiscalEnvironmentParams, FiscalAdditionalInfoFlags } from '@/lib/types'

export const DEFAULT_ADDITIONAL_INFO_FLAGS: FiscalAdditionalInfoFlags = {
  mostrar_numero_pedido: true,
  mostrar_condicao_pagamento: true,
  mostrar_natureza_operacao: true,
  mostrar_forma_entrega: true,
  mostrar_frete_seguro_outras_despesas: true,
  mostrar_tributos_aproximados: true,
  mostrar_endereco_entrega: true,
  mostrar_observacao_fiscal_pedido: true,
  mostrar_observacoes_padrao: true,
}

export interface FiscalAdditionalInfoOrderData {
  orderNumber?: string | null
  paymentMethodName?: string | null
  paymentInstallments?: number | null
  fiscalObservation?: string | null
  shippingAddress?: string | null
}

export interface FiscalAdditionalInfoBuildInput {
  payload: FiscalDocumentPayload
  order: FiscalAdditionalInfoOrderData
  environmentParams?: CompanyFiscalEnvironmentParams | Record<string, unknown> | null
}

export function parseAdditionalInfoFlags(
  value: Partial<FiscalAdditionalInfoFlags> | Record<string, unknown> | null | undefined
): FiscalAdditionalInfoFlags {
  const source = (value || {}) as Partial<FiscalAdditionalInfoFlags> & Record<string, unknown>

  return {
    mostrar_numero_pedido: source.mostrar_numero_pedido !== false,
    mostrar_condicao_pagamento: source.mostrar_condicao_pagamento !== false,
    mostrar_natureza_operacao: source.mostrar_natureza_operacao !== false,
    mostrar_forma_entrega: source.mostrar_forma_entrega !== false,
    mostrar_frete_seguro_outras_despesas: source.mostrar_frete_seguro_outras_despesas !== false,
    mostrar_tributos_aproximados: source.mostrar_tributos_aproximados !== false,
    mostrar_endereco_entrega: source.mostrar_endereco_entrega !== false,
    mostrar_observacao_fiscal_pedido: source.mostrar_observacao_fiscal_pedido !== false,
    mostrar_observacoes_padrao: source.mostrar_observacoes_padrao !== false,
  }
}

export function sanitizeAdditionalInfoFlags(
  value: Partial<FiscalAdditionalInfoFlags> | Record<string, unknown> | null | undefined
): FiscalAdditionalInfoFlags {
  return parseAdditionalInfoFlags(value)
}

export function sanitizeAdditionalStandardNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((note) => normalizeAdditionalInfoPart(typeof note === 'string' ? note : String(note || '')))
    .filter((note): note is string => Boolean(note))
}

export function parseFiscalEnvironmentParams(
  value: CompanyFiscalEnvironmentParams | Record<string, unknown> | null | undefined
): {
  additionalInfoFlags: FiscalAdditionalInfoFlags
  observacoesPadrao: string[]
} {
  const source = (value || {}) as Record<string, unknown>

  return {
    additionalInfoFlags: parseAdditionalInfoFlags(
      (source as Record<string, unknown>).additional_info_flags as Record<string, unknown> | undefined
    ),
    observacoesPadrao: sanitizeAdditionalStandardNotes(
      (source as Record<string, unknown>).observacoes_padrao
    ),
  }
}

export function buildResolvedAdditionalInfo(input: FiscalAdditionalInfoBuildInput): string | null {
  const { additionalInfoFlags, observacoesPadrao } = parseFiscalEnvironmentParams(input.environmentParams)
  const { payload, order } = input
  const parts: string[] = []

  if (additionalInfoFlags.mostrar_numero_pedido && order.orderNumber) {
    parts.push(`Pedido: ${order.orderNumber}`)
  }

  const paymentSummary = buildPaymentSummary(order.paymentMethodName, order.paymentInstallments)
  if (additionalInfoFlags.mostrar_condicao_pagamento && paymentSummary) {
    parts.push(`Condicao de pagamento: ${paymentSummary}`)
  }

  if (
    additionalInfoFlags.mostrar_natureza_operacao &&
    payload.context.operation.natureza_operacao_descricao
  ) {
    parts.push(`Natureza da operacao: ${payload.context.operation.natureza_operacao_descricao}`)
  }

  const deliveryForm = humanizeDeliveryForm(payload.context.transport.delivery_form)
  if (additionalInfoFlags.mostrar_forma_entrega && deliveryForm) {
    parts.push(`Forma de entrega: ${deliveryForm}`)
  }

  const costBlock = buildTransportCostBlock(payload)
  if (additionalInfoFlags.mostrar_frete_seguro_outras_despesas && costBlock) {
    parts.push(costBlock)
  }

  if (additionalInfoFlags.mostrar_tributos_aproximados && payload.totals.vTotTrib > 0) {
    parts.push(`Tributos aproximados (Lei 12.741): R$ ${formatMoney(payload.totals.vTotTrib)}`)
  }

  const fiscalObservation = normalizeAdditionalInfoPart(order.fiscalObservation)
  if (additionalInfoFlags.mostrar_observacao_fiscal_pedido && fiscalObservation) {
    parts.push(fiscalObservation)
  }

  if (additionalInfoFlags.mostrar_observacoes_padrao) {
    parts.push(...observacoesPadrao)
  }

  const shippingAddress = normalizeAdditionalInfoPart(order.shippingAddress)
  if (additionalInfoFlags.mostrar_endereco_entrega && shippingAddress) {
    parts.push(`Endereco de entrega: ${shippingAddress}`)
  }

  return parts.length > 0 ? parts.join(' | ') : null
}

export function normalizeAdditionalInfoPart(value: string | null | undefined) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function buildPaymentSummary(methodName: string | null | undefined, installments: number | null | undefined) {
  const parts = [
    normalizeAdditionalInfoPart(methodName),
    installments && installments > 1 ? `${installments} parcelas` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' - ') : null
}

function buildTransportCostBlock(payload: FiscalDocumentPayload) {
  const parts = [
    payload.totals.vFrete > 0 ? `Frete: R$ ${formatMoney(payload.totals.vFrete)}` : null,
    payload.totals.vSeg > 0 ? `Seguro: R$ ${formatMoney(payload.totals.vSeg)}` : null,
    payload.totals.vOutro > 0 ? `Outras despesas: R$ ${formatMoney(payload.totals.vOutro)}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' / ') : null
}

function humanizeDeliveryForm(value: FiscalTransportContext['delivery_form']) {
  switch (value) {
    case 'retirada':
      return 'Retirada'
    case 'transportadora':
      return 'Transportadora'
    case 'frota_propria':
      return 'Frota propria'
    case 'correios':
      return 'Correios'
    case 'entrega_expressa':
      return 'Entrega expressa'
    case 'balcao':
      return 'Balcao'
    default:
      return null
  }
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
