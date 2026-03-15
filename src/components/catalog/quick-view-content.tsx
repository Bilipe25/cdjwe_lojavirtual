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
import { usePriceTableStore } from '@/lib/stores/price-table-store'
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
            .select('*, fabric:fabrics(*), color:fabric_colors!product_variants_fabric_color_fk(*)')
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
    const { calculateB2BPrice, discountPercentage, overrides } = usePriceTableStore()

    const [selectedFabric, setSelectedFabric] = useState<string | null>(null)
    const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [colorSearch, setColorSearch] = useState('')
    const [activeImageIndex, setActiveImageIndex] = useState(0)
    const [addingToCart, setAddingToCart] = useState(false)

    // Select first fabric automatically if none is selected and fabrics load
    useEffect(() => {
        if (fabrics.length > 0 && !selectedFabric) {
            setSelectedFabric(fabrics[0].id)
        }
    }, [fabrics, selectedFabric])

    // Keep an active variant for price display (defaults to first color of selected fabric)
    useEffect(() => {
        if (!selectedFabric) {
            setActiveVariantId(null)
            return
        }
        const firstVariant = variants.find((v: any) => v.fabric_id === selectedFabric)
        setActiveVariantId(firstVariant?.id || null)
    }, [selectedFabric, variants])

    // Reset state on product change
    useEffect(() => {
        setQuantities({})
        setColorSearch('')
        setActiveImageIndex(0)
        setActiveVariantId(null)
        // Fabric selection reset relies on the effect above
        if (product?.id && fabrics.length > 0) setSelectedFabric(fabrics[0].id)
        else setSelectedFabric(null)
    }, [product?.id, fabrics])

    if (loading || !product) {
        return (
            <div className="flex flex-col md:grid md:grid-cols-[1fr_1fr] h-full p-4 gap-4 animate-pulse">
                <div className="bg-muted w-full aspect-square rounded-lg" />
                <div className="flex flex-col gap-3">
                    <div className="h-6 w-3/4 bg-muted rounded" />
                    <div className="h-4 w-1/4 bg-muted rounded" />
                    <div className="h-8 w-1/3 bg-muted rounded mt-2" />
                    <div className="h-px w-full bg-muted my-2" />
                    <div className="h-4 w-1/4 bg-muted rounded" />
                    <div className="flex gap-2">
                        <div className="h-8 w-20 bg-muted rounded" />
                        <div className="h-8 w-24 bg-muted rounded" />
                    </div>
                    <div className="h-4 w-1/3 bg-muted rounded mt-4" />
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-12 w-full bg-muted rounded" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    const totalQuantity = Object.values(quantities).reduce((a, b) => a + b, 0)
    const selectedFabricObj = fabrics.find(f => f.id === selectedFabric)
    const activeVariant =
        variants.find((v: any) => v.id === activeVariantId) ||
        variants.find((v: any) => v.fabric_id === selectedFabric)
    const displayPrice =
        calculateB2BPrice({
            basePrice: product?.base_price ?? 0,
            fabricModifier: selectedFabricObj?.price_modifier ?? 0,
            variantId: activeVariant?.id,
            variantPriceOverride: activeVariant?.price_override ?? null,
        }) ?? ((product?.base_price ?? 0) + (selectedFabricObj?.price_modifier ?? 0))
    const favorited = product ? isFavorite(product.id) : false
    
    // Calculate accurate total summing each variant due to individual price overrides
    let accTotalPrice = 0;
    Object.entries(quantities).filter(([_, qty]) => qty > 0).forEach(([variantId, qty]) => {
        const matchedVariant = variants.find((v: any) => v.id === variantId);
        if (!matchedVariant) return;
        
        const fabricObjForTotal = fabrics.find(f => f.id === matchedVariant.fabric_id);
        const calcBase = product?.base_price ?? 0;
        const calcMod = matchedVariant?.fabric?.price_modifier ?? fabricObjForTotal?.price_modifier ?? 0;

        const variantFinalPrice =
            calculateB2BPrice({
                basePrice: calcBase,
                fabricModifier: calcMod,
                variantId: matchedVariant?.id,
                variantPriceOverride: (matchedVariant as any)?.price_override ?? null,
            }) ?? (calcBase + calcMod);
        
        accTotalPrice += variantFinalPrice * qty;
    })
    
    const totalPrice = accTotalPrice

    const handleAddToCart = () => {
        if (!product) return
        const variantsToAdd = Object.entries(quantities).filter(([_, qty]) => qty > 0)
        if (variantsToAdd.length === 0) return

        setAddingToCart(true)
        variantsToAdd.forEach(([variantId, qty]) => {
            const matchedVariant = variants.find((v: any) => v.id === variantId)
            if (!matchedVariant) return

            const fabricObj = fabrics.find(f => f.id === matchedVariant.fabric_id)
            const colorObj = fabricObj?.colors.find(c => c.id === matchedVariant.fabric_color_id)
            
            const variantPrice =
                calculateB2BPrice({
                    basePrice: product.base_price ?? 0,
                    fabricModifier: fabricObj?.price_modifier ?? 0,
                    variantId: matchedVariant.id,
                    variantPriceOverride: (matchedVariant as any)?.price_override ?? null,
                }) ?? ((product.base_price ?? 0) + (fabricObj?.price_modifier ?? 0));

            addItem({
                variantId: matchedVariant.id,
                productId: product.id,
                productName: product.name,
                fabricName: fabricObj?.name || '',
                colorName: colorObj?.name || '',
                size: product.size,
                imageUrl: colorObj?.image_url || images[0]?.url || null,
                quantity: qty,
                unitPrice: variantPrice,
            })
        })

        toast.success(`${totalQuantity} itens adicionados ao carrinho!`)
        setQuantities({})
        setAddingToCart(false)
    }

    const filteredColors = selectedFabricObj?.colors.filter(
        color => color.name.toLowerCase().includes(colorSearch.toLowerCase())
    ) ?? []

    return (
        <div className="flex flex-col md:grid md:grid-cols-[1fr_1.2fr] h-full overflow-hidden bg-white">
            {/* Image Gallery */}
            <div className="relative shrink-0 md:h-full overflow-hidden bg-muted/20 border-r border-border/50">
                <ProductImageGallery 
                    images={images}
                    productName={product.name}
                    activeImageIndex={activeImageIndex}
                    onImageChange={setActiveImageIndex}
                />

                {/* Favorite button */}
                <button
                    onClick={() => toggle(product.id)}
                    className="absolute top-3 left-3 h-8 w-8 rounded bg-white shadow-sm border border-border flex items-center justify-center z-20 hover:bg-muted transition-colors"
                >
                    <Heart className={`h-4 w-4 ${favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                </button>
            </div>

            {/* Right Column (Info & Actions) */}
            <div className="flex flex-col h-full overflow-hidden">
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Header info - Compact */}
                    <div className="p-4 md:p-5 pb-2">
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                {showTitle ? (
                                    <DialogTitle className="text-xl md:text-2xl font-bold text-foreground leading-tight">
                                        {product.name}
                                    </DialogTitle>
                                ) : (
                                    <h2 className="text-xl md:text-2xl font-bold text-foreground leading-tight">
                                        {product.name}
                                    </h2>
                                )}
                                {product.size && (
                                    <p className="text-xs text-muted-foreground mt-0.5">Ref/Tamanho: {product.size}</p>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xl font-bold text-primary">
                                    R$ {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>
                    </div>

                    <Separator className="mx-4 md:mx-5 w-auto my-1" />

                    {/* Fabric Selection - Pills */}
                    {fabrics.length > 0 && (
                        <div className="px-4 md:px-5 py-3">
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Modelos/Tecidos ({fabrics.length})</label>
                            <div className="flex flex-wrap gap-1.5">
                                {fabrics.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => { setSelectedFabric(f.id); }}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                            selectedFabric === f.id
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-white border-border text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {f.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Color/Quantity Selection - Dense Table */}
                    {selectedFabricObj && selectedFabricObj.colors.length > 0 && (
                        <div className="px-4 md:px-5 py-2 pb-20 md:pb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Cores Dispo. ({filteredColors.length})
                                </label>
                                {totalQuantity > 0 && (
                                    <button onClick={() => setQuantities({})} className="text-[11px] font-medium text-destructive hover:underline">
                                        Zerar ({totalQuantity})
                                    </button>
                                )}
                            </div>
                            
                            {/* Color search - Compact */}
                            {selectedFabricObj.colors.length > 5 && (
                                <div className="relative mb-3">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Buscar cor..."
                                        value={colorSearch}
                                        onChange={e => setColorSearch(e.target.value)}
                                        className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                            )}

                            {/* Color List Dense */}
                            <div className="flex flex-col gap-1.5">
                                {filteredColors.map(color => {
                                    // Identificar a variante correspondente a esta cor no tecido selecionado
                                    const variant = variants.find(
                                        (v: any) => v.fabric_id === selectedFabric && v.fabric_color_id === color.id
                                    )
                                    if (!variant) return null;

                                    const qty = quantities[variant.id] || 0
                                    const isSelected = qty > 0

                                    const baseCalc = (product?.base_price ?? 0) + (selectedFabricObj.price_modifier ?? 0)
                                    const unitPrice =
                                        calculateB2BPrice({
                                            basePrice: product?.base_price ?? 0,
                                            fabricModifier: selectedFabricObj.price_modifier ?? 0,
                                            variantId: variant.id,
                                            variantPriceOverride: (variant as any)?.price_override ?? null,
                                        }) ?? baseCalc
                                    const hasVariantOverride = (variant as any)?.price_override !== null && (variant as any)?.price_override !== undefined
                                    const hasTableOverride = !hasVariantOverride && overrides[variant.id] !== undefined
                                    const hasDiscount = !hasVariantOverride && !hasTableOverride && discountPercentage > 0
                                    const lineTotal = unitPrice * qty

                                    return (
                                        <div
                                            key={color.id}
                                            className={`flex items-center justify-between p-1.5 pr-2 rounded-md border transition-colors ${
                                                isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-white hover:border-border'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 flex-1 min-w-0"
                                                onClick={() => {
                                                    const imgIndex = images.findIndex(img => img.url === color.image_url)
                                                    if (imgIndex !== -1) setActiveImageIndex(imgIndex)
                                                    setActiveVariantId(variant.id)
                                                }}
                                            >
                                                <div
                                                    className="h-7 w-7 md:h-8 md:w-8 rounded-sm border shadow-sm shrink-0 cursor-pointer relative"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#f3f4f6',
                                                        ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                    }}
                                                />
                                                <div className="flex flex-col min-w-0">
                                                    <span className={`text-sm truncate select-none ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground font-medium'}`}>
                                                        {color.name}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[10px] text-muted-foreground font-medium">
                                                            R$ {unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / un
                                                        </span>
                                                        {hasVariantOverride && (
                                                            <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1 rounded font-medium">Cor</span>
                                                        )}
                                                        {hasTableOverride && (
                                                            <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-medium">Tabela</span>
                                                        )}
                                                        {hasDiscount && (
                                                            <span className="text-[9px] bg-green-100 text-green-800 px-1 rounded font-medium">-{discountPercentage}%</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Quantity Controls & Subtotal - Aligned right */}
                                            <div className="flex flex-col md:flex-row items-end md:items-center gap-1.5 md:gap-3 shrink-0">
                                                {/* Subtotal da Linha (só aparece se selecionado) */}
                                                {isSelected && (
                                                    <span className="text-xs font-bold text-primary whitespace-nowrap hidden md:block">
                                                        R$ {lineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-1 bg-white border border-border/80 rounded shrink-0 p-0.5">
                                                    <button
                                                        className="h-6 w-6 md:h-7 md:w-8 rounded-sm flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                                        disabled={qty === 0}
                                                        onClick={() => {
                                                            setActiveVariantId(variant.id)
                                                            setQuantities(prev => ({ ...prev, [variant.id]: Math.max(0, qty - 1) }))
                                                        }}
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </button>
                                                    {/* Hidden input could replace span later for keyboard typing */}
                                                    <span className="w-6 md:w-8 text-center text-sm font-semibold select-none">
                                                        {qty === 0 ? '-' : qty}
                                                    </span>
                                                    <button
                                                        className="h-6 w-6 md:h-7 md:w-8 rounded-sm flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all"
                                                        onClick={() => {
                                                            setActiveVariantId(variant.id)
                                                            setQuantities(prev => ({ ...prev, [variant.id]: qty + 1 }))
                                                        }}
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {filteredColors.length === 0 && colorSearch && (
                                    <div className="py-4 text-center text-sm text-muted-foreground bg-muted/20 border border-dashed rounded-md">
                                        Cor não encontrada
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer B2B - High Density */}
                <div className="border-t border-border bg-white p-3 md:p-4 shrink-0 transition-transform">
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                        {/* Status/Totals Left */}
                        <div className="flex-1 flex justify-between w-full sm:w-auto items-center sm:block">
                            <span className="text-sm font-medium text-muted-foreground">
                                Total ({totalQuantity} iten{totalQuantity !== 1 ? 's' : ''})
                            </span>
                            <span className="text-lg font-bold text-foreground sm:block">
                                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        
                        {/* Action Right */}
                        <Button
                            className="w-full sm:w-auto min-w-[180px] h-11 px-6 font-semibold rounded-md gap-2"
                            disabled={!selectedFabric || totalQuantity === 0 || addingToCart}
                            onClick={handleAddToCart}
                        >
                            <ShoppingCart className="h-4 w-4" />
                            {totalQuantity === 0 ? 'Selecionar cores' : 'Adicionar Lote'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
