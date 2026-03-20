'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  ChevronLeft,
  Search,
  Package,
  X,
  ShoppingBag,
  Minus,
  Plus,
  Check,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useQuickViewData, QuickViewContent, type QuickViewAddToCartSummary } from '@/components/catalog/quick-view-content'
import type { Category, Product } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type BuilderProduct = Product & {
  images?: { url: string; is_primary: boolean }[]
  category?: Category | null
}

export type StagedItem = {
  id: string // cartKey: variantId::sizeOptionId
  productId: string
  productName: string
  fabricName: string
  colorName: string
  sizeName: string | null
  imageUrl: string | null
  quantity: number
  unitPrice: number
}

export type CatalogOverlayConfirmPayload = StagedItem[]

interface Props {
  products: BuilderProduct[]
  categories: Category[]
  /** When confirmed, yields staged items back to the order builder */
  onConfirm: (items: CatalogOverlayConfirmPayload) => void
  onClose: () => void
}

type Phase = 'catalog' | 'quick-view' | 'basket'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPrimaryImage(product: BuilderProduct) {
  return product.images?.find((i) => i.is_primary)?.url || product.images?.[0]?.url || null
}

function fmt(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

// ─── Mini product card (catalog phase) ────────────────────────────────────────

function RepProductCard({
  product,
  onTap,
  stagedQty,
}: {
  product: BuilderProduct
  onTap: () => void
  stagedQty: number
}) {
  const img = getPrimaryImage(product)
  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex flex-col overflow-hidden rounded-xl bg-card border border-border/40 shadow-sm active:scale-[0.97] transition-transform"
    >
      <div className="relative aspect-square w-full bg-muted">
        {img ? (
          <Image src={img} alt={product.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {stagedQty > 0 && (
          <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow">
            {stagedQty}
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-sm font-semibold leading-tight line-clamp-2">{product.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmt(product.base_price)}
        </p>
      </div>
    </button>
  )
}

// ─── QuickView wrapper (representative mode – no store cart) ──────────────────

function RepQuickView({
  productId,
  onBack,
  onAddBatch,
}: {
  productId: string
  onBack: () => void
  onAddBatch: (summary: QuickViewAddToCartSummary) => void
}) {
  const data = useQuickViewData(productId, true)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="gradient-navy flex items-center gap-2 px-4 py-3 shrink-0 shadow-sm">
        <button
          onClick={onBack}
          className="text-white rounded-full p-1.5 hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold text-white truncate flex-1">
          {data.loading ? 'Carregando...' : data.product?.name ?? 'Produto'}
        </h2>
      </div>

      {/* QuickViewContent in representative mode: onAddedToCart → basket */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <QuickViewContent
          data={data}
          onClose={onBack}
          showTitle={false}
          onAddedToCart={(summary) => {
            onAddBatch(summary)
          }}
        />
      </div>
    </div>
  )
}

// ─── Basket phase ─────────────────────────────────────────────────────────────

function RepBasket({
  items,
  onBack,
  onConfirm,
  onUpdateQty,
  onRemove,
}: {
  items: StagedItem[]
  onBack: () => void
  onConfirm: () => void
  onUpdateQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
}) {
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="gradient-navy flex items-center gap-2 px-4 py-3 shrink-0 shadow-sm">
        <button
          onClick={onBack}
          className="text-white rounded-full p-1.5 hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white">Revisão dos Produtos</h2>
          <p className="text-xs text-white/70">{totalQty} item{totalQty !== 1 ? 's' : ''} selecionado{totalQty !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/10 pb-36">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum produto selecionado</p>
            <Button variant="outline" size="sm" onClick={onBack}>Voltar ao catálogo</Button>
          </div>
        ) : (
          <div className="divide-y divide-border/30 bg-card">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                {/* Image */}
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[item.sizeName, item.fabricName, item.colorName].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs font-medium text-primary mt-0.5">{fmt(item.unitPrice)} / un</p>
                </div>

                {/* Qty + Remove */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    onClick={() => onRemove(item.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-white">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
                      disabled={item.quantity <= 1}
                      onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
                      onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs font-semibold">{fmt(item.unitPrice * item.quantity)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border/40 p-4 shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.08)] pb-safe" style={{ maxWidth: '448px', margin: '0 auto', left: '0', right: '0' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Total selecionado</p>
            <p className="text-xl font-bold text-foreground">{fmt(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Quantidade</p>
            <p className="text-lg font-bold text-primary">{totalQty} iten{totalQty !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button
          disabled={items.length === 0}
          onClick={onConfirm}
          className="w-full h-12 rounded-xl gradient-navy hover:opacity-90 text-white font-semibold text-base shadow-sm"
        >
          <Check className="h-5 w-5 mr-2" />
          CONFIRMAR E ADICIONAR AO PEDIDO
        </Button>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function RepresentativeProductCatalogOverlay({ products, categories, onConfirm, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('catalog')
  const [activeProductId, setActiveProductId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchActive, setSearchActive] = useState(false)
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchActive && searchRef.current) {
      searchRef.current.focus()
    }
  }, [searchActive])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = selectedCategory === 'all' || p.category_id === selectedCategory
      const term = search.trim().toLowerCase()
      const matchSearch = !term || p.name.toLowerCase().includes(term)
      return matchCategory && matchSearch
    })
  }, [products, search, selectedCategory])

  // Compute staged qty per product for badge
  const stagedQtyByProductId = useMemo(() => {
    const map: Record<string, number> = {}
    stagedItems.forEach((item) => {
      map[item.productId] = (map[item.productId] || 0) + item.quantity
    })
    return map
  }, [stagedItems])

  const totalStagedQty = stagedItems.reduce((s, i) => s + i.quantity, 0)
  const totalStagedValue = stagedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  const handleAddBatch = (summary: QuickViewAddToCartSummary) => {
    const newItems: StagedItem[] = summary.items.map((si) => ({
      id: `${si.id}::${si.sizeName || 'legacy'}`,
      productId: summary.productId,
      productName: si.productName,
      fabricName: si.fabricName,
      colorName: si.colorName,
      sizeName: si.sizeName,
      imageUrl: si.imageUrl,
      quantity: si.quantity,
      unitPrice: si.unitPrice,
    }))

    setStagedItems((prev) => {
      let updated = [...prev]
      newItems.forEach((newItem) => {
        const existing = updated.find((i) => i.id === newItem.id)
        if (existing) {
          updated = updated.map((i) => i.id === newItem.id ? { ...i, quantity: i.quantity + newItem.quantity } : i)
        } else {
          updated.push(newItem)
        }
      })
      return updated
    })
    setPhase('basket')
  }

  const handleUpdateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setStagedItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      setStagedItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity: qty } : i))
    }
  }

  const handleRemove = (id: string) => {
    setStagedItems((prev) => prev.filter((i) => i.id !== id))
  }

  const handleConfirm = () => {
    onConfirm(stagedItems)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background sm:max-w-md sm:mx-auto sm:border-x sm:border-border sm:shadow-xl xl:hidden pb-safe">

      {/* ── Phase: CATALOG ── */}
      {phase === 'catalog' && (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="gradient-navy px-4 py-3 shrink-0 flex items-center gap-2 shadow-sm">
            <button
              onClick={onClose}
              className="text-white rounded-full p-1.5 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {!searchActive ? (
              <div className="flex-1 flex items-center justify-between animate-in fade-in duration-200">
                <h2 className="text-lg font-semibold text-white">Catálogo</h2>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 rounded-full text-white hover:bg-white/20"
                    onClick={() => setSearchActive(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  {totalStagedQty > 0 && (
                    <button
                      onClick={() => setPhase('basket')}
                      className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-white text-xs font-semibold hover:bg-white/20 transition-colors"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {totalStagedQty} · {fmt(totalStagedValue)}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto..."
                    className="h-10 rounded-full border-0 bg-white shadow-sm pl-9 pr-9 text-foreground w-full"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Category pills */}
          <div className="bg-background border-b border-border/30 px-4 py-2 shrink-0 overflow-x-auto">
            <div className="flex items-center gap-2 w-max">
              <button
                onClick={() => setSelectedCategory('all')}
                className={cn(
                  'text-xs font-semibold rounded-full border px-3 py-1 shrink-0 transition-colors',
                  selectedCategory === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border/60 hover:bg-muted'
                )}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'text-xs font-semibold rounded-full border px-3 py-1 shrink-0 transition-colors whitespace-nowrap',
                    selectedCategory === cat.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border/60 hover:bg-muted'
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-muted/10 p-3 pb-28">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhum produto encontrado</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => (
                  <RepProductCard
                    key={product.id}
                    product={product}
                    stagedQty={stagedQtyByProductId[product.id] || 0}
                    onTap={() => {
                      setActiveProductId(product.id)
                      setPhase('quick-view')
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sticky basket bar (only if items staged) */}
          {totalStagedQty > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border/40 shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.08)] pb-safe" style={{ maxWidth: '448px', margin: '0 auto', left: '0', right: '0' }}>
              <Button
                onClick={() => setPhase('basket')}
                className="w-full h-12 rounded-xl gradient-navy hover:opacity-90 text-white font-semibold text-base"
              >
                <ShoppingBag className="h-5 w-5 mr-2" />
                Ver seleção · {totalStagedQty} iten{totalStagedQty !== 1 ? 's' : ''} · {fmt(totalStagedValue)}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Phase: QUICK-VIEW ── */}
      {phase === 'quick-view' && activeProductId && (
        <div className="flex flex-col h-full overflow-hidden animate-in slide-in-from-right-4 duration-300">
          <RepQuickView
            productId={activeProductId}
            onBack={() => { setPhase('catalog'); setActiveProductId(null) }}
            onAddBatch={handleAddBatch}
          />
        </div>
      )}

      {/* ── Phase: BASKET ── */}
      {phase === 'basket' && (
        <div className="flex flex-col h-full overflow-hidden animate-in slide-in-from-right-4 duration-300">
          <RepBasket
            items={stagedItems}
            onBack={() => setPhase('catalog')}
            onConfirm={handleConfirm}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemove}
          />
        </div>
      )}
    </div>
  )
}
