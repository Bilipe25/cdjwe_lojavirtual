// ============================================================
// Motor Fiscal - Calculate IBS/CBS Service
// Uses the resolved IBS/CBS runtime context and a configurable
// fiscal base composition aligned with the market XML pattern.
// ============================================================

import type {
  FiscalItemContext,
  IbsCbsBreakdown,
} from './types'
import { normalizeBaseMode } from '@/lib/fiscal/ibscbs-config'

interface IbsCbsBaseValuesInput {
  fiscalTotalValue: number
  freightValue: number
  insuranceValue: number
  otherExpensesValue: number
  discountValue: number
  icmsValue: number
  fcpValue: number
}

export function calculateIbsCbs(
  item: FiscalItemContext,
  values: IbsCbsBaseValuesInput
): IbsCbsBreakdown {
  const resolved = item.ibscbs_context
  const readinessErrors = resolved?.readiness_errors || []
  const cstCode = resolved?.cst_code || null
  const classificationCode = resolved?.classification_code || null
  const regularCstCode = resolved?.regular_cst_code || null
  const regularClassificationCode = resolved?.regular_classification_code || null
  const presumedCreditCode = resolved?.presumed_credit_code || null
  const presumedCreditRate = normalizeRate(resolved?.presumed_credit_rate)
  const ibsUfRate = normalizeRate(resolved?.ibs_uf_rate)
  const ibsMunRate = normalizeRate(resolved?.ibs_mun_rate)
  const cbsRate = normalizeRate(resolved?.cbs_rate)
  const rate = normalizeRate(resolved?.rate) || normalizeRate(ibsUfRate + ibsMunRate + cbsRate)
  const baseMode = resolved?.base_mode || null
  const normalizedBaseMode = normalizeBaseMode(baseMode)
  const basePercent = normalizeNullableNumber(resolved?.base_percent)
  const baseReductionPercent = normalizeRate(resolved?.base_reduction_percent)
  const impactsIbscbs = resolved?.impacts_ibscbs === true
  const hasAnyRate = ibsUfRate > 0 || ibsMunRate > 0 || cbsRate > 0 || rate > 0
  const isReady = Boolean(
    impactsIbscbs &&
      readinessErrors.length === 0 &&
      cstCode &&
      classificationCode
  )

  const baseComposition = isReady
    ? calculateBaseComposition(normalizedBaseMode, item.subtotal || 0, values)
    : { composed: 0, excludedOwnTaxes: 0, baseBeforeReduction: 0 }

  const base = isReady
    ? applyPercentAndReduction(baseComposition.baseBeforeReduction, basePercent, baseReductionPercent)
    : 0

  const ibsUfValue = isReady ? roundMoney(base * (ibsUfRate / 100)) : 0
  const ibsMunValue = isReady ? roundMoney(base * (ibsMunRate / 100)) : 0
  const ibsValue = isReady ? roundMoney(ibsUfValue + ibsMunValue) : 0
  const cbsValue = isReady ? roundMoney(base * (cbsRate / 100)) : 0
  const value = isReady ? roundMoney(ibsValue + cbsValue) : 0
  const presumedCreditValue = isReady ? roundMoney(base * (presumedCreditRate / 100)) : 0

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
    base_mode: normalizedBaseMode,
    base_composition_value: baseComposition.composed,
    base_excluded_tax_value: baseComposition.excludedOwnTaxes,
    base_before_reduction: baseComposition.baseBeforeReduction,
    base_percent: basePercent,
    base_reduction_percent: baseReductionPercent,
    applied_rule_scope: resolved?.applied_rule_scope || 'none',
    legacy_payload_used: resolved?.legacy_payload_used === true,
    readiness_errors: readinessErrors,
    is_ready: isReady,
    should_emit: isReady && hasAnyRate,
  }
}

function calculateBaseComposition(
  baseMode: ReturnType<typeof normalizeBaseMode>,
  subtotal: number,
  values: IbsCbsBaseValuesInput
) {
  const normalizedSubtotal = roundMoney(Math.max(0, subtotal || 0))
  const fiscalGross = roundMoney(
    Math.max(
      0,
      (values.fiscalTotalValue || 0) +
        (values.freightValue || 0) +
        (values.insuranceValue || 0) +
        (values.otherExpensesValue || 0) -
        (values.discountValue || 0)
    )
  )

  const composed = baseMode === 'subtotal' ? normalizedSubtotal : fiscalGross
  const excludedOwnTaxes =
    baseMode === 'fiscal_gross_less_icms_fcp'
      ? roundMoney(Math.max(0, (values.icmsValue || 0) + (values.fcpValue || 0)))
      : 0

  return {
    composed,
    excludedOwnTaxes,
    baseBeforeReduction: roundMoney(Math.max(0, composed - excludedOwnTaxes)),
  }
}

function applyPercentAndReduction(
  baseBeforeReduction: number,
  basePercent: number | null,
  baseReductionPercent: number
) {
  const baseWithPercent =
    basePercent !== null
      ? roundMoney(baseBeforeReduction * (basePercent / 100))
      : roundMoney(baseBeforeReduction)

  if (baseReductionPercent <= 0) return baseWithPercent
  return roundMoney(baseWithPercent * (1 - baseReductionPercent / 100))
}

function normalizeRate(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeNullableNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
