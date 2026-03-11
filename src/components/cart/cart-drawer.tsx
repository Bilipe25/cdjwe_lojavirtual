'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Minus, Plus, Trash2, ShoppingBag, X, Package } from 'lucide-react'
import { useCartStore } from '@/lib/stores/cart-store'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { toast } from 'sonner'
import { ProductDetailSkeleton } from '@/components/ui/skeletons'

export function CartDrawer() {
    const router = useRouter()
    const { items, isOpen, closeCart, removeItem, addItem, updateQuantity, subtotal, totalItems } = useCartStore()
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const total = subtotal()
    const count = totalItems()

    const handleRemove = (item: any) => {
        removeItem(item.variantId)
        toast.success(`Item removido!`, {
            action: {
                label: 'Desfazer',
                onClick: () => addItem(item)
            },
            duration: 4000,
        })
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        <SheetTitle className="text-lg font-semibold font-[family-name:var(--font-heading)]">
                            Carrinho
                        </SheetTitle>
                        {count > 0 && (
                            <span className="text-sm text-muted-foreground">({count} {count === 1 ? 'item' : 'itens'})</span>
                        )}
                    </div>
                </div>

                {/* Items */}
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
                        <p className="text-muted-foreground text-center">
                            Seu carrinho está vazio
                        </p>
                        <Button onClick={() => { closeCart(); router.push('/catalog') }} className="gradient-bronze border-0 text-white">
                            Ver Catálogo
                        </Button>
                    </div>
                ) : (
                    <>
                        <ScrollArea className="flex-1 px-6">
                            <AnimatePresence>
                                {items.map((item) => (
                                    <motion.div
                                        key={item.variantId}
                                        layout
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="py-4"
                                    >
                                        <div className="flex gap-3">
                                            {/* Image */}
                                            <div className="h-20 w-20 rounded-lg bg-muted shrink-0 overflow-hidden relative">
                                                {item.imageUrl ? (
                                                    <Image
                                                        src={item.imageUrl}
                                                        alt={item.productName}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center">
                                                        <Package className="h-8 w-8 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Details */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="min-w-0">
                                                        <h4 className="font-medium text-sm truncate text-foreground">{item.productName}</h4>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {item.fabricName} — {item.colorName}
                                                        </p>
                                                        {item.size && (
                                                            <p className="text-xs text-muted-foreground">{item.size}</p>
                                                        )}
                                                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-xs text-muted-foreground">
                                                                {item.quantity}x R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                            <span className="text-xs font-semibold text-gradient-bronze">
                                                                R$ {(item.unitPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 -mt-1 -mr-1"
                                                        onClick={() => handleRemove(item)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                {/* Quantity */}
                                                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50 w-max">
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </Button>
                                                    <span className="text-sm font-medium w-8 text-center">
                                                        {item.quantity}
                                                    </span>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                        <Separator className="mt-4" />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </ScrollArea>

                        {/* Footer */}
                        <div className="border-t p-6 bg-muted/20">
                            <div className="space-y-3 mb-6">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Subtotal nos itens</span>
                                    <span className="font-medium text-foreground">
                                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Frete & Descontos</span>
                                    <span className="text-muted-foreground italic text-xs">
                                        Calculados no checkout
                                    </span>
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-foreground">Total estimado</span>
                                    <span className="text-lg font-bold text-gradient-navy">
                                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <Button
                                className="w-full gradient-navy border-0 text-white h-12 text-base"
                                onClick={() => {
                                    closeCart()
                                    router.push('/cart')
                                }}
                            >
                                Finalizar Pedido
                            </Button>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
