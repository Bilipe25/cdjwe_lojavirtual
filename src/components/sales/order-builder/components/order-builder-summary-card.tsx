'use client'

import { FileText, Loader2, ShoppingBag } from 'lucide-react'
import type { OrderType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import type { NegotiationSummary, OrderBuilderMode } from '@/components/sales/order-builder/types'
import { formatCurrency } from '@/components/sales/order-builder/utils'
import {
  OrderBuilderValidationPanel,
  type BuilderValidationMessage,
} from '@/components/sales/order-builder/components/builder-validation-panel'
import { getOrderTypeLabel } from '@/components/sales/order-builder/components/order-type-selector'

export function OrderBuilderSummaryCard({
  mode,
  subtotal,
  negotiation,
  paymentDiscountAmount,
  paymentSurchargeAmount,
  total,
  selectedPaymentLabel,
  orderType,
  submitting,
  pricingPending,
  canSubmitCurrentDocument,
  canSubmitQuote,
  validationMessages,
  onSubmitOrder,
  onSubmitQuote,
}: {
  mode: OrderBuilderMode
  subtotal: number
  negotiation: NegotiationSummary
  paymentDiscountAmount: number
  paymentSurchargeAmount: number
  total: number
  selectedPaymentLabel?: string | null
  orderType: OrderType
  submitting: boolean
  pricingPending: boolean
  canSubmitCurrentDocument: boolean
  canSubmitQuote: boolean
  validationMessages: BuilderValidationMessage[]
  onSubmitOrder: () => void
  onSubmitQuote: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card">
      <div className="border-b border-border/30 px-4 py-3">
        <h2 className="text-sm font-semibold font-heading text-foreground">Resumo</h2>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
        </div>

        {negotiation.discountAmount > 0 ? (
          <div className="flex items-center justify-between text-xs text-emerald-700">
            <span>Desc. negociado</span>
            <span className="font-semibold">- {formatCurrency(negotiation.discountAmount)}</span>
          </div>
        ) : null}

        {negotiation.surchargeAmount > 0 ? (
          <div className="flex items-center justify-between text-xs text-amber-700">
            <span>Acrescimo</span>
            <span className="font-semibold">+ {formatCurrency(negotiation.surchargeAmount)}</span>
          </div>
        ) : null}

        {paymentDiscountAmount > 0 ? (
          <div className="flex items-center justify-between text-xs text-emerald-700">
            <span>Desc. pagamento</span>
            <span className="font-semibold">- {formatCurrency(paymentDiscountAmount)}</span>
          </div>
        ) : null}

        {paymentSurchargeAmount > 0 ? (
          <div className="flex items-center justify-between text-xs text-amber-700">
            <span>Acresc. pagamento</span>
            <span className="font-semibold">+ {formatCurrency(paymentSurchargeAmount)}</span>
          </div>
        ) : null}

        <div className="rounded-xl gradient-navy px-4 py-3 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Total estimado</p>
          <p className="mt-1 text-2xl font-bold font-heading tracking-tight">{formatCurrency(total)}</p>
          <p className="mt-1 text-xs text-white/60">{selectedPaymentLabel || 'Defina pagamento'}</p>
        </div>

        {mode === 'order' ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Tipo</span>
            <span className="text-right font-semibold text-foreground">{getOrderTypeLabel(orderType)}</span>
          </div>
        ) : null}

        <OrderBuilderValidationPanel messages={validationMessages} compact />

        {mode === 'order' ? (
          <Button
            className="h-10 w-full rounded-xl border-0 text-sm font-bold gradient-bronze text-white hover:opacity-90"
            disabled={submitting || pricingPending || !canSubmitCurrentDocument}
            onClick={onSubmitOrder}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShoppingBag className="mr-2 h-4 w-4" />
                Confirmar pedido
              </>
            )}
          </Button>
        ) : null}

        <Button
          variant={mode === 'quote' ? 'default' : 'outline'}
          className={
            mode === 'quote'
              ? 'h-10 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90'
              : 'h-10 w-full rounded-xl border-border bg-card text-sm text-foreground hover:bg-muted/60'
          }
          disabled={submitting || pricingPending || !canSubmitQuote}
          onClick={onSubmitQuote}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Salvar orcamento
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
