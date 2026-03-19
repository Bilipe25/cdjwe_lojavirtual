'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronRight, FileText, Loader2, Minus, Package, Plus, Search, ShoppingBag, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { calculateProductPrice } from '@/lib/pricing/calculate-product-price'
import type {
  Category,
  PaymentMethod,
  PaymentMethodCondition,
  PriceTable,
  PriceTablePaymentRule,
  Product,
  ProductSizeOption,
  Store,
  StoreAddress,
} from '@/lib/types'
import {
  createRepresentativeOrderAction,
  getRepresentativePaymentOptions,
  getRepresentativeProductConfiguratorData,
  saveRepresentativeQuoteAction,
  validateRepresentativeDraftPricingAction,
} from '@/app/sales/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import type { PriceSnapshot } from '@/lib/pricing/server-pricing'
import { cn } from '@/lib/utils'

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

type ProductConfiguratorData = {
  product: Product & { images?: { url: string; is_primary: boolean }[]; size_options?: ProductSizeOption[] }
  variants: Array<{
    id: string; fabric_id: string; fabric_color_id: string; price_override: number | null; image_url: string | null
    fabric?: { id: string; name: string; price_modifier: number | null } | null
    fabric_color?: { id: string; name: string } | null
  }>
  fabrics: Array<{ id: string; name: string; colors: Array<{ id: string; name: string }> }>
  priceTableContext: { discountPercentage: number; overrides: Record<string, number> }
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function buildCartKey(variantId: string, sizeOptionId: string | null) {
  return `${variantId}::${sizeOptionId || 'legacy'}`
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

function getPrimaryImage(product: BuilderProduct) {
  return product.images?.find((img) => img.is_primary)?.url || product.images?.[0]?.url || null
}

function getDefaultAddressId(store: BuilderCustomer | null) {
  return store?.addresses?.find((a) => a.is_main)?.id || store?.addresses?.[0]?.id || ''
}

function getDefaultPriceTableId(store: BuilderCustomer | null, fallbackTables: PriceTable[]) {
  return (store?.assigned_price_tables?.[0] || fallbackTables[0])?.id || ''
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

export function RepresentativeOrderBuilder({
  mode,
  initialCustomerId,
  customers,
  products,
  categories,
  priceTables,
}: {
  mode: 'order' | 'quote'
  initialCustomerId?: string
  customers: BuilderCustomer[]
  products: BuilderProduct[]
  categories: Category[]
  priceTables: PriceTable[]
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
  const [productSearch, setProductSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)
  const [isProductSheetOpen, setIsProductSheetOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [paymentGroups, setPaymentGroups] = useState<PaymentMethodGroup[]>([])
  const [pricingPending, setPricingPending] = useState(false)
  const [dialogProductId, setDialogProductId] = useState<string | null>(null)
  const [configData, setConfigData] = useState<ProductConfiguratorData | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [selectedSizeOptionId, setSelectedSizeOptionId] = useState('')
  const [selectedFabricId, setSelectedFabricId] = useState('')
  const [selectedColorId, setSelectedColorId] = useState('')
  const [dialogQuantity, setDialogQuantity] = useState(1)
  const [submitting, startSubmitting] = useTransition()

  /* ─── Mobile section visibility ─── */
  const [openSection, setOpenSection] = useState<'customer' | 'products' | 'negotiation' | 'payment' | 'notes' | null>(null)

  const selectedStore = useMemo(() => customers.find((c) => c.id === selectedStoreId) || null, [customers, selectedStoreId])
  const availablePriceTables = useMemo(() => selectedStore?.assigned_price_tables?.length ? selectedStore.assigned_price_tables : priceTables, [priceTables, selectedStore])
  
  const filteredCustomers = useMemo(() => customers.filter((c) => {
    const term = customerSearch.trim().toLowerCase()
    if (!term) return true
    return c.company_name.toLowerCase().includes(term) || (c.customer_code && c.customer_code.toLowerCase().includes(term))
  }), [customers, customerSearch])

  const filteredProducts = useMemo(() => products.filter((p) => {
    const term = productSearch.trim().toLowerCase()
    const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.category?.name?.toLowerCase().includes(term)
    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId
    return matchesSearch && matchesCategory
  }), [products, productSearch, selectedCategoryId])
  const pricingSignature = useMemo(() => JSON.stringify(items.map((i) => [i.variantId, i.sizeOptionId, i.quantity])), [items])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draftItems = useMemo(() => items, [pricingSignature])

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
    let cancelled = false
    const revalidate = async () => {
      if (!selectedStoreId || draftItems.length === 0) { setPaymentGroups([]); setSelectedPaymentMethodId(''); setSelectedPaymentId(''); return }
      setPricingPending(true)
      const pricing = (await validateRepresentativeDraftPricingAction({ storeId: selectedStoreId, priceTableId: selectedPriceTableId || null, lines: draftItems.map((i) => ({ cartKey: i.cartKey, variantId: i.variantId, sizeOptionId: i.sizeOptionId })) })) as PricingValidationResult
      if (cancelled) return
      if ('error' in pricing) { setPricingPending(false); toast.error(pricing.error); return }
      const repricedItems = draftItems.map((i) => { const p = pricing.prices[i.cartKey]; return p ? { ...i, unitPrice: p.unitPrice, sizeName: p.sizeName ?? i.sizeName } : i })
      setItems(repricedItems)
      const subtotal = repricedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      const payments = await getRepresentativePaymentOptions({ storeId: selectedStoreId, subtotal, priceTableId: selectedPriceTableId || null })
      if (cancelled) return
      if ('error' in payments && payments.error) { setPricingPending(false); toast.error(payments.error); return }
      setPaymentGroups((payments.paymentMethods || []) as PaymentMethodGroup[])
      setPricingPending(false)
    }
    void revalidate()
    return () => { cancelled = true }
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

  /* ─── Product configurator ─── */
  useEffect(() => {
    let cancelled = false
    const loadConfig = async () => {
      if (!dialogProductId || !selectedStoreId) { setConfigData(null); return }
      setConfigLoading(true)
      const result = await getRepresentativeProductConfiguratorData({ storeId: selectedStoreId, productId: dialogProductId, priceTableId: selectedPriceTableId || null })
      if (cancelled) return
      if ('error' in result && result.error) { setConfigLoading(false); toast.error(result.error); setConfigData(null); return }
      const data = result as ProductConfiguratorData
      setConfigData(data)
      setSelectedSizeOptionId(data.product.size_options?.find((o) => o.is_default && o.is_active)?.id || data.product.size_options?.find((o) => o.is_active)?.id || '')
      setSelectedFabricId(data.fabrics[0]?.id || '')
      setSelectedColorId(data.fabrics[0]?.colors[0]?.id || '')
      setDialogQuantity(1)
      setConfigLoading(false)
    }
    void loadConfig()
    return () => { cancelled = true }
  }, [dialogProductId, selectedPriceTableId, selectedStoreId])

  const selectedSizeOption = (configData?.product.size_options || []).find((o) => o.id === selectedSizeOptionId) || null
  const selectedVariant = useMemo(() => configData?.variants.find((v) => v.fabric_id === selectedFabricId && v.fabric_color_id === selectedColorId) || null, [configData, selectedColorId, selectedFabricId])
  const previewPrice = useMemo(() => {
    if (!configData || !selectedVariant) return 0
    return calculateProductPrice({ basePrice: configData.product.base_price, fabricModifier: selectedVariant.fabric?.price_modifier ?? 0, variantPriceOverride: selectedVariant.price_override, variantId: selectedVariant.id, sizePriceMode: selectedSizeOption?.price_mode ?? null, sizePriceValue: selectedSizeOption?.price_value ?? null, priceTable: configData.priceTableContext }).finalPrice
  }, [configData, selectedSizeOption, selectedVariant])

  const addConfiguredItem = () => {
    if (!configData || !selectedVariant) { toast.error('Selecione tecido e cor.'); return }
    if (configData.product.has_size_variants && !selectedSizeOption) { toast.error('Selecione um tamanho.'); return }
    const cartKey = buildCartKey(selectedVariant.id, selectedSizeOption?.id || null)
    const nextItem: DraftItem = { cartKey, productId: configData.product.id, productName: configData.product.name, variantId: selectedVariant.id, fabricName: selectedVariant.fabric?.name || 'Tecido', colorName: selectedVariant.fabric_color?.name || 'Cor', sizeName: selectedSizeOption?.name || configData.product.size || null, sizeOptionId: selectedSizeOption?.id || null, imageUrl: selectedVariant.image_url || configData.product.images?.find((i) => i.is_primary)?.url || configData.product.images?.[0]?.url || null, quantity: dialogQuantity, unitPrice: previewPrice }
    setItems((cur) => { const ex = cur.find((i) => i.cartKey === nextItem.cartKey); if (!ex) return [...cur, nextItem]; return cur.map((i) => i.cartKey === nextItem.cartKey ? { ...i, quantity: i.quantity + nextItem.quantity, unitPrice: nextItem.unitPrice } : i) })
    setDialogProductId(null)
    toast.success('Item adicionado.')
  }

  const handleSubmit = (target: 'order' | 'quote') => {
    if (!selectedStoreId) { toast.error('Selecione um cliente.'); return }
    if (items.length === 0) { toast.error('Adicione pelo menos um item.'); return }
    startSubmitting(async () => {
      const payload = { storeId: selectedStoreId, priceTableId: selectedPriceTableId || null, selectedPaymentId: effectivePaymentId || null, isTableRule: Boolean(selectedPaymentOption?.isTableRule), selectedAddressId: selectedAddressId || null, notes, negotiationDiscountType: discountType === 'none' ? null : discountType, negotiationDiscountValue: Number(discountValue || 0), negotiationSurchargeAmount: Number(surchargeValue || 0), negotiationReason, items }
      const response = target === 'order' ? await createRepresentativeOrderAction(payload) : await saveRepresentativeQuoteAction(payload)
      if (!response.success) { toast.error(response.error || 'Falha ao salvar.'); return }
      router.push(target === 'order' ? `/sales/orders/${response.orderId}` : `/sales/quotes/${response.quoteId}`)
    })
  }

  /* ─── Mobile view (list of sections with chevrons) ─── */
  const mobileContent = (
    <div className="flex flex-col min-h-[calc(100dvh-140px)] xl:hidden">
      <div className="flex-1 divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
        {/* Customer */}
        <SectionRow label="Cliente Selecionado" value={selectedStore?.company_name || 'Tocar para selecionar...'} highlight={!selectedStoreId} onClick={() => setIsCustomerSheetOpen(true)} />
        {selectedStoreId && (
          <div className="space-y-3 bg-muted/10 px-4 py-3 border-b border-border/30">
            <Select value={selectedPriceTableId} onValueChange={(v) => setSelectedPriceTableId(v || '')}><SelectTrigger className="h-9 rounded-xl border-border text-sm bg-card shadow-sm"><SelectValue placeholder="Tabela">{availablePriceTables.find(t => t.id === selectedPriceTableId)?.name}</SelectValue></SelectTrigger><SelectContent>{availablePriceTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
            <Select value={selectedAddressId} onValueChange={(v) => setSelectedAddressId(v || '')}><SelectTrigger className="h-9 rounded-xl border-border text-sm bg-card shadow-sm"><SelectValue placeholder="Endereço">{selectedStore?.addresses?.find(a => a.id === selectedAddressId)?.title}</SelectValue></SelectTrigger><SelectContent>{(selectedStore?.addresses || []).map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}</SelectContent></Select>
          </div>
        )}

        {/* Products */}
        <SectionRow label="Itens do Carrinho" value={items.length ? `${items.length} item(ns)` : 'Vazio'} highlight={items.length === 0 && selectedStoreId ? true : false} onClick={() => setIsProductSheetOpen(true)} />
        {items.length > 0 && (
          <div className="bg-muted/10 px-4 py-4 border-b border-border/30">
            <ItemsList items={items} setItems={setItems} pricingPending={pricingPending} />
            <Button onClick={() => setIsProductSheetOpen(true)} variant="outline" className="w-full mt-3 h-10 border-dashed border-border text-primary hover:bg-primary/5 rounded-xl"><Plus className="mr-2 h-4 w-4" /> Buscar mais produtos</Button>
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
          disabled={submitting || !selectedStoreId || items.length === 0}
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
          <div className="border-b border-border/30 px-4 py-3 flex items-center justify-between"><h2 className="text-sm font-semibold font-heading text-foreground">1. Cliente e contexto</h2>{selectedStoreId && <Button variant="ghost" size="sm" onClick={() => setIsCustomerSheetOpen(true)} className="h-7 text-xs text-primary px-2">Trocar cliente</Button>}</div>
          <div className="p-4">
            {!selectedStoreId ? (
               <div className="rounded-xl p-6 text-center border bg-muted/20">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Nenhum cliente selecionado</p>
                  <Button onClick={() => setIsCustomerSheetOpen(true)} className="gradient-bronze text-white font-semibold rounded-xl h-10 px-6 shadow-md transition hover:opacity-90">Selecionar Cliente</Button>
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
          <div className="border-b border-border/30 px-4 py-3 flex items-center justify-between"><h2 className="text-sm font-semibold font-heading text-foreground">2. Produtos do Pedido</h2><Button size="sm" onClick={() => setIsProductSheetOpen(true)} className="h-8 rounded-lg gradient-navy font-semibold px-4 text-white hover:opacity-90 shadow-sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Buscar Produtos</Button></div>
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
              <Button className="h-10 w-full rounded-xl border-0 text-sm font-bold gradient-bronze text-white hover:opacity-90" disabled={submitting || !selectedStoreId || items.length === 0} onClick={() => handleSubmit('order')}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingBag className="mr-2 h-4 w-4" />Confirmar pedido</>}
              </Button>
            )}
            <Button
              variant={mode === 'quote' ? 'default' : 'outline'}
              className={mode === 'quote' ? 'h-10 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90' : 'h-10 w-full rounded-xl border-border bg-card text-sm text-foreground hover:bg-muted/60'}
              disabled={submitting || !selectedStoreId || items.length === 0}
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

      {/* Modals de Seleção UX Native */}
      <Sheet open={isCustomerSheetOpen} onOpenChange={setIsCustomerSheetOpen}>
        <SheetContent side="bottom" className="h-[90dvh] rounded-t-3xl border-border bg-card p-0 flex flex-col sm:max-w-md sm:mx-auto sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
          <div className="border-b border-border/40 px-6 py-4">
            <SheetHeader className="text-left mb-3"><SheetTitle className="font-heading text-lg">Selecionar Cliente</SheetTitle></SheetHeader>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Buscar por nome corporativo..." className="h-10 rounded-xl border-border pl-10 bg-muted/20" /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredCustomers.length === 0 ? <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div> : filteredCustomers.map(c => (
              <button key={c.id} onClick={() => { handleStoreChange(c.id); setIsCustomerSheetOpen(false) }} className="w-full text-left p-3 rounded-xl border border-border/40 bg-card hover:bg-muted/40 transition flex items-center justify-between">
                <div><p className="font-semibold text-sm">{c.company_name}</p></div>
                {selectedStoreId === c.id && <span className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-md text-[10px] font-bold">Selecionado</span>}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isProductSheetOpen} onOpenChange={setIsProductSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md border-l border-border bg-card p-0 flex flex-col">
          <div className="border-b border-border/40 px-4 py-4 glass z-20">
            <SheetHeader className="text-left mb-3"><SheetTitle className="font-heading text-lg">Catálogo de Produtos</SheetTitle></SheetHeader>
            <div className="flex gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar produto..." className="h-9 rounded-xl border-border pl-10 bg-muted/20 text-sm" /></div>
              <Select value={selectedCategoryId} onValueChange={(v) => setSelectedCategoryId(v || 'all')}><SelectTrigger className="w-[120px] h-9 rounded-xl border-border text-xs"><SelectValue placeholder="Categoria">{selectedCategoryId === 'all' ? 'Todas' : categories.find(c => c.id === selectedCategoryId)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.slice(0, 30).map((product) => (
                <button key={product.id} type="button" onClick={() => { setDialogProductId(product.id) }} className="overflow-hidden rounded-xl border border-border/50 bg-card text-left transition hover:border-primary/50 hover:shadow-md group flex flex-col h-full">
                  <div className="relative h-28 w-full bg-muted/40 shrink-0">{getPrimaryImage(product) ? <Image src={getPrimaryImage(product) || ''} alt={product.name} fill className="object-cover transition-transform group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Package className="h-6 w-6" /></div>}</div>
                  <div className="p-3 flex-1 flex flex-col justify-start">
                    <p className="line-clamp-2 text-xs font-semibold text-foreground leading-tight">{product.name}</p>
                    {product.category?.name && <span className="mt-1.5 inline-flex w-fit rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{product.category.name}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Product configurator dialog */}
      <Dialog open={Boolean(dialogProductId)} onOpenChange={(open) => !open && setDialogProductId(null)}>
        <DialogContent className="rounded-2xl border-border bg-card sm:max-w-2xl">
          <DialogHeader><DialogTitle className="text-sm font-heading">Configurar item</DialogTitle></DialogHeader>
          {configLoading || !configData ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-5 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="relative h-40 overflow-hidden rounded-xl bg-muted/40">{configData.product.images?.find((i) => i.is_primary)?.url ? <Image src={configData.product.images.find((i) => i.is_primary)?.url || ''} alt={configData.product.name} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Package className="h-7 w-7" /></div>}</div>
              <div className="space-y-3">
                <p className="text-sm font-semibold font-heading text-foreground">{configData.product.name}</p>
                {(configData.product.size_options || []).filter((o) => o.is_active).length > 0 && (
                  <div className="space-y-1.5"><Label className="text-xs">Tamanho</Label><div className="flex flex-wrap gap-1.5">{(configData.product.size_options || []).filter((o) => o.is_active).map((o) => (<button key={o.id} type="button" onClick={() => setSelectedSizeOptionId(o.id)} className={cn('rounded-lg border px-2.5 py-1.5 text-xs transition-all', selectedSizeOptionId === o.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground')}>{o.name}</button>))}</div></div>
                )}
                <div className="space-y-1.5"><Label className="text-xs">Tecido</Label><div className="flex flex-wrap gap-1.5">{configData.fabrics.map((f) => (<button key={f.id} type="button" onClick={() => { setSelectedFabricId(f.id); setSelectedColorId(f.colors[0]?.id || '') }} className={cn('rounded-lg border px-2.5 py-1.5 text-xs transition-all', selectedFabricId === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground')}>{f.name}</button>))}</div></div>
                <div className="space-y-1.5"><Label className="text-xs">Cor</Label><div className="flex flex-wrap gap-1.5">{(configData.fabrics.find((f) => f.id === selectedFabricId)?.colors || []).map((c) => (<button key={c.id} type="button" onClick={() => setSelectedColorId(c.id)} className={cn('rounded-lg border px-2.5 py-1.5 text-xs transition-all', selectedColorId === c.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground')}>{c.name}</button>))}</div></div>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Qtd.</Label><Input type="number" min={1} value={dialogQuantity} onChange={(e) => setDialogQuantity(Math.max(1, Number(e.target.value || 1)))} className="h-9 w-20 rounded-xl border-border text-sm" /></div>
                  <div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unitário</p><p className="text-lg font-bold font-heading text-foreground">{formatCurrency(previewPrice)}</p></div>
                </div>
                <Button size="sm" className="h-9 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90" onClick={addConfiguredItem}><Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar item</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
