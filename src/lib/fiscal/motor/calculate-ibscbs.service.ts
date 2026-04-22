// ============================================================
// Motor Fiscal - Calculate IBS/CBS Service
// Guarded runtime resolution for IBS/CBS
// ============================================================

import type {
  FiscalItemContext,
  IbsCbsBreakdown,
} from './types'

export function calculateIbsCbs(
  item: FiscalItemContext
): IbsCbsBreakdown {
  const rawRulePayload = (item.applied_rule?.rule_payload || {}) as Record<string, unknown>
  const ibscbsPayload =
    (rawRulePayload.ibscbs_config as Record<string, unknown> | undefined) ||
    (rawRulePayload.ibscbs as Record<string, unknown> | undefined) ||
    {}

  const cstCode = normalizeText(ibscbsPayload.cst_code)
  const classificationCode = normalizeText(ibscbsPayload.classification_code)
  const regularCstCode = normalizeText(ibscbsPayload.regular_cst_code)
  const regularClassificationCode = normalizeText(ibscbsPayload.regular_classification_code)
  const presumedCreditCode = normalizeText(ibscbsPayload.presumed_credit_code)
  const presumedCreditRate = safeNumber(ibscbsPayload.presumed_credit_rate)
  const ibsUfRate = safeNumber(ibscbsPayload.ibs_uf_rate)
  const ibsMunRate = safeNumber(ibscbsPayload.ibs_mun_rate)
  const cbsRate = safeNumber(ibscbsPayload.cbs_rate)
  const rate = safeNumber(ibscbsPayload.rate) || ibsUfRate + ibsMunRate + cbsRate

  const hasCatalogAndCfopContext = Boolean(
    item.tax_profile.ibscbs_base_id &&
    item.tax_profile.ibscbs_version_id &&
    (
      item.applied_rule?.cfop_config_id ||
      item.tax_profile.default_output_cfop_config_id ||
      item.tax_profile.default_input_cfop_config_id
    )
  )

  const isReady = Boolean(hasCatalogAndCfopContext && cstCode && classificationCode)
  const base = isReady ? roundMoney(item.subtotal || 0) : 0
  const ibsUfValue = isReady ? roundMoney(base * (ibsUfRate / 100)) : 0
  const ibsMunValue = isReady ? roundMoney(base * (ibsMunRate / 100)) : 0
  const ibsValue = isReady ? roundMoney(ibsUfValue + ibsMunValue) : 0
  const cbsValue = isReady ? roundMoney(base * (cbsRate / 100)) : 0
  const value = isReady ? roundMoney(ibsValue + cbsValue) : 0
  const presumedCreditValue = isReady ? roundMoney(base * (presumedCreditRate / 100)) : 0
  const hasComponentBreakdown = ibsUfRate > 0 || ibsMunRate > 0 || cbsRate > 0

  return {
    cst_code: cstCode,
    classification_code: classificationCode,
    regular_cst_code: regularCstCode,
    regular_classification_code: regularClassificationCode,
    presumed_credit_code: presumedCreditCode,
    presumed_credit_rate: presumedCreditRate,
    presumed_credit_value: presumedCreditValue,
    base,
    rate,
    value,
    ibs_uf_rate: ibsUfRate,
    ibs_uf_value: ibsUfValue,
    ibs_mun_rate: ibsMunRate,
    ibs_mun_value: ibsMunValue,
    ibs_value: ibsValue,
    cbs_rate: cbsRate,
    cbs_value: cbsValue,
    is_ready: isReady,
    should_emit: isReady && hasComponentBreakdown,
  }
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function safeNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
