'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Minus, Plus, Trash2, ShoppingBag, X } from 'lucide-react'
import { useCartStore } from '@/lib/stores/cart-store'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

export function CartDrawer() {
    const router = useRouter()
    const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal, totalItems } = useCartStore()
    const total = subtotal()
    const count = totalItems()

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)]">
                            Carrinho
                        </h2>
                        {count > 0 && (
                            <span className="text-sm text-muted-foreground">({count} {count === 1 ? 'item' : 'itens'})</span>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={closeCart}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Items */}
                {items.length === 0 ? (
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
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-sm truncate">{item.productName}</h4>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {item.fabricName} — {item.colorName}
                                                </p>
                                                {item.size && (
                                                    <p className="text-xs text-muted-foreground">{item.size}</p>
                                                )}
                                                <p className="text-sm font-semibold mt-1 text-gradient-bronze">
                                                    R$ {(item.unitPrice * item.quantity).toFixed(2)}
                                                </p>

                                                {/* Quantity */}
                                                <div className="flex items-center gap-2 mt-2">
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
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 ml-auto text-destructive"
                                                        onClick={() => removeItem(item.variantId)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
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
                        <div className="border-t p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span className="text-lg font-semibold">
                                    R$ {total.toFixed(2)}
                                </span>
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

// This is used by the Image component
function Package({ className }: { className?: string }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" />
        </svg>
    )
}
