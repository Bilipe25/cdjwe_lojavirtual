'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, FileDown, FileText, Home, Loader2, Mail, MapPin, MessageCircle, Minus, Package, Pencil, Phone, Plus, Search, Share2, ShoppingBag, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Category,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentMethodCondition,
  PriceTable,
  PriceTablePaymentRule,
  Product,
  Store,
  StoreAddress,
  CustomerType,
  SystemSettings,
} from '@/lib/types'
import {
  createRepresentativeOrderAction,
  getRepresentativePaymentOptions,
  createCustomerAsRepresentativeTx,
  updateCustomerAsRepresentativeTx,
  validateRepresentativeDraftPricingAction,
  saveRepresentativeQuoteAction,
  getRepresentativeOrderCompletionData,
} from '@/app/sales/actions'
import { RepresentativeProductCatalogOverlay, type CatalogOverlayConfirmPayload } from './representative-product-catalog-overlay'
import { RepresentativeCustomerForm, type RepCustomerFormData } from './representative-customer-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type { PriceSnapshot } from '@/lib/pricing/server-pricing'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { getOrderPaymentDisplay } from '@/lib/orders/order-payment-display'
import { cn, getWhatsAppLink } from '@/lib/utils'

type BuilderCustomer = Store & {
  addresses?: StoreAddress[]
  assigned_price_tables?: PriceTable[]
}

type BuilderProduct = Product & {
  images?: { url: string; is_primary: boolean }[]
  category?: Category | null
}

type DraftItem = {
  cartKey: string
  productId: string
  productName: string
  variantId: string
  fabricName: string
  colorName: string
  sizeName: string | null
  sizeOptionId: string | null
  imageUrl: string | null
  quantity: number
  unitPrice: number
}

type PaymentMethodGroup = {
  method: PaymentMethod
  conditions: PaymentMethodCondition[]
  rules: PriceTablePaymentRule[]
}

type PaymentOption = {
  id: string
  label: string
  description: string | null
  discountPercentage: number
  surchargePercentage: number
  isTableRule: boolean
}

type PricingValidationResult =
  | { prices: Record<string, PriceSnapshot>; missingKeys: string[]; missingVariantIds: string[] }
  | { error: string }

type CompletionData = {
  order: Order
  items: OrderItem[]
  settings: SystemSettings | null
}



function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

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
        label: link.payment_condition?.name || 'Condição',
        description: link.payment_condition?.description || group.method.description || null,
        discountPercentage: link.payment_condition?.discount_percentage || 0,
        surchargePercentage: link.payment_condition?.surcharge_percentage || 0,
        isTableRule: false,
      })),
  ]
}

function computeNegotiation(subtotal: number, discountType: 'percent' | 'value' | 'none', discountValue: number, surchargeValue: number) {
  const safeSubtotal = Math.max(0, subtotal)
  const safeDiscount = Math.max(0, discountValue)
  const safeSurcharge = Math.max(0, surchargeValue)
  const discountAmount = discountType === 'percent' ? safeSubtotal * (Math.min(100, safeDiscount) / 100) : discountType === 'value' ? Math.min(safeSubtotal, safeDiscount) : 0
  const discountPercentage = discountType === 'percent' ? Math.min(100, safeDiscount) : 0
  const adjustedSubtotal = Math.max(0, safeSubtotal - discountAmount + safeSurcharge)
  return { adjustedSubtotal, discountAmount, discountPercentage, surchargeAmount: safeSurcharge }
}

function getDefaultAddressId(store: BuilderCustomer | null) {
  return store?.addresses?.find((a) => a.is_main)?.id || store?.addresses?.[0]?.id || ''
}

