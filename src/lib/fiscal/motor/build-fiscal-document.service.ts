// ============================================================
// Motor Fiscal — Build Fiscal Document Service
// Assembles the complete FiscalDocumentPayload from context
// and individual tax calculations
// ============================================================

import type {
  FiscalContext,
  FiscalDocumentPayload,
  ItemTaxBreakdown,
  DocumentTotals,
} from './types'
import { roundFiscal, MOTOR_VERSION } from './types'
import { resolveAllCfops } from './resolve-cfop.service'
import { calculateIcms, calculateFcp } from './calculate-icms.service'
import { calculateIcmsSt } from './calculate-icms-st.service'
import { calculatePis, calculateCofins } from './calculate-pis-cofins.service'
import { calculateIpi } from './calculate-ipi.service'
import { calculateIbsCbs } from './calculate-ibscbs.service'
import { distributeFreight } from './calculate-freight.service'
import { distributeDiscount } from './calculate-discount.service'
import { validateFiscalDocument } from './validate-fiscal-document.service'

/**
 * Builds the complete FiscalDocumentPayload from a resolved FiscalContext.
 *
 * Flow:
 * 1. Resolve CFOPs for all items
 * 2. Distribute freight and discount proportionally
 * 3. For each item: calculate ICMS, FCP, ST, PIS, COFINS, IPI, IBS/CBS
 * 4. Compute document totals
 * 5. Run pre-emission validation
 * 6. Return complete payload
 */
export function buildFiscalDocument(
  ctx: FiscalContext,
  totalFreight: number = 0,
  totalDiscount: number = 0
): FiscalDocumentPayload {
  // 1. Resolve CFOPs
  const cfopMap = resolveAllCfops(ctx)

  // 2. Distribute freight and discount
  const freightDistribution = distributeFreight(ctx.items, totalFreight)
  const discountDistribution = distributeDiscount(ctx.items, totalDiscount)

  const freightMap = new Map(freightDistribution.map((f) => [f.order_item_id, f.freight_value]))
  const discountMap = new Map(discountDistribution.map((d) => [d.order_item_id, d.discount_value]))

  // 3. Calculate taxes for each item
  const itemBreakdowns: ItemTaxBreakdown[] = []

  for (const item of ctx.items) {
    const cfopResolution = cfopMap.get(item.order_item_id)
    const cfop = cfopResolution?.cfop || '5102'

    const itemFreight = freightMap.get(item.order_item_id) || 0
    const itemDiscount = discountMap.get(item.order_item_id) || 0

    // IPI first (needed for ST base calculation)
    const ipi = calculateIpi(item)

    // ICMS
    const icms = calculateIcms(item, ctx, itemFreight, itemDiscount)

    // FCP
    const fcp = calculateFcp(item, icms)

    // ST (needs ICMS and IPI for base)
    const st = calculateIcmsSt(item, ctx, icms, ipi.value, itemFreight)

    // PIS/COFINS
    const pis = calculatePis(item, ctx, itemDiscount)
    const cofins = calculateCofins(item, ctx, itemDiscount)

    // IBS/CBS
    const ibscbs = calculateIbsCbs(item)

    // Fiscal values
    const fiscalUnitValue = roundFiscal(item.unit_price)
    const fiscalTotalValue = roundFiscal(item.quantity * item.unit_price)

    // Total tributos (Lei da Transparência 12.741/2012)
    const totalTributos = roundFiscal(
      icms.value +
      fcp.value +
      st.value +
      st.fcp_value +
      pis.value +
      cofins.value +
      ipi.value +
      ibscbs.value
    )

    itemBreakdowns.push({
      order_item_id: item.order_item_id,
      product_variant_id: item.product_variant_id,
      product_name: item.product_name,
      quantity: item.quantity,
      cfop,
      fiscal_unit_value: fiscalUnitValue,
      fiscal_total_value: fiscalTotalValue,
      fiscal_discount_value: itemDiscount,
      fiscal_freight_value: itemFreight,
      icms,
      fcp,
      st,
      pis,
      cofins,
      ipi,
      ibscbs,
      total_tributos: totalTributos,
      tax_profile_id: item.tax_profile.tax_profile_id,
      tax_profile_version: item.tax_profile.tax_profile_version,
      ncm: item.tax_profile.ncm,
      cest: item.tax_profile.cest,
      origin_code: item.tax_profile.origin_code,
    })
  }

  // 4. Compute document totals
  const totals = computeTotals(itemBreakdowns, totalFreight, totalDiscount)

  // 5. Run validation
  const validation = validateFiscalDocument(ctx, itemBreakdowns, totals)

  // 6. Return payload
  return {
    context: ctx,
    items: itemBreakdowns,
    totals,
    validation,
    calculated_at: new Date().toISOString(),
    motor_version: MOTOR_VERSION,
  }
}

/**
 * Computes aggregated document totals from item breakdowns.
 */
function computeTotals(
  items: ItemTaxBreakdown[],
  totalFreight: number,
  totalDiscount: number
): DocumentTotals {
  let vProd = 0
  let vBC = 0
  let vICMS = 0
  let vBCST = 0
  let vST = 0
  let vFCP = 0
  let vPIS = 0
  let vCOFINS = 0
  let vIPI = 0
  let vTotTrib = 0

  for (const item of items) {
    vProd += item.fiscal_total_value
    vBC += item.icms.base
    vICMS += item.icms.value
    vBCST += item.st.base
    vST += item.st.value
    vFCP += item.fcp.value + item.st.fcp_value
    vPIS += item.pis.value
    vCOFINS += item.cofins.value
    vIPI += item.ipi.value
    vTotTrib += item.total_tributos
  }

  // vNF = vProd + vST + vFrete + vIPI - vDesc
  // (seguro and outras despesas not implemented yet)
  const vNF = roundFiscal(vProd + vST + totalFreight + vIPI - totalDiscount)

  return {
    vProd: roundFiscal(vProd),
    vBC: roundFiscal(vBC),
    vICMS: roundFiscal(vICMS),
    vBCST: roundFiscal(vBCST),
    vST: roundFiscal(vST),
    vFCP: roundFiscal(vFCP),
    vPIS: roundFiscal(vPIS),
    vCOFINS: roundFiscal(vCOFINS),
    vIPI: roundFiscal(vIPI),
    vDesc: roundFiscal(totalDiscount),
    vFrete: roundFiscal(totalFreight),
    vTotTrib: roundFiscal(vTotTrib),
    vNF,
    item_count: items.length,
  }
}
