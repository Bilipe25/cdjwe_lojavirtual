import { useState, useEffect, useRef } from 'react'
import { Drawer } from 'vaul'
import { CheckCircle2, ChevronRight, ShoppingBag, X } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    useQuickViewData,
    QuickViewContent,
    type QuickViewAddToCartSummary,
} from '@/components/catalog/quick-view-content'

interface QuickViewBottomSheetProps {
    productId: string | null
    open: boolean
    onClose: () => void
}

export function QuickViewBottomSheet({ productId, open, onClose }: QuickViewBottomSheetProps) {
    const router = useRouter()
    const data = useQuickViewData(productId, open)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)
    const [cartConfirmation, setCartConfirmation] = useState<QuickViewAddToCartSummary | null>(null)
    const drawerContentRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = drawerContentRef.current
        if (!el) return
        if (isLightboxOpen) {
            el.setAttribute('inert', '')
        } else {
            el.removeAttribute('inert')
        }
    }, [isLightboxOpen])

    useEffect(() => {
        const handleLightboxState = (event: Event) => {
            const detail = (event as CustomEvent<{ open?: boolean }>).detail
            setIsLightboxOpen(Boolean(detail?.open))
        }

        window.addEventListener('lightbox-state-change', handleLightboxState)
        return () => window.removeEventListener('lightbox-state-change', handleLightboxState)
    }, [])

    const handleAddedToCart = (summary: QuickViewAddToCartSummary) => {
        window.setTimeout(() => setCartConfirmation(summary), 120)
    }

    const handleCloseConfirmation = () => {
        setCartConfirmation(null)
    }

    const handleGoToCart = () => {
        setCartConfirmation(null)
        router.push('/cart')
    }

    return (
        <>
            <Drawer.Root
                open={open}
                onOpenChange={(val) => !val && onClose()}
                shouldScaleBackground
                dismissible={!isLightboxOpen}
            >
                <Drawer.Portal>
                    <Drawer.Overlay
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <Drawer.Content
                        ref={drawerContentRef}
                        className="fixed inset-0 z-50 flex flex-col bg-background focus:outline-none"
                        style={{ height: '100dvh', maxHeight: '100dvh' }}
                    >
                        <Drawer.Title className="sr-only">Detalhes do produto</Drawer.Title>

                        <div
                            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-center px-4"
                            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
                        >
                            <div className="h-1.5 w-10 rounded-full bg-white/75 dark:bg-white/20 shadow-sm backdrop-blur-sm" />
                            <button
                                onClick={onClose}
                                className="pointer-events-auto absolute right-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-foreground shadow-lg shadow-black/10 backdrop-blur-md transition-colors hover:bg-background"
                                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
                                aria-label="Fechar"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-vaul-no-drag>
                            <QuickViewContent
                                data={data}
                                onClose={onClose}
                                showTitle={false}
                                onAddedToCart={handleAddedToCart}
                            />
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>

            <Drawer.Root open={Boolean(cartConfirmation)} onOpenChange={(val) => !val && handleCloseConfirmation()}>
                <Drawer.Portal>
                    <Drawer.Overlay
                        className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px]"
                        onClick={handleCloseConfirmation}
                    />
                    <Drawer.Content
                        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[28px] border border-border/60 bg-background px-4 pb-4 pt-3 shadow-[0_-24px_60px_-26px_rgba(15,23,42,0.45)] focus:outline-none"
                        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
                    >
                        <Drawer.Title className="sr-only">Itens adicionados ao carrinho</Drawer.Title>

                        {cartConfirmation && (
                            <div className="mx-auto w-full max-w-md">
                                <div className="mb-3 flex justify-center">
                                    <div className="h-1.5 w-10 rounded-full bg-muted" />
                                </div>

                                <div className="mb-4 flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-semibold text-foreground">Produto adicionado ao pedido</p>
                                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                                            Seu item ja esta no carrinho. Deseja continuar comprando ou revisar o pedido?
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-border bg-muted/20 p-3">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            <ShoppingBag className="h-3.5 w-3.5" />
                                            Itens adicionados
                                        </div>
                                        <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
                                            {cartConfirmation.totalQuantity} item{cartConfirmation.totalQuantity > 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    <div className="space-y-2.5">
                                        {cartConfirmation.items.slice(0, 3).map((item) => (
                                            <div
                                                key={`${item.id}-${item.sizeName || 'size'}-${item.colorName || 'color'}`}
                                                className="flex items-center gap-3 rounded-2xl bg-background border border-transparent dark:border-border/50 px-2.5 py-2 shadow-sm dark:shadow-md"
                                            >
                                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                                                    {item.imageUrl ? (
                                                        <Image
                                                            src={item.imageUrl}
                                                            alt={item.productName}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground/50">
                                                            CJ
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-foreground">{item.productName}</p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {[item.sizeName, item.fabricName, item.colorName].filter(Boolean).join(' / ')}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-sm font-semibold text-foreground">
                                                        R$ {item.lineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">Qtd. {item.quantity}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {cartConfirmation.items.length > 3 && (
                                        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
                                            +{cartConfirmation.items.length - 3} item(ns) adicionados neste lote
                                        </p>
                                    )}

                                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                                        <span className="text-sm font-medium text-muted-foreground">Total deste lote</span>
                                        <span className="text-lg font-semibold text-foreground">
                                            R$ {cartConfirmation.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-2.5">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 rounded-2xl border-border bg-background text-sm font-semibold text-foreground"
                                        onClick={handleCloseConfirmation}
                                    >
                                        Continuar comprando
                                    </Button>
                                    <Button
                                        type="button"
                                        className="h-11 rounded-2xl text-sm font-semibold"
                                        onClick={handleGoToCart}
                                    >
                                        Ir para pedido
                                        <ChevronRight className="ml-1 h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </>
    )
}