function getDefaultPriceTableId(store: BuilderCustomer | null, fallbackTables: PriceTable[]) {
  return (store?.assigned_price_tables?.[0] || fallbackTables[0])?.id || ''
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

/* ─── Section row (mobile native style — label + chevron) ─── */
function SectionRow({ label, value, highlight, onClick }: { label: string; value?: string; highlight?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 border-b border-border/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/40',
        highlight && 'bg-primary/5'
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {value && <p className={cn('mt-0.5 text-sm font-semibold', highlight ? 'text-primary' : 'text-foreground')}>{value}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function CompletionActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  busy,
  last,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  onClick: () => void
  busy?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(busy)}
      className={cn(
        'group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60',
        !last && 'border-b border-border/40'
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Icon className="h-5 w-5 text-primary" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  )
}

export function RepresentativeOrderBuilder({
  mode,
  initialCustomerId,
  customers,
  products,
  categories,
  priceTables,
  customerTypes,
}: {
  mode: 'order' | 'quote'
  initialCustomerId?: string
  customers: BuilderCustomer[]
  products: BuilderProduct[]
  categories: Category[]
  priceTables: PriceTable[]
  customerTypes: CustomerType[]
}) {
  const router = useRouter()
  const initialStore = customers.find((c) => c.id === initialCustomerId) || null
  const [selectedStoreId, setSelectedStoreId] = useState(initialCustomerId || '')
  const [selectedAddressId, setSelectedAddressId] = useState(() => getDefaultAddressId(initialStore))
  const [selectedPriceTableId, setSelectedPriceTableId] = useState(() => getDefaultPriceTableId(initialStore, priceTables))
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('')
  const [selectedPaymentId, setSelectedPaymentId] = useState('')
  const [notes, setNotes] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'value' | 'none'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [surchargeValue, setSurchargeValue] = useState('')
  const [negotiationReason, setNegotiationReason] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerSearchActive, setIsCustomerSearchActive] = useState(false)
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)
  const [previewCustomer, setPreviewCustomer] = useState<BuilderCustomer | null>(null)
  const [isProductOverlayOpen, setIsProductOverlayOpen] = useState(false)
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<BuilderCustomer | null>(null)
  const [paymentGroups, setPaymentGroups] = useState<PaymentMethodGroup[]>([])
  const [pricingPending, setPricingPending] = useState(false)
  const [submitting, startSubmitting] = useTransition()
  const [customerSaving, setCustomerSaving] = useState(false)
  const [completionData, setCompletionData] = useState<CompletionData | null>(null)
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionPdfLoading, setCompletionPdfLoading] = useState(false)
  const [completionWhatsAppLoading, setCompletionWhatsAppLoading] = useState(false)
  const [completionShareLoading, setCompletionShareLoading] = useState(false)

  /* ─── Mobile section visibility ─── */
  const [openSection, setOpenSection] = useState<'customer' | 'products' | 'negotiation' | 'payment' | 'notes' | null>(null)
  const revalidationSequenceRef = useRef(0)

  const selectedStore = useMemo(() => customers.find((c) => c.id === selectedStoreId) || null, [customers, selectedStoreId])
  const availablePriceTables = useMemo(() => selectedStore?.assigned_price_tables?.length ? selectedStore.assigned_price_tables : priceTables, [priceTables, selectedStore])
  
  const filteredCustomers = useMemo(() => customers.filter((c) => {
    const term = customerSearch.trim().toLowerCase()
    if (!term) return true
    return c.company_name.toLowerCase().includes(term) || (c.customer_code && c.customer_code.toLowerCase().includes(term))
  }), [customers, customerSearch])

  const pricingSignature = useMemo(() => JSON.stringify(items.map((i) => [i.variantId, i.sizeOptionId, i.quantity])), [items])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draftItems = useMemo(() => items, [pricingSignature])

  const openCustomerSheet = () => {
    setIsCustomerSearchActive(false)
    setIsCustomerSheetOpen(true)
  }

  const handleStoreChange = (nextStoreId: string) => {
    const nextStore = customers.find((c) => c.id === nextStoreId) || null
    setSelectedStoreId(nextStoreId)
    setSelectedAddressId(getDefaultAddressId(nextStore))
    setSelectedPriceTableId(getDefaultPriceTableId(nextStore, priceTables))
    setSelectedPaymentMethodId('')
    setSelectedPaymentId('')
  }

    /* ─── Pricing revalidation ─── */
  useEffect(() => {
    if (!selectedStoreId || draftItems.length === 0) {
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
          lines: draftItems.map((item) => ({
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

        const repricedItems = draftItems.map((item) => {
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
        toast.error('Não foi possível revalidar preços e pagamentos.')
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
  }, [draftItems, pricingSignature, selectedPriceTableId, selectedStoreId])

  const effectivePaymentMethodId = paymentGroups.some((g) => g.method.id === selectedPaymentMethodId) ? selectedPaymentMethodId : paymentGroups[0]?.method.id || ''
  const selectedMethodGroup = useMemo(() => paymentGroups.find((g) => g.method.id === effectivePaymentMethodId) || null, [effectivePaymentMethodId, paymentGroups])
  const paymentOptions = useMemo(() => buildPaymentOptions(selectedMethodGroup), [selectedMethodGroup])
  const effectivePaymentId = paymentOptions.some((o) => o.id === selectedPaymentId) ? selectedPaymentId : paymentOptions[0]?.id || ''
  const selectedPaymentOption = paymentOptions.find((o) => o.id === effectivePaymentId) || null

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [items])
  const negotiation = useMemo(() => computeNegotiation(subtotal, discountType, Number(discountValue || 0), Number(surchargeValue || 0)), [discountType, discountValue, subtotal, surchargeValue])
  const paymentDiscountAmount = negotiation.adjustedSubtotal * ((selectedPaymentOption?.discountPercentage || 0) / 100)
  const afterPaymentDiscount = Math.max(0, negotiation.adjustedSubtotal - paymentDiscountAmount)
  const paymentSurchargeAmount = afterPaymentDiscount * ((selectedPaymentOption?.surchargePercentage || 0) / 100)
  const total = Math.max(0, afterPaymentDiscount + paymentSurchargeAmount)

  const handleCatalogConfirm = (payload: CatalogOverlayConfirmPayload) => {
    setItems((cur) => {
      let updated = [...cur]
      payload.forEach((staged) => {
        const cartKey = staged.id
        const existing = updated.find((i) => i.cartKey === cartKey)
        if (existing) {
          updated = updated.map((i) =>
            i.cartKey === cartKey ? { ...i, quantity: i.quantity + staged.quantity, unitPrice: staged.unitPrice } : i
          )
        } else {
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
        }
      })
      return updated
    })
    setIsProductOverlayOpen(false)
    toast.success(`${payload.reduce((s, i) => s + i.quantity, 0)} item(ns) adicionados ao pedido!`)
  }

  const handleSaveCustomer = async (data: RepCustomerFormData) => {
    setCustomerSaving(true)
    try {
      const result = editingStore 
        ? await updateCustomerAsRepresentativeTx({ id: editingStore.id, ...data }) 
        : await createCustomerAsRepresentativeTx(data)
      
      if (result.success) {
        toast.success(editingStore ? 'Cliente atualizado!' : 'Cliente cadastrado e selecionado!')
        // Ideally we should re-fetch customers here, but for now we can rely on router refresh
        // or the user manually refreshing. However, to select it immediately:
        if (!editingStore && result.storeId) {
          handleStoreChange(result.storeId)
        }
        setIsCustomerFormOpen(false)
        setEditingStore(null)
        setIsCustomerSheetOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Erro ao salvar cliente.')
      }
    } catch {
      toast.error('Erro de conexão ao salvar cliente.')
    } finally {
      setCustomerSaving(false)
    }
  }

  const buildCompletionMessage = useCallback((data: CompletionData) => {
    const paymentDisplay = getOrderPaymentDisplay(data.order)
    const createdAt = new Date(data.order.created_at).toLocaleString('pt-BR')
    const itemLines = data.items.map((item) => (
      `- ${item.product_name} (${item.fabric_name}/${item.color_name}${item.size ? `/${item.size}` : ''})\n  ${item.quantity}x ${formatCurrency(item.unit_price)} = ${formatCurrency(item.subtotal)}`
    )).join('\n')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

    return [
      `Pedido ${data.order.order_number} - ${data.settings?.system_name || 'CDJWE'}`,
      `Data: ${createdAt}`,
      `Status: Em analise`,
      '',
      'Itens:',
      itemLines || '- Sem itens',
      '',
      `Total: ${formatCurrency(data.order.total)}`,
      paymentDisplay.combinedLabel !== 'A combinar' ? `Pagamento: ${paymentDisplay.combinedLabel}` : null,
      appUrl ? `Ver pedido: ${appUrl}/sales/orders/${data.order.id}` : null,
    ].filter(Boolean).join('\n')
  }, [])

  const openCompletionWhatsApp = useCallback((data: CompletionData) => {
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
      // User may cancel native share; no need to show an error toast.
    } finally {
      setCompletionShareLoading(false)
    }
  }, [buildCompletionMessage, completionData])

  const handleSubmit = (target: 'order' | 'quote') => {
    if (!selectedStoreId) { toast.error('Selecione um cliente.'); return }
    if (items.length === 0) { toast.error('Adicione pelo menos um item.'); return }
    if (pricingPending) { toast.info('Aguarde a revalidacao de precos antes de finalizar.'); return }

    startSubmitting(async () => {
      try {
        const payload = {
          storeId: selectedStoreId,
          priceTableId: selectedPriceTableId || null,
          selectedPaymentId: effectivePaymentId || null,
          isTableRule: Boolean(selectedPaymentOption?.isTableRule),
          selectedAddressId: selectedAddressId || null,
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

  /* ─── Mobile view (list of sections with chevrons) ─── */
  const mobileContent = (
    <div className="flex flex-col min-h-[calc(100dvh-140px)] xl:hidden">
      <div className="flex-1 divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
        {/* Customer */}
        <SectionRow label="Cliente Selecionado" value={selectedStore?.company_name || 'Tocar para selecionar...'} highlight={!selectedStoreId} onClick={openCustomerSheet} />
        {selectedStoreId && (
          <div className="space-y-3 bg-muted/10 px-4 py-3 border-b border-border/30">
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={selectedPriceTableId} onValueChange={(v) => setSelectedPriceTableId(v || '')}>
                  <SelectTrigger className="h-9 rounded-xl border-border text-sm bg-card shadow-sm">
                    <SelectValue placeholder="Tabela">{availablePriceTables.find(t => t.id === selectedPriceTableId)?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>{availablePriceTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setEditingStore(selectedStore); setIsCustomerFormOpen(true) }} className="h-9 rounded-xl border-border bg-card text-primary font-semibold">Editar</Button>
            </div>
            <Select value={selectedAddressId} onValueChange={(v) => setSelectedAddressId(v || '')}><SelectTrigger className="h-9 rounded-xl border-border text-sm bg-card shadow-sm"><SelectValue placeholder="Endereço">{selectedStore?.addresses?.find(a => a.id === selectedAddressId)?.title}</SelectValue></SelectTrigger><SelectContent>{(selectedStore?.addresses || []).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}</SelectContent></Select>
          </div>
        )}

        {/* Products */}
        <SectionRow label="Itens do Carrinho" value={items.length ? `${items.length} item(ns)` : 'Vazio'} highlight={items.length === 0 && selectedStoreId ? true : false} onClick={() => setIsProductOverlayOpen(true)} />
        {items.length > 0 && (
          <div className="bg-muted/10 px-4 py-4 border-b border-border/30">
            <ItemsList items={items} setItems={setItems} pricingPending={pricingPending} />
            <Button onClick={() => setIsProductOverlayOpen(true)} variant="outline" className="w-full mt-3 h-10 border-dashed border-border text-primary hover:bg-primary/5 rounded-xl"><Plus className="mr-2 h-4 w-4" /> Buscar mais produtos</Button>
          </div>
        )}

        {/* Negotiation */}
        <SectionRow
          label="Negociação"
          value={discountType !== 'none' ? `${discountType === 'percent' ? `${discountValue}%` : formatCurrency(Number(discountValue || 0))} desc.` : undefined}
          onClick={() => setOpenSection(openSection === 'negotiation' ? null : 'negotiation')}
        />
        {openSection === 'negotiation' && (
          <div className="grid gap-3 bg-muted/20 px-4 py-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Tipo desconto</Label><Select value={discountType} onValueChange={(v) => setDiscountType((v || 'none') as typeof discountType)}>
              <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                <SelectValue>
                  {discountType === 'none' ? 'Sem desconto' : discountType === 'percent' ? 'Percentual' : 'Valor'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent><SelectItem value="none">Sem desconto</SelectItem><SelectItem value="percent">Percentual</SelectItem><SelectItem value="value">Valor</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">{discountType === 'percent' ? '% desc.' : 'Valor desc.'}</Label><Input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="h-9 rounded-xl border-border text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Acréscimo</Label><Input value={surchargeValue} onChange={(e) => setSurchargeValue(e.target.value)} className="h-9 rounded-xl border-border text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Motivo</Label><Input value={negotiationReason} onChange={(e) => setNegotiationReason(e.target.value)} className="h-9 rounded-xl border-border text-sm" /></div>
          </div>
        )}

        {/* Payment */}
        <SectionRow
          label="Dados de pagamento"
          value={selectedPaymentOption?.label || 'Selecione'}
          highlight={Boolean(selectedPaymentOption?.discountPercentage)}
          onClick={() => setOpenSection(openSection === 'payment' ? null : 'payment')}
        />
        {openSection === 'payment' && (
          <div className="grid gap-3 bg-muted/20 px-4 py-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Meio</Label><Select value={effectivePaymentMethodId} onValueChange={(v) => { setSelectedPaymentMethodId(v || ''); setSelectedPaymentId('') }}>
              <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                <SelectValue placeholder="Selecione">
                  {selectedMethodGroup?.method.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{paymentGroups.map((g) => <SelectItem key={g.method.id} value={g.method.id}>{g.method.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Condição</Label><Select value={effectivePaymentId} onValueChange={(v) => setSelectedPaymentId(v || '')}>
              <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                <SelectValue placeholder="Selecione">
                  {selectedPaymentOption?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{paymentOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
        )}

        {/* Notes */}
        <SectionRow
          label="Observações"
          value={notes ? notes.substring(0, 40) + (notes.length > 40 ? '...' : '') : undefined}
          onClick={() => setOpenSection(openSection === 'notes' ? null : 'notes')}
        />
        {openSection === 'notes' && (
          <div className="bg-muted/20 px-4 py-4">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px] rounded-xl border-border text-sm" placeholder="Observações do pedido..." />
          </div>
        )}
      </div>

      {/* Fixed bottom: total + CTA */}
      <div className="sticky bottom-[var(--bottom-nav-height)] z-10 border-t border-border/30 bg-card px-4 py-3 shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.06)]">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Total do atendimento</span>
          <span className="text-lg font-bold font-heading text-foreground">{formatCurrency(total)}</span>
        </div>
        <Button
          className="h-12 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90"
          disabled={submitting || pricingPending || !selectedStoreId || items.length === 0}
          onClick={() => handleSubmit(mode)}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'order' ? (
            <><ShoppingBag className="mr-2 h-4 w-4" />CONFIRMAR PEDIDO</>
          ) : (
            <><FileText className="mr-2 h-4 w-4" />SALVAR ORÇAMENTO</>
          )}
        </Button>
      </div>
    </div>
  )

  /* ─── Desktop view (two-column) ─── */
  const desktopContent = (
    <div className="hidden xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5">
      <div className="space-y-5">
        {/* Customer & context */}
        <section className="rounded-2xl border border-border/40 bg-card">
          <div className="border-b border-border/30 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold font-heading text-foreground">1. Cliente e contexto</h2>
            {selectedStoreId && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setEditingStore(selectedStore); setIsCustomerFormOpen(true) }} className="h-7 text-xs text-primary px-2">Editar</Button>
                <Button variant="ghost" size="sm" onClick={openCustomerSheet} className="h-7 text-xs text-primary px-2">Trocar</Button>
              </div>
            )}
          </div>
          <div className="p-4">
            {!selectedStoreId ? (
               <div className="rounded-xl p-6 text-center border bg-muted/20">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Nenhum cliente selecionado</p>
                  <Button onClick={openCustomerSheet} className="gradient-bronze text-white font-semibold rounded-xl h-10 px-6 shadow-md transition hover:opacity-90">Selecionar Cliente</Button>
               </div>
            ) : (
               <div className="grid gap-4 md:grid-cols-2">
                 <div className="space-y-1.5 md:col-span-2"><Label className="text-xs text-muted-foreground">Cliente Vínculado</Label><div className="h-10 px-3 border border-border bg-muted/30 rounded-xl flex items-center cursor-pointer hover:bg-muted/50 transition"><span className="font-semibold text-foreground text-sm">{selectedStore?.company_name}</span></div></div>
                 <div className="space-y-1.5"><Label className="text-xs">Tabela de preço</Label><Select value={selectedPriceTableId} onValueChange={(v) => setSelectedPriceTableId(v || '')}><SelectTrigger className="h-10 rounded-xl border-border text-sm shadow-sm bg-card hover:bg-muted/30 transition"><SelectValue placeholder="Tabela">{availablePriceTables.find(t => t.id === selectedPriceTableId)?.name}</SelectValue></SelectTrigger><SelectContent>{availablePriceTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
                 <div className="space-y-1.5"><Label className="text-xs">Entrega</Label><Select value={selectedAddressId} onValueChange={(v) => setSelectedAddressId(v || '')}><SelectTrigger className="h-10 rounded-xl border-border text-sm shadow-sm bg-card hover:bg-muted/30 transition"><SelectValue placeholder="Endereço">{selectedStore?.addresses?.find(a => a.id === selectedAddressId)?.title}</SelectValue></SelectTrigger><SelectContent>{(selectedStore?.addresses || []).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}</SelectContent></Select></div>
               </div>
            )}
          </div>
        </section>

        {/* Products */}
        <section className={cn("rounded-2xl border bg-card transition-all duration-300", !selectedStoreId ? "opacity-50 pointer-events-none border-border/40" : "border-border/40 shadow-sm")}>
          <div className="border-b border-border/30 px-4 py-3 flex items-center justify-between"><h2 className="text-sm font-semibold font-heading text-foreground">2. Produtos do Pedido</h2><Button size="sm" onClick={() => setIsProductOverlayOpen(true)} className="h-8 rounded-lg gradient-navy font-semibold px-4 text-white hover:opacity-90 shadow-sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Buscar Produtos</Button></div>
          <div className="p-4">
            <ItemsList items={items} setItems={setItems} pricingPending={pricingPending} />
          </div>
        </section>

        {/* Payment & negotiation */}
        <section className="rounded-2xl border border-border/40 bg-card">
          <div className="border-b border-border/30 px-4 py-3"><h2 className="text-sm font-semibold font-heading text-foreground">3. Pagamento</h2></div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Meio</Label><Select value={effectivePaymentMethodId} onValueChange={(v) => { setSelectedPaymentMethodId(v || ''); setSelectedPaymentId('') }}>
              <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                <SelectValue placeholder="Selecione">
                  {selectedMethodGroup?.method.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{paymentGroups.map((g) => <SelectItem key={g.method.id} value={g.method.id}>{g.method.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Condição</Label><Select value={effectivePaymentId} onValueChange={(v) => setSelectedPaymentId(v || '')}>
              <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                <SelectValue placeholder="Selecione">
                  {selectedPaymentOption?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{paymentOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Desconto</Label><Select value={discountType} onValueChange={(v) => setDiscountType((v || 'none') as typeof discountType)}>
              <SelectTrigger className="h-9 rounded-xl border-border text-sm">
                <SelectValue>
                  {discountType === 'none' ? 'Sem desconto' : discountType === 'percent' ? 'Percentual' : 'Valor'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent><SelectItem value="none">Sem desconto</SelectItem><SelectItem value="percent">Percentual</SelectItem><SelectItem value="value">Valor</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">{discountType === 'percent' ? '% desc.' : 'Valor desc.'}</Label><Input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="h-9 rounded-xl border-border text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Acréscimo</Label><Input value={surchargeValue} onChange={(e) => setSurchargeValue(e.target.value)} className="h-9 rounded-xl border-border text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Motivo</Label><Input value={negotiationReason} onChange={(e) => setNegotiationReason(e.target.value)} className="h-9 rounded-xl border-border text-sm" /></div>
            <div className="space-y-1.5 md:col-span-2"><Label className="text-xs">Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px] rounded-xl border-border text-sm" /></div>
          </div>
        </section>
      </div>

      {/* Summary sidebar */}
      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-2xl border border-border/40 bg-card">
          <div className="border-b border-border/30 px-4 py-3"><h2 className="text-sm font-semibold font-heading text-foreground">Resumo</h2></div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span></div>
            {negotiation.discountAmount > 0 && <div className="flex items-center justify-between text-xs text-emerald-700"><span>Desc. negociado</span><span className="font-semibold">- {formatCurrency(negotiation.discountAmount)}</span></div>}
            {negotiation.surchargeAmount > 0 && <div className="flex items-center justify-between text-xs text-amber-700"><span>Acréscimo</span><span className="font-semibold">+ {formatCurrency(negotiation.surchargeAmount)}</span></div>}
            {paymentDiscountAmount > 0 && <div className="flex items-center justify-between text-xs text-emerald-700"><span>Desc. pagamento</span><span className="font-semibold">- {formatCurrency(paymentDiscountAmount)}</span></div>}
            {paymentSurchargeAmount > 0 && <div className="flex items-center justify-between text-xs text-amber-700"><span>Acrésc. pagamento</span><span className="font-semibold">+ {formatCurrency(paymentSurchargeAmount)}</span></div>}
            <div className="rounded-xl gradient-navy px-4 py-3 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Total estimado</p>
              <p className="mt-1 text-2xl font-bold font-heading tracking-tight">{formatCurrency(total)}</p>
              <p className="mt-1 text-xs text-white/60">{selectedPaymentOption?.label || 'Defina pagamento'}</p>
            </div>
            {mode === 'order' && (
              <Button className="h-10 w-full rounded-xl border-0 text-sm font-bold gradient-bronze text-white hover:opacity-90" disabled={submitting || pricingPending || !selectedStoreId || items.length === 0} onClick={() => handleSubmit('order')}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingBag className="mr-2 h-4 w-4" />Confirmar pedido</>}
              </Button>
            )}
            <Button
              variant={mode === 'quote' ? 'default' : 'outline'}
              className={mode === 'quote' ? 'h-10 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90' : 'h-10 w-full rounded-xl border-border bg-card text-sm text-foreground hover:bg-muted/60'}
              disabled={submitting || pricingPending || !selectedStoreId || items.length === 0}
              onClick={() => handleSubmit('quote')}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="mr-2 h-4 w-4" />Salvar orçamento</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {mobileContent}
      {desktopContent}

      {(completionLoading || completionData) && mode === 'order' && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-background">
          {completionLoading || !completionData ? (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="glass-card rounded-2xl border border-border/40 px-6 py-6 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium text-foreground">Preparando finalizacao do pedido...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 gradient-navy px-4 pb-5 pt-4 text-white shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold font-heading">Atendimento finalizado</p>
                    <p className="mt-0.5 text-xs text-white/75">Pedido #{completionData.order.order_number}</p>
                    <p className="mt-1 text-[11px] text-white/70">
                      Total {formatCurrency(completionData.order.total)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
                <div className="glass-card overflow-hidden rounded-2xl border border-border/40">
                  <CompletionActionRow
                    icon={Share2}
                    label="Compartilhar"
                    description="Compartilhe o resumo do pedido"
                    onClick={() => { void handleCompletionShare() }}
                    busy={completionShareLoading}
                  />
                  <CompletionActionRow
                    icon={MessageCircle}
                    label="Enviar por WhatsApp"
                    description="Abrir WhatsApp com mensagem pronta"
                    onClick={() => { void handleCompletionWhatsApp() }}
                    busy={completionWhatsAppLoading}
                  />
                  <CompletionActionRow
                    icon={FileDown}
                    label="Impressao (PDF)"
                    description="Gerar comprovante em PDF"
                    onClick={() => { void handleCompletionDownloadPdf() }}
                    busy={completionPdfLoading}
                  />
                  <CompletionActionRow
                    icon={Copy}
                    label="Imprimir e enviar no WhatsApp"
                    description="Gera o PDF e abre o WhatsApp"
                    onClick={() => { void handleCompletionPrintAndWhatsApp() }}
                    busy={completionPdfLoading || completionWhatsAppLoading}
                  />
                  <CompletionActionRow
                    icon={ShoppingBag}
                    label="Novo atendimento para este cliente"
                    description="Iniciar novo pedido mantendo o cliente"
                    onClick={() => {
                      setCompletionData(null)
                      router.push(`/sales/orders/new?customer=${completionData.order.store_id}`)
                    }}
                  />
                  <CompletionActionRow
                    icon={FileText}
                    label="Ver pedido finalizado"
                    description="Abrir a pagina de detalhes do pedido"
                    onClick={() => {
                      setCompletionData(null)
                      router.push(`/sales/orders/${completionData.order.id}`)
                    }}
                    last
                  />
                </div>
              </div>

              <div className="shrink-0 border-t border-border/40 bg-background/95 p-4 backdrop-blur-sm">
                <Button
                  className="h-12 w-full rounded-xl border-0 text-sm font-bold gradient-bronze text-white hover:opacity-90"
                  onClick={() => {
                    setCompletionData(null)
                    router.push('/sales/dashboard')
                  }}
                >
                  <Home className="mr-2 h-4 w-4" />
                  VOLTAR AO MENU INICIAL
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Customer Selection Fullpage Overlay ─── */}
      {isCustomerSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">

          {/* ─── View: Customer Detail ─── */}
          {previewCustomer ? (
            <>
              {/* Header — navy bar with back + title + edit */}
              <div className="shrink-0 gradient-navy px-4 py-3 text-white flex items-center justify-between h-14">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPreviewCustomer(null)}
                    className="rounded-full p-1.5 hover:bg-white/20 transition-colors"
                    title="Voltar"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <h2 className="text-lg font-bold font-heading">Dados do cliente</h2>
                </div>
                <button
                  onClick={() => { setEditingStore(previewCustomer); setIsCustomerFormOpen(true) }}
                  className="rounded-full p-2 hover:bg-white/20 transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-5 w-5" />
                </button>
              </div>

              {/* Body — customer info */}
              <div className="flex-1 overflow-y-auto overscroll-y-contain bg-background" style={{ WebkitOverflowScrolling: 'touch' }}>
                {/* Company header */}
                <div className="px-5 pt-5 pb-4">
                  <h3 className="text-lg font-bold text-foreground leading-snug">{previewCustomer.company_name}</h3>
                  {previewCustomer.cnpj && <p className="text-sm text-muted-foreground mt-0.5">CNPJ: {previewCustomer.cnpj}</p>}
                  {previewCustomer.state_registration && <p className="text-sm text-muted-foreground">Inscrição Estadual: {previewCustomer.state_registration}</p>}
                  {previewCustomer.customer_code && <p className="text-sm text-muted-foreground">Código: #{previewCustomer.customer_code}</p>}
                </div>

                <Separator />

                {/* Contact rows */}
                {previewCustomer.phone && (
                  <div className="flex items-center gap-4 px-5 py-4 border-b border-border/30">
                    <Phone className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Celular</p>
                      <p className="text-sm font-medium text-foreground">{previewCustomer.phone}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                )}

                {previewCustomer.email && (
                  <div className="flex items-center gap-4 px-5 py-4 border-b border-border/30">
                    <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{previewCustomer.email}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                )}

                {/* Primary address */}
                {(() => {
                  const addr = previewCustomer.addresses?.find(a => a.is_main) || previewCustomer.addresses?.[0]
                  const legacyAddr = !addr && previewCustomer.address
                    ? { address: previewCustomer.address, city: previewCustomer.city, state: previewCustomer.state, zip_code: previewCustomer.zip_code, neighborhood: null as string | null }
                    : null
                  const display = addr || legacyAddr
                  if (!display) return null
                  return (
                    <div className="flex items-start gap-4 px-5 py-4 border-b border-border/30">
                      <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{display.address}</p>
                        {display.neighborhood && <p className="text-sm text-muted-foreground">{display.neighborhood}</p>}
                        <p className="text-sm text-muted-foreground">{[display.city, display.state].filter(Boolean).join(' - ')}</p>
                        {display.zip_code && <p className="text-sm text-muted-foreground">{display.zip_code}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  )
                })()}

                {/* Price tables */}
                {previewCustomer.assigned_price_tables && previewCustomer.assigned_price_tables.length > 0 && (
                  <>
                    <div className="px-5 pt-5 pb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tabelas de preço</p>
                    </div>
                    <div className="px-5 pb-4 flex flex-wrap gap-2">
                      {previewCustomer.assigned_price_tables.map(t => (
                        <Badge key={t.id} variant="outline" className="text-xs border-border">{t.name}</Badge>
                      ))}
                    </div>
                  </>
                )}

                {/* Extra addresses */}
                {previewCustomer.addresses && previewCustomer.addresses.length > 1 && (
                  <>
                    <div className="px-5 pt-3 pb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endereços ({previewCustomer.addresses.length})</p>
                    </div>
                    {previewCustomer.addresses.map(addr => (
                      <div key={addr.id} className="flex items-start gap-4 px-5 py-3 border-b border-border/20">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">{addr.title}{addr.is_main ? ' (Principal)' : ''}</p>
                          <p className="text-xs text-muted-foreground">{addr.address}{addr.number ? `, ${addr.number}` : ''} — {addr.city}/{addr.state}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Fixed CTA */}
              <div className="shrink-0 border-t border-border/40 p-4 bg-card safe-bottom">
                <Button
                  className="h-12 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90"
                  onClick={() => { handleStoreChange(previewCustomer.id); setIsCustomerSheetOpen(false); setPreviewCustomer(null); setCustomerSearch(''); setIsCustomerSearchActive(false) }}
                >
                  SELECIONAR ESTE CLIENTE
                </Button>
              </div>
            </>
          ) : (
            /* ─── View: Customer List ─── */
            <>
              {/* Header Profissional com Busca Animada */}
              <div className="shrink-0 gradient-navy px-4 py-3 text-white flex items-center justify-between relative overflow-hidden h-14">
                <div className={cn("flex items-center gap-3 transition-all duration-300", isCustomerSearchActive ? "opacity-0 -translate-x-10 pointer-events-none" : "opacity-100 translate-x-0")}>
                  <button
                    onClick={() => { setIsCustomerSheetOpen(false); setCustomerSearch(''); setIsCustomerSearchActive(false); setPreviewCustomer(null) }}
                    className="rounded-full p-1.5 hover:bg-white/20 transition-colors"
                    title="Voltar"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <h2 className="text-lg font-bold font-heading">Clientes</h2>
                </div>

                <div className={cn(
                  "absolute inset-y-0 left-0 right-14 px-4 flex items-center transition-all duration-300",
                  isCustomerSearchActive ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10 pointer-events-none"
                )}>
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Buscar por Razão Social..."
                      className="h-10 rounded-xl border-white/20 bg-white/10 text-white placeholder:text-white/40 pl-10 focus:bg-white/20 transition-all border-0 focus-visible:ring-1 focus-visible:ring-white/30"
                      autoFocus={isCustomerSearchActive}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 bg-transparent">
                  <button
                    onClick={() => setIsCustomerSearchActive(!isCustomerSearchActive)}
                    className={cn("rounded-full p-2 transition-colors", isCustomerSearchActive ? "bg-white/20" : "hover:bg-white/20")}
                    title="Buscar"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => { setEditingStore(null); setIsCustomerFormOpen(true) }}
                    className="rounded-full p-2 hover:bg-white/20 transition-colors"
                    title="Novo Cliente"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-y-contain bg-muted/10" style={{ WebkitOverflowScrolling: 'touch' }}>
                {filteredCustomers.length === 0 ? (
                  <div className="flex flex-col h-40 items-center justify-center text-sm text-muted-foreground gap-2">
                    <Users className="h-8 w-8 opacity-20" />
                    <p>Nenhum cliente encontrado.</p>
                  </div>
                ) : filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setPreviewCustomer(c)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-border/30 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="w-1 self-stretch rounded-full bg-emerald-500/60 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">{c.company_name}</p>
                      {c.trade_name && c.trade_name !== c.company_name && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.trade_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {selectedStoreId === c.id && <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[9px] h-5">Atual</Badge>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}



      {isCustomerFormOpen && (
        <div className="fixed inset-0 z-[100] bg-background">
          <RepresentativeCustomerForm
            onClose={() => { setIsCustomerFormOpen(false); setEditingStore(null) }}
            onSave={handleSaveCustomer}
            customerTypes={customerTypes}
            saving={customerSaving}
            initialData={editingStore ?? undefined}
          />
        </div>
      )}

      {isProductOverlayOpen && (
        <RepresentativeProductCatalogOverlay
          products={products}
          categories={categories}
          onClose={() => setIsProductOverlayOpen(false)}
          onConfirm={handleCatalogConfirm}
        />
      )}
    </>
  )
}

/* ─── Shared items list ─── */
function ItemsList({ items, setItems, pricingPending }: { items: DraftItem[]; setItems: React.Dispatch<React.SetStateAction<DraftItem[]>>; pricingPending: boolean }) {
  function formatCurrency(value: number) {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Itens ({items.length})</h3>
        {pricingPending && <span className="text-[10px] text-muted-foreground">Revalidando...</span>}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">Nenhum item adicionado.</div>
      ) : (
        <div className="divide-y divide-border/30 rounded-xl border border-border/40">
          {items.map((item) => (
            <div key={item.cartKey} className="flex items-center gap-3 px-3 py-2.5">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted/40">{item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Package className="h-4 w-4" /></div>}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{item.productName}</p>
                <p className="text-[10px] text-muted-foreground">{item.fabricName} / {item.colorName}{item.sizeName ? ` / ${item.sizeName}` : ''}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-lg border-border" onClick={() => setItems((cur) => cur.map((i) => i.cartKey === item.cartKey ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))}><Minus className="h-3.5 w-3.5" /></Button>
                <span className="min-w-[24px] text-center text-xs font-semibold">{item.quantity}</span>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-lg border-border" onClick={() => setItems((cur) => cur.map((i) => i.cartKey === item.cartKey ? { ...i, quantity: i.quantity + 1 } : i))}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="w-[90px] text-right"><p className="text-xs font-semibold text-foreground">{formatCurrency(item.unitPrice * item.quantity)}</p><p className="text-[10px] text-muted-foreground">{formatCurrency(item.unitPrice)} un.</p></div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setItems((cur) => cur.filter((i) => i.cartKey !== item.cartKey))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
