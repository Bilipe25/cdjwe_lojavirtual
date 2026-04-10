// ============================================================
// Motor Fiscal — Calculate ICMS-ST Service
// ICMS Substituição Tributária (MVA-based)
// ============================================================

import type {
  FiscalContext,
  FiscalItemContext,
  IcmsBreakdown,
  StBreakdown,
} from './types'
import { roundFiscal, safeNumber } from './types'
import { isInterstate } from './resolve-cfop.service'

/**
 * Calculates ICMS-ST for a single item.
 * Only applies when tax profile has has_substitution_tax = true
 * and the ICMS ST rule is enabled.
 */
export function calculateIcmsSt(
  item: FiscalItemContext,
  ctx: FiscalContext,
  icmsBreakdown: IcmsBreakdown,
  ipiValue: number = 0,
  freightValue: number = 0
): StBreakdown {
  const emptyBreakdown: StBreakdown = {
    enabled: false,
    base: 0,
    rate: 0,
    value: 0,
    mva: 0,
    fcp_base: 0,
    fcp_rate: 0,
    fcp_value: 0,
  }

  // Check if ST applies
  if (!item.tax_profile.has_substitution_tax) return emptyBreakdown
  if (!item.icms_st_rule || !item.icms_st_rule.st_enabled) return emptyBreakdown

  const stRule = item.icms_st_rule
  const productValue = item.quantity * item.unit_price

  // Select MVA: use adjusted if interstate, otherwise original
  const interstate = isInterstate(ctx)
  let mva = 0
  if (stRule.st_base_calc_type === 'mva') {
    mva = interstate
      ? safeNumber(stRule.mva_adjusted) || safeNumber(stRule.mva_original)
      : safeNumber(stRule.mva_original)
  }

  // Calculate ST base
  // Base ST = (Valor produto + IPI + Frete) × (1 + MVA/100)
  let baseSt = productValue + ipiValue + freightValue
  baseSt = baseSt * (1 + mva / 100)

  // Apply base reduction if configured
  if (stRule.st_base_reduction_percent && stRule.st_base_reduction_percent > 0) {
    baseSt = baseSt * (1 - stRule.st_base_reduction_percent / 100)
  }

  baseSt = roundFiscal(baseSt)

  // ST rate
  const stRate = safeNumber(stRule.st_rate)

  // ICMS-ST = (Base ST × Alíquota interna) − ICMS próprio
  const icmsStBruto = roundFiscal(baseSt * stRate / 100)
  const icmsStValue = roundFiscal(Math.max(0, icmsStBruto - icmsBreakdown.value))

  // FCP-ST
  const fcpStRate = safeNumber(stRule.st_fcp_rate)
  const fcpStValue = fcpStRate > 0 ? roundFiscal(baseSt * fcpStRate / 100) : 0

  return {
    enabled: true,
    base: baseSt,
    rate: stRate,
    value: icmsStValue,
    mva,
    fcp_base: fcpStRate > 0 ? baseSt : 0,
    fcp_rate: fcpStRate,
    fcp_value: fcpStValue,
  }
}
