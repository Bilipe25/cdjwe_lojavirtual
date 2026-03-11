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
    const [selectedColor, setSelectedColor] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
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
            if (fabricList[0].colors.length > 0) {
                setSelectedColor(fabricList[0].colors[0].id)
            }
        }

        setLoading(false)
    }

    // Get available colors for selected fabric
    const availableColors = fabrics.find(f => f.id === selectedFabric)?.colors || []

    // Get selected variant
    const selectedVariant = variants.find(
        v => v.fabric_id === selectedFabric && v.fabric_color_id === selectedColor
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
        const fabric = fabrics.find(f => f.id === fabricId)
        if (fabric && fabric.colors.length > 0) {
            setSelectedColor(fabric.colors[0].id)
        } else {
            setSelectedColor(null)
        }
        setActiveImageIndex(0)
    }

    const handleAddToCart = () => {
        if (!product || !selectedFabric || !selectedColor) {
            toast.error('Selecione tecido e cor')
            return
        }

        const fabric = fabrics.find(f => f.id === selectedFabric)
        const color = availableColors.find(c => c.id === selectedColor)

        addItem({
            variantId: selectedVariant?.id || `${product.id}-${selectedFabric}-${selectedColor}`,
            productId: product.id,
            productName: product.name,
            fabricName: fabric?.name || '',
            colorName: color?.name || '',
            size: product.size || null,
            imageUrl: displayImages[0]?.url || null,
            quantity,
            unitPrice: price,
        })

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

                    {/* Color Selection */}
                    {availableColors.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold mb-3">
                                Cor{' '}
                                <span className="text-muted-foreground font-normal">
                                    — {availableColors.find(c => c.id === selectedColor)?.name || 'Selecione'}
                                </span>
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {availableColors.map((color) => (
                                    <TooltipProvider key={color.id}>
                                        <Tooltip>
                                            <TooltipTrigger render={
                                                <button
                                                    onClick={() => { setSelectedColor(color.id); setActiveImageIndex(0) }}
                                                    className={`relative h-10 w-10 rounded-full border-2 transition-all flex items-center justify-center overflow-hidden ${selectedColor === color.id
                                                            ? 'border-primary shadow-md scale-110'
                                                            : 'border-border hover:border-primary/50 hover:scale-105'
                                                        }`}
                                                    style={{
                                                        backgroundColor: color.hex_code || '#e5e7eb',
                                                        ...(color.image_url ? { backgroundImage: `url(${color.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                                                    }}
                                                >
                                                    <AnimatePresence>
                                                        {selectedColor === color.id && (
                                                            <motion.div
                                                                initial={{ scale: 0 }}
                                                                animate={{ scale: 1 }}
                                                                exit={{ scale: 0 }}
                                                            >
                                                                <Check className="h-4 w-4 text-white drop-shadow-md" />
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </button>
                                            } />
                                            <TooltipContent>
                                                <p>{color.name}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ))}
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* Quantity */}
                    <div>
                        <h3 className="text-sm font-semibold mb-3">Quantidade</h3>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center border rounded-lg">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-r-none"
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                >
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-12 text-center font-medium">{quantity}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-l-none"
                                    onClick={() => setQuantity(quantity + 1)}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <span className="text-sm text-muted-foreground">
                                Total: <strong className="text-foreground">R$ {(price * quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                            </span>
                        </div>
                    </div>

                    {/* Add to Cart */}
                    <Button
                        size="lg"
                        className="w-full h-14 text-base gradient-navy border-0 text-white"
                        onClick={handleAddToCart}
                        disabled={!selectedFabric || !selectedColor}
                    >
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        Adicionar ao Carrinho
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
