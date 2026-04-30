'use client'

import { useState, useMemo, useTransition, useCallback, useRef, useEffect } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRelation, SectionCard } from '../_components'
import { transferRepresentativeStockMultiAction } from '../actions'

// ─── Types ───

type Representative = {
  id: string
  full_name: string | null
  email: string | null
  status: string
}

type VariantOption = {
  value: string
  label: string
  productName: string
  details: string
  globalStock: number
}

type TransferItem = {
  key: string
  variantChoice: string
  label: string
  productName: string
  details: string
  globalStock: number
  quantity: number
}

// ─── Helpers ───

function buildVariantOptions(variants: Array<{
  id: string
  sku: string | null
  stock_quantity: number | null
  product: { id: string; name: string; has_size_variants?: boolean; size_options?: Array<{ id: string; name: string; is_active?: boolean; sort_order?: number }> } | { id: string; name: string; has_size_variants?: boolean; size_options?: Array<{ id: string; name: string; is_active?: boolean; sort_order?: number }> }[] | null
  fabric: { id: string; name: string } | { id: string; name: string }[] | null
  fabric_color: { id: string; name: string } | { id: string; name: string }[] | null
}>): VariantOption[] {
  return variants.flatMap((variant) => {
    const product = getRelation(variant.product)
    const fabric = getRelation(variant.fabric)
    const color = getRelation(variant.fabric_color)
    const sizeOptions = Array.isArray(product?.size_options)
      ? product.size_options.filter((size) => size.is_active !== false).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      : []

    const productName = product?.name || 'Produto sem nome'
    const detailParts = [fabric?.name, color?.name, variant.sku ? `SKU ${variant.sku}` : null].filter(Boolean)
    const globalStock = Number(variant.stock_quantity || 0)

    if (product?.has_size_variants && sizeOptions.length > 0) {
      return sizeOptions.map((size) => ({
        value: `${variant.id}::${size.id}`,
        label: [productName, ...detailParts, size.name].join(' · '),
        productName,
        details: [...detailParts, size.name].join(' · '),
        globalStock,
      }))
    }

    return [{
      value: `${variant.id}::legacy`,
      label: [productName, ...detailParts].join(' · '),
      productName,
      details: detailParts.join(' · '),
      globalStock,
    }]
  })
}

// ─── Component ───

