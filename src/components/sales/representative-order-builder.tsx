'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Category, CustomerType, OrderType, PriceTable } from '@/lib/types'
import {
  createCustomerAsRepresentativeTx,
  createRepresentativeOrderAction,
  getRepresentativeOrderCompletionData,
  saveRepresentativeQuoteAction,
  updateCustomerAsRepresentativeTx,
} from '@/app/sales/actions'
import { RepresentativeProductCatalogOverlay, type CatalogOverlayConfirmPayload } from './representative-product-catalog-overlay'
import { RepresentativeCustomerForm, type RepCustomerFormData } from './representative-customer-form'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { getOrderPaymentDisplay } from '@/lib/orders/order-payment-display'
import { getOrderDeliverySummary, getOrderTypeLabel } from '@/lib/orders/order-type'
import { getWhatsAppLink } from '@/lib/utils'
import { useOrderDraft } from '@/components/sales/order-builder/hooks/use-order-draft'
import { usePaymentSelection } from '@/components/sales/order-builder/hooks/use-payment-selection'
import { usePricingValidation } from '@/components/sales/order-builder/hooks/use-pricing-validation'
import { CustomerSelectionOverlay } from '@/components/sales/order-builder/components/customer-selection-overlay'
import { DesktopOrderBuilder } from '@/components/sales/order-builder/components/desktop-order-builder'
import { MobileOrderBuilder } from '@/components/sales/order-builder/components/mobile-order-builder'
import { OrderCompletionOverlay } from '@/components/sales/order-builder/components/order-completion-overlay'
import type { BuilderValidationMessage } from '@/components/sales/order-builder/components/builder-validation-panel'
import type {
  BuilderCustomer,
  BuilderProduct,
  DiscountType,
  DraftItem,
  OrderBuilderCompletionData,
  OrderBuilderMode,
  OrderBuilderSection,
} from '@/components/sales/order-builder/types'
import { formatCurrency } from '@/components/sales/order-builder/utils'

export type RepresentativeOrderBuilderInitialDraft = {
  quoteId?: string | null
  sourceVisitId?: string | null
  items?: DraftItem[]
  notes?: string
  selectedPriceTableId?: string | null
  selectedAddressId?: string | null
  discountType?: DiscountType
  discountValue?: string
  surchargeValue?: string
  negotiationReason?: string
  selectedPaymentMethodId?: string | null
  selectedPaymentId?: string | null
  orderType?: OrderType
}

