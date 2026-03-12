'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
    X, Package, ShoppingCart, Check, Search,
    ChevronLeft, ChevronRight, Minus, Plus, Heart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import { useState, useEffect, useCallback } from 'react'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/lib/stores/cart-store'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { toast } from 'sonner'
import type { Product, ProductImage, ProductVariant, Fabric, FabricColor } from '@/lib/types'

export interface QuickViewData {
    product: Product | null
    images: ProductImage[]
    fabrics: (Fabric & { colors: FabricColor[] })[]
    variants: ProductVariant[]
    loading: boolean
}

export function useQuickViewData(productId: string | null, open: boolean): QuickViewData {
    const [product, setProduct] = useState<Product | null>(null)
    const [images, setImages] = useState<ProductImage[]>([])
    const [fabrics, setFabrics] = useState<(Fabric & { colors: FabricColor[] })[]>([])
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [loading, setLoading] = useState(false)

    const loadProduct = useCallback(async (id: string) => {
        setLoading(true)
        const supabase = createClient()

        const { data: productData } = await supabase.from('products').select('*').eq('id', id).single()
        if (productData) setProduct(productData)

        const { data: imagesData } = await supabase
            .from('product_images').select('*').eq('product_id', id).order('sort_order')
        if (imagesData) setImages(imagesData)

        const { data: variantsData } = await supabase
            .from('product_variants')
            .select('*, fabric:fabrics(*), color:fabric_colors(*)')
            .eq('product_id', id)
            .eq('is_active', true)
        if (variantsData) {
            setVariants(variantsData)
            const fabricMap = new Map<string, Fabric & { colors: FabricColor[] }>()
            variantsData.forEach((v: any) => {
                if (v.fabric && v.color) {
                    if (!fabricMap.has(v.fabric.id)) fabricMap.set(v.fabric.id, { ...v.fabric, colors: [] })
                    const f = fabricMap.get(v.fabric.id)!
                    if (!f.colors.find((c: FabricColor) => c.id === v.color.id)) f.colors.push(v.color)
                }
            })
            setFabrics(Array.from(fabricMap.values()))
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        if (open && productId) {
            loadProduct(productId)
        } else {
            setProduct(null); setImages([]); setFabrics([]); setVariants([])
        }
    }, [open, productId, loadProduct])

    return { product, images, fabrics, variants, loading }
}

interface QuickViewContentProps {
    data: QuickViewData
    onClose: () => void
    /** Show the dialog title (needed for accessibility when inside a Dialog) */
    showTitle?: boolean
}

const statusLabels: Record<string, string> = {
    pending: 'Em Análise', approved: 'Aprovado', in_production: 'Em Produção',
    shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado',
}

export function QuickViewContent({ data, onClose, showTitle = true }: QuickViewContentProps) {
    const { product, images, fabrics, variants, loading } = data
    const { addItem, openCart } = useCartStore()
    const { isFavorite, toggle } = useFavoritesStore()

    const [selectedFabric, setSelectedFabric] = useState<string | null>(null)
    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [colorSearch, setColorSearch] = useState('')
    const [activeImageIndex, setActiveImageIndex] = useState(0)
    const [addingToCart, setAddingToCart] = useState(false)

    // Reset variant state when product changes
    useEffect(() => {
        setSelectedFabric(null)
        setQuantities({})
        setColorSearch('')
        setActiveImageIndex(0)
    }, [product?.id])

    const totalQuantity = Object.values(quantities).reduce((a, b) => a + b, 0)
    const selectedFabricObj = fabrics.find(f => f.id === selectedFabric)
    const displayPrice = (product?.base_price ?? 0) + (selectedFabricObj?.price_modifier ?? 0)
    const favorited = product ? isFavorite(product.id) : false

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
        setQuantities({})
        setAddingToCart(false)
    }

    if (loading || !product) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    const filteredColors = selectedFabricObj?.colors.filter(
        color => color.name.toLowerCase().includes(colorSearch.toLowerCase())
    ) ?? []

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Image Gallery */}
            <div className="relative bg-muted shrink-0 aspect-4/3 sm:aspect-square md:aspect-auto md:h-[260px]">
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

                {/* Image nav arrows */}
                {images.length > 1 && (
                    <>
                        <button
                            onClick={() => setActiveImageIndex(i => i === 0 ? images.length - 1 : i - 1)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow mobile-touch-target"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setActiveImageIndex(i => i === images.length - 1 ? 0 : i + 1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow mobile-touch-target"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] backdrop-blur">
                            {activeImageIndex + 1}/{images.length}
                        </div>
                        {/* Dot indicators */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                            {images.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActiveImageIndex(i)}
                                    className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* Favorite button on image */}
                <button
                    onClick={() => toggle(product.id)}
                    className="absolute top-3 left-3 h-9 w-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow mobile-touch-target"
                >
                    <Heart className={`h-4 w-4 ${favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Header info */}
                <div className="p-4 pb-2">
                    {showTitle && (
                        <DialogTitle className="text-xl font-bold font-heading text-gradient-navy leading-tight mb-1">
                            {product.name}
                        </DialogTitle>
                    )}
                    {!showTitle && (
                        <h2 className="text-xl font-bold font-heading text-gradient-navy leading-tight mb-1">
                            {product.name}
                        </h2>
                    )}
                    {product.size && (
                        <p className="text-xs text-muted-foreground mb-1">{product.size}</p>
                    )}
                    {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{product.description}</p>
                    )}
                    <p className="text-2xl font-bold text-gradient-bronze">
                        R$ {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>

                <Separator />

                {/* Fabric Selection */}
                {fabrics.length > 0 && (
                    <div className="p-4 pb-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Tecido</label>
                        <div className="flex flex-wrap gap-1.5">
                            {fabrics.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => { setSelectedFabric(f.id); setQuantities({}) }}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                                        selectedFabric === f.id
                                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                                            : 'border-border hover:border-primary/50 text-muted-foreground'
                                    }`}
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Color/Quantity Selection */}
                {selectedFabricObj && selectedFabricObj.colors.length > 0 && (
                    <div className="p-4 pt-2">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cores e Quantidades</label>
                            {totalQuantity > 0 && (
                                <button onClick={() => setQuantities({})} className="text-[10px] text-muted-foreground hover:text-destructive underline">
                                    Zerar
                                </button>
                            )}
                        </div>
                        {/* Color search */}
                        <div className="relative mb-3">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Buscar cor..."
                                value={colorSearch}
                                onChange={e => setColorSearch(e.target.value)}
                                className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-transparent text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        </div>
                        {/* Color rows */}
                        <div className="flex flex-col gap-2">
                            {filteredColors.map(color => {
                                const qty = quantities[color.id] || 0
                                return (
                                    <div
                                        key={color.id}
                                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${qty > 0 ? 'border-primary bg-primary/5' : 'border-border'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="h-8 w-8 rounded-full border border-black/10 shadow-inner shrink-0 overflow-hidden flex items-center justify-center"
                                                style={{
                                                    backgroundColor: color.hex_code || '#e5e7eb',
                                                    ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                }}
                                            >
                                                {qty > 0 && <Check className="h-4 w-4 text-white drop-shadow-md mix-blend-difference" />}
                                            </div>
                                            <span className={`text-sm ${qty > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                {color.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 border rounded-lg p-1 bg-white">
                                            <Button variant="ghost" size="icon" className="h-7 w-7"
                                                onClick={() => setQuantities(prev => ({ ...prev, [color.id]: Math.max(0, qty - 1) }))}>
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="w-7 text-center text-sm font-medium">{qty === 0 ? '-' : qty}</span>
                                            <Button variant="ghost" size="icon" className="h-7 w-7"
                                                onClick={() => setQuantities(prev => ({ ...prev, [color.id]: qty + 1 }))}>
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                            {filteredColors.length === 0 && colorSearch && (
                                <p className="text-center py-4 text-sm text-muted-foreground">Nenhuma cor encontrada</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Link to full page */}
                <div className="px-4 pb-4 text-center">
                    <Link
                        href={`/catalog/${product.id}`}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        onClick={onClose}
                    >
                        Ver página completa do produto →
                    </Link>
                </div>
            </div>

            {/* Sticky Add to Cart */}
            <div
                className="shrink-0 border-t bg-white p-4 shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.07)]"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
            >
                <Button
                    className="w-full gradient-bronze border-0 text-white gap-2 h-12 text-sm shadow-md"
                    disabled={!selectedFabric || totalQuantity === 0 || addingToCart}
                    onClick={handleAddToCart}
                >
                    <ShoppingCart className="h-4 w-4" />
                    {!selectedFabric
                        ? 'Selecione um tecido'
                        : totalQuantity === 0
                        ? 'Selecione as quantidades'
                        : `Adicionar ${totalQuantity} ${totalQuantity === 1 ? 'item' : 'itens'} ao Carrinho`}
                </Button>
            </div>
        </div>
    )
}
