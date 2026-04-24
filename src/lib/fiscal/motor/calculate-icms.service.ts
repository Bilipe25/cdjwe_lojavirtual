// ============================================================
// Motor Fiscal — Calculate ICMS Service
// ICMS próprio + DIFAL + FCP
// Regime: Lucro Presumido (CRT=3, CST-based)
// ============================================================

import type {
  FiscalContext,
  FiscalItemContext,
  IcmsBreakdown,
  FcpBreakdown,
} from './types'
import { roundFiscal, safeNumber } from './types'
import { isInterstate } from './resolve-cfop.service'

/**
 * Internal tax rates per UF for DIFAL calculation.
 * Source: CONFAZ - typical internal rates per state.
 */
const INTERNAL_RATES: Record<string, number> = {
  AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17,
  GO: 19, MA: 22, MT: 17, MS: 17, MG: 18, PA: 19, PB: 20, PR: 19.5,
  PE: 20.5, PI: 21, RJ: 22, RN: 18, RS: 17, RO: 19.5, RR: 20,
  SC: 17, SP: 18, SE: 19, TO: 20,
}

/**
 * Calculates the ICMS breakdown for a single item.
 */
export function calculateIcms(
  item: FiscalItemContext,
  ctx: FiscalContext,
  freightValue: number = 0,
  discountValue: number = 0,
  insuranceValue: number = 0,
  otherExpensesValue: number = 0
): IcmsBreakdown {
  const emptyBreakdown: IcmsBreakdown = {
    cst: '41',
    base: 0,
    rate: 0,
    value: 0,
    base_reduction_percent: 0,
    difal_base: 0,
    difal_rate_origin: 0,
    difal_rate_destination: 0,
    difal_value_origin: 0,
    difal_value_destination: 0,
    has_difal: false,
  }

  if (!item.icms_rule) {
    return emptyBreakdown
  }

  const rule = item.icms_rule
  const cst = rule.cst_code || '00'

  // Non-taxed CSTs: 40 (isenta), 41 (não tributada), 50 (suspensão)
  const nonTaxedCsts = ['40', '41', '50']
  if (nonTaxedCsts.includes(cst)) {
    return { ...emptyBreakdown, cst }
  }

  // CST 60 = ICMS collected previously by ST — no own ICMS
  if (cst === '60') {
    return { ...emptyBreakdown, cst: '60' }
  }

  const productValue = item.quantity * item.unit_price
  const operationValue = Math.max(0, productValue - discountValue)
  const operationValueWithAdditions = Math.max(
    0,
    productValue + freightValue + insuranceValue + otherExpensesValue - discountValue
  )

  let base: number
  switch (rule.base_calc_type) {
    case 'operation_value_with_additions':
      base = operationValueWithAdditions
      break
    case 'fixed_percent': {
      const basePercent = safeNumber(rule.base_calc_percent, 100)
      base = operationValueWithAdditions * basePercent / 100
      break
    }
    case 'operation_value':
    default:
      base = operationValue
      break
  }

  // Legacy fallback for older profiles that still depend on the global freight toggle.
  if (!rule.base_calc_type && ctx.environment.frete_base_icms) {
    base += freightValue
  }

  let reductionPercent = 0
  if (rule.base_reduction_percent && rule.base_reduction_percent > 0) {
    reductionPercent = rule.base_reduction_percent
    base = base * (1 - reductionPercent / 100)
  }

  base = roundFiscal(Math.max(0, base))

  // Calculate ICMS value
  const rate = safeNumber(rule.icms_rate)
  const icmsValue = roundFiscal(base * rate / 100)

  // DIFAL calculation for interstate + consumer final
  let difalBase = 0
  let difalRateOrigin = 0
  let difalRateDestination = 0
  let difalValueOrigin = 0
  let difalValueDestination = 0
  let hasDifal = false

  const interstate = isInterstate(ctx)
  if (interstate && ctx.store.is_consumer_final) {
    const internalRate = INTERNAL_RATES[ctx.store.uf] || 18
    const interstateRate = item.icms_interstate_rule
      ? safeNumber(item.icms_interstate_rule.icms_rate)
      : rate

    if (internalRate > interstateRate) {
      hasDifal = true
      difalBase = base
      difalRateOrigin = interstateRate
      difalRateDestination = internalRate - interstateRate

      // 100% for destination state (EC 87/2015 fully transitioned since 2019)
      difalValueDestination = roundFiscal(difalBase * difalRateDestination / 100)
      difalValueOrigin = 0
    }
  }

  return {
    cst,
    base,
    rate,
    value: icmsValue,
    base_reduction_percent: reductionPercent,
    difal_base: difalBase,
    difal_rate_origin: difalRateOrigin,
    difal_rate_destination: difalRateDestination,
    difal_value_origin: difalValueOrigin,
    difal_value_destination: difalValueDestination,
    has_difal: hasDifal,
  }
}

/**
 * Calculates FCP (Fundo de Combate à Pobreza) for a single item.
 */
export function calculateFcp(
  item: FiscalItemContext,
  icmsBreakdown: IcmsBreakdown
): FcpBreakdown {
  if (!item.icms_rule) {
    return { base: 0, rate: 0, value: 0 }
  }

  const fcpRate = safeNumber(item.icms_rule.fcp_rate)
  if (fcpRate <= 0) {
    return { base: 0, rate: 0, value: 0 }
  }

  const base = icmsBreakdown.base
  const value = roundFiscal(base * fcpRate / 100)

  return { base, rate: fcpRate, value }
}
