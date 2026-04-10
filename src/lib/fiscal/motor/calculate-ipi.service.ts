// ============================================================
// Motor Fiscal — Calculate IPI Service
// IPI per NCM enquadramento
// ============================================================

import type {
  FiscalItemContext,
  IpiBreakdown,
} from './types'
import { roundFiscal, safeNumber } from './types'

/**
 * IPI CSTs that result in zero tax
 */
const IPI_ZERO_CSTS = ['01', '02', '03', '04', '05', '51', '52', '53', '54', '55']

/**
 * Calculates IPI for a single item.
 * Only products with has_ipi = true trigger IPI calculation.
 */
export function calculateIpi(
  item: FiscalItemContext,
  tipiRate: number | null = null
): IpiBreakdown {
  const emptyBreakdown: IpiBreakdown = {
    cst: '53',
    enquadramento: null,
    base: 0,
    rate: 0,
    value: 0,
  }

  if (!item.tax_profile.has_ipi) {
    return emptyBreakdown
  }

  const cst = item.tax_profile.ipi_cst_out || '50'
  const enquadramento = item.tax_profile.ipi_enquadramento_codigo || null

  // Zero-rated CSTs (exempt, immune, suspended, etc.)
  if (IPI_ZERO_CSTS.includes(cst)) {
    return { cst, enquadramento, base: 0, rate: 0, value: 0 }
  }

  const productValue = item.quantity * item.unit_price
  const base = roundFiscal(productValue)

  // Rate: TIPI rate or from tax profile (future_tax_payload could carry this)
  const rate = safeNumber(tipiRate)
  const value = rate > 0 ? roundFiscal(base * rate / 100) : 0

  return { cst, enquadramento, base, rate, value }
}
