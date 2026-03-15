'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft,
    ShoppingCart,
    Minus,
    Plus,
    Package,
    Check,
    ChevronLeft,
    ChevronRight,
    Truck,
    Shield,
    Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ProductDetailSkeleton } from '@/components/ui/skeletons'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/lib/stores/cart-store'
import { usePriceTableStore } from '@/lib/stores/price-table-store'
import { toast } from 'sonner'
import type { Product, ProductImage, Fabric, FabricColor, ProductVariant } from '@/lib/types'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'

export default function ProductDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { addItem, openCart } = useCartStore()
    const { calculateB2BPrice, discountPercentage, overrides } = usePriceTableStore()

    const [product, setProduct] = useState<Product | null>(null)
    const [images, setImages] = useState<ProductImage[]>([])
    const [fabrics, setFabrics] = useState<(Fabric & { colors: FabricColor[] })[]>([])
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [loading, setLoading] = useState(true)

    // Selection state
    const [selectedFabric, setSelectedFabric] = useState<string | null>(null)
    const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [addingToCart, setAddingToCart] = useState(false)
    const [activeImageIndex, setActiveImageIndex] = useState(0)

    useEffect(() => {
        loadProduct()
    }, [params.id])

    const loadProduct = async () => {
        setLoading(true)
        const supabase = createClient()

        // Load product
        const { data: prod } = await supabase
            .from('products')
            .select('*, category:categories(*)')
            .eq('id', params.id)
            .single()

        if (!prod) {
            router.push('/catalog')
            return
        }
        setProduct(prod)

        // Load images
        const { data: imgs } = await supabase
            .from('product_images')
            .select('*')
            .eq('product_id', params.id)
            .order('sort_order')

        if (imgs) setImages(imgs)

        // Load variants with fabrics and colors
        const { data: vars } = await supabase
            .from('product_variants')
            .select(`
        *,
        fabric:fabrics(*),
        fabric_color:fabric_colors!product_variants_fabric_color_fk(*)
      `)
            .eq('product_id', params.id)
            .eq('is_active', true)

        if (vars) setVariants(vars)

        // Get unique fabrics with their available colors for this product
        const fabricMap = new Map<string, Fabric & { colors: FabricColor[] }>()
        vars?.forEach((v: ProductVariant & { fabric: Fabric; fabric_color: FabricColor }) => {
            if (!fabricMap.has(v.fabric_id)) {
                fabricMap.set(v.fabric_id, { ...v.fabric, colors: [] })
            }
            const fab = fabricMap.get(v.fabric_id)!
            if (!fab.colors.find(c => c.id === v.fabric_color_id)) {
                fab.colors.push(v.fabric_color)
            }
        })
        const fabricList = Array.from(fabricMap.values())
        setFabrics(fabricList)

        // Select first fabric by default
        if (fabricList.length > 0) {
            setSelectedFabric(fabricList[0].id)
        }

        setLoading(false)
    }

    // Get available colors for selected fabric
    const availableColors = fabrics.find(f => f.id === selectedFabric)?.colors || []

    // Keep an active variant for accurate price display
    useEffect(() => {
        if (!selectedFabric) {
            setActiveVariantId(null)
            return
        }
        const firstVariant = variants.find(v => v.fabric_id === selectedFabric)
        setActiveVariantId(firstVariant?.id || null)
    }, [selectedFabric, variants])

    const activeVariant =
        variants.find(v => v.id === activeVariantId) ||
        variants.find(v => v.fabric_id === selectedFabric)

    const price = calculateB2BPrice({
        basePrice: product?.base_price ?? 0,
        fabricModifier: fabrics.find(f => f.id === selectedFabric)?.price_modifier ?? 0,
        variantId: activeVariant?.id,
        variantPriceOverride: activeVariant?.price_override ?? null,
    }) ?? ((product?.base_price ?? 0) + (fabrics.find(f => f.id === selectedFabric)?.price_modifier ?? 0))

    // Get variant image or fall back to product images
    const displayImages = activeVariant?.image_url
        ? [{ url: activeVariant.image_url, id: 'variant' }, ...images.map(img => ({ url: img.url, id: img.id }))]
        : images.map(img => ({ url: img.url, id: img.id }))

    const getVariantUnitPrice = (variant: ProductVariant) => {
        const fabricMod = fabrics.find(f => f.id === variant.fabric_id)?.price_modifier ?? 0
        return (
            calculateB2BPrice({
                basePrice: product?.base_price ?? 0,
                fabricModifier: fabricMod,
                variantId: variant.id,
                variantPriceOverride: variant.price_override ?? null,
            }) ?? ((product?.base_price ?? 0) + fabricMod)
        )
    }

    const totalSelectedQuantity = Object.values(quantities).reduce((a, b) => a + b, 0)
    const totalSelectedPrice = Object.entries(quantities).reduce((acc, [colorId, qty]) => {
        if (qty <= 0) return acc
        const matchedVariant = variants.find(
            (v: any) => v.fabric_id === selectedFabric && v.fabric_color_id === colorId
        )
        if (!matchedVariant) return acc
        return acc + (getVariantUnitPrice(matchedVariant) * qty)
    }, 0)

    const handleSelectFabric = (fabricId: string) => {
        setSelectedFabric(fabricId)
        setQuantities({})
        setActiveImageIndex(0)
        const firstVariant = variants.find(v => v.fabric_id === fabricId)
        setActiveVariantId(firstVariant?.id || null)
    }

    const handleAddToCart = () => {
        if (!product || !selectedFabric) return

        const colorsToAdd = Object.entries(quantities).filter(([_, qty]) => qty > 0)
        if (colorsToAdd.length === 0) return

        setAddingToCart(true)

        const fabric = fabrics.find(f => f.id === selectedFabric)

        colorsToAdd.forEach(([colorId, qty]) => {
            const matchedVariant = variants.find(
                (v: any) => v.fabric_id === selectedFabric && v.fabric_color_id === colorId
            )
            const colorObj = availableColors.find(c => c.id === colorId)

            const variantPrice = matchedVariant ? getVariantUnitPrice(matchedVariant) : price

            addItem({
                variantId: matchedVariant?.id || `${product.id}-${selectedFabric}-${colorId}`,
                productId: product.id,
                productName: product.name,
                fabricName: fabric?.name || '',
                colorName: colorObj?.name || '',
                size: product.size || null,
                imageUrl: displayImages[0]?.url || null, // Optional: find specific image for color
                quantity: qty,
                unitPrice: variantPrice,
            })
        })

        setAddingToCart(false)

        toast.success('Produto adicionado ao carrinho!', {
            action: {
                label: 'Ver Carrinho',
                onClick: openCart,
            },
        })
    }

    if (loading) {
        return <ProductDetailSkeleton />
    }

    if (!product) return null

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Back Button */}
            <Button
                variant="ghost"
                className="mb-4 gap-2"
                onClick={() => router.push('/catalog')}
            >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao Catálogo
            </Button>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                {/* Image Gallery */}
                <div className="space-y-4">
                    <ProductImageGallery 
                        images={displayImages}
                        productName={product.name}
                        activeImageIndex={activeImageIndex}
                        onImageChange={setActiveImageIndex}
                    />
                </div>

                {/* Product Info */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-6"
                >
                    {/* Category & Name */}
                    <div>
                        {product.category && (
                            <Badge variant="secondary" className="mb-2">
                                {(product.category as { name: string }).name}
                            </Badge>
                        )}
                        <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)]">
                            {product.name}
                        </h1>
                        {product.size && (
                            <p className="text-muted-foreground mt-1">{product.size}</p>
                        )}
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gradient-bronze">
                            R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    {/* Description */}
                    {product.description && (
                        <p className="text-muted-foreground leading-relaxed">
                            {product.description}
                        </p>
                    )}

                    <Separator />

                    {/* Fabric Selection */}
                    {fabrics.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold mb-3">
                                Tecido{' '}
                                <span className="text-muted-foreground font-normal">
                                    — {fabrics.find(f => f.id === selectedFabric)?.name || 'Selecione'}
                                </span>
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {fabrics.map((fabric) => (
                                    <TooltipProvider key={fabric.id}>
                                        <Tooltip>
                                            <TooltipTrigger render={
                                                <button
                                                    onClick={() => handleSelectFabric(fabric.id)}
                                                    className={`px-4 py-2 rounded-lg text-sm border transition-all ${selectedFabric === fabric.id
                                                            ? 'border-primary bg-primary/10 text-primary font-medium shadow-sm'
                                                            : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                                                        }`}
                                                >
                                                    {fabric.name}
                                                    {fabric.price_modifier > 0 && (
                                                        <span className="text-[10px] ml-1 text-bronze">
                                                            +R${fabric.price_modifier.toFixed(0)}
                                                        </span>
                                                    )}
                                                </button>
                                            } />
                                            {fabric.description && (
                                                <TooltipContent>
                                                    <p>{fabric.description}</p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </TooltipProvider>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Color and Quantity Selection */}
                    {availableColors.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold">
                                    Cores e Quantidades
                                </h3>
                                {totalSelectedQuantity > 0 && (
                                    <button
                                        onClick={() => setQuantities({})}
                                        className="text-xs text-muted-foreground hover:text-destructive underline"
                                    >
                                        Zerar
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
                                {availableColors.map((color) => {
                                    const qty = quantities[color.id] || 0;
                                    const matchedVariant = variants.find(
                                        (v: any) => v.fabric_id === selectedFabric && v.fabric_color_id === color.id
                                    )
                                    if (!matchedVariant) return null

                                    const unitPrice = getVariantUnitPrice(matchedVariant)
                                    const hasVariantOverride = matchedVariant.price_override !== null && matchedVariant.price_override !== undefined
                                    const hasTableOverride = !hasVariantOverride && overrides[matchedVariant.id] !== undefined
                                    const hasDiscount = !hasVariantOverride && !hasTableOverride && discountPercentage > 0

                                    return (
                                        <div key={color.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors shrink-0 ${qty > 0 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="h-10 w-10 rounded-full flex items-center justify-center border border-black/10 shadow-inner shrink-0 overflow-hidden relative cursor-pointer group"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#e5e7eb',
                                                        ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                    }}
                                                    onClick={() => {
                                                        const imgIndex = displayImages.findIndex(img => img.url === color.image_url)
                                                        if (imgIndex !== -1) {
                                                            setActiveImageIndex(imgIndex)
                                                        }
                                                        setActiveVariantId(matchedVariant.id)
                                                    }}
                                                >
                                                    {qty > 0 && (
                                                        <Check className="h-5 w-5 text-white drop-shadow-md mix-blend-difference" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`text-base ${qty > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                        {color.name}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground font-medium">
                                                            R$ {unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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

                                            <div className="flex items-center gap-2 border rounded-lg p-1 bg-white">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        setActiveVariantId(matchedVariant.id)
                                                        setQuantities(prev => ({ ...prev, [color.id]: Math.max(0, qty - 1) }))
                                                    }}
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <span className="w-8 text-center font-medium">{qty === 0 ? '-' : qty}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        setActiveVariantId(matchedVariant.id)
                                                        setQuantities(prev => ({ ...prev, [color.id]: qty + 1 }))
                                                    }}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Total Price summary */}
                            <div className="mt-4 flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Total selecionado:</span>
                                <span className="font-semibold text-lg">
                                    {totalSelectedQuantity} itens = R$ {totalSelectedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* Add to Cart */}
                    <Button
                        size="lg"
                        className="w-full h-14 text-base gradient-navy border-0 text-white shadow-md disabled:opacity-50"
                        onClick={handleAddToCart}
                        disabled={!selectedFabric || totalSelectedQuantity === 0 || addingToCart}
                    >
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        {!selectedFabric
                            ? 'Selecione um tecido' :
                            totalSelectedQuantity === 0
                                ? 'Selecione as quantidades' :
                                `Adicionar ${totalSelectedQuantity} itens ao Carrinho`}
                    </Button>

                    {/* Benefits */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Truck className="h-4 w-4 text-bronze shrink-0" />
                            <span>Entrega para todo Brasil</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Shield className="h-4 w-4 text-bronze shrink-0" />
                            <span>Garantia de fábrica</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Star className="h-4 w-4 text-bronze shrink-0" />
                            <span>Qualidade premium</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
