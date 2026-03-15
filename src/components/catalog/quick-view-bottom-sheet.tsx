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
                    className="fixed inset-0 z-50 flex flex-col bg-white focus:outline-none"
                    style={{ height: '100dvh', maxHeight: '100dvh' }}
                >
                    <Drawer.Title className="sr-only">Detalhes do produto</Drawer.Title>
                    
                    {/* Header compactado para ganhar espaço de tela */}
                    <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-border/50 bg-muted/10">
                        {/* Fake drag handle alinhado à esquerda na barra pra não roubar altura extra (ou remover visual no B2B já que swipe funciona igual) */}
                        <div className="mx-auto h-1.5 w-10 rounded text-transparent bg-muted/60 absolute left-1/2 -translate-x-1/2 top-3" />
                        <span className="text-xs font-semibold text-muted-foreground invisible">Modal</span>
                        <button
                            onClick={onClose}
                            className="h-8 w-8 rounded-md bg-white border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors ml-auto z-10"
                            aria-label="Fechar"
                        >
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Content — fills remaining height, scrolls internally */}
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-vaul-no-drag>
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
