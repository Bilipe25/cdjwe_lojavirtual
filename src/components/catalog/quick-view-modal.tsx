'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X, Package, Eye, ShoppingCart, Check,
    ChevronLeft, ChevronRight, Minus, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/lib/stores/cart-store'
import { toast } from 'sonner'
import type { Product, ProductImage, ProductVariant, Fabric, FabricColor } from '@/lib/types'

interface QuickViewModalProps {
    productId: string | null
    open: boolean
    onClose: () => void
}

export function QuickViewModal({ productId, open, onClose }: QuickViewModalProps) {
    const { addItem, openCart } = useCartStore()
    const [product, setProduct] = useState<Product | null>(null)
    const [images, setImages] = useState<ProductImage[]>([])
    const [fabrics, setFabrics] = useState<(Fabric & { colors: FabricColor[] })[]>([])
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [loading, setLoading] = useState(false)

    const [selectedFabric, setSelectedFabric] = useState<string | null>(null)
    const [selectedColor, setSelectedColor] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [activeImageIndex, setActiveImageIndex] = useState(0)
    const [addingToCart, setAddingToCart] = useState(false)

    useEffect(() => {
        if (open && productId) {
            loadProduct(productId)
        } else {
            // Reset state
            setProduct(null)
            setImages([])
            setFabrics([])
            setVariants([])
            setSelectedFabric(null)
            setSelectedColor(null)
            setQuantity(1)
            setActiveImageIndex(0)
        }
    }, [open, productId])

    const loadProduct = async (id: string) => {
        setLoading(true)
        const supabase = createClient()

        const { data: productData } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single()
        if (productData) setProduct(productData)

        const { data: imagesData } = await supabase
            .from('product_images')
            .select('*')
            .eq('product_id', id)
            .order('sort_order')
        if (imagesData) setImages(imagesData)

        const { data: variantsData } = await supabase
            .from('product_variants')
            .select('*, fabric:fabrics(*), color:fabric_colors(*)')
            .eq('product_id', id)
            .eq('is_active', true)
        if (variantsData) {
            setVariants(variantsData)
            // Build fabric list with colors from active variants
            const fabricMap = new Map<string, Fabric & { colors: FabricColor[] }>()
            variantsData.forEach((v: any) => {
                if (v.fabric && v.color) {
                    if (!fabricMap.has(v.fabric.id)) {
                        fabricMap.set(v.fabric.id, { ...v.fabric, colors: [] })
                    }
                    const f = fabricMap.get(v.fabric.id)!
                    if (!f.colors.find((c: FabricColor) => c.id === v.color.id)) {
                        f.colors.push(v.color)
                    }
                }
            })
            setFabrics(Array.from(fabricMap.values()))
        }

        setLoading(false)
    }

    const selectedFabricObj = fabrics.find(f => f.id === selectedFabric)

    const matchedVariant = variants.find(
        (v: any) => v.fabric_id === selectedFabric && v.color_id === selectedColor
    )

    const displayPrice = (matchedVariant as any)?.custom_price ?? product?.base_price ?? 0

    const handleAddToCart = () => {
        if (!matchedVariant || !product) return
        setAddingToCart(true)
        addItem({
            variantId: matchedVariant.id,
            productId: product.id,
            productName: product.name,
            fabricName: selectedFabricObj?.name || '',
            colorName: selectedFabricObj?.colors.find(c => c.id === selectedColor)?.name || '',
            size: product.size,
            imageUrl: images[0]?.url || null,
            quantity,
            unitPrice: displayPrice,
        })
        toast.success('Adicionado ao carrinho!')
        setTimeout(() => {
            setAddingToCart(false)
            onClose()
            openCart()
        }, 300)
    }

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-0">
                {loading || !product ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                        {/* Image */}
                        <div className="relative aspect-square bg-muted overflow-hidden">
                            {images.length > 0 ? (
                                <Image
                                    src={images[activeImageIndex]?.url}
                                    alt={product.name}
                                    fill
                                    className="object-cover"
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                    <Package className="h-16 w-16 text-muted-foreground/20" />
                                </div>
                            )}
                            {images.length > 1 && (
                                <>
                                    <button
                                        onClick={() => setActiveImageIndex(
                                            activeImageIndex === 0 ? images.length - 1 : activeImageIndex - 1
                                        )}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white shadow"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => setActiveImageIndex(
                                            activeImageIndex === images.length - 1 ? 0 : activeImageIndex + 1
                                        )}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white shadow"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] backdrop-blur">
                                        {activeImageIndex + 1}/{images.length}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Details */}
                        <div className="p-5 flex flex-col">
                            <DialogHeader className="mb-3">
                                <DialogTitle className="text-xl font-bold font-heading text-gradient-navy leading-tight">
                                    {product.name}
                                </DialogTitle>
                            </DialogHeader>

                            {product.size && (
                                <p className="text-xs text-muted-foreground mb-1">{product.size}</p>
                            )}
                            {product.description && (
                                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{product.description}</p>
                            )}

                            {/* Price */}
                            <div className="mb-4">
                                <p className="text-2xl font-bold text-gradient-bronze">
                                    R$ {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>

                            {/* Fabric Selection */}
                            {fabrics.length > 0 && (
                                <div className="mb-3">
                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tecido</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {fabrics.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => { setSelectedFabric(f.id); setSelectedColor(null) }}
                                                className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                                                    selectedFabric === f.id
                                                        ? 'border-primary bg-primary/10 text-primary font-medium'
                                                        : 'border-border hover:border-primary/50'
                                                }`}
                                            >
                                                {f.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Color Selection */}
                            {selectedFabricObj && selectedFabricObj.colors.length > 0 && (
                                <div className="mb-4">
                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cor</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedFabricObj.colors.map(color => (
                                            <TooltipProvider key={color.id}>
                                                <Tooltip>
                                                    <TooltipTrigger render={
                                                        <button
                                                            onClick={() => setSelectedColor(color.id)}
                                                            className={`h-8 w-8 rounded-full border-2 transition-all overflow-hidden flex items-center justify-center ${
                                                                selectedColor === color.id
                                                                    ? 'border-primary shadow-md scale-110'
                                                                    : 'border-border hover:border-primary/50'
                                                            }`}
                                                            style={{
                                                                backgroundColor: color.hex_code || '#e5e7eb',
                                                                ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                            }}
                                                        >
                                                            {selectedColor === color.id && (
                                                                <Check className="h-3 w-3 text-white drop-shadow-md" />
                                                            )}
                                                        </button>
                                                    } />
                                                    <TooltipContent><p>{color.name}</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Quantity + Add */}
                            <div className="flex items-center gap-3 mt-auto pt-3 border-t">
                                <div className="flex items-center gap-1 border rounded-lg">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuantity(quantity + 1)}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                                <Button
                                    className="flex-1 gradient-bronze border-0 text-white gap-2"
                                    disabled={!matchedVariant || addingToCart}
                                    onClick={handleAddToCart}
                                >
                                    <ShoppingCart className="h-4 w-4" />
                                    {!selectedFabric ? 'Selecione tecido' : !selectedColor ? 'Selecione cor' : 'Adicionar'}
                                </Button>
                            </div>

                            {/* View full page link */}
                            <Link
                                href={`/catalog/${product.id}`}
                                className="text-xs text-center text-muted-foreground hover:text-primary mt-3 transition-colors"
                                onClick={onClose}
                            >
                                Ver página completa →
                            </Link>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
