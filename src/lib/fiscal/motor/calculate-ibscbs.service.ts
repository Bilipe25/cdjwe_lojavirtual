// ============================================================
// Motor Fiscal — Calculate IBS/CBS Service
// Preparatory service for Brazilian tax reform (IBS/CBS)
// Currently resolves CST + classification, value = 0
// ============================================================

import type {
  FiscalItemContext,
  IbsCbsBreakdown,
} from './types'

/**
 * Resolves IBS/CBS for a single item.
 * This is a preparatory module. The actual IBS/CBS rates
 * will be defined by law and published in official tables.
 * For now, this resolves the CST + classification code from
 * the ibscbs_base linked to the tax profile, with zero values.
 */
export function calculateIbsCbs(
  item: FiscalItemContext
): IbsCbsBreakdown {
  // IBS/CBS is not yet in production — structural preparation only
  return {
    cst_code: null,
    classification_code: null,
    base: 0,
    rate: 0,
    value: 0,
  }
}
