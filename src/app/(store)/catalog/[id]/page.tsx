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
import { toast } from 'sonner'
import type { Product, ProductImage, Fabric, FabricColor, ProductVariant } from '@/lib/types'

export default function ProductDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { addItem, openCart } = useCartStore()

    const [product, setProduct] = useState<Product | null>(null)
    const [images, setImages] = useState<ProductImage[]>([])
    const [fabrics, setFabrics] = useState<(Fabric & { colors: FabricColor[] })[]>([])
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [loading, setLoading] = useState(true)

    // Selection state
    const [selectedFabric, setSelectedFabric] = useState<string | null>(null)
    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [addingToCart, setAddingToCart] = useState(false)
    const [activeImageIndex, setActiveImageIndex] = useState(0)

    // Touch swipe support for image gallery
    const touchStartX = useRef<number | null>(null)
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX
    }
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null || displayImages.length <= 1) return
        const diff = touchStartX.current - e.changedTouches[0].clientX
        const threshold = 50
        if (diff > threshold) {
            // Swipe left → next image
            setActiveImageIndex(prev => prev === displayImages.length - 1 ? 0 : prev + 1)
        } else if (diff < -threshold) {
            // Swipe right → previous image
            setActiveImageIndex(prev => prev === 0 ? displayImages.length - 1 : prev - 1)
        }
        touchStartX.current = null
    }

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
        fabric_color:fabric_colors(*)
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

    // Get selected variant (if applicable, used for getting price overrides if color is not a factor)
    // For specific colors we should map them, but we'll use first color as base for now just for default image
    const selectedVariant = variants.find(
        v => v.fabric_id === selectedFabric
    )

    // Calculate price
    const getPrice = () => {
        if (selectedVariant?.price_override) return selectedVariant.price_override
        const fabric = fabrics.find(f => f.id === selectedFabric)
        return (product?.base_price || 0) + (fabric?.price_modifier || 0)
    }

    const price = getPrice()

    // Get variant image or fall back to product images
    const displayImages = selectedVariant?.image_url
        ? [{ url: selectedVariant.image_url, id: 'variant' }, ...images.map(img => ({ url: img.url, id: img.id }))]
        : images.map(img => ({ url: img.url, id: img.id }))

    const handleSelectFabric = (fabricId: string) => {
        setSelectedFabric(fabricId)
        setQuantities({})
        setActiveImageIndex(0)
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

            const variantPrice = (matchedVariant as any)?.price_override ?? price

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
                    {/* Main Image */}
                    <motion.div
                        key={displayImages[activeImageIndex]?.url}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="relative aspect-square rounded-2xl overflow-hidden bg-muted glass-card touch-pan-y"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        {displayImages.length > 0 ? (
                            <Image
                                src={displayImages[activeImageIndex]?.url}
                                alt={product.name}
                                fill
                                className="object-cover"
                                priority
                            />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center">
                                <Package className="h-24 w-24 text-muted-foreground/20" />
                            </div>
                        )}

                        {/* Nav Arrows */}
                        {displayImages.length > 1 && (
                            <>
                                <button
                                    onClick={() => setActiveImageIndex(
                                        activeImageIndex === 0 ? displayImages.length - 1 : activeImageIndex - 1
                                    )}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition-colors shadow"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={() => setActiveImageIndex(
                                        activeImageIndex === displayImages.length - 1 ? 0 : activeImageIndex + 1
                                    )}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition-colors shadow"
                                >
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                            </>
                        )}

                        {/* Image counter */}
                        {displayImages.length > 1 && (
                            <div className="absolute bottom-3 right-3 px-2 py-1 rounded-full bg-black/50 text-white text-xs backdrop-blur">
                                {activeImageIndex + 1} / {displayImages.length}
                            </div>
                        )}
                    </motion.div>

                    {/* Thumbnails */}
                    {displayImages.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {displayImages.map((img, i) => (
                                <button
                                    key={img.id}
                                    onClick={() => setActiveImageIndex(i)}
                                    className={`relative h-16 w-16 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${i === activeImageIndex
                                            ? 'border-primary shadow-md'
                                            : 'border-transparent opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    <Image src={img.url} alt="" fill className="object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
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
                                {Object.values(quantities).reduce((a, b) => a + b, 0) > 0 && (
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
                                    return (
                                        <div key={color.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors shrink-0 ${qty > 0 ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="h-10 w-10 rounded-full flex items-center justify-center border border-black/10 shadow-inner shrink-0 overflow-hidden relative cursor-pointer group"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#e5e7eb',
                                                        ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                    }}
                                                    onClick={() => setActiveImageIndex(
                                                        displayImages.findIndex(img => img.url === (color as any).image_url) !== -1 ? displayImages.findIndex(img => img.url === (color as any).image_url) : 0
                                                    )}
                                                >
                                                    {qty > 0 && (
                                                        <Check className="h-5 w-5 text-white drop-shadow-md mix-blend-difference" />
                                                    )}
                                                </div>
                                                <span className={`text-base ${qty > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                                    {color.name}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 border rounded-lg p-1 bg-white">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => setQuantities(prev => ({ ...prev, [color.id]: Math.max(0, qty - 1) }))}
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <span className="w-8 text-center font-medium">{qty === 0 ? '-' : qty}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => setQuantities(prev => ({ ...prev, [color.id]: qty + 1 }))}
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
                                    {Object.values(quantities).reduce((a, b) => a + b, 0)} itens = R$ {(price * Object.values(quantities).reduce((a, b) => a + b, 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                        disabled={!selectedFabric || Object.values(quantities).reduce((a, b) => a + b, 0) === 0 || addingToCart}
                    >
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        {!selectedFabric
                            ? 'Selecione um tecido' :
                            Object.values(quantities).reduce((a, b) => a + b, 0) === 0
                                ? 'Selecione as quantidades' :
                                `Adicionar ${Object.values(quantities).reduce((a, b) => a + b, 0)} itens ao Carrinho`}
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
