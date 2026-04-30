'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PaymentMethodGroup, PaymentOption } from '@/components/sales/order-builder/types'
import { cn } from '@/lib/utils'

export function PaymentFields({
  paymentGroups,
  effectivePaymentMethodId,
  selectedMethodGroup,
  paymentOptions,
  effectivePaymentId,
  selectedPaymentOption,
  onPaymentMethodChange,
  onPaymentConditionChange,
  className,
}: {
  paymentGroups: PaymentMethodGroup[]
  effectivePaymentMethodId: string
  selectedMethodGroup: PaymentMethodGroup | null
  paymentOptions: PaymentOption[]
  effectivePaymentId: string
  selectedPaymentOption: PaymentOption | null
  onPaymentMethodChange: (value: string) => void
  onPaymentConditionChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-2', className)}>
      <div className="space-y-1.5">
        <Label className="text-xs">Meio</Label>
        <Select
          value={effectivePaymentMethodId}
          onValueChange={(value) => {
            onPaymentMethodChange(value || '')
            onPaymentConditionChange('')
          }}
        >
          <SelectTrigger className="h-9 rounded-xl border-border text-sm">
            <SelectValue placeholder="Selecione">{selectedMethodGroup?.method.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {paymentGroups.map((group) => (
              <SelectItem key={group.method.id} value={group.method.id}>
                {group.method.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Condicao</Label>
        <Select value={effectivePaymentId} onValueChange={(value) => onPaymentConditionChange(value || '')}>
          <SelectTrigger className="h-9 rounded-xl border-border text-sm">
            <SelectValue placeholder="Selecione">{selectedPaymentOption?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {paymentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
