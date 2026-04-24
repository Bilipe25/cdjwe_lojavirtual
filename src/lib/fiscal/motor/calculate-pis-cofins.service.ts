// ============================================================
// Motor Fiscal - Calculate PIS/COFINS Service
// Regime: Lucro Presumido -> Cumulativo
// ============================================================

import type {
  FiscalContext,
  FiscalItemContext,
  PisCofinsItemBreakdown,
} from './types'
import { roundFiscal, safeNumber } from './types'

const ZERO_CSTS = ['04', '05', '06', '07', '08', '09']
const QUANTITY_CST = '03'

function zeroBreakdown(cst: string): PisCofinsItemBreakdown {
  return {
    cst,
    calculation_mode: 'none',
    base: 0,
    quantity_base: 0,
    rate: 0,
    unit_rate: 0,
    value: 0,
  }
}

function quantityBreakdown(cst: string, quantity: number, unitRate: number): PisCofinsItemBreakdown {
  const quantityBase = roundFiscal(Math.max(0, quantity), 4)
  const resolvedUnitRate = roundFiscal(Math.max(0, unitRate), 4)

  return {
    cst,
    calculation_mode: 'quantity',
    base: 0,
    quantity_base: quantityBase,
    rate: 0,
    unit_rate: resolvedUnitRate,
    value: roundFiscal(quantityBase * resolvedUnitRate),
  }
}

function percentBreakdown(cst: string, base: number, rate: number): PisCofinsItemBreakdown {
  const resolvedBase = roundFiscal(Math.max(0, base))
  const resolvedRate = roundFiscal(Math.max(0, rate), 4)

  return {
    cst,
    calculation_mode: 'percent',
    base: resolvedBase,
    quantity_base: 0,
    rate: resolvedRate,
    unit_rate: 0,
    value: roundFiscal(resolvedBase * resolvedRate / 100),
  }
}

function resolvePercentBase(
  item: FiscalItemContext,
  ctx: FiscalContext,
  discountValue: number,
  icmsValue: number
) {
  let base = item.quantity * item.unit_price - discountValue

  if (!ctx.environment.icms_base_pis_cofins) {
    base -= icmsValue
  }

  return base
}

export function calculatePis(
  item: FiscalItemContext,
  ctx: FiscalContext,
  discountValue: number = 0,
  icmsValue: number = 0
): PisCofinsItemBreakdown {
  const cst = item.tax_profile.pis_cst || '01'

  if (ZERO_CSTS.includes(cst)) {
    return zeroBreakdown(cst)
  }

  if (cst === QUANTITY_CST) {
    return quantityBreakdown(cst, item.quantity, safeNumber(item.tax_profile.pis_unit_rate))
  }

  const rate = safeNumber(item.tax_profile.pis_aliquota) || ctx.emitter.aliquota_pis
  return percentBreakdown(cst, resolvePercentBase(item, ctx, discountValue, icmsValue), rate)
}

export function calculateCofins(
  item: FiscalItemContext,
  ctx: FiscalContext,
  discountValue: number = 0,
  icmsValue: number = 0
): PisCofinsItemBreakdown {
  const cst = item.tax_profile.cofins_cst || '01'

  if (ZERO_CSTS.includes(cst)) {
    return zeroBreakdown(cst)
  }

  if (cst === QUANTITY_CST) {
    return quantityBreakdown(cst, item.quantity, safeNumber(item.tax_profile.cofins_unit_rate))
  }

  const rate = safeNumber(item.tax_profile.cofins_aliquota) || ctx.emitter.aliquota_cofins
  return percentBreakdown(cst, resolvePercentBase(item, ctx, discountValue, icmsValue), rate)
}