export function ReadyDeliveryTransferClient({
  representatives,
  variants,
  initialSuccess,
  initialError,
}: {
  representatives: Representative[]
  variants: Parameters<typeof buildVariantOptions>[0]
  initialSuccess?: boolean
  initialError?: string
}) {
  // State
  const [items, setItems] = useState<TransferItem[]>([])
  const [repId, setRepId] = useState('')
  const [repName, setRepName] = useState('')
  const [notes, setNotes] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const [repSearch, setRepSearch] = useState('')
  const [showRepDropdown, setShowRepDropdown] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    initialSuccess
      ? { type: 'success', message: 'Transferência registrada com sucesso.' }
      : initialError
        ? { type: 'error', message: initialError === 'invalid' ? 'Preencha representante, produto e quantidade.' : decodeURIComponent(initialError) }
        : null
  )
  const [isPending, startTransition] = useTransition()

  const productSearchRef = useRef<HTMLInputElement>(null)
  const repSearchRef = useRef<HTMLInputElement>(null)

  // Auto-dismiss feedback
  useEffect(() => {
    if (feedback?.type === 'success') {
      const timer = setTimeout(() => setFeedback(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [feedback])

  // Click-outside to close dropdowns
  const repDropdownRef = useRef<HTMLDivElement>(null)
  const productDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (repDropdownRef.current && !repDropdownRef.current.contains(e.target as Node)) {
        setShowRepDropdown(false)
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Derived
  const variantOptions = useMemo(() => buildVariantOptions(variants), [variants])

  const filteredVariants = useMemo(() => {
    const q = variantSearch.toLowerCase().trim()
    if (!q) return variantOptions.slice(0, 30)
    return variantOptions.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30)
  }, [variantOptions, variantSearch])

  const filteredReps = useMemo(() => {
    const q = repSearch.toLowerCase().trim()
    if (!q) return representatives
    return representatives.filter(
      (r) => r.full_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)
    )
  }, [representatives, repSearch])

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalProducts = items.length
  const hasValidData = repId && items.length > 0 && items.every((item) => item.quantity > 0)

  // Handlers
  const selectRep = useCallback((rep: Representative) => {
    setRepId(rep.id)
    setRepName(rep.full_name || rep.email || '')
    setRepSearch(rep.full_name || rep.email || '')
    setShowRepDropdown(false)
    // Focus product search after selecting rep
    setTimeout(() => productSearchRef.current?.focus(), 100)
  }, [])

  const clearRep = useCallback(() => {
    setRepId('')
    setRepName('')
    setRepSearch('')
    repSearchRef.current?.focus()
  }, [])

  const addItem = useCallback((option: VariantOption) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.variantChoice === option.value)
      if (existing) {
        return prev.map((item) =>
          item.variantChoice === option.value
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, {
        key: option.value,
        variantChoice: option.value,
        label: option.label,
        productName: option.productName,
        details: option.details,
        globalStock: option.globalStock,
        quantity: 1,
      }]
    })
    setVariantSearch('')
    setShowProductDropdown(false)
    productSearchRef.current?.focus()
  }, [])

  const updateQuantity = useCallback((key: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((item) => item.key !== key))
    } else {
      setItems((prev) => prev.map((item) => item.key === key ? { ...item, quantity: qty } : item))
    }
  }, [])

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
    setNotes('')
  }, [])

  const handleSubmit = useCallback(() => {
    if (!hasValidData || isPending) return

    startTransition(async () => {
      try {
        const result = await transferRepresentativeStockMultiAction({
          representativeId: repId,
          items: items.map((item) => ({
            variantChoice: item.variantChoice,
            quantity: item.quantity,
          })),
          notes,
        })

        if (result.success) {
          setFeedback({
            type: 'success',
            message: result.transferNumber
              ? `Transferência ${result.transferNumber} registrada com sucesso — ${totalProducts} produto(s), ${totalItems} unidade(s).`
              : `Transferência registrada com sucesso — ${totalProducts} produto(s), ${totalItems} unidade(s).`,
          })
          setItems([])
          setNotes('')
        } else {
          setFeedback({ type: 'error', message: result.error || 'Erro desconhecido.' })
        }
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Erro inesperado ao registrar transferência.' })
      }
    })
  }, [hasValidData, isPending, repId, items, notes, totalProducts, totalItems])

  return (
    <div className="space-y-5">
      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded-md p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <SectionCard
        title="Nova transferência de estoque"
        description="Selecione o representante, adicione os produtos desejados e registre tudo de uma vez."
      >
        {/* ─── Step 1: Representative picker ─── */}
        <div className="border-b border-border/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
            <span className="text-xs font-semibold text-foreground">Representante destino</span>
          </div>

          {repId ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 dark:border-emerald-800/40 dark:bg-emerald-950/20">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                {repName.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">{repName}</span>
              <button
                type="button"
                onClick={clearRep}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Trocar representante"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div ref={repDropdownRef} className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                ref={repSearchRef}
                placeholder="Buscar por nome ou email do representante..."
                value={repSearch}
                onChange={(e) => { setRepSearch(e.target.value); setShowRepDropdown(true) }}
                onFocus={() => setShowRepDropdown(true)}
                className="h-10 pl-9"
              />
              {showRepDropdown && filteredReps.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                  {filteredReps.map((rep) => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => selectRep(rep)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {(rep.full_name || rep.email || '?').charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-foreground">{rep.full_name || 'Sem nome'}</p>
                        {rep.email && <p className="truncate text-xs text-muted-foreground">{rep.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showRepDropdown && repSearch.trim() && filteredReps.length === 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-popover px-3 py-4 shadow-lg">
                  <p className="text-center text-xs text-muted-foreground">Nenhum representante encontrado.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Step 2: Product picker ─── */}
        <div className="border-b border-border/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
            <span className="text-xs font-semibold text-foreground">Adicionar produtos</span>
            {items.length > 0 && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                {totalProducts} produto{totalProducts !== 1 ? 's' : ''} · {totalItems} un.
              </span>
            )}
          </div>

          <div ref={productDropdownRef} className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              ref={productSearchRef}
              placeholder="Buscar por nome, tecido, cor, SKU..."
              value={variantSearch}
              onChange={(e) => { setVariantSearch(e.target.value); setShowProductDropdown(true) }}
              onFocus={() => setShowProductDropdown(true)}
              className="h-10 pl-9"
            />
            {showProductDropdown && variantSearch.trim() && filteredVariants.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                {filteredVariants.map((option) => {
                  const alreadyAdded = items.some((item) => item.variantChoice === option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => addItem(option)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-foreground">{option.productName}</p>
                        {option.details && <p className="truncate text-xs text-muted-foreground">{option.details}</p>}
                      </div>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                        Est. {option.globalStock}
                      </span>
                      {alreadyAdded ? (
                        <span className="shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">+1</span>
                      ) : (
                        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {showProductDropdown && variantSearch.trim() && filteredVariants.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-popover px-3 py-4 shadow-lg">
                <p className="text-center text-xs text-muted-foreground">Nenhum produto encontrado para &quot;{variantSearch}&quot;.</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Items list ─── */}
        {items.length > 0 ? (
          <div className="border-b border-border/50">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[200px]">Produto</TableHead>
                    <TableHead className="text-right w-28">Estoque geral</TableHead>
                    <TableHead className="text-right w-36">Qtd. a transferir</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.key} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                            {item.details && <p className="truncate text-xs text-muted-foreground">{item.details}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                          {item.globalStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.key, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                          >
                            −
                          </button>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.key, Number(e.target.value))}
                            className="h-7 w-16 text-center tabular-nums text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.key, item.quantity + 1)}
                            disabled={item.quantity >= item.globalStock}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="rounded-md p-1.5 text-muted-foreground opacity-50 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          title="Remover item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary bar */}
            <div className="flex items-center justify-between border-t border-dashed border-border/40 bg-muted/30 px-4 py-2">
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Limpar lista
              </button>
              <p className="text-xs font-medium text-foreground tabular-nums">
                Total: {totalProducts} produto{totalProducts !== 1 ? 's' : ''}, {totalItems} unidade{totalItems !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 border-b border-border/50 py-10">
            <Package className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Use a busca acima para adicionar produtos à transferência.</p>
          </div>
        )}

        {/* ─── Step 3: Notes + Submit ─── */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
            <span className="text-xs font-semibold text-foreground">Observação e confirmação</span>
          </div>

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: carga para roteiro de sexta-feira, loja X e Y"
            className="min-h-20"
          />

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              {!repId && <p className="text-amber-600 dark:text-amber-400">⚠ Selecione um representante</p>}
              {repId && items.length === 0 && <p className="text-amber-600 dark:text-amber-400">⚠ Adicione ao menos um produto</p>}
              {hasValidData && (
                <p className="text-emerald-600 dark:text-emerald-400">
                  ✓ Pronto para enviar · {repName}
                </p>
              )}
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!hasValidData || isPending}
              className="h-10 rounded-lg px-6"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Registrar transferência
                </>
              )}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
