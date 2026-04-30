'use client'

import type { Dispatch, SetStateAction } from 'react'
import { ChevronRight, FileText, Loader2, MapPin, Plus, ShoppingBag } from 'lucide-react'
import type { OrderType, PriceTable } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemsList } from '@/components/sales/order-builder/components/items-list'
import { NegotiationFields } from '@/components/sales/order-builder/components/negotiation-fields'
import { OrderNotesField } from '@/components/sales/order-builder/components/order-notes-field'
import { OrderTypeSelector, getOrderTypeLabel } from '@/components/sales/order-builder/components/order-type-selector'
import { PaymentFields } from '@/components/sales/order-builder/components/payment-fields'
import { SectionRow } from '@/components/sales/order-builder/components/section-row'
import {
  OrderBuilderValidationPanel,
  type BuilderValidationMessage,
} from '@/components/sales/order-builder/components/builder-validation-panel'
import { cn } from '@/lib/utils'
import type {
  BuilderCustomer,
  DiscountType,
  DraftItem,
  OrderBuilderMode,
  OrderBuilderSection,
  PaymentMethodGroup,
  PaymentOption,
} from '@/components/sales/order-builder/types'
import { formatCurrency } from '@/components/sales/order-builder/utils'

export function MobileOrderBuilder({
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
  openSection,
  onOpenSectionChange,
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
  total,
  submitting,
  canSubmitCurrentDocument,
  validationMessages,
  readyDeliveryStockByKey,
  readyDeliveryReservedByKey,
  onOpenCustomerSheet,
  onEditSelectedStore,
  onOpenProducts,
  onSubmit,
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
  openSection: OrderBuilderSection
  onOpenSectionChange: (section: OrderBuilderSection) => void
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
  total: number
  submitting: boolean
  canSubmitCurrentDocument: boolean
  validationMessages: BuilderValidationMessage[]
  readyDeliveryStockByKey?: Record<string, number>
  readyDeliveryReservedByKey?: Record<string, number>
  onOpenCustomerSheet: () => void
  onEditSelectedStore: () => void
  onOpenProducts: () => void
  onSubmit: () => void
}) {
  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col xl:hidden">
      <div className="flex-1 divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
        <button
          type="button"
          onClick={onOpenCustomerSheet}
          className={cn(
            'flex w-full items-center gap-3 border-b border-border/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/40',
            !selectedStoreId && 'bg-primary/5'
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Cliente Selecionado</p>
            <p className={cn('mt-0.5 text-sm font-semibold', !selectedStoreId ? 'text-primary' : 'text-foreground')}>
              {selectedStore?.company_name || 'Tocar para selecionar...'}
            </p>
            {selectedStore && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {(selectedStore.city || selectedStore.state) && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5" />
                    {[selectedStore.city, selectedStore.state].filter(Boolean).join('/')}
                  </span>
                )}
                {selectedStore.customer_code && (
                  <span>· Cód. #{selectedStore.customer_code}</span>
                )}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {selectedStoreId ? (
          <div className="space-y-3 border-b border-border/30 bg-muted/10 px-4 py-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={selectedPriceTableId} onValueChange={(value) => onPriceTableChange(value || '')}>
                  <SelectTrigger className="h-9 rounded-xl border-border bg-card text-sm shadow-sm">
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
              <Button
                variant="outline"
                size="sm"
                onClick={onEditSelectedStore}
                className="h-9 rounded-xl border-border bg-card font-semibold text-primary"
              >
                Editar
              </Button>
            </div>

            {mode === 'order' ? (
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold text-muted-foreground">Tipo de pedido</Label>
                <OrderTypeSelector value={orderType} onChange={onOrderTypeChange} />
              </div>
            ) : null}

            {isPreSaleOrder ? (
              <div className="space-y-2">
                <Select value={selectedAddressId} onValueChange={(value) => onAddressChange(value || '')}>
                  <SelectTrigger className="h-9 rounded-xl border-border bg-card text-sm shadow-sm">
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
                Pronta entrega selecionada. O pedido sera criado sem endereco de entrega.
              </div>
            )}
          </div>
        ) : null}

        <SectionRow
          label="Itens do Carrinho"
          value={items.length ? `${items.length} item(ns) · ${formatCurrency(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}` : 'Vazio'}
          highlight={items.length === 0 && Boolean(selectedStoreId)}
          onClick={onOpenProducts}
        />
        {items.length > 0 ? (
          <div className="border-b border-border/30 bg-muted/10 px-4 py-4">
            <ItemsList
              items={items}
              setItems={setItems}
              pricingPending={pricingPending}
              orderType={orderType}
              readyDeliveryStockByKey={readyDeliveryStockByKey}
              readyDeliveryReservedByKey={readyDeliveryReservedByKey}
            />
            <Button
              onClick={onOpenProducts}
              variant="outline"
              className="mt-3 h-10 w-full rounded-xl border-dashed border-border text-primary hover:bg-primary/5"
            >
              <Plus className="mr-2 h-4 w-4" />
              Buscar mais produtos
            </Button>
          </div>
        ) : null}

        <SectionRow
          label="Negociacao"
          value={
            discountType !== 'none'
              ? `${discountType === 'percent' ? `${discountValue}%` : formatCurrency(Number(discountValue || 0))} desc.`
              : undefined
          }
          expanded={openSection === 'negotiation'}
          onClick={() => onOpenSectionChange(openSection === 'negotiation' ? null : 'negotiation')}
        />
        {openSection === 'negotiation' ? (
          <NegotiationFields
            className="bg-muted/20 px-4 py-4"
            discountType={discountType}
            discountValue={discountValue}
            surchargeValue={surchargeValue}
            negotiationReason={negotiationReason}
            onDiscountTypeChange={onDiscountTypeChange}
            onDiscountValueChange={onDiscountValueChange}
            onSurchargeValueChange={onSurchargeValueChange}
            onNegotiationReasonChange={onNegotiationReasonChange}
          />
        ) : null}

        <SectionRow
          label="Dados de pagamento"
          value={selectedPaymentOption?.label || 'Selecione'}
          highlight={Boolean(selectedPaymentOption?.discountPercentage)}
          expanded={openSection === 'payment'}
          onClick={() => onOpenSectionChange(openSection === 'payment' ? null : 'payment')}
        />
        {openSection === 'payment' ? (
          <PaymentFields
            className="bg-muted/20 px-4 py-4"
            paymentGroups={paymentGroups}
            effectivePaymentMethodId={effectivePaymentMethodId}
            selectedMethodGroup={selectedMethodGroup}
            paymentOptions={paymentOptions}
            effectivePaymentId={effectivePaymentId}
            selectedPaymentOption={selectedPaymentOption}
            onPaymentMethodChange={onPaymentMethodChange}
            onPaymentConditionChange={onPaymentConditionChange}
          />
        ) : null}

        <SectionRow
          label="Observacoes"
          value={notes ? notes.substring(0, 40) + (notes.length > 40 ? '...' : '') : undefined}
          expanded={openSection === 'notes'}
          onClick={() => onOpenSectionChange(openSection === 'notes' ? null : 'notes')}
        />
        {openSection === 'notes' ? (
          <div className="bg-muted/20 px-4 py-4">
            <OrderNotesField value={notes} onChange={onNotesChange} />
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-[var(--bottom-nav-height)] z-10 border-t border-border/30 bg-card px-4 py-3 pb-safe shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
        {mode === 'order' ? (
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Tipo de pedido</span>
            <span className="font-semibold text-foreground">{getOrderTypeLabel(orderType)}</span>
          </div>
        ) : null}

        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Total do atendimento</span>
          <span className="text-lg font-bold font-heading text-foreground">{formatCurrency(total)}</span>
        </div>

        {!canSubmitCurrentDocument ? (
          <div className="mb-2">
            <OrderBuilderValidationPanel messages={validationMessages} compact />
          </div>
        ) : null}

        <Button
          className="h-12 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90"
          disabled={submitting || pricingPending || !canSubmitCurrentDocument}
          onClick={onSubmit}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === 'order' ? (
            <>
              <ShoppingBag className="mr-2 h-4 w-4" />
              CONFIRMAR PEDIDO
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              SALVAR ORCAMENTO
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
