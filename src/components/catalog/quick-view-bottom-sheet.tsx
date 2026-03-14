import { useState, useEffect, useRef } from 'react'
import { Drawer } from 'vaul'
import { X } from 'lucide-react'
import { useQuickViewData, QuickViewContent } from '@/components/catalog/quick-view-content'

interface QuickViewBottomSheetProps {
    productId: string | null
    open: boolean
    onClose: () => void
}

export function QuickViewBottomSheet({ productId, open, onClose }: QuickViewBottomSheetProps) {
    const data = useQuickViewData(productId, open)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)
    const drawerContentRef = useRef<HTMLDivElement>(null)

    // Quando a lightbox abre, aplica inert no Drawer.Content para silenciar
    // TODOS os listeners de toque do Vaul no nível do browser (funciona mesmo
    // contra capture listeners no document/window).
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
        const handleLightboxState = (e: any) => {
            setIsLightboxOpen(!!e.detail?.open)
        }
        window.addEventListener('lightbox-state-change', handleLightboxState)
        return () => window.removeEventListener('lightbox-state-change', handleLightboxState)
    }, [])

    return (
        <Drawer.Root
            open={open}
            onOpenChange={(val) => !val && onClose()}
            shouldScaleBackground
            dismissible={!isLightboxOpen}
        >
            <Drawer.Portal>
                <Drawer.Overlay
                    className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <Drawer.Content
                    ref={drawerContentRef}
                    className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white rounded-t-3xl focus:outline-none"
                    style={{ maxHeight: '92dvh' }}
                >
                    <Drawer.Title className="sr-only">Detalhes do produto</Drawer.Title>
                    {/* Drag Handle */}
                    <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-muted shrink-0" />

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors z-10"
                        aria-label="Fechar"
                    >
                        <X className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {/* Content — fills remaining height, scrolls internally */}
                    <div className="flex-1 overflow-y-auto overscroll-contain" data-vaul-no-drag>
                        <QuickViewContent
                            data={data}
                            onClose={onClose}
                            showTitle={false}
                        />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}