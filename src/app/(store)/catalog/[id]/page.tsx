'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    ArrowLeft,
    ShoppingCart,
    Minus,
    Plus,
    Package,
    Check,
    Truck,
    Shield,
    Star,
    Heart,
    Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ProductDetailSkeleton } from '@/components/ui/skeletons'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCartStore } from '@/lib/stores/cart-store'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { useProductDetailData } from '@/lib/hooks/use-product-detail-data'
import { useProductSelectionState } from '@/lib/hooks/use-product-selection-state'
import type { ProductDetailVariant } from '@/lib/products/product-detail'
import { usePriceTableStore } from '@/lib/stores/price-table-store'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import { toast } from 'sonner'
import type { FabricColor } from '@/lib/types'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'
import { PricePresentation, getVariantPriceBadges } from '@/components/catalog/price-presentation'

export default function ProductDetailPage() {
    const params = useParams()
    const router = useRouter()
    const productId =
        typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''
    const { addItem, openCart } = useCartStore()
    const { isFavorite, toggle } = useFavoritesStore()
    const { discountPercentage, overrides } = usePriceTableStore()
    const { product, images, fabrics, variants, loading, error, reload } = useProductDetailData({
        productId,
        enabled: !!productId,
    })
    const [addingToCart, setAddingToCart] = useState(false)
    const selection = useProductSelectionState({
        scopeKey: productId || null,
        fabrics,
        variants,
    })

    if (loading) {
        return <ProductDetailSkeleton />
    }

    if (error || !product) {
        return (
            <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                    <Package className="h-7 w-7 text-red-600" />
                </div>
                <div>
                    <h2 className="text-xl font-bold">Não foi possível abrir o produto</h2>
                    <p className="text-sm text-muted-foreground">
                        {error || 'Tente novamente em alguns instantes.'}
                    </p>
                </div>
                <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={() => router.push('/catalog')}>
                        Voltar ao Catálogo
                    </Button>
                    <Button onClick={() => void reload()}>Tentar novamente</Button>
                </div>
            </div>
        )
    }

    const {
        selectedFabric,
        selectedFabricGroup: activeFabric,
        activeVariant,
        quantities,
        totalQuantity: totalSelectedQuantity,
        activeImageIndex,
        colorSearch,
        showFullDescription,
        setSelectedFabric,
        setActiveVariantId,
        setActiveImageIndex,
        setColorSearch,
        setShowFullDescription,
        setVariantQuantity,
        clearQuantities,
        resetSelection,
    } = selection

    const favorited = isFavorite(product.id)
    const availableColors = activeFabric?.colors || []
    const filteredColors = availableColors.filter((color) =>
        color.name.toLowerCase().includes(colorSearch.toLowerCase())
    )
    const priceTable = {
        discountPercentage,
        overrides,
    }

    const priceBreakdown = resolveVariantPricing({
        basePrice: product.base_price ?? 0,
        fabricModifier: activeFabric?.price_modifier ?? 0,
        variantId: activeVariant?.id,
        variantPriceOverride: activeVariant?.price_override ?? null,
        priceTable,
    })

    const displayImages = activeVariant?.image_url
        ? [
              { url: activeVariant.image_url, id: `variant-${activeVariant.id}` },
              ...images.map((image) => ({ url: image.url, id: image.id })),
          ]
        : images.map((image) => ({ url: image.url, id: image.id }))

    const description = product.description?.trim() || ''
    const hasLongDescription = description.length > 220
    const descriptionPreview = hasLongDescription
        ? `${description.slice(0, 220).trimEnd()}...`
        : description

    const getVariantPricing = (variant: ProductDetailVariant) => {
        const fabricModifier =
            variant.fabric?.price_modifier ??
            fabrics.find((fabric) => fabric.id === variant.fabric_id)?.price_modifier ??
            0

        return resolveVariantPricing({
            basePrice: product.base_price ?? 0,
            fabricModifier,
            variantId: variant.id,
            variantPriceOverride: variant.price_override ?? null,
            priceTable,
        })
    }

    const totalSelectedPrice = Object.entries(quantities).reduce((acc, [variantId, quantity]) => {
        if (quantity <= 0) return acc

        const variant = variants.find((currentVariant) => currentVariant.id === variantId)
        if (!variant) return acc

        return acc + getVariantPricing(variant).unitPrice * quantity
    }, 0)

    const handleActivateVariant = (variant: ProductDetailVariant, color: FabricColor) => {
        if (variant.image_url) {
            setActiveImageIndex(0)
        } else {
            const colorImageIndex = displayImages.findIndex((image) => image.url === color.image_url)
            if (colorImageIndex !== -1) {
                setActiveImageIndex(colorImageIndex)
            }
        }

        setActiveVariantId(variant.id)
    }

    const handleAddToCart = () => {
        if (!selectedFabric) return

        const variantsToAdd = Object.entries(quantities).filter(([, quantity]) => quantity > 0)
        if (variantsToAdd.length === 0) return

        setAddingToCart(true)

        try {
            variantsToAdd.forEach(([variantId, quantity]) => {
                const variant = variants.find((currentVariant) => currentVariant.id === variantId)
                if (!variant) return

                const fabric = fabrics.find((item) => item.id === variant.fabric_id)
                const color = fabric?.colors.find((item) => item.id === variant.fabric_color_id)

                addItem({
                    variantId: variant.id,
                    productId: product.id,
                    productName: product.name,
                    fabricName: fabric?.name || '',
                    colorName: color?.name || '',
                    size: product.size || null,
                    imageUrl: variant.image_url || color?.image_url || images[0]?.url || null,
                    quantity,
                    unitPrice: getVariantPricing(variant).unitPrice,
                })
            })

            resetSelection()
            toast.success(`${totalSelectedQuantity} itens adicionados ao carrinho!`, {
                action: {
                    label: 'Ver Carrinho',
                    onClick: openCart,
                },
            })
        } finally {
            setAddingToCart(false)
        }
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Button variant="ghost" className="mb-4 gap-2" onClick={() => router.push('/catalog')}>
                <ArrowLeft className="h-4 w-4" />
                Voltar ao Catálogo
            </Button>

            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-12">
                <div className="self-start space-y-4">
                    <ProductImageGallery
                        images={displayImages}
                        productName={product.name}
                        activeImageIndex={activeImageIndex}
                        onImageChange={setActiveImageIndex}
                    />
                </div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-6 lg:pr-2"
                >
                    <div>
                        <div className="mb-3 flex items-start justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                                {product.category && (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700"
                                    >
                                        {(product.category as { name: string }).name}
                                    </Badge>
                                )}
                                {product.is_featured && (
                                    <Badge className="rounded-full border-0 bg-linear-to-r from-amber-700 to-orange-500 px-3 py-1 text-[11px] font-semibold text-white">
                                        Destaque
                                    </Badge>
                                )}
                            </div>

                            <button
                                onClick={() => toggle(product.id)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                                aria-label={
                                    favorited
                                        ? 'Remover dos favoritos'
                                        : 'Adicionar aos favoritos'
                                }
                            >
                                <Heart
                                    className={`h-5 w-5 ${
                                        favorited ? 'fill-red-500 text-red-500' : ''
                                    }`}
                                />
                            </button>
                        </div>

                        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-slate-950 lg:text-4xl">
                            {product.name}
                        </h1>
                        {product.size && (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Ref/Tamanho: {product.size}
                            </p>
                        )}
                    </div>

                    <PricePresentation
                        title="Preço Atual"
                        price={priceBreakdown.finalPrice}
                        layer={priceBreakdown.layer}
                        discountPercentage={discountPercentage}
                        description="O valor final do pedido acompanha a cor selecionada e a política comercial da sua tabela B2B."
                    />

                    {description && (
                        <div className="rounded-2xl border border-border/70 bg-muted/10 p-5">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Descrição
                                </span>
                                {hasLongDescription && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowFullDescription((previous) => !previous)
                                        }
                                        className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                                    >
                                        {showFullDescription ? 'Ver menos' : 'Ver mais'}
                                    </button>
                                )}
                            </div>
                            <p
                                className={`text-sm leading-7 text-muted-foreground ${
                                    showFullDescription ? '' : 'line-clamp-3'
                                }`}
                            >
                                {showFullDescription ? description : descriptionPreview}
                            </p>
                        </div>
                    )}

                    <Separator />

                    {fabrics.length > 0 && (
                        <div>
                            <h3 className="mb-3 text-sm font-semibold">
                                Tecido
                                <span className="font-normal text-muted-foreground">
                                    {' '}
                                    - {activeFabric?.name || 'Selecione'}
                                </span>
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {fabrics.map((fabric) => (
                                    <TooltipProvider key={fabric.id}>
                                        <Tooltip>
                                            <TooltipTrigger
                                                render={
                                                    <button
                                                        onClick={() => setSelectedFabric(fabric.id)}
                                                        className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                                                            selectedFabric === fabric.id
                                                                ? 'border-primary bg-primary/10 font-medium text-primary shadow-sm'
                                                                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                                                        }`}
                                                    >
                                                        {fabric.name}
                                                        {fabric.price_modifier > 0 && (
                                                            <span className="ml-1 text-[10px] text-bronze">
                                                                +R${fabric.price_modifier.toFixed(0)}
                                                            </span>
                                                        )}
                                                    </button>
                                                }
                                            />
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

                    {fabrics.length === 0 && (
                        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                            Este produto não possui variações ativas no momento.
                        </div>
                    )}

                    {availableColors.length > 0 && (
                        <div className="rounded-2xl border border-border/70 bg-white p-5 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Cores e Quantidades
                                    <span className="ml-1 font-normal text-muted-foreground">
                                        ({filteredColors.length})
                                    </span>
                                </h3>
                                {totalSelectedQuantity > 0 && (
                                    <button
                                        onClick={clearQuantities}
                                        className="text-xs text-muted-foreground underline hover:text-destructive"
                                    >
                                        Zerar
                                    </button>
                                )}
                            </div>

                            {availableColors.length > 5 && (
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        value={colorSearch}
                                        onChange={(event) => setColorSearch(event.target.value)}
                                        placeholder="Buscar cor..."
                                        className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none transition-colors focus:border-primary"
                                    />
                                </div>
                            )}

                            <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-2">
                                {filteredColors.map((color) => {
                                    const variant = variants.find(
                                        (currentVariant) =>
                                            currentVariant.fabric_id === selectedFabric &&
                                            currentVariant.fabric_color_id === color.id
                                    )

                                    if (!variant) return null

                                    const quantity = quantities[variant.id] || 0
                                    const pricing = getVariantPricing(variant)
                                    const unitPrice = pricing.unitPrice
                                    const lineTotal = unitPrice * quantity
                                    const badges = getVariantPriceBadges({
                                        layer: pricing.layer,
                                        discountPercentage,
                                    })

                                    return (
                                        <div
                                            key={color.id}
                                            className={`flex shrink-0 items-center justify-between rounded-xl border p-3 transition-colors ${
                                                quantity > 0
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-border hover:border-primary/30'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-black/10 shadow-inner"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#e5e7eb',
                                                        ...(color.image_url
                                                            ? {
                                                                  backgroundImage: `url(${color.image_url})`,
                                                                  backgroundSize: 'cover',
                                                                  backgroundPosition: 'center',
                                                              }
                                                            : {}),
                                                    }}
                                                    onClick={() => handleActivateVariant(variant, color)}
                                                >
                                                    {quantity > 0 && (
                                                        <Check className="h-5 w-5 text-white drop-shadow-md mix-blend-difference" />
                                                    )}
                                                </div>

                                                <div className="flex flex-col">
                                                    <span
                                                        className={`text-base ${
                                                            quantity > 0
                                                                ? 'font-medium text-foreground'
                                                                : 'text-muted-foreground'
                                                        }`}
                                                    >
                                                        {color.name}
                                                    </span>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-xs font-medium text-muted-foreground">
                                                            R$ {unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                        {badges.map((badge) => (
                                                            <span
                                                                key={badge.label}
                                                                className={`rounded px-1 text-[9px] font-medium ${badge.className}`}
                                                            >
                                                                {badge.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {quantity > 0 && (
                                                    <span className="hidden min-w-[92px] text-right text-sm font-semibold text-slate-900 lg:block">
                                                        R$ {lineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2 rounded-lg border bg-white p-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() =>
                                                            setVariantQuantity(
                                                                variant.id,
                                                                quantity - 1
                                                            )
                                                        }
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </Button>
                                                    <span className="w-8 text-center font-medium">
                                                        {quantity === 0 ? '-' : quantity}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() =>
                                                            setVariantQuantity(
                                                                variant.id,
                                                                quantity + 1
                                                            )
                                                        }
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}

                                {filteredColors.length === 0 && colorSearch && (
                                    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                                        Nenhuma cor encontrada para essa busca.
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-muted-foreground">Total selecionado</span>
                                <span className="text-lg font-semibold text-slate-950">
                                    {totalSelectedQuantity} iten
                                    {totalSelectedQuantity !== 1 ? 's' : ''} = R${' '}
                                    {totalSelectedPrice.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                        </div>
                    )}

                    {selectedFabric && availableColors.length === 0 && (
                        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                            Nenhuma cor disponível para este tecido.
                        </div>
                    )}

                    <Separator />

                    <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-lg shadow-slate-950/10">
                        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                                    Resumo da Seleção
                                </p>
                                <p className="mt-1 text-2xl font-bold">
                                    R${' '}
                                    {totalSelectedPrice.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                    })}
                                </p>
                            </div>
                            <p className="text-sm text-white/72">
                                {totalSelectedQuantity} iten
                                {totalSelectedQuantity !== 1 ? 's' : ''} selecionado
                                {totalSelectedQuantity !== 1 ? 's' : ''}
                            </p>
                        </div>

                        <Button
                            size="lg"
                            className="h-14 w-full border-0 bg-white text-slate-950 shadow-md hover:bg-white/92 disabled:bg-white/70"
                            onClick={handleAddToCart}
                            disabled={!selectedFabric || totalSelectedQuantity === 0 || addingToCart}
                        >
                            <ShoppingCart className="mr-2 h-5 w-5" />
                            {!selectedFabric
                                ? 'Selecione um tecido'
                                : totalSelectedQuantity === 0
                                  ? 'Selecione as quantidades'
                                  : `Adicionar ${totalSelectedQuantity} itens ao carrinho`}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Truck className="h-4 w-4 shrink-0 text-bronze" />
                            <span>Entrega para todo Brasil</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Shield className="h-4 w-4 shrink-0 text-bronze" />
                            <span>Garantia de fábrica</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Star className="h-4 w-4 shrink-0 text-bronze" />
                            <span>Qualidade premium</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
