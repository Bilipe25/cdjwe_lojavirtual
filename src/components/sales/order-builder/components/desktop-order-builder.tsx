'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Users } from 'lucide-react'
import type { OrderType, PriceTable } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemsList } from '@/components/sales/order-builder/components/items-list'
import { NegotiationFields } from '@/components/sales/order-builder/components/negotiation-fields'
import { OrderBuilderSummaryCard } from '@/components/sales/order-builder/components/order-builder-summary-card'
import { OrderNotesField } from '@/components/sales/order-builder/components/order-notes-field'
import { OrderTypeSelector } from '@/components/sales/order-builder/components/order-type-selector'
import { PaymentFields } from '@/components/sales/order-builder/components/payment-fields'
import type { BuilderValidationMessage } from '@/components/sales/order-builder/components/builder-validation-panel'
import type {
  BuilderCustomer,
  DiscountType,
  DraftItem,
  NegotiationSummary,
  OrderBuilderMode,
  PaymentMethodGroup,
  PaymentOption,
} from '@/components/sales/order-builder/types'
import { cn } from '@/lib/utils'

export function DesktopOrderBuilder({
  mode,
  selectedStore,
  selectedStoreId,
  availablePriceTables,
  selectedPriceTableId,
  onPriceTableChange,
  orderType,
  onOrderTypeChange,
  isPreSaleOrder,
  selectedAddressId,
  onAddressChange,
  currentAddressTitle,
  requiresDeliveryAddress,
  hasResolvableAddress,
  items,
  setItems,
  pricingPending,
  discountType,
  discountValue,
  surchargeValue,
  negotiationReason,
  onDiscountTypeChange,
  onDiscountValueChange,
  onSurchargeValueChange,
  onNegotiationReasonChange,
  paymentGroups,
  effectivePaymentMethodId,
  selectedMethodGroup,
  paymentOptions,
  effectivePaymentId,
  selectedPaymentOption,
  onPaymentMethodChange,
  onPaymentConditionChange,
  notes,
  onNotesChange,
  subtotal,
  negotiation,
  paymentDiscountAmount,
  paymentSurchargeAmount,
  total,
  submitting,
  canSubmitCurrentDocument,
  canSubmitQuote,
  validationMessages,
  onOpenCustomerSheet,
  onEditSelectedStore,
  onOpenProducts,
  onSubmitOrder,
  onSubmitQuote,
}: {
  mode: OrderBuilderMode
  selectedStore: BuilderCustomer | null
  selectedStoreId: string
  availablePriceTables: PriceTable[]
  selectedPriceTableId: string
  onPriceTableChange: (value: string) => void
  orderType: OrderType
  onOrderTypeChange: (value: OrderType) => void
  isPreSaleOrder: boolean
  selectedAddressId: string
  onAddressChange: (value: string) => void
  currentAddressTitle?: string
  requiresDeliveryAddress: boolean
  hasResolvableAddress: boolean
  items: DraftItem[]
  setItems: Dispatch<SetStateAction<DraftItem[]>>
  pricingPending: boolean
  discountType: DiscountType
  discountValue: string
  surchargeValue: string
  negotiationReason: string
  onDiscountTypeChange: (value: DiscountType) => void
  onDiscountValueChange: (value: string) => void
  onSurchargeValueChange: (value: string) => void
  onNegotiationReasonChange: (value: string) => void
  paymentGroups: PaymentMethodGroup[]
  effectivePaymentMethodId: string
  selectedMethodGroup: PaymentMethodGroup | null
  paymentOptions: PaymentOption[]
  effectivePaymentId: string
  selectedPaymentOption: PaymentOption | null
  onPaymentMethodChange: (value: string) => void
  onPaymentConditionChange: (value: string) => void
  notes: string
  onNotesChange: (value: string) => void
  subtotal: number
  negotiation: NegotiationSummary
  paymentDiscountAmount: number
  paymentSurchargeAmount: number
  total: number
  submitting: boolean
  canSubmitCurrentDocument: boolean
  canSubmitQuote: boolean
  validationMessages: BuilderValidationMessage[]
  onOpenCustomerSheet: () => void
  onEditSelectedStore: () => void
  onOpenProducts: () => void
  onSubmitOrder: () => void
  onSubmitQuote: () => void
}) {
  return (
    <div className="hidden xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border/40 bg-card">
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold font-heading text-foreground">1. Cliente e contexto</h2>
            {selectedStoreId ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onEditSelectedStore} className="h-7 px-2 text-xs text-primary">
                  Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={onOpenCustomerSheet} className="h-7 px-2 text-xs text-primary">
                  Trocar
                </Button>
              </div>
            ) : null}
          </div>

          <div className="p-4">
            {!selectedStoreId ? (
              <div className="rounded-xl border bg-muted/20 p-6 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="mb-4 text-sm text-muted-foreground">Nenhum cliente selecionado</p>
                <Button
                  onClick={onOpenCustomerSheet}
                  className="h-10 rounded-xl px-6 font-semibold gradient-bronze text-white shadow-md transition hover:opacity-90"
                >
                  Selecionar Cliente
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Cliente Vinculado</Label>
                  <div className="flex h-10 cursor-pointer items-center rounded-xl border border-border bg-muted/30 px-3 transition hover:bg-muted/50">
                    <span className="text-sm font-semibold text-foreground">{selectedStore?.company_name}</span>
                  </div>
                </div>

                {mode === 'order' ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs">Tipo de pedido</Label>
                    <OrderTypeSelector value={orderType} onChange={onOrderTypeChange} />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label className="text-xs">Tabela de preco</Label>
                  <Select value={selectedPriceTableId} onValueChange={(value) => onPriceTableChange(value || '')}>
                    <SelectTrigger className="h-10 rounded-xl border-border bg-card text-sm shadow-sm transition hover:bg-muted/30">
                      <SelectValue placeholder="Tabela">
                        {availablePriceTables.find((table) => table.id === selectedPriceTableId)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availablePriceTables.map((table) => (
                        <SelectItem key={table.id} value={table.id}>
                          {table.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isPreSaleOrder ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Entrega</Label>
                    <Select value={selectedAddressId} onValueChange={(value) => onAddressChange(value || '')}>
                      <SelectTrigger className="h-10 rounded-xl border-border bg-card text-sm shadow-sm transition hover:bg-muted/30">
                        <SelectValue placeholder="Endereco">{currentAddressTitle}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedStore?.addresses || []).map((address) => (
                          <SelectItem key={address.id} value={address.id}>
                            {address.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {requiresDeliveryAddress && !hasResolvableAddress ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        Cadastre um endereco para concluir um pedido pre-venda.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                    Pronta entrega selecionada. Endereco de entrega nao sera solicitado.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          className={cn(
            'rounded-2xl border bg-card transition-all duration-300',
            !selectedStoreId ? 'pointer-events-none border-border/40 opacity-50' : 'border-border/40 shadow-sm'
          )}
        >
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold font-heading text-foreground">2. Produtos do Pedido</h2>
            <Button
              size="sm"
              onClick={onOpenProducts}
              className="h-8 rounded-lg px-4 font-semibold gradient-navy text-white shadow-sm hover:opacity-90"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Buscar Produtos
            </Button>
          </div>
          <div className="p-4">
            <ItemsList items={items} setItems={setItems} pricingPending={pricingPending} />
          </div>
        </section>

        <section className="rounded-2xl border border-border/40 bg-card">
          <div className="border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold font-heading text-foreground">3. Pagamento</h2>
          </div>
          <div className="space-y-3 p-4">
            <PaymentFields
              paymentGroups={paymentGroups}
              effectivePaymentMethodId={effectivePaymentMethodId}
              selectedMethodGroup={selectedMethodGroup}
              paymentOptions={paymentOptions}
              effectivePaymentId={effectivePaymentId}
              selectedPaymentOption={selectedPaymentOption}
              onPaymentMethodChange={onPaymentMethodChange}
              onPaymentConditionChange={onPaymentConditionChange}
            />
            <NegotiationFields
              discountType={discountType}
              discountValue={discountValue}
              surchargeValue={surchargeValue}
              negotiationReason={negotiationReason}
              onDiscountTypeChange={onDiscountTypeChange}
              onDiscountValueChange={onDiscountValueChange}
              onSurchargeValueChange={onSurchargeValueChange}
              onNegotiationReasonChange={onNegotiationReasonChange}
            />
            <OrderNotesField value={notes} onChange={onNotesChange} className="md:col-span-2" />
          </div>
        </section>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <OrderBuilderSummaryCard
          mode={mode}
          subtotal={subtotal}
          negotiation={negotiation}
          paymentDiscountAmount={paymentDiscountAmount}
          paymentSurchargeAmount={paymentSurchargeAmount}
          total={total}
          selectedPaymentLabel={selectedPaymentOption?.label}
          orderType={orderType}
          submitting={submitting}
          pricingPending={pricingPending}
          canSubmitCurrentDocument={canSubmitCurrentDocument}
          canSubmitQuote={canSubmitQuote}
          validationMessages={validationMessages}
          onSubmitOrder={onSubmitOrder}
          onSubmitQuote={onSubmitQuote}
        />
      </div>
    </div>
  )
}
