// ============================================================
// Motor Fiscal — Calculate Discount Service
// Proportional discount distribution across order items
// ============================================================

import type { FiscalItemContext } from './types'
import { roundFiscal } from './types'

export interface DiscountDistribution {
  order_item_id: string
  discount_value: number
}

/**
 * Distributes total discount proportionally across items based on value.
 *
 * Formula: discount_item = discount_total × (item_value / total_value)
 *
 * The last item absorbs any rounding difference to guarantee
 * the sum equals the original discount total.
 *
 * If discount exceeds product total, each item is capped at its subtotal.
 */
export function distributeDiscount(
  items: FiscalItemContext[],
  totalDiscount: number
): DiscountDistribution[] {
  if (totalDiscount <= 0 || items.length === 0) {
    return items.map((item) => ({
      order_item_id: item.order_item_id,
      discount_value: 0,
    }))
  }

  const totalProductValue = items.reduce((sum, item) => sum + item.subtotal, 0)

  // Cap discount at product total
  const effectiveDiscount = Math.min(totalDiscount, totalProductValue)

  if (totalProductValue <= 0) {
    return items.map((item) => ({
      order_item_id: item.order_item_id,
      discount_value: 0,
    }))
  }

  const result: DiscountDistribution[] = []
  let accumulated = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const isLast = i === items.length - 1

    if (isLast) {
      // Last item absorbs rounding difference
      const remaining = roundFiscal(effectiveDiscount - accumulated)
      result.push({
        order_item_id: item.order_item_id,
        discount_value: Math.min(remaining, item.subtotal),
      })
    } else {
      const proportion = item.subtotal / totalProductValue
      const discountValue = roundFiscal(effectiveDiscount * proportion)
      // Cap per item at item subtotal
      const cappedValue = Math.min(discountValue, item.subtotal)
      accumulated += cappedValue
      result.push({
        order_item_id: item.order_item_id,
        discount_value: cappedValue,
      })
    }
  }

  return result
}
