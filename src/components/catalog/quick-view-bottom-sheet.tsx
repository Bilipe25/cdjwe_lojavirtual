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
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <Drawer.Content
                    ref={drawerContentRef}
                    className="fixed inset-0 z-50 flex flex-col bg-white focus:outline-none"
                    style={{ height: '100dvh', maxHeight: '100dvh' }}
                >
                    <Drawer.Title className="sr-only">Detalhes do produto</Drawer.Title>

                    <div
                        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-center px-4"
                        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
                    >
                        <div className="h-1.5 w-10 rounded-full bg-white/75 shadow-sm backdrop-blur-sm" />
                        <button
                            onClick={onClose}
                            className="pointer-events-auto absolute right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/88 text-slate-700 shadow-lg shadow-black/10 backdrop-blur-md transition-colors hover:bg-white"
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
                        />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
