// ============================================================
// Motor Fiscal — Calculate PIS/COFINS Service
// Regime: Lucro Presumido → Cumulativo
// PIS: 0.65% | COFINS: 3.00%
// ============================================================

import type {
  FiscalContext,
  FiscalItemContext,
  PisCofinsItemBreakdown,
} from './types'
import { roundFiscal, safeNumber } from './types'

/**
 * PIS CSTs that result in zero tax (monophasic, exempt, suspended, etc.)
 */
const PIS_ZERO_CSTS = ['04', '05', '06', '07', '08', '09']

/**
 * COFINS CSTs that result in zero tax
 */
const COFINS_ZERO_CSTS = ['04', '05', '06', '07', '08', '09']

/**
 * Calculates PIS for a single item.
 * Lucro Presumido uses regime cumulativo (Lei 9.718/98).
 */
export function calculatePis(
  item: FiscalItemContext,
  ctx: FiscalContext,
  discountValue: number = 0
): PisCofinsItemBreakdown {
  // Resolve CST (priority: profile → default 01)
  const cst = item.tax_profile.pis_cst || '01'

  // Zero-rated CSTs
  if (PIS_ZERO_CSTS.includes(cst)) {
    return { cst, base: 0, rate: 0, value: 0 }
  }

  const productValue = item.quantity * item.unit_price
  let base = productValue - discountValue

  // If icms_base_pis_cofins is enabled, include ICMS in the PIS/COFINS base
  // (default behavior for Lucro Presumido: base = revenue value)
  // When disabled, ICMS is NOT included (some court decisions allow exclusion)

  base = roundFiscal(Math.max(0, base))

  // Resolve rate (priority: profile override → emitter federal config)
  const rate = safeNumber(item.tax_profile.pis_aliquota) || ctx.emitter.aliquota_pis
  const value = roundFiscal(base * rate / 100)

  return { cst, base, rate, value }
}

/**
 * Calculates COFINS for a single item.
 * Lucro Presumido uses regime cumulativo (Lei 9.718/98).
 */
export function calculateCofins(
  item: FiscalItemContext,
  ctx: FiscalContext,
  discountValue: number = 0
): PisCofinsItemBreakdown {
  const cst = item.tax_profile.cofins_cst || '01'

  if (COFINS_ZERO_CSTS.includes(cst)) {
    return { cst, base: 0, rate: 0, value: 0 }
  }

  const productValue = item.quantity * item.unit_price
  let base = productValue - discountValue

  base = roundFiscal(Math.max(0, base))

  const rate = safeNumber(item.tax_profile.cofins_aliquota) || ctx.emitter.aliquota_cofins
  const value = roundFiscal(base * rate / 100)

  return { cst, base, rate, value }
}
