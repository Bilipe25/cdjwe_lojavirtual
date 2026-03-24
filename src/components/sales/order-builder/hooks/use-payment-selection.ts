'use client'

import { useMemo, useState } from 'react'
import type { DiscountType, NegotiationSummary, PaymentOption } from '@/components/sales/order-builder/types'

function computeNegotiation(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
  surchargeValue: number
): NegotiationSummary {
  const safeSubtotal = Math.max(0, subtotal)
  const safeDiscount = Math.max(0, discountValue)
  const safeSurcharge = Math.max(0, surchargeValue)
  const discountAmount =
    discountType === 'percent'
      ? safeSubtotal * (Math.min(100, safeDiscount) / 100)
      : discountType === 'value'
        ? Math.min(safeSubtotal, safeDiscount)
        : 0
  const discountPercentage = discountType === 'percent' ? Math.min(100, safeDiscount) : 0
  const adjustedSubtotal = Math.max(0, safeSubtotal - discountAmount + safeSurcharge)
  return { adjustedSubtotal, discountAmount, discountPercentage, surchargeAmount: safeSurcharge }
}

export function usePaymentSelection({
  subtotal,
  selectedPaymentOption,
  initialDiscountType,
  initialDiscountValue,
  initialSurchargeValue,
  initialNegotiationReason,
}: {
  subtotal: number
  selectedPaymentOption: PaymentOption | null
  initialDiscountType?: DiscountType
  initialDiscountValue?: string
  initialSurchargeValue?: string
  initialNegotiationReason?: string
}) {
  const [discountType, setDiscountType] = useState<DiscountType>(initialDiscountType || 'none')
  const [discountValue, setDiscountValue] = useState(initialDiscountValue || '')
  const [surchargeValue, setSurchargeValue] = useState(initialSurchargeValue || '')
  const [negotiationReason, setNegotiationReason] = useState(initialNegotiationReason || '')

  const negotiation = useMemo(
    () => computeNegotiation(subtotal, discountType, Number(discountValue || 0), Number(surchargeValue || 0)),
    [discountType, discountValue, subtotal, surchargeValue]
  )

  const paymentDiscountAmount = negotiation.adjustedSubtotal * ((selectedPaymentOption?.discountPercentage || 0) / 100)
  const afterPaymentDiscount = Math.max(0, negotiation.adjustedSubtotal - paymentDiscountAmount)
  const paymentSurchargeAmount = afterPaymentDiscount * ((selectedPaymentOption?.surchargePercentage || 0) / 100)
  const total = Math.max(0, afterPaymentDiscount + paymentSurchargeAmount)

  return {
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    surchargeValue,
    setSurchargeValue,
    negotiationReason,
    setNegotiationReason,
    negotiation,
    paymentDiscountAmount,
    paymentSurchargeAmount,
    total,
  }
}
