'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getRepresentativePaymentOptions, validateRepresentativeDraftPricingAction } from '@/app/sales/actions'
import type {
  DraftItem,
  PaymentMethodGroup,
  PaymentOption,
  PricingValidationResult,
} from '@/components/sales/order-builder/types'

function buildPaymentOptions(group: PaymentMethodGroup | null): PaymentOption[] {
  if (!group) return []
  return [
    ...group.rules.map((rule) => ({
      id: rule.id,
      label: rule.payment_method_condition?.payment_condition?.name || `${rule.number_of_installments}x`,
      description: rule.payment_method_condition?.payment_condition?.description || 'Regra comercial da tabela.',
      discountPercentage: rule.discount_percentage,
      surchargePercentage: rule.surcharge_percentage || 0,
      isTableRule: true,
    })),
    ...group.conditions
      .filter((link) => link.is_active && link.payment_condition?.is_active)
      .map((link) => ({
        id: link.payment_condition_id,
        label: link.payment_condition?.name || 'Condicao',
        description: link.payment_condition?.description || group.method.description || null,
        discountPercentage: link.payment_condition?.discount_percentage || 0,
        surchargePercentage: link.payment_condition?.surcharge_percentage || 0,
        isTableRule: false,
      })),
  ]
}

function hasSamePricingSnapshot(current: DraftItem[], next: DraftItem[]) {
  if (current.length !== next.length) return false

  for (let index = 0; index < current.length; index += 1) {
    const currentItem = current[index]
    const nextItem = next[index]
    if (!nextItem) return false

    if (
      currentItem.cartKey !== nextItem.cartKey ||
      currentItem.quantity !== nextItem.quantity ||
      currentItem.unitPrice !== nextItem.unitPrice ||
      currentItem.sizeName !== nextItem.sizeName
    ) {
      return false
    }
  }

  return true
}

export function usePricingValidation({
  selectedStoreId,
  selectedPriceTableId,
  items,
  setItems,
  initialSelectedPaymentMethodId,
  initialSelectedPaymentId,
}: {
  selectedStoreId: string
  selectedPriceTableId: string
  items: DraftItem[]
  setItems: React.Dispatch<React.SetStateAction<DraftItem[]>>
  initialSelectedPaymentMethodId?: string | null
  initialSelectedPaymentId?: string | null
}) {
  const [paymentGroups, setPaymentGroups] = useState<PaymentMethodGroup[]>([])
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(initialSelectedPaymentMethodId || '')
  const [selectedPaymentId, setSelectedPaymentId] = useState(initialSelectedPaymentId || '')
  const [pricingPending, setPricingPending] = useState(false)

  const revalidationSequenceRef = useRef(0)

  useEffect(() => {
    if (!selectedStoreId || items.length === 0) {
      setPaymentGroups([])
      setSelectedPaymentMethodId('')
      setSelectedPaymentId('')
      setPricingPending(false)
      return
    }

    let cancelled = false
    const sequence = revalidationSequenceRef.current + 1
    revalidationSequenceRef.current = sequence

    const resetPaymentState = () => {
      setPaymentGroups([])
      setSelectedPaymentMethodId('')
      setSelectedPaymentId('')
    }

    const revalidate = async () => {
      setPricingPending(true)

      try {
        const pricing = (await validateRepresentativeDraftPricingAction({
          storeId: selectedStoreId,
          priceTableId: selectedPriceTableId || null,
          lines: items.map((item) => ({
            cartKey: item.cartKey,
            variantId: item.variantId,
            sizeOptionId: item.sizeOptionId,
          })),
        })) as PricingValidationResult

        if (cancelled || sequence !== revalidationSequenceRef.current) return

        if ('error' in pricing) {
          resetPaymentState()
          toast.error(pricing.error)
          return
        }

        const repricedItems = items.map((item) => {
          const price = pricing.prices[item.cartKey]
          if (!price) return item

          return {
            ...item,
            unitPrice: price.unitPrice,
            sizeName: price.sizeName ?? item.sizeName,
          }
        })

        setItems((current) => (hasSamePricingSnapshot(current, repricedItems) ? current : repricedItems))

        const subtotal = repricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
        const payments = await getRepresentativePaymentOptions({
          storeId: selectedStoreId,
          subtotal,
          priceTableId: selectedPriceTableId || null,
        })

        if (cancelled || sequence !== revalidationSequenceRef.current) return

        if ('error' in payments && payments.error) {
          resetPaymentState()
          toast.error(payments.error)
          return
        }

        setPaymentGroups((payments.paymentMethods || []) as PaymentMethodGroup[])
      } catch {
        if (cancelled || sequence !== revalidationSequenceRef.current) return
        resetPaymentState()
        toast.error('Nao foi possivel revalidar precos e pagamentos.')
      } finally {
        if (!cancelled && sequence === revalidationSequenceRef.current) {
          setPricingPending(false)
        }
      }
    }

    const timeout = window.setTimeout(() => {
      void revalidate()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [items, selectedPriceTableId, selectedStoreId, setItems])

  const effectivePaymentMethodId = paymentGroups.some((group) => group.method.id === selectedPaymentMethodId)
    ? selectedPaymentMethodId
    : paymentGroups[0]?.method.id || ''

  const selectedMethodGroup = useMemo(
    () => paymentGroups.find((group) => group.method.id === effectivePaymentMethodId) || null,
    [effectivePaymentMethodId, paymentGroups]
  )

  const paymentOptions = useMemo(() => buildPaymentOptions(selectedMethodGroup), [selectedMethodGroup])

  const effectivePaymentId = paymentOptions.some((option) => option.id === selectedPaymentId)
    ? selectedPaymentId
    : paymentOptions[0]?.id || ''

  const selectedPaymentOption = paymentOptions.find((option) => option.id === effectivePaymentId) || null

  return {
    pricingPending,
    paymentGroups,
    selectedPaymentMethodId,
    setSelectedPaymentMethodId,
    selectedPaymentId,
    setSelectedPaymentId,
    effectivePaymentMethodId,
    selectedMethodGroup,
    paymentOptions,
    effectivePaymentId,
    selectedPaymentOption,
  }
}
