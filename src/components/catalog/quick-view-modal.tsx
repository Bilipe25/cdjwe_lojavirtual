'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X, Package, Eye, ShoppingCart, Check, Search,
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
    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [colorSearch, setColorSearch] = useState('')
    const [activeImageIndex, setActiveImageIndex] = useState(0)
    const [addingToCart, setAddingToCart] = useState(false)

    const totalQuantity = Object.values(quantities).reduce((a, b) => a + b, 0)

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
            setQuantities({})
            setColorSearch('')
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

    const displayPrice = (product?.base_price ?? 0) + (selectedFabricObj?.price_modifier ?? 0)

    const handleAddToCart = () => {
        if (!product || !selectedFabric) return
        
        const colorsToAdd = Object.entries(quantities).filter(([_, qty]) => qty > 0)
        if (colorsToAdd.length === 0) return

        setAddingToCart(true)
        
        colorsToAdd.forEach(([colorId, qty]) => {
            const matchedVariant = variants.find(
                (v: any) => v.fabric_id === selectedFabric && v.fabric_color_id === colorId
            )
            const colorObj = selectedFabricObj?.colors.find(c => c.id === colorId)
            
            const variantPrice = (matchedVariant as any)?.price_override ?? displayPrice

            addItem({
                variantId: matchedVariant?.id || `${product.id}-${selectedFabric}-${colorId}`,
                productId: product.id,
                productName: product.name,
                fabricName: selectedFabricObj?.name || '',
                colorName: colorObj?.name || '',
                size: product.size,
                imageUrl: images[0]?.url || null,
                quantity: qty,
                unitPrice: variantPrice,
            })
        })
        
        toast.success(`${totalQuantity} itens adicionados ao carrinho!`)
        setTimeout(() => {
            setAddingToCart(false)
            onClose()
            openCart()
        }, 300)
    }

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent showCloseButton={false} className="max-w-4xl sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden p-0 flex flex-col">
                {loading || !product ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 overflow-y-auto max-h-[90vh]">
                        {/* Image */}
                        <div className="relative aspect-square md:aspect-auto md:h-full bg-muted overflow-hidden shrink-0">
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

                        {/* Details - Fixed Container */}
                        <div className="flex flex-col h-full bg-white relative max-h-[90vh] overflow-hidden">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/50 hover:bg-muted transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="h-5 w-5 text-muted-foreground" />
                            </button>

                            {/* Static Header Area */}
                            <div className="p-6 md:p-8 pb-4 shrink-0 shadow-sm z-10 pr-14">
                                <DialogHeader className="mb-4">
                                    <DialogTitle className="text-2xl font-bold font-heading text-gradient-navy leading-tight">
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
                                    <div className="mb-0">
                                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tecido</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {fabrics.map(f => (
                                                <button
                                                    key={f.id}
                                                    onClick={() => { setSelectedFabric(f.id); setQuantities({}) }}
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
                            </div>

                            {/* Scrollable Colors Area */}
                            <div className="flex-1 overflow-y-auto p-6 md:p-8 pt-2 pb-2">
                                {/* Color Selection with Quantities */}
                                {selectedFabricObj && selectedFabricObj.colors.length > 0 && (
                                    <div className="flex flex-col min-h-0 h-full">
                                        <div className="flex items-center justify-between mb-3 shrink-0">
                                            <label className="text-xs font-medium text-muted-foreground">Cores e Quantidades</label>
                                            {totalQuantity > 0 && (
                                                <button 
                                                    onClick={() => setQuantities({})}
                                                    className="text-[10px] text-muted-foreground hover:text-destructive underline"
                                                >
                                                    Zerar quantidades
                                                </button>
                                            )}
                                        </div>
                                        
                                        <div className="relative mb-3 shrink-0">
                                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                                <Search className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Buscar cor..."
                                                value={colorSearch}
                                                onChange={(e) => setColorSearch(e.target.value)}
                                                className="w-full h-9 pl-9 pr-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            />
                                            {colorSearch && (
                                                <button
                                                    onClick={() => setColorSearch('')}
                                                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-muted-foreground hover:text-foreground"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2 flex-1">
                                            {selectedFabricObj.colors
                                                .filter(color => color.name.toLowerCase().includes(colorSearch.toLowerCase()))
                                                .map(color => {
                                                const qty = quantities[color.id] || 0;
                                                return (
                                                    <div key={color.id} className={`flex items-center justify-between p-2 rounded-lg border transition-colors shrink-0 ${qty > 0 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                                                        <div className="flex items-center gap-3">
                                                            <div 
                                                                className="h-8 w-8 rounded-full flex items-center justify-center border border-black/10 shadow-inner shrink-0 overflow-hidden"
                                                                style={{
                                                                    backgroundColor: color.hex_code || '#e5e7eb',
                                                                    ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                                }}
                                                            >
                                                                {qty > 0 && (
                                                                    <Check className="h-4 w-4 text-white drop-shadow-md mix-blend-difference" />
                                                                )}
                                                            </div>
                                                            <span className={`text-sm ${qty > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                                {color.name}
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-1 border rounded-lg p-1 bg-white">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setQuantities(prev => ({...prev, [color.id]: Math.max(0, qty - 1)}))}>
                                                                <Minus className="h-3 w-3" />
                                                            </Button>
                                                            <span className="w-8 text-center text-sm font-medium">{qty === 0 ? '-' : qty}</span>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setQuantities(prev => ({...prev, [color.id]: qty + 1}))}>
                                                                <Plus className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            {selectedFabricObj.colors.filter(color => color.name.toLowerCase().includes(colorSearch.toLowerCase())).length === 0 && (
                                                <div className="text-center py-4 text-sm text-muted-foreground">
                                                    Nenhuma cor encontrada com "{colorSearch}"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions (Sticky at bottom) */}
                            <div className="p-4 md:p-5 pt-3 border-t bg-white mt-auto shrink-0 shadow-[0_-8px_15px_-5px_rgba(0,0,0,0.05)] z-10">
                                <Button
                                    className="w-full gradient-bronze border-0 text-white gap-2 h-10 shadow-md"
                                    disabled={!selectedFabric || totalQuantity === 0 || addingToCart}
                                    onClick={handleAddToCart}
                                >
                                    <ShoppingCart className="h-4 w-4" />
                                    {!selectedFabric 
                                        ? 'Selecione um tecido' : 
                                        totalQuantity === 0 
                                        ? 'Selecione as quantidades' : 
                                        `Adicionar ${totalQuantity} itens ao Carrinho`}
                                </Button>

                                {/* View full page link */}
                                <div className="mt-2 text-center">
                                    <Link
                                        href={`/catalog/${product.id}`}
                                        className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
                                        onClick={onClose}
                                    >
                                        Mais Detalhes do Produto →
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
