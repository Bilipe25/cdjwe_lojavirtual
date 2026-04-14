
'use client'

import { useMemo, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
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
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import type { ProductDetailVariant } from '@/lib/products/product-detail'
import { usePriceTableStore } from '@/lib/stores/price-table-store'
import { useCustomerCommercialStore } from '@/lib/stores/customer-commercial-store'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import { buildBaseGalleryImages, buildDisplayGalleryImages } from '@/lib/products/gallery-images'
import { toast } from 'sonner'
import { ProductImageGallery } from '@/components/products/ProductImageGallery'
import { PricePresentation, getVariantPriceBadges } from '@/components/catalog/price-presentation'

function buildCartKey(variantId: string, sizeOptionId: string | null) {
    return `${variantId}::${sizeOptionId || 'legacy'}`
}

export default function ProductDetailPage() {
    const params = useParams()
    const pathname = usePathname()
    const router = useRouter()
    const productId =
        typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''
    const { addItem, openCart } = useCartStore()
    const isMobile = useIsMobile()
    const { isFavorite, toggle } = useFavoritesStore()
    const { discountPercentage, overrides } = usePriceTableStore()
    const { isSalesBlocked } = useCustomerCommercialStore()
    const { product, images, fabrics, variants, sizeOptions, loading, error, reload } = useProductDetailData({
        productId,
        enabled: !!productId,
    })
    const [addingToCart, setAddingToCart] = useState(false)
    const isRepresentativeView = pathname.startsWith('/sales/catalog')
    const catalogBasePath = isRepresentativeView ? '/sales/catalog' : '/catalog'
    const selection = useProductSelectionState({
        scopeKey: productId || null,
        fabrics,
        variants,
        sizeOptions,
        hasSizeVariants: Boolean(product?.has_size_variants),
    })
    const {
        selectedSizeOption,
        selectedFabric,
        selectedFabricGroup: activeFabric,
        activeVariant,
        quantities,
        selectionBuckets,
        totalQuantity: totalSelectedQuantity,
        activeImageIndex,
        colorSearch,
        showFullDescription,
        setSelectedSizeOptionId,
        setSelectedFabric,
        setActiveVariantId,
        setActiveImageIndex,
        setColorSearch,
        setShowFullDescription,
        setVariantQuantity,
        clearQuantities,
        resetSelection,
    } = selection
    const baseImages = useMemo(() => buildBaseGalleryImages(images), [images])
    const displayImages = useMemo(
        () =>
            buildDisplayGalleryImages(baseImages, {
                id: activeVariant?.id,
                imageUrl: activeVariant?.image_url || null,
            }),
        [activeVariant?.id, activeVariant?.image_url, baseImages]
    )

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
                    <h2 className="text-xl font-bold">Nao foi possivel abrir o produto</h2>
                    <p className="text-sm text-muted-foreground">
                        {error || 'Tente novamente em alguns instantes.'}
                    </p>
                </div>
                <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={() => router.push(catalogBasePath)}>
                        Voltar ao catalogo
                    </Button>
                    <Button onClick={() => void reload()}>Tentar novamente</Button>
                </div>
            </div>
        )
    }

    const favorited = isFavorite(product.id)
    const availableColors = activeFabric?.colors || []
    const filteredColors = availableColors.filter((color) =>
        color.name.toLowerCase().includes(colorSearch.toLowerCase())
    )
    const priceTable = {
        discountPercentage,
        overrides,
    }
    const requiresSizeSelection = Boolean(product.has_size_variants) && sizeOptions.length > 0
    const canSelectVariants = !requiresSizeSelection || Boolean(selectedSizeOption)

    const priceBreakdown = resolveVariantPricing({
        basePrice: product.base_price ?? 0,
        fabricModifier: activeFabric?.price_modifier ?? 0,
        variantId: activeVariant?.id,
        variantPriceOverride: activeVariant?.price_override ?? null,
        sizePriceMode: selectedSizeOption?.price_mode ?? null,
        sizePriceValue: selectedSizeOption?.price_value ?? null,
        priceTable,
    })

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
            sizePriceMode: selectedSizeOption?.price_mode ?? null,
            sizePriceValue: selectedSizeOption?.price_value ?? null,
            priceTable,
        })
    }

    const getVariantPricingForSize = (variant: ProductDetailVariant, sizeOptionId: string | null) => {
        const sizeOption = sizeOptions.find((item) => item.id === sizeOptionId) || null
        const fabricModifier =
            variant.fabric?.price_modifier ??
            fabrics.find((fabric) => fabric.id === variant.fabric_id)?.price_modifier ??
            0

        return resolveVariantPricing({
            basePrice: product.base_price ?? 0,
            fabricModifier,
            variantId: variant.id,
            variantPriceOverride: variant.price_override ?? null,
            sizePriceMode: sizeOption?.price_mode ?? null,
            sizePriceValue: sizeOption?.price_value ?? null,
            priceTable,
        })
    }

    const totalSelectedPrice = selectionBuckets.reduce((acc, bucket) => {
        return (
            acc +
            Object.entries(bucket.quantities).reduce((bucketAcc, [variantId, quantity]) => {
                if (quantity <= 0) return bucketAcc
                const variant = variants.find((currentVariant) => currentVariant.id === variantId)
                if (!variant) return bucketAcc
                return bucketAcc + getVariantPricingForSize(variant, bucket.sizeOptionId).unitPrice * quantity
            }, 0)
        )
    }, 0)

    const handleActivateVariant = (variant: ProductDetailVariant) => {
        if (variant.image_url) {
            setActiveImageIndex(0)
        }

        setActiveVariantId(variant.id)
    }

    const handleAddToCart = () => {
        if (isRepresentativeView) {
            toast.info('Modo somente visualizacao para representante.')
            return
        }
        if (isSalesBlocked) {
            toast.error('Este cliente esta com vendas restritas no momento.')
            return
        }
        if (!selectedFabric) return
        if (requiresSizeSelection && !selectedSizeOption) {
            toast.error('Selecione um tamanho antes de continuar.')
            return
        }

        const variantsToAdd = selectionBuckets.flatMap((bucket) =>
            Object.entries(bucket.quantities)
                .filter(([, quantity]) => quantity > 0)
                .map(([variantId, quantity]) => ({
                    variantId,
                    quantity,
                    sizeOptionId: bucket.sizeOptionId,
                }))
        )
        if (variantsToAdd.length === 0) return

        setAddingToCart(true)

        try {
            variantsToAdd.forEach(({ variantId, quantity, sizeOptionId }) => {
                const variant = variants.find((currentVariant) => currentVariant.id === variantId)
                if (!variant) return

                const fabric = fabrics.find((item) => item.id === variant.fabric_id)
                const color = fabric?.colors.find((item) => item.id === variant.fabric_color_id)
                const pricing = getVariantPricingForSize(variant, sizeOptionId)
                const selectedSize = sizeOptions.find((item) => item.id === sizeOptionId) || null
                const resolvedSizeName = selectedSize?.name || product.size || null
                const resolvedSizeOptionId = selectedSize?.id || null

                addItem({
                    cartKey: buildCartKey(variant.id, resolvedSizeOptionId),
                    variantId: variant.id,
                    productId: product.id,
                    productName: product.name,
                    fabricName: fabric?.name || '',
                    colorName: color?.name || '',
                    size: resolvedSizeName,
                    sizeOptionId: resolvedSizeOptionId,
                    sizePrice: pricing.sizePrice,
                    imageUrl: variant.image_url || baseImages[0]?.url || null,
                    quantity,
                    unitPrice: pricing.unitPrice,
                })
            })

            resetSelection()
            toast.success(`${totalSelectedQuantity} itens adicionados ao carrinho!`, {
                action: {
                    label: 'Ver carrinho',
                    onClick: openCart,
                },
            })
            if (!isMobile) {
                openCart()
            }
        } finally {
            setAddingToCart(false)
        }
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Button variant="ghost" className="mb-4 gap-2 rounded-xl" onClick={() => router.push(catalogBasePath)}>
                <ArrowLeft className="h-4 w-4" />
                Voltar ao catalogo
            </Button>

            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-12">
                <div className="self-start space-y-4">
                    <ProductImageGallery
                        images={displayImages}
                        productName={product.name}
                        activeImageIndex={activeImageIndex}
                        onImageChange={setActiveImageIndex}
                        layoutContext="detail"
                    />

                    {description && (
                        <div className="glass-card rounded-3xl border-0 p-5 sm:p-6">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Descricao
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
                                        className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-semibold text-foreground"
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
                                className="glass-card flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
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

                        <h1 className="font-heading text-3xl font-bold text-gradient-navy lg:text-4xl">
                            {product.name}
                        </h1>
                        {product.size && !product.has_size_variants && (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Ref/Tamanho: {product.size}
                            </p>
                        )}
                    </div>

                    <PricePresentation
                        title="Preco atual"
                        price={priceBreakdown.finalPrice}
                        layer={priceBreakdown.layer}
                        discountPercentage={discountPercentage}
                        className="glass-card rounded-3xl border-0 p-5 shadow-sm"
                        badgeClassName="border-white/40 bg-navy/5 text-foreground dark:border-white/10 dark:bg-white/5"
                    />

                    <Separator />

                    {requiresSizeSelection && (
                        <div className="glass-card rounded-3xl border-0 p-5 sm:p-6">
                            <h3 className="mb-3 text-sm font-semibold">
                                Tamanho
                                <span className="font-normal text-muted-foreground">
                                    {' '}
                                    - {selectedSizeOption?.name || 'Selecione'}
                                </span>
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {sizeOptions.map((sizeOption) => (
                                    <button
                                        key={sizeOption.id}
                                        onClick={() => setSelectedSizeOptionId(sizeOption.id)}
                                        className={`rounded-lg border px-4 py-2 text-sm transition-all ${
                                            selectedSizeOption?.id === sizeOption.id
                                                ? 'border-primary bg-primary/10 font-medium text-primary shadow-sm'
                                                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                                        }`}
                                    >
                                        {sizeOption.name}
                                    </button>
                                ))}
                            </div>
                            {!selectedSizeOption && (
                                <p className="mt-2 text-xs text-amber-700">
                                    Selecione o tamanho para liberar tecido e cor.
                                </p>
                            )}
                        </div>
                    )}

                    {fabrics.length > 0 && (
                        <div className="glass-card rounded-3xl border-0 p-5 sm:p-6">
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
                                                        disabled={!canSelectVariants || isRepresentativeView}
                                                        className={`rounded-lg border px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
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
                        <div className="glass-card rounded-2xl border-0 p-4 text-sm text-muted-foreground">
                            Este produto nao possui variacoes ativas no momento.
                        </div>
                    )}

                    {availableColors.length > 0 && (
                        <div className="glass-card rounded-3xl border-0 p-5 sm:p-6">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Cores e quantidades
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
                                        className="h-11 w-full rounded-xl border border-white/45 bg-background/80 pl-10 pr-3 text-sm outline-none transition-colors focus:border-primary"
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
                                            className={`flex shrink-0 items-center justify-between rounded-2xl border p-3 transition-colors ${
                                                quantity > 0
                                                    ? 'border-primary/35 bg-primary/6 shadow-sm'
                                                    : 'border-white/45 bg-background/70 hover:border-primary/30'
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
                                                    onClick={() => handleActivateVariant(variant)}
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
                                                    <span className="hidden min-w-[92px] text-right text-sm font-semibold text-foreground lg:block">
                                                        R$ {lineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-background/85 p-1">
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
                                                        disabled={!canSelectVariants || isRepresentativeView}
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
                                                        disabled={!canSelectVariants || isRepresentativeView}
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

                            <div className="mt-4 flex flex-col gap-1 rounded-2xl bg-navy/6 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:bg-white/6">
                                <span className="text-muted-foreground">Total selecionado</span>
                                <span className="text-lg font-semibold text-foreground">
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
                        <div className="glass-card rounded-2xl border-0 p-4 text-sm text-muted-foreground">
                            Nenhuma cor disponivel para este tecido.
                        </div>
                    )}

                    <Separator />

                    <div className="rounded-3xl gradient-navy border-0 p-5 text-white shadow-xl shadow-slate-950/15">
                        {isSalesBlocked && (
                            <div className="mb-4 rounded-2xl border border-red-200/20 bg-white/10 px-3 py-2 text-sm text-red-50">
                                Compras bloqueadas para este cliente. Solicite liberacao administrativa.
                            </div>
                        )}
                        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                                    Resumo da selecao
                                </p>
                                <p className="mt-1 text-2xl font-bold">
                                    R${' '}
                                    {totalSelectedPrice.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                    })}
                                </p>
                            </div>
                            <p className="text-sm text-white/75">
                                {totalSelectedQuantity} iten
                                {totalSelectedQuantity !== 1 ? 's' : ''} selecionado
                                {totalSelectedQuantity !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {isRepresentativeView ? (
                            <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white/85">
                                Catalogo em modo somente visualizacao para representante.
                            </div>
                        ) : (
                            <Button
                                size="lg"
                                className="h-14 w-full rounded-2xl border-0 bg-white text-slate-950 shadow-md hover:bg-white/92 disabled:opacity-70 disabled:grayscale"
                                onClick={handleAddToCart}
                                disabled={
                                    isSalesBlocked ||
                                    !selectedFabric ||
                                    totalSelectedQuantity === 0 ||
                                    addingToCart ||
                                    !canSelectVariants
                                }
                            >
                                <ShoppingCart className="mr-2 h-5 w-5" />
                                {isSalesBlocked
                                    ? 'Vendas restritas'
                                    : !canSelectVariants
                                    ? 'Selecione o tamanho'
                                    : totalSelectedQuantity === 0
                                      ? 'Selecione as quantidades'
                                      : `Adicionar ${totalSelectedQuantity} itens ao carrinho`}
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                        <div className="glass-card flex items-center gap-3 rounded-2xl border-0 px-4 py-3 text-sm text-muted-foreground">
                            <Truck className="h-4 w-4 shrink-0 text-bronze" />
                            <span>Entrega para todo Brasil</span>
                        </div>
                        <div className="glass-card flex items-center gap-3 rounded-2xl border-0 px-4 py-3 text-sm text-muted-foreground">
                            <Shield className="h-4 w-4 shrink-0 text-bronze" />
                            <span>Garantia de fabrica</span>
                        </div>
                        <div className="glass-card flex items-center gap-3 rounded-2xl border-0 px-4 py-3 text-sm text-muted-foreground">
                            <Star className="h-4 w-4 shrink-0 text-bronze" />
                            <span>Qualidade premium</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
