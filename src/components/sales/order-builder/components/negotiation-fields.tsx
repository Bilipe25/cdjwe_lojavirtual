'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DiscountType } from '@/components/sales/order-builder/types'
import { cn } from '@/lib/utils'

export function NegotiationFields({
  discountType,
  discountValue,
  surchargeValue,
  negotiationReason,
  onDiscountTypeChange,
  onDiscountValueChange,
  onSurchargeValueChange,
  onNegotiationReasonChange,
  className,
}: {
  discountType: DiscountType
  discountValue: string
  surchargeValue: string
  negotiationReason: string
  onDiscountTypeChange: (value: DiscountType) => void
  onDiscountValueChange: (value: string) => void
  onSurchargeValueChange: (value: string) => void
  onNegotiationReasonChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-2', className)}>
      <div className="space-y-1.5">
        <Label className="text-xs">Desconto</Label>
        <Select value={discountType} onValueChange={(value) => onDiscountTypeChange((value || 'none') as DiscountType)}>
          <SelectTrigger className="h-9 rounded-xl border-border text-sm">
            <SelectValue>
              {discountType === 'none' ? 'Sem desconto' : discountType === 'percent' ? 'Percentual' : 'Valor'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem desconto</SelectItem>
            <SelectItem value="percent">Percentual</SelectItem>
            <SelectItem value="value">Valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{discountType === 'percent' ? '% desc.' : 'Valor desc.'}</Label>
        <Input
          value={discountValue}
          onChange={(event) => onDiscountValueChange(event.target.value)}
          className="h-9 rounded-xl border-border text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Acrescimo</Label>
        <Input
          value={surchargeValue}
          onChange={(event) => onSurchargeValueChange(event.target.value)}
          className="h-9 rounded-xl border-border text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Motivo</Label>
        <Input
          value={negotiationReason}
          onChange={(event) => onNegotiationReasonChange(event.target.value)}
          className="h-9 rounded-xl border-border text-sm"
        />
      </div>
    </div>
  )
}
