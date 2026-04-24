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
import { roundFiscal, safeNumber, MOTOR_VERSION } from './types'
import { resolveAllCfops } from './resolve-cfop.service'
import { calculateIcms, calculateFcp } from './calculate-icms.service'
import { calculateIcmsSt } from './calculate-icms-st.service'
import { calculatePis, calculateCofins } from './calculate-pis-cofins.service'
import { calculateIpi } from './calculate-ipi.service'
import { calculateIbsCbs } from './calculate-ibscbs.service'
import { distributeFreight } from './calculate-freight.service'
import { distributeDiscount } from './calculate-discount.service'
import { validateFiscalDocument } from './validate-fiscal-document.service'
import { buildResolvedItemAdditionalInfo } from '@/lib/fiscal/additional-info'
import { buildCommercialItemCode, buildCommercialItemDescription } from '@/lib/fiscal/document-commercial'

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

  // 2. Distribute freight, insurance, other expenses and discount
  const freightDistribution = distributeFreight(ctx.items, totalFreight)
  const insuranceDistribution = distributeFreight(ctx.items, ctx.transport.insurance_value)
  const otherExpensesDistribution = distributeFreight(ctx.items, ctx.transport.other_expenses_value)
  const discountDistribution = distributeDiscount(ctx.items, totalDiscount)

  const freightMap = new Map(freightDistribution.map((f) => [f.order_item_id, f.freight_value]))
  const insuranceMap = new Map(insuranceDistribution.map((f) => [f.order_item_id, f.freight_value]))
  const otherExpensesMap = new Map(otherExpensesDistribution.map((f) => [f.order_item_id, f.freight_value]))
  const discountMap = new Map(discountDistribution.map((d) => [d.order_item_id, d.discount_value]))

  // 3. Calculate taxes for each item
  const itemBreakdowns: ItemTaxBreakdown[] = []

  for (const item of ctx.items) {
    const cfopResolution = cfopMap.get(item.order_item_id)
    const cfop = cfopResolution?.cfop || '5102'

    const itemFreight = freightMap.get(item.order_item_id) || 0
    const itemInsurance = insuranceMap.get(item.order_item_id) || 0
    const itemOtherExpenses = otherExpensesMap.get(item.order_item_id) || 0
    const itemDiscount = discountMap.get(item.order_item_id) || 0

    // IPI first (needed for ST base calculation)
    const ipi = calculateIpi(item)

    // ICMS
    const icms = calculateIcms(item, ctx, itemFreight, itemDiscount, itemInsurance, itemOtherExpenses)

    // FCP
    const fcp = calculateFcp(item, icms)

    // ST (needs ICMS and IPI for base)
    const st = calculateIcmsSt(item, ctx, icms, ipi.value, itemFreight)

    // PIS/COFINS
    const pis = calculatePis(item, ctx, itemDiscount, icms.value)
    const cofins = calculateCofins(item, ctx, itemDiscount, icms.value)

    // Fiscal values
    const fiscalUnitValue = roundFiscal(item.unit_price)
    const fiscalTotalValue = roundFiscal(item.quantity * item.unit_price)

    // IBS/CBS
    const ibscbs = calculateIbsCbs(item, {
      fiscalTotalValue,
      freightValue: itemFreight,
      insuranceValue: itemInsurance,
      otherExpensesValue: itemOtherExpenses,
      discountValue: itemDiscount,
      icmsValue: icms.value,
      fcpValue: fcp.value,
    })

    const fiscalItemValue = roundFiscal(
      Math.max(0, fiscalTotalValue + itemFreight + itemInsurance + itemOtherExpenses - itemDiscount)
    )
    const approxTaxRatePercent = item.tax_profile.approx_tax_rate_percent
    const totalTributos = roundFiscal(fiscalItemValue * safeNumber(approxTaxRatePercent) / 100)

    itemBreakdowns.push({
      order_item_id: item.order_item_id,
      product_variant_id: item.product_variant_id,
      sku: item.sku,
      commercial_code: item.commercial_code,
      manufacturer_name: item.manufacturer_name,
      product_name: item.product_name,
      fabric_name: item.fabric_name,
      color_name: item.color_name,
      size: item.size,
      size_name: item.size_name,
      quantity: item.quantity,
      cfop,
      cfop_source: cfopResolution?.source || 'geographic_inference',
      fiscal_unit_value: fiscalUnitValue,
      fiscal_total_value: fiscalTotalValue,
      fiscal_discount_value: itemDiscount,
      fiscal_freight_value: itemFreight,
      fiscal_insurance_value: itemInsurance,
      fiscal_other_expenses_value: itemOtherExpenses,
      icms,
      fcp,
      st,
      pis,
      cofins,
      ipi,
      ibscbs,
      ibscbs_context: item.ibscbs_context,
      total_tributos: totalTributos,
      approx_tax_rate_percent: approxTaxRatePercent,
      tax_profile_id: item.tax_profile.tax_profile_id,
      tax_profile_version: item.tax_profile.tax_profile_version,
      ncm: item.tax_profile.ncm,
      cest: item.tax_profile.cest,
      origin_code: item.tax_profile.origin_code,
      commercial_unit: item.tax_profile.commercial_unit,
      tax_unit: item.tax_profile.tax_unit,
      ean_gtin: item.tax_profile.ean_gtin,
      tax_ean_gtin: item.tax_profile.tax_ean_gtin,
      cst_icms: icms.cst,
      aliquota_icms: icms.rate,
      aliquota_ipi: ipi.rate,
      resolved_product_code: buildCommercialItemCode({
        productVariantId: item.product_variant_id,
        sku: item.sku,
        commercialCode: item.commercial_code,
        productName: item.product_name,
        colorName: item.color_name,
        fabricName: item.fabric_name,
        sizeName: item.size_name,
        size: item.size,
      }),
      resolved_product_description: buildCommercialItemDescription({
        productName: item.product_name,
        colorName: item.color_name,
        fabricName: item.fabric_name,
        sizeName: item.size_name,
        size: item.size,
      }),
      inf_ad_prod: null,
    })
  }

  for (const item of itemBreakdowns) {
    item.inf_ad_prod = buildResolvedItemAdditionalInfo({
      item: {
        manufacturer_name: item.manufacturer_name,
        default_fiscal_description: ctx.items.find((ctxItem) => ctxItem.order_item_id === item.order_item_id)?.tax_profile.default_fiscal_description || null,
        ean_gtin: item.ean_gtin,
        tax_ean_gtin: item.tax_ean_gtin,
        fcp: item.fcp,
        st: item.st,
        ipi: item.ipi,
      },
      environmentParams: {
        item_additional_info_flags: ctx.environment.item_additional_info_flags,
      },
    })
  }

  // 4. Compute document totals
  const totals = computeTotals(
    itemBreakdowns,
    totalFreight,
    ctx.transport.insurance_value,
    ctx.transport.other_expenses_value,
    totalDiscount,
    ctx.volumes
  )

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
  totalInsurance: number,
  totalOtherExpenses: number,
  totalDiscount: number,
  volumes: FiscalContext['volumes']
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
    vFCP += item.fcp.value
    vPIS += item.pis.value
    vCOFINS += item.cofins.value
    vIPI += item.ipi.value
    vTotTrib += item.total_tributos
  }

  // vNF = vProd + vST + vFrete + vIPI - vDesc
  const vSeg = roundFiscal(totalInsurance)
  const vOutro = roundFiscal(totalOtherExpenses)
  const volumeCount = volumes.reduce((sum, volume) => sum + (volume.quantity || 0), 0)
  const totalGrossWeight = roundFiscal(volumes.reduce((sum, volume) => sum + (volume.gross_weight || 0), 0), 3)
  const totalNetWeight = roundFiscal(volumes.reduce((sum, volume) => sum + (volume.net_weight || 0), 0), 3)
  const vNF = roundFiscal(vProd + vST + totalFreight + vSeg + vOutro + vIPI - totalDiscount)

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
    vSeg,
    vOutro,
    vTotTrib: roundFiscal(vTotTrib),
    vNF,
    item_count: items.length,
    volume_count: volumeCount,
    total_gross_weight: totalGrossWeight,
    total_net_weight: totalNetWeight,
  }
}
