// ============================================================
// Motor Fiscal — Resolve CFOP Service
// Determines the final CFOP for each item based on geographic
// context, tax profile rules, and CFOP configurations
// ============================================================

import type { FiscalContext, FiscalItemContext } from './types'

interface CfopResolution {
  cfop: string
  source: 'item_override' | 'order_global' | 'rule_override' | 'profile_default' | 'geographic_inference'
  is_internal: boolean
  is_interstate: boolean
}

/**
 * Infers CFOP family based on emitter vs destination UF.
 * - Same UF → 5xxx (internal)
 * - Different UF → 6xxx (interstate)
 */
function inferCfopFamily(emitterUf: string, storeUf: string): { prefix: string; is_internal: boolean; is_interstate: boolean } {
  const isInternal = emitterUf === storeUf
  return {
    prefix: isInternal ? '5' : '6',
    is_internal: isInternal,
    is_interstate: !isInternal,
  }
}

/**
 * Adapts a CFOP from one family to the correct geographic family.
 * E.g., 5102 → 6102 if interstate.
 */
function adaptCfopToGeography(cfop: string, targetPrefix: string): string {
  if (!cfop || cfop.length !== 4) return cfop
  const currentPrefix = cfop.charAt(0)
  // Only adapt between 5xxx ↔ 6xxx (outbound) or 1xxx ↔ 2xxx (inbound)
  if (
    (currentPrefix === '5' || currentPrefix === '6') &&
    (targetPrefix === '5' || targetPrefix === '6')
  ) {
    return targetPrefix + cfop.slice(1)
  }
  if (
    (currentPrefix === '1' || currentPrefix === '2') &&
    (targetPrefix === '1' || targetPrefix === '2')
  ) {
    return targetPrefix + cfop.slice(1)
  }
  return cfop
}

/**
 * Resolves the CFOP for a single item.
 */
function resolveItemCfop(
  item: FiscalItemContext,
  ctx: FiscalContext
): CfopResolution {
  const geo = inferCfopFamily(ctx.emitter.uf, ctx.store.uf)
  const operationDirection = ctx.operation_direction

  // 1. Explicit item override on the order
  if (item.cfop_override_code) {
    return {
      cfop: item.cfop_override_code,
      source: 'item_override',
      is_internal: geo.is_internal,
      is_interstate: geo.is_interstate,
    }
  }

  // 2. Global order CFOP
  if (ctx.operation.cfop_global_code) {
    return {
      cfop: ctx.operation.cfop_global_code,
      source: 'order_global',
      is_internal: geo.is_internal,
      is_interstate: geo.is_interstate,
    }
  }

  // 3. Check rule override
  if (item.applied_rule?.cfop_override) {
    const adapted = adaptCfopToGeography(item.applied_rule.cfop_override, geo.prefix)
    return {
      cfop: adapted,
      source: 'rule_override',
      is_internal: geo.is_internal,
      is_interstate: geo.is_interstate,
    }
  }

  // 4. Check tax profile default CFOP
  const defaultCfop = operationDirection === 'inbound'
    ? item.tax_profile.default_input_cfop
    : item.tax_profile.default_output_cfop

  if (defaultCfop) {
    const adapted = adaptCfopToGeography(defaultCfop, geo.prefix)
    return {
      cfop: adapted,
      source: 'profile_default',
      is_internal: geo.is_internal,
      is_interstate: geo.is_interstate,
    }
  }

  // 5. Geographic inference fallback
  // Default: 5102/6102 for regular sale with resale
  const baseCfop = geo.is_internal ? '5102' : '6102'
  return {
    cfop: baseCfop,
    source: 'geographic_inference',
    is_internal: geo.is_internal,
    is_interstate: geo.is_interstate,
  }
}

/**
 * Resolves CFOPs for all items in the fiscal context.
 */
export function resolveAllCfops(ctx: FiscalContext): Map<string, CfopResolution> {
  const resolutions = new Map<string, CfopResolution>()

  for (const item of ctx.items) {
    resolutions.set(item.order_item_id, resolveItemCfop(item, ctx))
  }

  return resolutions
}

/**
 * Gets a single item CFOP resolution.
 */
export function resolveCfop(item: FiscalItemContext, ctx: FiscalContext): CfopResolution {
  return resolveItemCfop(item, ctx)
}

/**
 * Checks if the operation is interstate.
 */
export function isInterstate(ctx: FiscalContext): boolean {
  return ctx.emitter.uf !== ctx.store.uf
}
