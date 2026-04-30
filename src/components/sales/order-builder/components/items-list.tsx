'use client'

import Image from 'next/image'
import { Minus, Package, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DraftItem } from '@/components/sales/order-builder/types'
import { formatCurrency } from '@/components/sales/order-builder/utils'

export function ItemsList({
  items,
  setItems,
  pricingPending,
}: {
  items: DraftItem[]
  setItems: React.Dispatch<React.SetStateAction<DraftItem[]>>
  pricingPending: boolean
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Itens ({items.length})</h3>
        {pricingPending ? <span className="text-[10px] text-muted-foreground">Revalidando...</span> : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhum item adicionado.
        </div>
      ) : (
        <div className="divide-y divide-border/30 rounded-xl border border-border/40">
          {items.map((item) => (
            <div key={item.cartKey} className="flex items-center gap-3 px-3 py-2.5">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted/40">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Package className="h-4 w-4" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{item.productName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.fabricName} / {item.colorName}
                  {item.sizeName ? ` / ${item.sizeName}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-lg border-border"
                  onClick={() =>
                    setItems((current) =>
                      current.map((currentItem) =>
                        currentItem.cartKey === item.cartKey
                          ? { ...currentItem, quantity: Math.max(1, currentItem.quantity - 1) }
                          : currentItem
                      )
                    )
                  }
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-[24px] text-center text-xs font-semibold">{item.quantity}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-lg border-border"
                  onClick={() =>
                    setItems((current) =>
                      current.map((currentItem) =>
                        currentItem.cartKey === item.cartKey
                          ? { ...currentItem, quantity: currentItem.quantity + 1 }
                          : currentItem
                      )
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="w-[90px] text-right">
                <p className="text-xs font-semibold text-foreground">{formatCurrency(item.unitPrice * item.quantity)}</p>
                <p className="text-[10px] text-muted-foreground">{formatCurrency(item.unitPrice)} un.</p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setItems((current) => current.filter((currentItem) => currentItem.cartKey !== item.cartKey))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
