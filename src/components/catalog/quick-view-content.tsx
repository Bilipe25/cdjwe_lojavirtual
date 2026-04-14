'use client'

import Link from 'next/link'
import { Package, ShoppingCart, Search, Minus, Plus, Heart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { useCartStore } from '@/lib/stores/cart-store'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { usePriceTableStore } from '@/lib/stores/price-table-store'
import { useCustomerCommercialStore } from '@/lib/stores/customer-commercial-store'
import { useProductDetailData, type ProductDetailData } from '@/lib/hooks/use-product-detail-data'
import { useProductSelectionState } from '@/lib/hooks/use-product-selection-state'
import { resolveVariantPricing } from '@/lib/pricing/resolve-variant-pricing'
import { buildBaseGalleryImages, buildDisplayGalleryImages } from '@/lib/products/gallery-images'
import { toast } from 'sonner'
import { ProductImageGallery } from '../products/ProductImageGallery'
import { PricePresentation, getVariantPriceBadges } from './price-presentation'

export type QuickViewData = ProductDetailData

export interface QuickViewAddToCartSummaryItem {
    id: string
    productName: string
    fabricName: string
    colorName: string
    sizeName: string | null
    sizeOptionId: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    imageUrl: string | null
}

export interface QuickViewAddToCartSummary {
    productId: string
    productName: string
    totalQuantity: number
    totalPrice: number
    items: QuickViewAddToCartSummaryItem[]
}

export function useQuickViewData(productId: string | null, open: boolean): QuickViewData {
    return useProductDetailData({
        productId,
        enabled: open,
    })
}

interface QuickViewContentProps {
    data: QuickViewData
    onClose: () => void
    showTitle?: boolean
    onAddedToCart?: (summary: QuickViewAddToCartSummary) => void
}

function buildCartKey(variantId: string, sizeOptionId: string | null) {
    return `${variantId}::${sizeOptionId || 'legacy'}`
}

export function QuickViewContent({
    data,
    onClose,
    showTitle = true,
    onAddedToCart,
}: QuickViewContentProps) {
    const { product, images, fabrics, variants, sizeOptions, loading, error } = data
    const { addItem, openCart } = useCartStore()
    const { isFavorite, toggle } = useFavoritesStore()
    const { discountPercentage, overrides } = usePriceTableStore()
    const { isSalesBlocked } = useCustomerCommercialStore()
    const hasExternalAddHandler = typeof onAddedToCart === 'function'
    const [addingToCart, setAddingToCart] = useState(false)

    const selection = useProductSelectionState({
        scopeKey: product?.id ?? null,
        fabrics,
        variants,
        sizeOptions,
        hasSizeVariants: Boolean(product?.has_size_variants),
    })

    const {
        selectedSizeOption,
        selectedFabric,
        selectedFabricGroup,
        activeVariant,
        quantities,
        selectionBuckets,
        currentSizeQuantity,
        totalQuantity,
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

    const requiresSizeSelection = Boolean(product?.has_size_variants) && sizeOptions.length > 0
    const canSelectVariants = !requiresSizeSelection || Boolean(selectedSizeOption)

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
        return (
            <div className="flex h-full flex-col gap-4 p-4 animate-pulse md:grid md:grid-cols-[1fr_1fr]">
                <div className="aspect-square w-full rounded-lg bg-muted" />
                <div className="flex flex-col gap-3">
                    <div className="h-6 w-3/4 rounded bg-muted" />
                    <div className="h-4 w-1/4 rounded bg-muted" />
                    <div className="mt-2 h-8 w-1/3 rounded bg-muted" />
                    <div className="my-2 h-px w-full bg-muted" />
                    <div className="h-4 w-1/4 rounded bg-muted" />
                    <div className="flex gap-2">
                        <div className="h-8 w-20 rounded bg-muted" />
                        <div className="h-8 w-24 rounded bg-muted" />
                    </div>
                    <div className="mt-4 h-4 w-1/3 rounded bg-muted" />
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3].map((item) => (
                            <div key={item} className="h-12 w-full rounded bg-muted" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (error || !product) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                    <Package className="h-7 w-7 text-red-600" />
                </div>
                <div>
                    <p className="font-semibold text-foreground">Nao foi possivel abrir o produto</p>
                    <p className="text-sm text-muted-foreground">
                        {error || 'Tente novamente em alguns instantes.'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Fechar
                    </Button>
                    {product?.id && (
                        <Link href={`/catalog/${product.id}`} className="inline-flex">
                            <Button>Ver detalhes</Button>
                        </Link>
                    )}
                </div>
            </div>
        )
    }

    const priceTable = {
        discountPercentage,
        overrides,
    }
    const favorited = isFavorite(product.id)
    const description = product.description?.trim() || ''
    const hasLongDescription = description.length > 180
    const descriptionPreview = hasLongDescription ? `${description.slice(0, 180).trimEnd()}...` : description

    const displayPriceBreakdown = resolveVariantPricing({
        basePrice: product.base_price ?? 0,
        fabricModifier: selectedFabricGroup?.price_modifier ?? 0,
        variantId: activeVariant?.id,
        variantPriceOverride: activeVariant?.price_override ?? null,
        sizePriceMode: selectedSizeOption?.price_mode ?? null,
        sizePriceValue: selectedSizeOption?.price_value ?? null,
        priceTable,
    })

    const getVariantPricing = (variantId: string) => {
        const variant = variants.find((item) => item.id === variantId)
        if (!variant) {
            return resolveVariantPricing({
                basePrice: product.base_price ?? 0,
                sizePriceMode: selectedSizeOption?.price_mode ?? null,
                sizePriceValue: selectedSizeOption?.price_value ?? null,
                priceTable,
            })
        }

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

    const getVariantPricingForSize = (variantId: string, sizeOptionId: string | null) => {
        const sizeOption = sizeOptions.find((item) => item.id === sizeOptionId) || null
        const variant = variants.find((item) => item.id === variantId)
        if (!variant) {
            return resolveVariantPricing({
                basePrice: product.base_price ?? 0,
                sizePriceMode: sizeOption?.price_mode ?? null,
                sizePriceValue: sizeOption?.price_value ?? null,
                priceTable,
            })
        }

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

    const totalPrice = selectionBuckets.reduce((sum, bucket) => {
        return (
            sum +
            Object.entries(bucket.quantities).reduce((bucketSum, [variantId, quantity]) => {
                if (quantity <= 0) return bucketSum
                return bucketSum + getVariantPricingForSize(variantId, bucket.sizeOptionId).unitPrice * quantity
            }, 0)
        )
    }, 0)

    const isAddToCartDisabled =
        isSalesBlocked ||
        !selectedFabric ||
        totalQuantity === 0 ||
        addingToCart ||
        !canSelectVariants

    const addToCartLabel = isSalesBlocked
        ? 'Vendas restritas'
        : !canSelectVariants
          ? 'Selecione tamanho'
          : totalQuantity === 0
            ? 'Selecionar cores'
            : 'Adicionar lote'

    const handleActivateVariant = (variantId: string) => {
        const variant = variants.find((item) => item.id === variantId)
        if (!variant) return

        if (variant.image_url) {
            setActiveImageIndex(0)
        }

        setActiveVariantId(variant.id)
    }

    const handleAddToCart = () => {
        if (!product) return
        if (isSalesBlocked) {
            toast.error('Este cliente esta com vendas restritas no momento.')
            return
        }
        if (requiresSizeSelection && !selectedSizeOption) {
            toast.error('Selecione um tamanho antes de adicionar ao carrinho.')
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
            const addedItems: QuickViewAddToCartSummaryItem[] = []

            variantsToAdd.forEach(({ variantId, quantity, sizeOptionId }) => {
                const matchedVariant = variants.find((variant) => variant.id === variantId)
                if (!matchedVariant) return

                const fabric = fabrics.find((item) => item.id === matchedVariant.fabric_id)
                const color = fabric?.colors.find((item) => item.id === matchedVariant.fabric_color_id)
                const priceBreakdown = getVariantPricingForSize(matchedVariant.id, sizeOptionId)
                const selectedSize = sizeOptions.find((item) => item.id === sizeOptionId) || null
                const resolvedSizeName = selectedSize?.name || product.size || null
                const resolvedSizeOptionId = selectedSize?.id || null

                addItem({
                    cartKey: buildCartKey(matchedVariant.id, resolvedSizeOptionId),
                    variantId: matchedVariant.id,
                    productId: product.id,
                    productName: product.name,
                    fabricName: fabric?.name || '',
                    colorName: color?.name || '',
                    size: resolvedSizeName,
                    sizeOptionId: resolvedSizeOptionId,
                    sizePrice: priceBreakdown.sizePrice,
                    imageUrl: matchedVariant.image_url || baseImages[0]?.url || null,
                    quantity,
                    unitPrice: priceBreakdown.unitPrice,
                })

                addedItems.push({
                    id: matchedVariant.id,
                    productName: product.name,
                    fabricName: fabric?.name || '',
                    colorName: color?.name || '',
                    sizeName: resolvedSizeName,
                    sizeOptionId: resolvedSizeOptionId,
                    quantity,
                    unitPrice: priceBreakdown.unitPrice,
                    lineTotal: priceBreakdown.unitPrice * quantity,
                    imageUrl: matchedVariant.image_url || baseImages[0]?.url || null,
                })
            })

            const addedSummary: QuickViewAddToCartSummary = {
                productId: product.id,
                productName: product.name,
                totalQuantity,
                totalPrice,
                items: addedItems,
            }

            if (hasExternalAddHandler) {
                onAddedToCart?.(addedSummary)
            } else {
                toast.success(`${totalQuantity} itens adicionados ao carrinho!`)
            }

            resetSelection()
            onClose()
            if (!hasExternalAddHandler) {
                openCart()
            }
        } finally {
            setAddingToCart(false)
        }
    }

    const filteredColors =
        selectedFabricGroup?.colors.filter((color) =>
            color.name.toLowerCase().includes(colorSearch.toLowerCase())
        ) ?? []

    return (
        <div className="flex flex-col bg-background md:grid md:h-full md:grid-cols-[1fr_1.2fr] md:overflow-hidden">
            <div className="relative shrink-0 overflow-hidden bg-muted/20 md:h-full md:border-r md:border-border/50">
                <ProductImageGallery
                    images={displayImages}
                    productName={product.name}
                    activeImageIndex={activeImageIndex}
                    onImageChange={setActiveImageIndex}
                    layoutContext="quickview"
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/30 via-black/10 to-transparent md:hidden" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/12 to-transparent md:hidden" />

                <button
                    onClick={() => toggle(product.id)}
                    className="absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded border border-border bg-background shadow-sm transition-colors hover:bg-muted"
                >
                    <Heart
                        className={`h-4 w-4 ${
                            favorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                        }`}
                    />
                </button>
            </div>

            <div className="flex flex-col md:h-full md:overflow-hidden">
                <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
                    <div className="px-4 pb-2 pt-4 md:px-5 md:pt-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                {showTitle ? (
                                    <DialogTitle className="text-xl font-bold leading-tight text-foreground md:text-2xl">
                                        {product.name}
                                    </DialogTitle>
                                ) : (
                                    <h2 className="text-xl font-bold leading-tight text-foreground md:text-2xl">
                                        {product.name}
                                    </h2>
                                )}
                                {product.size && !product.has_size_variants && (
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Ref/Tamanho: {product.size}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <Separator className="mx-4 my-1 w-auto md:mx-5" />

                    <div className="px-4 py-3 md:px-5">
                        <PricePresentation
                            className="rounded-xl border-border/60 bg-muted/10 p-4 shadow-none"
                            title="Preco Atual"
                            price={displayPriceBreakdown.finalPrice}
                            layer={displayPriceBreakdown.layer}
                            discountPercentage={discountPercentage}
                            priceClassName="text-2xl text-primary"
                        />
                    </div>

                    {description && (
                        <div className="px-4 py-1 md:px-5">
                            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Descricao
                                    </span>
                                    {hasLongDescription && (
                                        <button
                                            type="button"
                                            onClick={() => setShowFullDescription((previous) => !previous)}
                                            className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                                        >
                                            {showFullDescription ? 'Ver menos' : 'Ver mais'}
                                        </button>
                                    )}
                                </div>
                                <p
                                    className={`text-sm leading-relaxed text-muted-foreground ${
                                        showFullDescription ? '' : 'line-clamp-2'
                                    }`}
                                >
                                    {showFullDescription ? description : descriptionPreview}
                                </p>
                            </div>
                        </div>
                    )}

                    {requiresSizeSelection && (
                        <div className="px-4 py-3 md:px-5">
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Tamanho
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {sizeOptions.map((sizeOption) => (
                                    <button
                                        key={sizeOption.id}
                                        onClick={() => setSelectedSizeOptionId(sizeOption.id)}
                                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                            selectedSizeOption?.id === sizeOption.id
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-background text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {sizeOption.name}
                                    </button>
                                ))}
                            </div>
                            {!selectedSizeOption && (
                                <p className="mt-2 text-xs text-amber-700">
                                    Selecione um tamanho para liberar tecido, cor e compra.
                                </p>
                            )}
                        </div>
                    )}

                    {fabrics.length > 0 && (
                        <div className="px-4 py-3 md:px-5">
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Modelos/Tecidos ({fabrics.length})
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {fabrics.map((fabric) => (
                                    <button
                                        key={fabric.id}
                                        onClick={() => setSelectedFabric(fabric.id)}
                                        disabled={!canSelectVariants}
                                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                            selectedFabric === fabric.id
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-background text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {fabric.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {fabrics.length === 0 && (
                        <div className="px-4 py-6 md:px-5">
                            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                                Este produto nao possui variacoes ativas no momento.
                            </div>
                        </div>
                    )}

                    {selectedFabricGroup && selectedFabricGroup.colors.length > 0 && (
                        <div className="px-4 py-2 pb-20 md:px-5 md:pb-6">
                            <div className="mb-2 flex items-center justify-between">
                                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Cores disponiveis ({filteredColors.length})
                                </label>
                                {totalQuantity > 0 && (
                                    <button
                                        onClick={clearQuantities}
                                        className="text-[11px] font-medium text-destructive hover:underline"
                                    >
                                        Zerar ({currentSizeQuantity})
                                    </button>
                                )}
                            </div>

                            {selectedFabricGroup.colors.length > 5 && (
                                <div className="relative mb-3">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Buscar cor..."
                                        value={colorSearch}
                                        onChange={(event) => setColorSearch(event.target.value)}
                                        className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm transition-colors focus:border-primary focus:outline-none"
                                    />
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                {filteredColors.map((color) => {
                                    const variant = variants.find(
                                        (item) =>
                                            item.fabric_id === selectedFabric &&
                                            item.fabric_color_id === color.id
                                    )

                                    if (!variant) return null

                                    const quantity = quantities[variant.id] || 0
                                    const isSelected = quantity > 0
                                    const priceBreakdown = getVariantPricing(variant.id)
                                    const lineTotal = priceBreakdown.unitPrice * quantity
                                    const badges = getVariantPriceBadges({
                                        layer: priceBreakdown.layer,
                                        discountPercentage,
                                    })

                                    return (
                                        <div
                                            key={color.id}
                                            className={`flex items-center justify-between rounded-md border p-1.5 pr-2 transition-colors ${
                                                isSelected
                                                    ? 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                                                    : 'border-border/60 bg-background hover:border-border/80 dark:hover:border-border'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => handleActivateVariant(variant.id)}
                                                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                                                disabled={!canSelectVariants}
                                            >
                                                <div
                                                    className="relative h-7 w-7 shrink-0 rounded-sm border shadow-sm md:h-8 md:w-8"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#f3f4f6',
                                                        ...(color.image_url
                                                            ? {
                                                                  backgroundImage: `url(${color.image_url})`,
                                                                  backgroundSize: 'cover',
                                                                  backgroundPosition: 'center',
                                                              }
                                                            : {}),
                                                    }}
                                                />
                                                <div className="flex min-w-0 flex-col">
                                                    <span
                                                        className={`truncate text-sm ${
                                                            isSelected
                                                                ? 'font-semibold text-foreground'
                                                                : 'font-medium text-muted-foreground'
                                                        }`}
                                                    >
                                                        {color.name}
                                                    </span>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[10px] font-medium text-muted-foreground">
                                                            R$ {priceBreakdown.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / un
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
                                            </button>

                                            <div className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-3">
                                                {isSelected && (
                                                    <span className="hidden whitespace-nowrap text-xs font-bold text-primary md:block">
                                                        R$ {lineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                                <div className="flex shrink-0 items-center gap-1 rounded border border-border/80 bg-background p-0.5">
                                                    <button
                                                        className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent md:h-7 md:w-8"
                                                        disabled={quantity === 0 || !canSelectVariants}
                                                        onClick={() =>
                                                            setVariantQuantity(variant.id, quantity - 1)
                                                        }
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </button>
                                                    <span className="w-6 select-none text-center text-sm font-semibold md:w-8">
                                                        {quantity === 0 ? '-' : quantity}
                                                    </span>
                                                    <button
                                                        className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 md:h-7 md:w-8 disabled:opacity-30"
                                                        disabled={!canSelectVariants}
                                                        onClick={() =>
                                                            setVariantQuantity(variant.id, quantity + 1)
                                                        }
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}

                                {filteredColors.length === 0 && colorSearch && (
                                    <div className="rounded-md border border-dashed bg-muted/20 py-4 text-center text-sm text-muted-foreground">
                                        Cor nao encontrada
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {selectedFabricGroup && selectedFabricGroup.colors.length === 0 && (
                        <div className="px-4 py-4 md:px-5">
                            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                                Nenhuma cor disponivel para este tecido.
                            </div>
                        </div>
                    )}
                </div>

                <div className="shrink-0 border-t border-border bg-background p-3 md:p-4">
                    {isSalesBlocked && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            Compras bloqueadas para este cliente. Fale com o administrativo.
                        </div>
                    )}
                    <div className="flex flex-col items-center gap-3 sm:flex-row">
                        <div className="flex w-full flex-1 items-center justify-between sm:w-auto sm:block">
                            <span className="text-sm font-medium text-muted-foreground">
                                Total ({totalQuantity} iten{totalQuantity !== 1 ? 's' : ''})
                            </span>
                            <span className="text-lg font-bold text-foreground sm:block">
                                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <Button
                            className="h-11 w-full min-w-[180px] gap-2 rounded-md px-6 font-semibold sm:w-auto"
                            disabled={isAddToCartDisabled}
                            onClick={handleAddToCart}
                        >
                            <ShoppingCart className="h-4 w-4" />
                            {addToCartLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
