// ============================================================
// Motor Fiscal — Public API (index.ts)
// Camada 2: Business logic layer for NF-e/NFC-e
// ============================================================

import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveFiscalContext } from './resolve-fiscal-context.service'
import { buildFiscalDocument } from './build-fiscal-document.service'
import { validateFiscalDocument } from './validate-fiscal-document.service'
import { resolveAllCfops } from './resolve-cfop.service'
import type {
  FiscalDocumentPayload,
  FiscalCalculationResult,
  ValidationResult,
  ItemTaxBreakdown,
} from './types'
import { roundFiscal } from './types'

// Re-export types for external consumers
export type {
  FiscalContext,
  FiscalDocumentPayload,
  FiscalCalculationResult,
  ValidationResult,
  ItemTaxBreakdown,
  DocumentTotals,
  EmitterContext,
  StoreContext,
  EnvironmentContext,
  FiscalItemContext,
  ResolvedTaxProfile,
  ResolvedIbsCbsContext,
  IcmsBreakdown,
  FcpBreakdown,
  StBreakdown,
  PisCofinsItemBreakdown,
  IpiBreakdown,
  IbsCbsBreakdown,
  ValidationError,
} from './types'

export { MOTOR_VERSION, roundFiscal, roundRate, safeNumber } from './types'

// --------------- Calculate Order Fiscal ---------------

/**
 * Calculates fiscal data for an order.
 * This is the main entry point for the Motor Fiscal.
 *
 * Flow:
 * 1. Loads the complete FiscalContext (emitter, store, env, items+rules)
 * 2. Builds the fiscal document (CFOP, taxes, totals)
 * 3. Returns the complete FiscalDocumentPayload
 *
 * @param orderId - The order ID to calculate
 * @returns FiscalDocumentPayload with all tax breakdowns
 */
export async function calculateOrderFiscal(
  orderId: string
): Promise<FiscalCalculationResult<FiscalDocumentPayload>> {
  const supabase = createServiceRoleClient()

  // Load order to get storeId and discount/freight
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, store_id, discount_amount, coupon_discount_amount, subtotal, total')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    return {
      success: false,
      error: {
        code: 'ORDER_NOT_FOUND',
        message: `Pedido ${orderId} nao encontrado.`,
      },
    }
  }

  const storeId = order.store_id as string
  if (!storeId) {
    return {
      success: false,
      error: {
        code: 'ORDER_NO_STORE',
        message: 'Pedido nao possui loja vinculada.',
      },
    }
  }

  // Resolve full fiscal context
  const contextResult = await resolveFiscalContext(orderId, storeId, 'outbound')
  if (!contextResult.success) {
    return contextResult
  }

  // Total discount = order discount + coupon discount
  const totalDiscount = (Number(order.discount_amount) || 0) + (Number(order.coupon_discount_amount) || 0)

  const { data: fiscalSettings } = await supabase
    .from('order_fiscal_settings')
    .select('freight_value, insurance_value, other_expenses_value')
    .eq('order_id', orderId)
    .maybeSingle()

  const totalFreight = Number(fiscalSettings?.freight_value) || 0
  const totalInsurance = Number(fiscalSettings?.insurance_value) || 0
  const totalOtherExpenses = Number(fiscalSettings?.other_expenses_value) || 0

  // Build fiscal document
  const payload = buildFiscalDocument(
    {
      ...contextResult.data,
      transport: {
        ...contextResult.data.transport,
        freight_value: totalFreight,
        insurance_value: totalInsurance,
        other_expenses_value: totalOtherExpenses,
      },
    },
    totalFreight,
    totalDiscount
  )

  return { success: true, data: payload }
}

// --------------- Persist Order Fiscal Snapshot ---------------

/**
 * Persists the calculated fiscal data to the order and order_items tables.
 * This is called after calculateOrderFiscal when the admin is satisfied
 * with the calculation results.
 *
 * The snapshot is recalculable until the moment of emission.
 */
