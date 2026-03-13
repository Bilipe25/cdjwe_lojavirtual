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
import { ProductImageGallery } from '../products/ProductImageGallery'

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
        <div className="flex flex-col md:grid md:grid-cols-[1.2fr_1fr] h-full overflow-hidden">
            {/* Image Gallery */}
            <div className="relative shrink-0 md:h-full overflow-hidden">
                <ProductImageGallery 
                    images={images}
                    productName={product.name}
                    activeImageIndex={activeImageIndex}
                    onImageChange={setActiveImageIndex}
                />

                {/* Favorite button on image */}
                <button
                    onClick={() => toggle(product.id)}
                    className="absolute top-3 left-3 h-9 w-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-lg z-20 hover:scale-110 transition-transform mobile-touch-target"
                >
                    <Heart className={`h-4 w-4 ${favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                </button>
            </div>

            {/* Right Column (Info & Actions) */}
            <div className="flex flex-col h-full overflow-hidden">
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Header info */}
                    <div className="p-6 md:p-10 pb-2 md:pb-6">
                        {showTitle && (
                            <DialogTitle className="text-2xl md:text-3xl font-bold font-heading text-primary leading-tight mb-2">
                                {product.name}
                            </DialogTitle>
                        )}
                        {!showTitle && (
                            <h2 className="text-2xl md:text-3xl font-bold font-heading text-primary leading-tight mb-2">
                                {product.name}
                            </h2>
                        )}
                        {product.size && (
                            <p className="text-sm text-muted-foreground mb-3">{product.size}</p>
                        )}
                        {product.description && (
                            <p className="text-sm text-muted-foreground/80 leading-relaxed mb-4 line-clamp-3">{product.description}</p>
                        )}
                        <p className="text-3xl font-extrabold text-gradient-bronze">
                            R$ {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    <div className="px-6 md:px-10">
                        <Separator />
                    </div>

                    {/* Fabric Selection */}
                    {fabrics.length > 0 && (
                        <div className="px-6 md:px-10 pt-4 pb-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Tecido</label>
                            <div className="flex flex-wrap gap-2">
                                {fabrics.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => { setSelectedFabric(f.id); setQuantities({}) }}
                                        className={`px-4 py-2 rounded-full text-xs border transition-all ${
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
                        <div className="px-6 md:px-10 pt-1 pb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cores e Quantidades</label>
                                {totalQuantity > 0 && (
                                    <button onClick={() => setQuantities({})} className="text-[10px] text-muted-foreground hover:text-destructive underline">
                                        Zerar tudo
                                    </button>
                                )}
                            </div>
                            {/* Color search */}
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nome da cor..."
                                    value={colorSearch}
                                    onChange={e => setColorSearch(e.target.value)}
                                    className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                            </div>
                            {/* Color rows */}
                            <div className="flex flex-col gap-3">
                                {filteredColors.map(color => {
                                    const qty = quantities[color.id] || 0
                                    return (
                                        <div
                                            key={color.id}
                                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${qty > 0 ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-border bg-white shadow-sm'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="h-10 w-10 rounded-full border border-black/10 shadow-inner shrink-0 overflow-hidden flex items-center justify-center relative cursor-pointer group"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#f3f4f6',
                                                        ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                    }}
                                                    onClick={() => {
                                                        const imgIndex = images.findIndex(img => img.url === color.image_url)
                                                        if (imgIndex !== -1) {
                                                            setActiveImageIndex(imgIndex)
                                                        }
                                                    }}
                                                >
                                                    {qty > 0 && <div className="absolute inset-0 bg-primary/30 flex items-center justify-center transition-opacity"><Check className="h-5 w-5 text-white" /></div>}
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                </div>
                                                <span className={`text-sm ${qty > 0 ? 'font-bold text-foreground' : 'text-muted-foreground font-medium'}`}>
                                                    {color.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 border rounded-xl p-1 bg-white shadow-sm">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted"
                                                    onClick={() => setQuantities(prev => ({ ...prev, [color.id]: Math.max(0, qty - 1) }))}>
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-8 text-center text-sm font-bold">{qty === 0 ? '-' : qty}</span>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted"
                                                    onClick={() => setQuantities(prev => ({ ...prev, [color.id]: qty + 1 }))}>
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                                {filteredColors.length === 0 && colorSearch && (
                                    <p className="text-center py-8 text-sm text-muted-foreground italic">Nenhuma cor corresponde à busca</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Add to Cart & Actions */}
                <div className="p-6 md:p-8 pt-2 flex flex-col items-center gap-2 bg-white">
                    <Button
                        className="w-full gradient-bronze border-0 text-white gap-3 h-12 text-sm font-bold shadow-lg shadow-bronze/10 rounded-xl transition-transform active:scale-[0.98]"
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

                    <Link
                        href={`/catalog/${product.id}`}
                        className="text-[13px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                        onClick={onClose}
                    >
                        Mais Detalhes do Produto →
                    </Link>
                </div>
            </div>
        </div>
    )
}
