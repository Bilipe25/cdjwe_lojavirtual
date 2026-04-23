import type { FiscalDocumentPayload, FiscalTransportContext, ItemTaxBreakdown } from './motor/types'
import type {
  CompanyFiscalEnvironmentParams,
  FiscalAdditionalInfoFlags,
  FiscalItemAdditionalInfoFlags,
} from '@/lib/types'
import { parseTechnicalResponsibleConfig } from '@/lib/fiscal/technical-responsible.shared'

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

export const DEFAULT_ITEM_ADDITIONAL_INFO_FLAGS: FiscalItemAdditionalInfoFlags = {
  mostrar_fabricante_produto: true,
  mostrar_descricao_fiscal_padrao: true,
  mostrar_codigo_barras_gtin: true,
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

export interface FiscalItemAdditionalInfoBuildInput {
  item: Pick<
    ItemTaxBreakdown,
    | 'manufacturer_name'
    | 'ean_gtin'
    | 'tax_ean_gtin'
    | 'cest'
    | 'fcp'
    | 'st'
    | 'ipi'
  > & {
    default_fiscal_description?: string | null
  }
  environmentParams?: CompanyFiscalEnvironmentParams | Record<string, unknown> | null
}

export interface FiscalAuthorityInfoBuildInput {
  payload: FiscalDocumentPayload
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

export function parseItemAdditionalInfoFlags(
  value: Partial<FiscalItemAdditionalInfoFlags> | Record<string, unknown> | null | undefined
): FiscalItemAdditionalInfoFlags {
  const source = (value || {}) as Partial<FiscalItemAdditionalInfoFlags> & Record<string, unknown>

  return {
    mostrar_fabricante_produto: source.mostrar_fabricante_produto !== false,
    mostrar_descricao_fiscal_padrao: source.mostrar_descricao_fiscal_padrao !== false,
    mostrar_codigo_barras_gtin: source.mostrar_codigo_barras_gtin !== false,
  }
}

export function sanitizeItemAdditionalInfoFlags(
  value: Partial<FiscalItemAdditionalInfoFlags> | Record<string, unknown> | null | undefined
): FiscalItemAdditionalInfoFlags {
  return parseItemAdditionalInfoFlags(value)
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
  itemAdditionalInfoFlags: FiscalItemAdditionalInfoFlags
  observacoesPadrao: string[]
  technicalResponsible: ReturnType<typeof parseTechnicalResponsibleConfig>
} {
  const source = (value || {}) as Record<string, unknown>

  return {
    additionalInfoFlags: parseAdditionalInfoFlags(
      (source as Record<string, unknown>).additional_info_flags as Record<string, unknown> | undefined
    ),
    itemAdditionalInfoFlags: parseItemAdditionalInfoFlags(
      (source as Record<string, unknown>).item_additional_info_flags as Record<string, unknown> | undefined
    ),
    observacoesPadrao: sanitizeAdditionalStandardNotes(
      (source as Record<string, unknown>).observacoes_padrao
    ),
    technicalResponsible: parseTechnicalResponsibleConfig(source),
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

  return parts.length > 0 ? parts.join('\n') : null
}

export function buildResolvedItemAdditionalInfo(input: FiscalItemAdditionalInfoBuildInput): string | null {
  const { itemAdditionalInfoFlags } = parseFiscalEnvironmentParams(input.environmentParams)
  const { item } = input
  const parts: string[] = []

  const defaultFiscalDescription = normalizeAdditionalInfoPart(item.default_fiscal_description)
  if (itemAdditionalInfoFlags.mostrar_descricao_fiscal_padrao && defaultFiscalDescription) {
    parts.push(defaultFiscalDescription)
  }

  const manufacturerName = normalizeAdditionalInfoPart(item.manufacturer_name)
  if (itemAdditionalInfoFlags.mostrar_fabricante_produto && manufacturerName) {
    parts.push(`Fabricante: ${manufacturerName}`)
  }

  const gtin = normalizeGtin(item.tax_ean_gtin || item.ean_gtin)
  if (itemAdditionalInfoFlags.mostrar_codigo_barras_gtin && gtin) {
    parts.push(`GTIN: ${gtin}`)
  }

  if (item.cest) {
    parts.push(`CEST ${item.cest}`)
  }

  if (item.fcp.value > 0) {
    parts.push(`FCP proprio: p ${item.fcp.rate.toFixed(2)}% v ${item.fcp.value.toFixed(2)}`)
  }

  if (item.st.fcp_value > 0) {
    parts.push(`FCP-ST: p ${item.st.fcp_rate.toFixed(2)}% v ${item.st.fcp_value.toFixed(2)}`)
  }

  if (item.ipi.value > 0) {
    parts.push(`IPI: CST ${item.ipi.cst} p ${item.ipi.rate.toFixed(2)}% v ${item.ipi.value.toFixed(2)}`)
  }

  return parts.length > 0 ? parts.join('\n') : null
}

export function buildResolvedFiscalAuthorityInfo(input: FiscalAuthorityInfoBuildInput): string | null {
  const { payload } = input

  const totals = payload.items.reduce(
    (acc, item) => {
      acc.difalBase += item.icms.difal_base || 0
      acc.difalOrigin += item.icms.difal_value_origin || 0
      acc.difalDestination += item.icms.difal_value_destination || 0
      acc.fcpSt += item.st.fcp_value || 0
      return acc
    },
    { difalBase: 0, difalOrigin: 0, difalDestination: 0, fcpSt: 0 }
  )

  const parts: string[] = []

  if (totals.difalDestination > 0 || totals.difalOrigin > 0) {
    parts.push(
      `DIFAL: BC ${formatMoney(totals.difalBase)} | UF destino ${formatMoney(totals.difalDestination)} | UF origem ${formatMoney(totals.difalOrigin)}`
    )
  }

  if (payload.totals.vFCP > 0) {
    parts.push(`FCP proprio total: R$ ${formatMoney(payload.totals.vFCP)}`)
  }

  if (totals.fcpSt > 0) {
    parts.push(`FCP-ST total: R$ ${formatMoney(totals.fcpSt)}`)
  }

  if (payload.totals.vST > 0) {
    parts.push(`ICMS-ST total: R$ ${formatMoney(payload.totals.vST)}`)
  }

  if (payload.totals.vIPI > 0) {
    parts.push(`IPI total: R$ ${formatMoney(payload.totals.vIPI)}`)
  }

  return parts.length > 0 ? parts.join('\n') : null
}

export function normalizeAdditionalInfoPart(value: string | null | undefined) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

export function normalizeAdditionalInfoText(value: string | null | undefined) {
  const normalizedLines = (value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeAdditionalInfoPart(line))
    .filter((line): line is string => Boolean(line))

  return normalizedLines.length > 0 ? normalizedLines.join('\n') : null
}

function normalizeGtin(value: string | null | undefined) {
  const normalized = normalizeAdditionalInfoPart(value)
  if (!normalized) return null

  const upper = normalized.toUpperCase()
  if (upper === 'SEM GTIN' || upper === 'SEM GTIN TRIBUTAVEL') return null
  return normalized
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
