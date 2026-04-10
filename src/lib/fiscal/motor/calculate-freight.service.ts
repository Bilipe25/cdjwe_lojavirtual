// ============================================================
// Motor Fiscal — Calculate Freight Service
// Proportional freight distribution across order items
// ============================================================

import type { FiscalItemContext } from './types'
import { roundFiscal } from './types'

export interface FreightDistribution {
  order_item_id: string
  freight_value: number
}

/**
 * Distributes total freight proportionally across items based on value.
 *
 * Formula: freight_item = freight_total × (item_value / total_value)
 *
 * The last item absorbs any rounding difference to guarantee
 * the sum equals the original freight total.
 */
export function distributeFreight(
  items: FiscalItemContext[],
  totalFreight: number
): FreightDistribution[] {
  if (totalFreight <= 0 || items.length === 0) {
    return items.map((item) => ({
      order_item_id: item.order_item_id,
      freight_value: 0,
    }))
  }

  const totalProductValue = items.reduce((sum, item) => sum + item.subtotal, 0)

  if (totalProductValue <= 0) {
    // Distribute equally if no product value (edge case)
    const equalShare = roundFiscal(totalFreight / items.length)
    return items.map((item, index) => ({
      order_item_id: item.order_item_id,
      freight_value: index === items.length - 1
        ? roundFiscal(totalFreight - equalShare * (items.length - 1))
        : equalShare,
    }))
  }

  const result: FreightDistribution[] = []
  let accumulated = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const isLast = i === items.length - 1

    if (isLast) {
      // Last item absorbs rounding difference
      result.push({
        order_item_id: item.order_item_id,
        freight_value: roundFiscal(totalFreight - accumulated),
      })
    } else {
      const proportion = item.subtotal / totalProductValue
      const freightValue = roundFiscal(totalFreight * proportion)
      accumulated += freightValue
      result.push({
        order_item_id: item.order_item_id,
        freight_value: freightValue,
      })
    }
  }

  return result
}
