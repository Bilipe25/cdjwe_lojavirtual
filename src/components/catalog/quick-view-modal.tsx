'use client'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useQuickViewData, QuickViewContent } from '@/components/catalog/quick-view-content'

interface QuickViewModalProps {
    productId: string | null
    open: boolean
    onClose: () => void
}

export function QuickViewModal({ productId, open, onClose }: QuickViewModalProps) {
    const data = useQuickViewData(productId, open)

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent
                showCloseButton
                className="max-w-5xl sm:max-w-4xl w-full max-h-[90vh] overflow-hidden p-0 flex flex-col rounded-xl"
            >
                <QuickViewContent
                    data={data}
                    onClose={onClose}
                    showTitle={true}
                />
            </DialogContent>
        </Dialog>
    )
}
