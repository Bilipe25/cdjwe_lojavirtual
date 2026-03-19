'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { FileText, Loader2, Minus, Package, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  | {
      prices: Record<string, PriceSnapshot>
      missingKeys: string[]
      missingVariantIds: string[]
    }
  | {
      error: string
    }

type ProductConfiguratorData = {
  product: Product & { images?: { url: string; is_primary: boolean }[]; size_options?: ProductSizeOption[] }
  variants: Array<{
    id: string
    fabric_id: string
    fabric_color_id: string
    price_override: number | null
    image_url: string | null
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
        label: link.payment_condition?.name || 'Condicao',
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
  return product.images?.find((image) => image.is_primary)?.url || product.images?.[0]?.url || null
}

function getDefaultAddressId(store: BuilderCustomer | null) {
  return store?.addresses?.find((address) => address.is_main)?.id || store?.addresses?.[0]?.id || ''
}

function getDefaultPriceTableId(store: BuilderCustomer | null, fallbackTables: PriceTable[]) {
  return (store?.assigned_price_tables?.[0] || fallbackTables[0])?.id || ''
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
  const initialStore = customers.find((customer) => customer.id === initialCustomerId) || null
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
  const [search, setSearch] = useState('')
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

  const selectedStore = useMemo(() => customers.find((customer) => customer.id === selectedStoreId) || null, [customers, selectedStoreId])
  const availablePriceTables = useMemo(() => selectedStore?.assigned_price_tables?.length ? selectedStore.assigned_price_tables : priceTables, [priceTables, selectedStore])
  const filteredProducts = useMemo(() => products.filter((product) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || product.name.toLowerCase().includes(term) || product.category?.name?.toLowerCase().includes(term)
    const matchesCategory = selectedCategoryId === 'all' || product.category_id === selectedCategoryId
    return matchesSearch && matchesCategory
  }), [products, search, selectedCategoryId])
  const pricingSignature = useMemo(() => JSON.stringify(items.map((item) => [item.variantId, item.sizeOptionId, item.quantity])), [items])
  // Mantemos um snapshot estrutural para evitar loop de reprecificacao quando apenas o unitPrice muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draftItems = useMemo(() => items, [pricingSignature])

  const handleStoreChange = (nextStoreId: string) => {
    const nextStore = customers.find((customer) => customer.id === nextStoreId) || null
    setSelectedStoreId(nextStoreId)
    setSelectedAddressId(getDefaultAddressId(nextStore))
    setSelectedPriceTableId(getDefaultPriceTableId(nextStore, priceTables))
    setSelectedPaymentMethodId('')
    setSelectedPaymentId('')
  }

  useEffect(() => {
    let cancelled = false

    const revalidate = async () => {
      if (!selectedStoreId || draftItems.length === 0) {
        setPaymentGroups([])
        setSelectedPaymentMethodId('')
        setSelectedPaymentId('')
        return
      }

      setPricingPending(true)
      const pricing = (await validateRepresentativeDraftPricingAction({
        storeId: selectedStoreId,
        priceTableId: selectedPriceTableId || null,
        lines: draftItems.map((item) => ({ cartKey: item.cartKey, variantId: item.variantId, sizeOptionId: item.sizeOptionId })),
      })) as PricingValidationResult

      if (cancelled) return
      if ('error' in pricing) {
        setPricingPending(false)
        toast.error(pricing.error)
        return
      }

      const repricedItems = draftItems.map((item) => {
        const price = pricing.prices[item.cartKey]
        return price ? { ...item, unitPrice: price.unitPrice, sizeName: price.sizeName ?? item.sizeName } : item
      })
      setItems(repricedItems)

      const subtotal = repricedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const payments = await getRepresentativePaymentOptions({ storeId: selectedStoreId, subtotal, priceTableId: selectedPriceTableId || null })
      if (cancelled) return
      if ('error' in payments && payments.error) {
        setPricingPending(false)
        toast.error(payments.error)
        return
      }

      setPaymentGroups((payments.paymentMethods || []) as PaymentMethodGroup[])
      setPricingPending(false)
    }

    void revalidate()
    return () => { cancelled = true }
  }, [draftItems, pricingSignature, selectedPriceTableId, selectedStoreId])

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

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items])
  const negotiation = useMemo(() => computeNegotiation(subtotal, discountType, Number(discountValue || 0), Number(surchargeValue || 0)), [discountType, discountValue, subtotal, surchargeValue])
  const paymentDiscountAmount = negotiation.adjustedSubtotal * ((selectedPaymentOption?.discountPercentage || 0) / 100)
  const afterPaymentDiscount = Math.max(0, negotiation.adjustedSubtotal - paymentDiscountAmount)
  const paymentSurchargeAmount = afterPaymentDiscount * ((selectedPaymentOption?.surchargePercentage || 0) / 100)
  const total = Math.max(0, afterPaymentDiscount + paymentSurchargeAmount)

  useEffect(() => {
    let cancelled = false

    const loadConfig = async () => {
      if (!dialogProductId || !selectedStoreId) {
        setConfigData(null)
        return
      }

      setConfigLoading(true)
      const result = await getRepresentativeProductConfiguratorData({ storeId: selectedStoreId, productId: dialogProductId, priceTableId: selectedPriceTableId || null })
      if (cancelled) return
      if ('error' in result && result.error) {
        setConfigLoading(false)
        toast.error(result.error)
        setConfigData(null)
        return
      }

      const data = result as ProductConfiguratorData
      setConfigData(data)
      setSelectedSizeOptionId(data.product.size_options?.find((option) => option.is_default && option.is_active)?.id || data.product.size_options?.find((option) => option.is_active)?.id || '')
      setSelectedFabricId(data.fabrics[0]?.id || '')
      setSelectedColorId(data.fabrics[0]?.colors[0]?.id || '')
      setDialogQuantity(1)
      setConfigLoading(false)
    }

    void loadConfig()
    return () => { cancelled = true }
  }, [dialogProductId, selectedPriceTableId, selectedStoreId])

  const selectedSizeOption = (configData?.product.size_options || []).find((option) => option.id === selectedSizeOptionId) || null
  const selectedVariant = useMemo(() => configData?.variants.find((variant) => variant.fabric_id === selectedFabricId && variant.fabric_color_id === selectedColorId) || null, [configData, selectedColorId, selectedFabricId])
  const previewPrice = useMemo(() => {
    if (!configData || !selectedVariant) return 0
    return calculateProductPrice({
      basePrice: configData.product.base_price,
      fabricModifier: selectedVariant.fabric?.price_modifier ?? 0,
      variantPriceOverride: selectedVariant.price_override,
      variantId: selectedVariant.id,
      sizePriceMode: selectedSizeOption?.price_mode ?? null,
      sizePriceValue: selectedSizeOption?.price_value ?? null,
      priceTable: configData.priceTableContext,
    }).finalPrice
  }, [configData, selectedSizeOption, selectedVariant])

  const addConfiguredItem = () => {
    if (!configData || !selectedVariant) {
      toast.error('Selecione tecido e cor antes de adicionar.')
      return
    }

    if (configData.product.has_size_variants && !selectedSizeOption) {
      toast.error('Selecione um tamanho para continuar.')
      return
    }

    const cartKey = buildCartKey(selectedVariant.id, selectedSizeOption?.id || null)
    const nextItem: DraftItem = {
      cartKey,
      productId: configData.product.id,
      productName: configData.product.name,
      variantId: selectedVariant.id,
      fabricName: selectedVariant.fabric?.name || 'Tecido',
      colorName: selectedVariant.fabric_color?.name || 'Cor',
      sizeName: selectedSizeOption?.name || configData.product.size || null,
      sizeOptionId: selectedSizeOption?.id || null,
      imageUrl: selectedVariant.image_url || configData.product.images?.find((image) => image.is_primary)?.url || configData.product.images?.[0]?.url || null,
      quantity: dialogQuantity,
      unitPrice: previewPrice,
    }

    setItems((current) => {
      const existing = current.find((item) => item.cartKey === nextItem.cartKey)
      if (!existing) return [...current, nextItem]
      return current.map((item) => item.cartKey === nextItem.cartKey ? { ...item, quantity: item.quantity + nextItem.quantity, unitPrice: nextItem.unitPrice } : item)
    })

    setDialogProductId(null)
    toast.success('Item adicionado ao documento.')
  }

  const handleSubmit = (target: 'order' | 'quote') => {
    if (!selectedStoreId) {
      toast.error('Selecione um cliente antes de continuar.')
      return
    }
    if (items.length === 0) {
      toast.error('Adicione pelo menos um item.')
      return
    }

    startSubmitting(async () => {
      const response = target === 'order'
        ? await createRepresentativeOrderAction({
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
          })
        : await saveRepresentativeQuoteAction({
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
          })

      if (!response.success) {
        toast.error(response.error || 'Falha ao salvar o documento.')
        return
      }

      router.push(target === 'order' ? `/sales/orders/${response.orderId}` : `/sales/quotes/${response.quoteId}`)
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="border-b border-slate-100"><CardTitle>1. Cliente e contexto comercial</CardTitle><p className="text-sm text-slate-500">Defina cliente, tabela e entrega antes de montar os itens.</p></CardHeader>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Cliente</Label>
              <Select value={selectedStoreId} onValueChange={(value) => handleStoreChange(value || '')}>
                <SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.customer_code ? `${customer.customer_code} - ` : ''}{customer.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tabela de preco</Label>
              <Select value={selectedPriceTableId} onValueChange={(value) => setSelectedPriceTableId(value || '')}>
                <SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Tabela" /></SelectTrigger>
                <SelectContent>{availablePriceTables.map((table) => <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entrega</Label>
              <Select value={selectedAddressId} onValueChange={(value) => setSelectedAddressId(value || '')}>
                <SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Endereco" /></SelectTrigger>
                <SelectContent>{(selectedStore?.addresses || []).map((address) => <SelectItem key={address.id} value={address.id}>{address.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {selectedStore && <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:col-span-2"><p className="text-sm font-semibold text-slate-950">{selectedStore.company_name}</p><p className="mt-1 text-xs text-slate-500">{selectedStore.customer_code || selectedStore.cnpj}</p></div>}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="border-b border-slate-100"><CardTitle>2. Produtos e composicao</CardTitle><p className="text-sm text-slate-500">Busque rapido, configure variacoes e monte o documento com agilidade.</p></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" className="rounded-2xl border-slate-200 pl-10" /></div>
              <Select value={selectedCategoryId} onValueChange={(value) => setSelectedCategoryId(value || 'all')}><SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredProducts.slice(0, 18).map((product) => <button key={product.id} type="button" onClick={() => { if (!selectedStoreId) { toast.error('Selecione um cliente antes.') ; return } setDialogProductId(product.id) }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md"><div className="relative h-32 bg-slate-100">{getPrimaryImage(product) ? <Image src={getPrimaryImage(product) || ''} alt={product.name} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><Package className="h-7 w-7" /></div>}</div><div className="space-y-2 p-4"><p className="line-clamp-1 text-sm font-semibold text-slate-950">{product.name}</p>{product.category?.name && <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-[10px] text-slate-600">{product.category.name}</Badge>}</div></button>)}</div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-950">Itens</h3><p className="text-xs text-slate-500">{pricingPending ? 'Revalidando precos do documento.' : 'Ajuste quantidade e remova itens quando necessario.'}</p></div></div>
              {items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">Nenhum item adicionado.</div> : <div className="space-y-3">{items.map((item) => <div key={item.cartKey} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center"><div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-slate-100">{item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><Package className="h-5 w-5" /></div>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-950">{item.productName}</p><p className="mt-1 text-xs text-slate-500">{item.fabricName} / {item.colorName}{item.sizeName ? ` / ${item.sizeName}` : ''}</p></div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-xl border-slate-200" onClick={() => setItems((current) => current.map((currentItem) => currentItem.cartKey === item.cartKey ? { ...currentItem, quantity: Math.max(1, currentItem.quantity - 1) } : currentItem))}><Minus className="h-4 w-4" /></Button><div className="min-w-[28px] text-center text-sm font-semibold text-slate-950">{item.quantity}</div><Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-xl border-slate-200" onClick={() => setItems((current) => current.map((currentItem) => currentItem.cartKey === item.cartKey ? { ...currentItem, quantity: currentItem.quantity + 1 } : currentItem))}><Plus className="h-4 w-4" /></Button></div><div className="w-full md:w-[130px] md:text-right"><p className="text-sm font-semibold text-slate-950">{formatCurrency(item.unitPrice * item.quantity)}</p><p className="mt-1 text-xs text-slate-500">Unit. {formatCurrency(item.unitPrice)}</p></div><Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setItems((current) => current.filter((currentItem) => currentItem.cartKey !== item.cartKey))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="border-b border-slate-100"><CardTitle>3. Pagamento e observacoes</CardTitle><p className="text-sm text-slate-500">Aplique negociacao, pagamento e notas do atendimento presencial.</p></CardHeader>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
            <div className="space-y-2"><Label>Meio</Label><Select value={effectivePaymentMethodId} onValueChange={(value) => { setSelectedPaymentMethodId(value || ''); setSelectedPaymentId('') }}><SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{paymentGroups.map((group) => <SelectItem key={group.method.id} value={group.method.id}>{group.method.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Condicao</Label><Select value={effectivePaymentId} onValueChange={(value) => setSelectedPaymentId(value || '')}><SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{paymentOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Desconto negociado</Label><Select value={discountType} onValueChange={(value) => setDiscountType((value || 'none') as 'percent' | 'value' | 'none')}><SelectTrigger className="rounded-2xl border-slate-200"><SelectValue placeholder="Sem desconto" /></SelectTrigger><SelectContent><SelectItem value="none">Sem desconto</SelectItem><SelectItem value="percent">Percentual</SelectItem><SelectItem value="value">Valor</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>{discountType === 'percent' ? 'Percentual (%)' : 'Valor do desconto'}</Label><Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} className="rounded-2xl border-slate-200" /></div>
            <div className="space-y-2"><Label>Acrescimo</Label><Input value={surchargeValue} onChange={(event) => setSurchargeValue(event.target.value)} className="rounded-2xl border-slate-200" /></div>
            <div className="space-y-2"><Label>Motivo</Label><Textarea value={negotiationReason} onChange={(event) => setNegotiationReason(event.target.value)} className="min-h-[100px] rounded-2xl border-slate-200" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Observacoes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[110px] rounded-2xl border-slate-200" /></div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100"><CardTitle>4. Resumo comercial</CardTitle><p className="text-sm text-slate-500">Revise o total estimado antes de confirmar o documento.</p></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="font-semibold text-slate-950">{formatCurrency(subtotal)}</span></div>
            {negotiation.discountAmount > 0 && <div className="flex items-center justify-between text-sm text-emerald-700"><span>Desconto negociado</span><span className="font-semibold">- {formatCurrency(negotiation.discountAmount)}</span></div>}
            {negotiation.surchargeAmount > 0 && <div className="flex items-center justify-between text-sm text-amber-700"><span>Acrescimo negociado</span><span className="font-semibold">+ {formatCurrency(negotiation.surchargeAmount)}</span></div>}
            {paymentDiscountAmount > 0 && <div className="flex items-center justify-between text-sm text-emerald-700"><span>Desconto de pagamento</span><span className="font-semibold">- {formatCurrency(paymentDiscountAmount)}</span></div>}
            {paymentSurchargeAmount > 0 && <div className="flex items-center justify-between text-sm text-amber-700"><span>Acrescimo de pagamento</span><span className="font-semibold">+ {formatCurrency(paymentSurchargeAmount)}</span></div>}
            <div className="rounded-3xl bg-slate-950 px-4 py-4 text-white"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Total estimado</p><p className="mt-2 text-3xl font-bold tracking-tight">{formatCurrency(total)}</p><p className="mt-2 text-sm text-slate-300">{selectedPaymentOption?.label || 'Defina meio e condicao de pagamento.'}</p></div>
            {mode === 'order' && <Button className="h-12 w-full rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800" disabled={submitting || !selectedStoreId || items.length === 0} onClick={() => handleSubmit('order')}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="mr-2 h-4 w-4" />}Confirmar pedido</Button>}
            <Button variant={mode === 'quote' ? 'default' : 'outline'} className={mode === 'quote' ? 'h-12 w-full rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800' : 'h-12 w-full rounded-2xl border-slate-200 bg-white text-slate-950 hover:bg-slate-50'} disabled={submitting || !selectedStoreId || items.length === 0} onClick={() => handleSubmit('quote')}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Salvar como orcamento</Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(dialogProductId)} onOpenChange={(open) => !open && setDialogProductId(null)}>
        <DialogContent className="rounded-3xl border border-slate-200 bg-white sm:max-w-3xl">
          <DialogHeader><DialogTitle>Configurar item</DialogTitle></DialogHeader>
          {configLoading || !configData ? <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando configuracao...</div> : <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]"><div className="relative h-48 overflow-hidden rounded-2xl bg-slate-100">{configData.product.images?.find((image) => image.is_primary)?.url ? <Image src={configData.product.images.find((image) => image.is_primary)?.url || ''} alt={configData.product.name} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><Package className="h-8 w-8" /></div>}</div><div className="space-y-4"><div><p className="text-lg font-semibold text-slate-950">{configData.product.name}</p><p className="mt-1 text-sm text-slate-500">Escolha a combinacao ideal para este cliente.</p></div>{(configData.product.size_options || []).filter((option) => option.is_active).length > 0 && <div className="space-y-2"><Label>Tamanho</Label><div className="flex flex-wrap gap-2">{(configData.product.size_options || []).filter((option) => option.is_active).map((option) => <button key={option.id} type="button" onClick={() => setSelectedSizeOptionId(option.id)} className={cn('rounded-full border px-3 py-2 text-sm transition-all', selectedSizeOptionId === option.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700')}>{option.name}</button>)}</div></div>}<div className="space-y-2"><Label>Tecido</Label><div className="flex flex-wrap gap-2">{configData.fabrics.map((fabric) => <button key={fabric.id} type="button" onClick={() => { setSelectedFabricId(fabric.id); setSelectedColorId(fabric.colors[0]?.id || '') }} className={cn('rounded-full border px-3 py-2 text-sm transition-all', selectedFabricId === fabric.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700')}>{fabric.name}</button>)}</div></div><div className="space-y-2"><Label>Cor</Label><div className="flex flex-wrap gap-2">{(configData.fabrics.find((fabric) => fabric.id === selectedFabricId)?.colors || []).map((color) => <button key={color.id} type="button" onClick={() => setSelectedColorId(color.id)} className={cn('rounded-full border px-3 py-2 text-sm transition-all', selectedColorId === color.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700')}>{color.name}</button>)}</div></div><div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]"><div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} value={dialogQuantity} onChange={(event) => setDialogQuantity(Math.max(1, Number(event.target.value || 1)))} className="rounded-2xl border-slate-200" /></div><div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Preco unitario</p><p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrency(previewPrice)}</p></div></div><Button className="h-12 rounded-2xl border-0 bg-slate-950 text-white hover:bg-slate-800" onClick={addConfiguredItem}><Plus className="mr-2 h-4 w-4" />Adicionar item</Button></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
