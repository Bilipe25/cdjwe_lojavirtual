'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Minus, Plus, Trash2, ShoppingBag, Package } from 'lucide-react'
import { useCartStore } from '@/lib/stores/cart-store'
import type { CartItem } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { toast } from 'sonner'

function getCartKey(item: CartItem) {
    return item.cartKey || `${item.variantId}::${item.sizeOptionId || 'legacy'}`
}

export function CartDrawer() {
    const router = useRouter()
    const { items, isOpen, closeCart, removeItem, addItem, updateQuantity, subtotal, totalItems } = useCartStore()
    const persistApi = 'persist' in useCartStore ? useCartStore.persist : undefined
    const [isMounted, setIsMounted] = useState(() => persistApi?.hasHydrated?.() ?? false)

    useEffect(() => {
        if (!persistApi) {
            setIsMounted(true)
            return
        }

        setIsMounted(persistApi.hasHydrated?.() ?? false)

        const unsubscribeHydrate = persistApi.onHydrate?.(() => setIsMounted(false))
        const unsubscribeFinishHydration = persistApi.onFinishHydration?.(() => setIsMounted(true))

        return () => {
            unsubscribeHydrate?.()
            unsubscribeFinishHydration?.()
        }
    }, [persistApi])

    const total = subtotal()
    const count = totalItems()

    const handleRemove = (item: CartItem) => {
        removeItem(getCartKey(item))
        toast.success('Item removido!', {
            action: {
                label: 'Desfazer',
                onClick: () => addItem(item),
            },
            duration: 4000,
        })
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
            <SheetContent className="data-[side=right]:w-[90vw] sm:max-w-md p-0 flex flex-col gap-0 border-l border-border/30 shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                    <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        <SheetTitle className="text-lg font-semibold font-[family-name:var(--font-heading)]">
                            Carrinho
                        </SheetTitle>
                        {count > 0 && (
                            <span className="text-sm text-muted-foreground">
                                ({count} {count === 1 ? 'item' : 'itens'})
                            </span>
                        )}
                    </div>
                </div>

                {!isMounted ? (
                    <div className="flex-1 p-6 space-y-6 opacity-60 pointer-events-none">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="flex gap-4">
                                <div className="h-20 w-20 rounded-lg bg-muted animate-pulse" />
                                <div className="flex-1 space-y-2 py-1">
                                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                                    <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground text-center">Seu carrinho esta vazio</p>
                        <Button onClick={() => { closeCart(); router.push('/catalog') }} className="gradient-bronze border-0 text-white">
                            Ver catalogo
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <ScrollArea className="h-full px-4 sm:px-6">
                                <AnimatePresence>
                                    {items.map((item) => {
                                        const cartKey = getCartKey(item)

                                        return (
                                            <motion.div
                                                key={cartKey}
                                                layout
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="py-3"
                                            >
                                                <div className="flex gap-3 relative">
                                                    <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md bg-muted shrink-0 overflow-hidden relative">
                                                        {item.imageUrl ? (
                                                            <Image
                                                                src={item.imageUrl}
                                                                alt={item.productName}
                                                                fill
                                                                className="object-cover"
                                                            />
                                                        ) : (
                                                            <div className="h-full w-full flex items-center justify-center">
                                                                <Package className="h-6 w-6 text-muted-foreground/30" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                                        <div className="pr-6">
                                                            <h4 className="font-medium text-sm text-foreground leading-tight line-clamp-1">{item.productName}</h4>
                                                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                                {item.fabricName} - {item.colorName}
                                                            </p>
                                                            {item.size && (
                                                                <p className="text-[10px] text-muted-foreground mt-0.5">{item.size}</p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between mt-2">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-muted-foreground leading-none mb-1">
                                                                    {item.quantity}x R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                                <span className="text-sm font-semibold text-gradient-bronze">
                                                                    R$ {(item.unitPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-1 bg-muted/30 rounded-md border border-border/50 p-0.5">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground"
                                                                    onClick={() => updateQuantity(cartKey, item.quantity - 1)}
                                                                >
                                                                    <Minus className="h-3 w-3" />
                                                                </Button>
                                                                <span className="text-xs font-medium w-6 text-center tabular-nums">
                                                                    {item.quantity}
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground"
                                                                    onClick={() => updateQuantity(cartKey, item.quantity + 1)}
                                                                >
                                                                    <Plus className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute top-0 right-0 h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm"
                                                        onClick={() => handleRemove(item)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                <Separator className="mt-3" />
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            </ScrollArea>
                        </div>

                        <div className="shrink-0 border-t p-4 sm:p-6 bg-white z-10 shadow-[0_-4px_10px_-5px_rgba(0,0,0,0.05)]">
                            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                                Os precos do carrinho sao confirmados automaticamente antes do envio do pedido.
                            </p>
                            <div className="mb-4">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-foreground text-sm uppercase tracking-tight">Total</span>
                                    <span className="text-xl font-bold text-gradient-navy">
                                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <Button
                                className="w-full gradient-navy border-0 text-white h-11 text-sm font-medium shadow-md"
                                onClick={() => {
                                    closeCart()
                                    router.push('/cart')
                                }}
                            >
                                Finalizar pedido
                            </Button>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