export async function persistOrderFiscalSnapshot(
  orderId: string,
  payload: FiscalDocumentPayload
): Promise<FiscalCalculationResult<{ persisted: boolean }>> {
  const supabase = createServiceRoleClient()

  // Update each order item with tax breakdown
  for (const item of payload.items) {
    const { error: itemError } = await supabase
      .from('order_items')
      .update({
        fiscal_cfop: item.cfop,
        fiscal_ncm: item.ncm,
        fiscal_cest: item.cest,
        fiscal_origin_code: item.origin_code,
        fiscal_unit_value: item.fiscal_unit_value,
        fiscal_total_value: item.fiscal_total_value,
        fiscal_discount_value: item.fiscal_discount_value,
        fiscal_freight_value: item.fiscal_freight_value,
        // ICMS
        icms_cst: item.icms.cst,
        icms_base: item.icms.base,
        icms_rate: item.icms.rate,
        icms_value: item.icms.value,
        // ST
        icms_st_base: item.st.base,
        icms_st_rate: item.st.rate,
        icms_st_value: item.st.value,
        icms_st_mva: item.st.mva,
        // FCP
        fcp_base: item.fcp.base,
        fcp_rate: item.fcp.rate,
        fcp_value: item.fcp.value,
        // PIS
        pis_cst: item.pis.cst,
        pis_base: item.pis.base,
        pis_rate: item.pis.rate,
        pis_value: item.pis.value,
        // COFINS
        cofins_cst: item.cofins.cst,
        cofins_base: item.cofins.base,
        cofins_rate: item.cofins.rate,
        cofins_value: item.cofins.value,
        // IPI
        ipi_cst: item.ipi.cst,
        ipi_base: item.ipi.base,
        ipi_rate: item.ipi.rate,
        ipi_value: item.ipi.value,
        // Total tributos
        total_tributos: item.total_tributos,
        effective_cfop_code: item.cfop,
        cfop_source: item.cfop_source,
        // Context
        tax_profile_id: item.tax_profile_id,
        tax_profile_version: item.tax_profile_version,
        fiscal_context: {
          cfop_source: item.cfop_source,
          motor_version: payload.motor_version,
          calculated_at: payload.calculated_at,
          operation: payload.context.operation,
          transport: payload.context.transport,
        },
        fiscal_payload: {
          icms: item.icms,
          fcp: item.fcp,
          st: item.st,
          pis: item.pis,
          cofins: item.cofins,
          ipi: item.ipi,
          ibscbs: item.ibscbs,
          ibscbs_context: item.ibscbs_context,
          totals: {
            insurance: item.fiscal_insurance_value,
            other_expenses: item.fiscal_other_expenses_value,
          },
        },
      })
      .eq('id', item.order_item_id)

    if (itemError) {
      return {
        success: false,
        error: {
          code: 'ITEM_PERSIST_FAILED',
          message: `Falha ao salvar item ${item.order_item_id}: ${itemError.message}`,
        },
      }
    }
  }

  // Update order totals
  const { error: orderError } = await supabase
    .from('orders')
    .update({
      fiscal_total_produtos: payload.totals.vProd,
      fiscal_total_icms: payload.totals.vICMS,
      fiscal_total_st: payload.totals.vST,
      fiscal_total_fcp: payload.totals.vFCP,
      fiscal_total_pis: payload.totals.vPIS,
      fiscal_total_cofins: payload.totals.vCOFINS,
      fiscal_total_ipi: payload.totals.vIPI,
      fiscal_total_tributos: payload.totals.vTotTrib,
      fiscal_total_desconto: payload.totals.vDesc,
      fiscal_total_frete: payload.totals.vFrete,
      fiscal_calculated_at: payload.calculated_at,
      fiscal_snapshot: {
        motor_version: payload.motor_version,
        totals: payload.totals,
        validation: payload.validation,
        emitter_uf: payload.context.emitter.uf,
        store_uf: payload.context.store.uf,
        ambiente: payload.context.environment.ambiente,
        item_count: payload.items.length,
        operation: payload.context.operation,
        transport: payload.context.transport,
        volumes: payload.context.volumes,
      },
      fiscal_ready: payload.validation.is_valid,
    })
    .eq('id', orderId)

  if (orderError) {
    return {
      success: false,
      error: {
        code: 'ORDER_PERSIST_FAILED',
        message: `Falha ao salvar totais do pedido: ${orderError.message}`,
      },
    }
  }

  return { success: true, data: { persisted: true } }
}

// --------------- Recalculate Order Fiscal ---------------

/**
 * Recalculates and persists fiscal data for an order.
 * Convenience wrapper around calculateOrderFiscal + persistOrderFiscalSnapshot.
 *
 * The snapshot is recalculable until the moment of emission.
 */
export async function recalculateOrderFiscal(
  orderId: string
): Promise<FiscalCalculationResult<FiscalDocumentPayload>> {
  const calcResult = await calculateOrderFiscal(orderId)
  if (!calcResult.success) return calcResult

  const persistResult = await persistOrderFiscalSnapshot(orderId, calcResult.data)
  if (!persistResult.success) return persistResult

  return calcResult
}

// --------------- Validate Order for Emission ---------------

/**
 * Validates if an order is ready for NF-e emission.
 * Does NOT persist anything — read-only check.
 */
export async function validateOrderForEmission(
  orderId: string
): Promise<FiscalCalculationResult<ValidationResult>> {
  const calcResult = await calculateOrderFiscal(orderId)
  if (!calcResult.success) {
    return {
      success: true,
      data: {
        is_valid: false,
        errors: [{
          field: 'motor',
          code: calcResult.error.code,
          message: calcResult.error.message,
          severity: 'error',
        }],
        warnings: [],
        checked_at: new Date().toISOString(),
      },
    }
  }

  return { success: true, data: calcResult.data.validation }
}