export function RepresentativeOrderBuilder({
  mode,
  initialCustomerId,
  initialDraft,
  customers,
  products,
  categories,
  priceTables,
  customerTypes,
}: {
  mode: OrderBuilderMode
  initialCustomerId?: string
  initialDraft?: RepresentativeOrderBuilderInitialDraft
  customers: BuilderCustomer[]
  products: BuilderProduct[]
  categories: Category[]
  priceTables: PriceTable[]
  customerTypes: CustomerType[]
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialDraft?.notes || '')
  const [orderType, setOrderType] = useState<OrderType>(initialDraft?.orderType || 'PRE_VENDA')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerSearchActive, setIsCustomerSearchActive] = useState(false)
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)
  const [previewCustomer, setPreviewCustomer] = useState<BuilderCustomer | null>(null)
  const [isProductOverlayOpen, setIsProductOverlayOpen] = useState(false)
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<BuilderCustomer | null>(null)
  const [submitting, startSubmitting] = useTransition()
  const [customerSaving, setCustomerSaving] = useState(false)
  const [completionData, setCompletionData] = useState<OrderBuilderCompletionData | null>(null)
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionPdfLoading, setCompletionPdfLoading] = useState(false)
  const [completionWhatsAppLoading, setCompletionWhatsAppLoading] = useState(false)
  const [completionShareLoading, setCompletionShareLoading] = useState(false)
  const [sourceVisitId, setSourceVisitId] = useState(initialDraft?.sourceVisitId || null)
  const [openSection, setOpenSection] = useState<OrderBuilderSection>(null)

  const {
    selectedStore,
    selectedStoreId,
    selectedAddressId,
    setSelectedAddressId,
    selectedPriceTableId,
    setSelectedPriceTableId,
    items,
    setItems,
    availablePriceTables,
    handleStoreChange,
  } = useOrderDraft({
    customers,
    priceTables,
    initialCustomerId,
    initialItems: initialDraft?.items,
    initialAddressId: initialDraft?.selectedAddressId,
    initialPriceTableId: initialDraft?.selectedPriceTableId,
  })

  const isPreSaleOrder = mode !== 'order' || orderType === 'PRE_VENDA'
  const requiresDeliveryAddress = mode === 'order' && orderType === 'PRE_VENDA'
  const currentAddressTitle = selectedStore?.addresses?.find((address) => address.id === selectedAddressId)?.title
  const hasResolvableAddress = Boolean(selectedAddressId || selectedStore?.addresses?.length)
  const canSubmitCurrentDocument = Boolean(
    selectedStoreId &&
      items.length > 0 &&
      (!requiresDeliveryAddress || hasResolvableAddress)
  )
  const canSubmitQuote = Boolean(selectedStoreId && items.length > 0)

  useEffect(() => {
    if (!sourceVisitId) return
    if (!initialCustomerId) return
    if (!selectedStoreId) return
    if (selectedStoreId !== initialCustomerId) {
      setSourceVisitId(null)
    }
  }, [initialCustomerId, selectedStoreId, sourceVisitId])

  const {
    pricingPending,
    paymentGroups,
    setSelectedPaymentMethodId,
    setSelectedPaymentId,
    effectivePaymentMethodId,
    selectedMethodGroup,
    paymentOptions,
    effectivePaymentId,
    selectedPaymentOption,
  } = usePricingValidation({
    selectedStoreId,
    selectedPriceTableId,
    items,
    setItems,
    initialSelectedPaymentMethodId: initialDraft?.selectedPaymentMethodId,
    initialSelectedPaymentId: initialDraft?.selectedPaymentId,
  })

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const term = customerSearch.trim().toLowerCase()
    if (!term) return true
    return (
      customer.company_name.toLowerCase().includes(term) ||
      Boolean(customer.customer_code && customer.customer_code.toLowerCase().includes(term))
    )
  }), [customerSearch, customers])

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items])
  const {
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
  } = usePaymentSelection({
    subtotal,
    selectedPaymentOption,
    initialDiscountType: initialDraft?.discountType,
    initialDiscountValue: initialDraft?.discountValue,
    initialSurchargeValue: initialDraft?.surchargeValue,
    initialNegotiationReason: initialDraft?.negotiationReason,
  })

  const validationMessages = useMemo<BuilderValidationMessage[]>(() => {
    const messages: BuilderValidationMessage[] = []

    if (!selectedStoreId) {
      messages.push({
        id: 'customer',
        tone: 'warning',
        title: 'Selecione um cliente',
        description: 'O atendimento precisa estar vinculado a um cliente.',
      })
    }

    if (items.length === 0) {
      messages.push({
        id: 'items',
        tone: 'warning',
        title: 'Adicione produtos',
        description: 'Inclua pelo menos um item para salvar o atendimento.',
      })
    }

    if (requiresDeliveryAddress && !hasResolvableAddress) {
      messages.push({
        id: 'address',
        tone: 'warning',
        title: 'Endereco obrigatorio',
        description: 'Pedido pre-venda exige endereco de entrega cadastrado.',
      })
    }

    if (pricingPending) {
      messages.push({
        id: 'pricing',
        tone: 'info',
        title: 'Revalidando precos',
        description: 'Aguarde a atualizacao antes de finalizar.',
      })
    }

    if (messages.length === 0) {
      messages.push({
        id: 'ready',
        tone: 'success',
        title: mode === 'order' ? 'Pedido pronto para finalizar' : 'Orcamento pronto para salvar',
        description: mode === 'order' && orderType === 'PRONTA_ENTREGA'
          ? 'Pronta entrega sera criada sem endereco de entrega.'
          : undefined,
      })
    }

    return messages
  }, [hasResolvableAddress, items.length, mode, orderType, pricingPending, requiresDeliveryAddress, selectedStoreId])

  const openCustomerSheet = () => {
    setIsCustomerSearchActive(false)
    setIsCustomerSheetOpen(true)
  }

  const closeCustomerSheet = () => {
    setIsCustomerSheetOpen(false)
    setCustomerSearch('')
    setIsCustomerSearchActive(false)
    setPreviewCustomer(null)
  }

  const openCustomerForm = (customer: BuilderCustomer | null) => {
    setEditingStore(customer)
    setIsCustomerFormOpen(true)
  }

  const openSelectedCustomerForm = () => {
    if (!selectedStore) return
    openCustomerForm(selectedStore)
  }

  const selectCustomerFromOverlay = (customerId: string) => {
    handleStoreChange(customerId)
    closeCustomerSheet()
  }

  const handleCatalogConfirm = (payload: CatalogOverlayConfirmPayload) => {
    setItems((current) => {
      let updated = [...current]
      payload.forEach((staged) => {
        const cartKey = staged.id
        const existing = updated.find((item) => item.cartKey === cartKey)

        if (existing) {
          updated = updated.map((item) =>
            item.cartKey === cartKey
              ? { ...item, quantity: item.quantity + staged.quantity, unitPrice: staged.unitPrice }
              : item
          )
          return
        }

        updated.push({
          cartKey,
          productId: staged.productId,
          productName: staged.productName,
          variantId: cartKey.split('::')[0],
          fabricName: staged.fabricName,
          colorName: staged.colorName,
          sizeName: staged.sizeName,
          sizeOptionId: cartKey.split('::')[1] === 'legacy' ? null : cartKey.split('::')[1],
          imageUrl: staged.imageUrl,
          quantity: staged.quantity,
          unitPrice: staged.unitPrice,
        })
      })
      return updated
    })
    setIsProductOverlayOpen(false)
    toast.success(`${payload.reduce((sum, item) => sum + item.quantity, 0)} item(ns) adicionados ao pedido!`)
  }

  const handleSaveCustomer = async (data: RepCustomerFormData) => {
    setCustomerSaving(true)
    try {
      const result = editingStore
        ? await updateCustomerAsRepresentativeTx({ id: editingStore.id, ...data })
        : await createCustomerAsRepresentativeTx(data)

      if (result.success) {
        toast.success(editingStore ? 'Cliente atualizado!' : 'Cliente cadastrado e selecionado!')
        if (!editingStore && result.storeId) {
          handleStoreChange(result.storeId)
        }
        setIsCustomerFormOpen(false)
        setEditingStore(null)
        setIsCustomerSheetOpen(false)
        router.refresh()
        return
      }

      toast.error(result.error || 'Erro ao salvar cliente.')
    } catch {
      toast.error('Erro de conexao ao salvar cliente.')
    } finally {
      setCustomerSaving(false)
    }
  }

  const buildCompletionMessage = useCallback((data: OrderBuilderCompletionData) => {
    const paymentDisplay = getOrderPaymentDisplay(data.order)
    const createdAt = new Date(data.order.created_at).toLocaleString('pt-BR')
    const itemLines = data.items.map((item) => (
      `- ${item.product_name} (${item.fabric_name}/${item.color_name}${item.size ? `/${item.size}` : ''})\n  ${item.quantity}x ${formatCurrency(item.unit_price)} = ${formatCurrency(item.subtotal)}`
    )).join('\n')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

    return [
      `Pedido ${data.order.order_number} - ${data.settings?.system_name || 'CDJWE'}`,
      `Data: ${createdAt}`,
      'Status: Em analise',
      `Tipo: ${getOrderTypeLabel(data.order.order_type || 'PRE_VENDA')}`,
      `Entrega: ${getOrderDeliverySummary(data.order.order_type, data.order.shipping_address)}`,
      '',
      'Itens:',
      itemLines || '- Sem itens',
      '',
      `Total: ${formatCurrency(data.order.total)}`,
      paymentDisplay.combinedLabel !== 'A combinar' ? `Pagamento: ${paymentDisplay.combinedLabel}` : null,
      appUrl ? `Ver pedido: ${appUrl}/sales/orders/${data.order.id}` : null,
    ].filter(Boolean).join('\n')
  }, [])

  const openCompletionWhatsApp = useCallback((data: OrderBuilderCompletionData) => {
    const message = buildCompletionMessage(data)
    const waBase = getWhatsAppLink(data.settings?.whatsapp)
    const url = waBase
      ? `${waBase}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }, [buildCompletionMessage])

  const handleCompletionDownloadPdf = useCallback(async () => {
    if (!completionData) return false
    setCompletionPdfLoading(true)
    try {
      await generateOrderReceiptPDF(completionData.order, completionData.items, completionData.settings)
      return true
    } catch {
      toast.error('Nao foi possivel gerar o PDF do pedido.')
      return false
    } finally {
      setCompletionPdfLoading(false)
    }
  }, [completionData])

  const handleCompletionWhatsApp = useCallback(async () => {
    if (!completionData) return
    setCompletionWhatsAppLoading(true)
    try {
      openCompletionWhatsApp(completionData)
    } finally {
      setCompletionWhatsAppLoading(false)
    }
  }, [completionData, openCompletionWhatsApp])

  const handleCompletionPrintAndWhatsApp = useCallback(async () => {
    if (!completionData) return
    const pdfOk = await handleCompletionDownloadPdf()
    if (!pdfOk) return
    openCompletionWhatsApp(completionData)
    toast.success('PDF gerado. Agora finalize o envio no WhatsApp.')
  }, [completionData, handleCompletionDownloadPdf, openCompletionWhatsApp])

  const handleCompletionShare = useCallback(async () => {
    if (!completionData) return
    const message = buildCompletionMessage(completionData)
    setCompletionShareLoading(true)
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Pedido ${completionData.order.order_number}`,
          text: message,
        })
        return
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message)
        toast.success('Resumo do pedido copiado para compartilhamento.')
        return
      }

      toast.info('Compartilhamento indisponivel neste navegador.')
    } catch {
      // Native share can be cancelled by the user.
    } finally {
      setCompletionShareLoading(false)
    }
  }, [buildCompletionMessage, completionData])

  const handleSubmit = (target: OrderBuilderMode) => {
    if (!selectedStoreId) {
      toast.error('Selecione um cliente.')
      return
    }
    if (items.length === 0) {
      toast.error('Adicione pelo menos um item.')
      return
    }
    if (pricingPending) {
      toast.info('Aguarde a revalidacao de precos antes de finalizar.')
      return
    }
    if (target === 'order' && orderType === 'PRE_VENDA' && !hasResolvableAddress) {
      toast.error('Pedido pre-venda exige endereco de entrega cadastrado para o cliente.')
      return
    }

    startSubmitting(async () => {
      try {
        const payload = {
          quoteId: target === 'quote' ? initialDraft?.quoteId || null : null,
          sourceVisitId,
          orderType: target === 'order' ? orderType : 'PRE_VENDA',
          storeId: selectedStoreId,
          priceTableId: selectedPriceTableId || null,
          selectedPaymentId: effectivePaymentId || null,
          isTableRule: Boolean(selectedPaymentOption?.isTableRule),
          selectedAddressId: target === 'order' && orderType === 'PRONTA_ENTREGA' ? null : selectedAddressId || null,
          notes,
          negotiationDiscountType: discountType === 'none' ? null : discountType,
          negotiationDiscountValue: Number(discountValue || 0),
          negotiationSurchargeAmount: Number(surchargeValue || 0),
          negotiationReason,
          items,
        }

        const response = target === 'order'
          ? await createRepresentativeOrderAction(payload)
          : await saveRepresentativeQuoteAction(payload)

        if (!response.success) {
          toast.error(response.error || 'Falha ao salvar.')
          return
        }

        if (target === 'quote') {
          router.push(`/sales/quotes/${response.quoteId}`)
          return
        }

        const orderId = response.orderId
        if (!orderId) {
          toast.error('Pedido criado, mas nao foi possivel identificar o pedido para finalizacao.')
          router.push('/sales/orders')
          return
        }

        const isMobileLikeViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches
        if (!isMobileLikeViewport) {
          router.push(`/sales/orders/${orderId}`)
          return
        }

        setCompletionLoading(true)
        setCompletionData(null)
        const completionResponse = await getRepresentativeOrderCompletionData(orderId)

        if (!completionResponse.success) {
          toast.error(completionResponse.error || 'Pedido criado, mas nao foi possivel carregar a finalizacao.')
          router.push(`/sales/orders/${orderId}`)
          return
        }

        setCompletionData({
          order: completionResponse.order,
          items: completionResponse.items,
          settings: completionResponse.settings,
        })
        toast.success('Pedido finalizado com sucesso.')
      } catch {
        toast.error('Falha inesperada ao finalizar o atendimento.')
      } finally {
        setCompletionLoading(false)
      }
    })
  }

  return (
    <>
      <MobileOrderBuilder
        mode={mode}
        selectedStore={selectedStore}
        selectedStoreId={selectedStoreId}
        availablePriceTables={availablePriceTables}
        selectedPriceTableId={selectedPriceTableId}
        onPriceTableChange={setSelectedPriceTableId}
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        isPreSaleOrder={isPreSaleOrder}
        selectedAddressId={selectedAddressId}
        onAddressChange={setSelectedAddressId}
        currentAddressTitle={currentAddressTitle}
        requiresDeliveryAddress={requiresDeliveryAddress}
        hasResolvableAddress={hasResolvableAddress}
        items={items}
        setItems={setItems}
        pricingPending={pricingPending}
        openSection={openSection}
        onOpenSectionChange={setOpenSection}
        discountType={discountType}
        discountValue={discountValue}
        surchargeValue={surchargeValue}
        negotiationReason={negotiationReason}
        onDiscountTypeChange={setDiscountType}
        onDiscountValueChange={setDiscountValue}
        onSurchargeValueChange={setSurchargeValue}
        onNegotiationReasonChange={setNegotiationReason}
        paymentGroups={paymentGroups}
        effectivePaymentMethodId={effectivePaymentMethodId}
        selectedMethodGroup={selectedMethodGroup}
        paymentOptions={paymentOptions}
        effectivePaymentId={effectivePaymentId}
        selectedPaymentOption={selectedPaymentOption}
        onPaymentMethodChange={setSelectedPaymentMethodId}
        onPaymentConditionChange={setSelectedPaymentId}
        notes={notes}
        onNotesChange={setNotes}
        total={total}
        submitting={submitting}
        canSubmitCurrentDocument={canSubmitCurrentDocument}
        validationMessages={validationMessages}
        onOpenCustomerSheet={openCustomerSheet}
        onEditSelectedStore={openSelectedCustomerForm}
        onOpenProducts={() => setIsProductOverlayOpen(true)}
        onSubmit={() => handleSubmit(mode)}
      />

      <DesktopOrderBuilder
        mode={mode}
        selectedStore={selectedStore}
        selectedStoreId={selectedStoreId}
        availablePriceTables={availablePriceTables}
        selectedPriceTableId={selectedPriceTableId}
        onPriceTableChange={setSelectedPriceTableId}
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        isPreSaleOrder={isPreSaleOrder}
        selectedAddressId={selectedAddressId}
        onAddressChange={setSelectedAddressId}
        currentAddressTitle={currentAddressTitle}
        requiresDeliveryAddress={requiresDeliveryAddress}
        hasResolvableAddress={hasResolvableAddress}
        items={items}
        setItems={setItems}
        pricingPending={pricingPending}
        discountType={discountType}
        discountValue={discountValue}
        surchargeValue={surchargeValue}
        negotiationReason={negotiationReason}
        onDiscountTypeChange={setDiscountType}
        onDiscountValueChange={setDiscountValue}
        onSurchargeValueChange={setSurchargeValue}
        onNegotiationReasonChange={setNegotiationReason}
        paymentGroups={paymentGroups}
        effectivePaymentMethodId={effectivePaymentMethodId}
        selectedMethodGroup={selectedMethodGroup}
        paymentOptions={paymentOptions}
        effectivePaymentId={effectivePaymentId}
        selectedPaymentOption={selectedPaymentOption}
        onPaymentMethodChange={setSelectedPaymentMethodId}
        onPaymentConditionChange={setSelectedPaymentId}
        notes={notes}
        onNotesChange={setNotes}
        subtotal={subtotal}
        negotiation={negotiation}
        paymentDiscountAmount={paymentDiscountAmount}
        paymentSurchargeAmount={paymentSurchargeAmount}
        total={total}
        submitting={submitting}
        canSubmitCurrentDocument={canSubmitCurrentDocument}
        canSubmitQuote={canSubmitQuote}
        validationMessages={validationMessages}
        onOpenCustomerSheet={openCustomerSheet}
        onEditSelectedStore={openSelectedCustomerForm}
        onOpenProducts={() => setIsProductOverlayOpen(true)}
        onSubmitOrder={() => handleSubmit('order')}
        onSubmitQuote={() => handleSubmit('quote')}
      />

      {mode === 'order' ? (
        <OrderCompletionOverlay
          loading={completionLoading}
          data={completionData}
          pdfLoading={completionPdfLoading}
          whatsAppLoading={completionWhatsAppLoading}
          shareLoading={completionShareLoading}
          onShare={handleCompletionShare}
          onWhatsApp={handleCompletionWhatsApp}
          onDownloadPdf={handleCompletionDownloadPdf}
          onPrintAndWhatsApp={handleCompletionPrintAndWhatsApp}
          onNewForCustomer={() => {
            if (!completionData) return
            setCompletionData(null)
            router.push(`/sales/orders/new?customer=${completionData.order.store_id}`)
          }}
          onViewOrder={() => {
            if (!completionData) return
            setCompletionData(null)
            router.push(`/sales/orders/${completionData.order.id}`)
          }}
          onBackDashboard={() => {
            setCompletionData(null)
            router.push('/sales/dashboard')
          }}
        />
      ) : null}

      {isCustomerSheetOpen ? (
        <CustomerSelectionOverlay
          previewCustomer={previewCustomer}
          customers={filteredCustomers}
          selectedStoreId={selectedStoreId}
          customerSearch={customerSearch}
          isCustomerSearchActive={isCustomerSearchActive}
          onCustomerSearchChange={setCustomerSearch}
          onCustomerSearchActiveChange={setIsCustomerSearchActive}
          onPreviewCustomerChange={setPreviewCustomer}
          onClose={closeCustomerSheet}
          onCreateCustomer={() => openCustomerForm(null)}
          onEditCustomer={openCustomerForm}
          onSelectCustomer={selectCustomerFromOverlay}
        />
      ) : null}

      {isCustomerFormOpen ? (
        <div className="fixed inset-0 z-[100] bg-background">
          <RepresentativeCustomerForm
            onClose={() => {
              setIsCustomerFormOpen(false)
              setEditingStore(null)
            }}
            onSave={handleSaveCustomer}
            customerTypes={customerTypes}
            saving={customerSaving}
            initialData={editingStore ?? undefined}
          />
        </div>
      ) : null}

      {isProductOverlayOpen ? (
        <RepresentativeProductCatalogOverlay
          products={products}
          categories={categories}
          onClose={() => setIsProductOverlayOpen(false)}
          onConfirm={handleCatalogConfirm}
        />
      ) : null}
    </>
  )
}
