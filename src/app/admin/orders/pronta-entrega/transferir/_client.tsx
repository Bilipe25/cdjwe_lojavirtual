'use client'

import { useState, useMemo } from 'react'
import { AlertCircle, CheckCircle2, Plus, Search, Send, Trash2 } from 'lucide-react'
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

type Representative = {
  id: string
  full_name: string | null
  email: string | null
  status: string
}

type VariantOption = {
  value: string
  label: string
  globalStock: number
}

type TransferItem = {
  key: string
  variantChoice: string
  label: string
  globalStock: number
  quantity: number
}

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

    const baseLabel = [
      product?.name || 'Produto sem nome',
      fabric?.name,
      color?.name,
      variant.sku ? `SKU ${variant.sku}` : null,
    ].filter(Boolean).join(' · ')

    const globalStock = Number(variant.stock_quantity || 0)

    if (product?.has_size_variants && sizeOptions.length > 0) {
      return sizeOptions.map((size) => ({
        value: `${variant.id}::${size.id}`,
        label: `${baseLabel} · ${size.name}`,
        globalStock,
      }))
    }

    return [{
      value: `${variant.id}::legacy`,
      label: baseLabel,
      globalStock,
    }]
  })
}

export function ReadyDeliveryTransferClient({
  representatives,
  variants,
  success,
  error,
}: {
  representatives: Representative[]
  variants: Parameters<typeof buildVariantOptions>[0]
  success?: boolean
  error?: string
}) {
  const [items, setItems] = useState<TransferItem[]>([])
  const [repId, setRepId] = useState('')
  const [notes, setNotes] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const [repSearch, setRepSearch] = useState('')

  const variantOptions = useMemo(() => buildVariantOptions(variants), [variants])

  const filteredVariants = useMemo(() => {
    if (!variantSearch.trim()) return variantOptions.slice(0, 50)
    const q = variantSearch.toLowerCase()
    return variantOptions.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 50)
  }, [variantOptions, variantSearch])

  const filteredReps = useMemo(() => {
    if (!repSearch.trim()) return representatives
    const q = repSearch.toLowerCase()
    return representatives.filter(
      (r) => r.full_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q)
    )
  }, [representatives, repSearch])

  function addItem(option: VariantOption) {
    const existing = items.find((item) => item.variantChoice === option.value)
    if (existing) {
      setItems((prev) => prev.map((item) =>
        item.variantChoice === option.value
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setItems((prev) => [...prev, {
        key: option.value,
        variantChoice: option.value,
        label: option.label,
        globalStock: option.globalStock,
        quantity: 1,
      }])
    }
    setVariantSearch('')
  }

  function updateQuantity(key: string, qty: number) {
    if (qty <= 0) {
      setItems((prev) => prev.filter((item) => item.key !== key))
    } else {
      setItems((prev) => prev.map((item) => item.key === key ? { ...item, quantity: qty } : item))
    }
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key))
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const hasValidData = repId && items.length > 0 && items.every((item) => item.quantity > 0)

  return (
    <div className="space-y-5">
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Transferência registrada com sucesso.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error === 'invalid' ? 'Preencha representante, produto e quantidade.' : decodeURIComponent(error)}
        </div>
      )}

      <SectionCard title="Nova transferência" description="Selecione o representante, adicione produtos e registre a transferência de estoque.">
        {/* Representative picker */}
        <div className="border-b border-border/50 p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Representante destino</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar representante..."
                value={repSearch}
                onChange={(e) => setRepSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            {filteredReps.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border/50 bg-background">
                {filteredReps.map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => { setRepId(rep.id); setRepSearch(rep.full_name || rep.email || '') }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${repId === rep.id ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : ''}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                      {(rep.full_name || rep.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <span>{rep.full_name || rep.email}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
        </div>

        {/* Product picker */}
        <div className="border-b border-border/50 p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Adicionar produto</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar produto, SKU..."
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            {variantSearch.trim() && filteredVariants.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-background">
                {filteredVariants.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => addItem(option)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      Estoque: {option.globalStock}
                    </span>
                    <Plus className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
            {variantSearch.trim() && filteredVariants.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Nenhum produto encontrado.</p>
            )}
          </label>
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div className="border-b border-border/50">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right w-24">Estoque geral</TableHead>
                    <TableHead className="text-right w-32">Quantidade</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="text-sm">{item.label}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">{item.globalStock}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.key, Number(e.target.value))}
                          className="ml-auto h-8 w-20 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Notes + Submit */}
        <div className="p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Observação</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: carga para roteiro de sexta-feira"
              className="min-h-20"
            />
          </label>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {items.length > 0
                ? `${items.length} produto${items.length !== 1 ? 's' : ''} · ${totalItems} unidade${totalItems !== 1 ? 's' : ''}`
                : 'Nenhum produto adicionado'}
            </p>
            {/* Hidden form for server action */}
            <form action="/admin/orders/pronta-entrega/transferir" method="POST">
              <input type="hidden" name="representativeId" value={repId} />
              {items.map((item, i) => (
                <input key={i} type="hidden" name={`items[${i}]`} value={JSON.stringify(item)} />
              ))}
              <input type="hidden" name="notes" value={notes} />
              <Button
                type="submit"
                disabled={!hasValidData}
                className="h-10 rounded-lg"
                formAction={async () => {
                  // Use form action from server
                  const formData = new FormData()
                  formData.set('representativeId', repId)
                  formData.set('notes', notes)
                  // For now, transfer one item at a time via the existing RPC
                  // which accepts a JSON array of items
                  for (const item of items) {
                    formData.set('variantChoice', item.variantChoice)
                    formData.set('quantity', String(item.quantity))
                  }
                }}
              >
                <Send className="mr-2 h-4 w-4" />
                Registrar transferência
              </Button>
            </form>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
