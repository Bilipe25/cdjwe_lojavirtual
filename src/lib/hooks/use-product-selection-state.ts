'use client'

import { useCallback, useMemo, useState, type SetStateAction } from 'react'
import type { ProductSizeOption } from '@/lib/types'
import type { ProductDetailVariant, ProductFabricGroup } from '@/lib/products/product-detail'

interface SelectionBucketState {
    selectedFabricId: string | null
    activeVariantId: string | null
    quantities: Record<string, number>
    activeImageIndex: number
    colorSearch: string
}

interface SelectionBucketEntry {
    sizeOptionId: string | null
    quantities: Record<string, number>
}

interface SelectionState {
    scopeKey: string | null
    selectedSizeOptionId: string | null
    bucketsBySize: Record<string, SelectionBucketState>
    showFullDescription: boolean
}

interface UseProductSelectionStateOptions {
    scopeKey: string | null
    fabrics: ProductFabricGroup[]
    variants: ProductDetailVariant[]
    sizeOptions?: ProductSizeOption[]
    hasSizeVariants?: boolean
}

const INITIAL_SELECTION_BUCKET: SelectionBucketState = {
    selectedFabricId: null,
    activeVariantId: null,
    quantities: {},
    activeImageIndex: 0,
    colorSearch: '',
}

const INITIAL_SELECTION_STATE: SelectionState = {
    scopeKey: null,
    selectedSizeOptionId: null,
    bucketsBySize: {},
    showFullDescription: false,
}

function clampQuantity(value: number) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function getBucketKey(hasSizeVariants: boolean, sizeOptionId: string | null) {
    if (!hasSizeVariants) return 'legacy'
    return sizeOptionId ?? '__size_unselected__'
}

function getSizeOptionIdFromBucketKey(hasSizeVariants: boolean, bucketKey: string) {
    if (!hasSizeVariants) return null
    if (bucketKey === '__size_unselected__') return null
    return bucketKey
}

function getDefaultBucket() {
    return {
        ...INITIAL_SELECTION_BUCKET,
        quantities: {},
    }
}

export function useProductSelectionState({
    scopeKey,
    fabrics,
    variants,
    sizeOptions = [],
    hasSizeVariants = false,
}: UseProductSelectionStateOptions) {
    const [state, setState] = useState<SelectionState>(INITIAL_SELECTION_STATE)

    const isCurrentScope = scopeKey !== null && state.scopeKey === scopeKey

    const resolveSizeOptionId = useCallback(
        (candidate: string | null) => {
            if (!hasSizeVariants || sizeOptions.length === 0) return null
            if (candidate && sizeOptions.some((option) => option.id === candidate)) {
                return candidate
            }
            const defaultOption = sizeOptions.find((option) => option.is_default)
            return defaultOption?.id ?? null
        },
        [hasSizeVariants, sizeOptions]
    )

    const selectedSizeOptionId = useMemo(() => {
        if (!isCurrentScope) return resolveSizeOptionId(null)
        return resolveSizeOptionId(state.selectedSizeOptionId)
    }, [isCurrentScope, resolveSizeOptionId, state.selectedSizeOptionId])

    const selectedSizeOption = useMemo(
        () => sizeOptions.find((option) => option.id === selectedSizeOptionId) ?? null,
        [selectedSizeOptionId, sizeOptions]
    )

    const currentBucketKey = useMemo(
        () => getBucketKey(hasSizeVariants, selectedSizeOptionId),
        [hasSizeVariants, selectedSizeOptionId]
    )

    const currentBucket = useMemo(() => {
        if (!isCurrentScope) return INITIAL_SELECTION_BUCKET
        return state.bucketsBySize[currentBucketKey] ?? INITIAL_SELECTION_BUCKET
    }, [currentBucketKey, isCurrentScope, state.bucketsBySize])

    const selectionBuckets = useMemo<SelectionBucketEntry[]>(() => {
        if (!isCurrentScope) return []

        return Object.entries(state.bucketsBySize)
            .map(([bucketKey, bucket]) => ({
                sizeOptionId: getSizeOptionIdFromBucketKey(hasSizeVariants, bucketKey),
                quantities: bucket.quantities,
            }))
            .filter((entry) => Object.keys(entry.quantities).length > 0)
    }, [hasSizeVariants, isCurrentScope, state.bucketsBySize])

    const selectedFabric = useMemo(() => {
        if (
            currentBucket.selectedFabricId &&
            fabrics.some((fabric) => fabric.id === currentBucket.selectedFabricId)
        ) {
            return currentBucket.selectedFabricId
        }

        return fabrics[0]?.id ?? null
    }, [currentBucket.selectedFabricId, fabrics])

    const activeVariantId = useMemo(() => {
        if (
            currentBucket.activeVariantId &&
            variants.some((variant) => variant.id === currentBucket.activeVariantId)
        ) {
            return currentBucket.activeVariantId
        }

        return variants.find((variant) => variant.fabric_id === selectedFabric)?.id ?? null
    }, [currentBucket.activeVariantId, selectedFabric, variants])

    const quantities = currentBucket.quantities
    const activeImageIndex = currentBucket.activeImageIndex
    const colorSearch = currentBucket.colorSearch
    const showFullDescription = isCurrentScope
        ? state.showFullDescription
        : INITIAL_SELECTION_STATE.showFullDescription

    const selectedFabricGroup = fabrics.find((fabric) => fabric.id === selectedFabric) ?? null
    const activeVariant =
        variants.find((variant) => variant.id === activeVariantId) ||
        variants.find((variant) => variant.fabric_id === selectedFabric) ||
        null
    const currentSizeQuantity = Object.values(quantities).reduce(
        (sum, quantity) => sum + quantity,
        0
    )
    const totalQuantity = selectionBuckets.reduce(
        (sum, bucket) =>
            sum + Object.values(bucket.quantities).reduce((bucketSum, quantity) => bucketSum + quantity, 0),
        0
    )

    const updateState = useCallback(
        (updater: (previous: SelectionState) => SelectionState) => {
            setState((previous) => {
                const baseState =
                    scopeKey !== null && previous.scopeKey === scopeKey
                        ? previous
                        : { ...INITIAL_SELECTION_STATE, scopeKey }

                return updater(baseState)
            })
        },
        [scopeKey]
    )

    const resolveBucketKeyFromState = useCallback(
        (previous: SelectionState) => {
            const resolvedSizeOptionId = resolveSizeOptionId(previous.selectedSizeOptionId)
            return getBucketKey(hasSizeVariants, resolvedSizeOptionId)
        },
        [hasSizeVariants, resolveSizeOptionId]
    )

    const setSelectedSizeOptionId = useCallback(
        (sizeOptionId: string | null) => {
            updateState((previous) => {
                const nextSizeOptionId = hasSizeVariants ? sizeOptionId : null
                const nextBucketKey = getBucketKey(
                    hasSizeVariants,
                    resolveSizeOptionId(nextSizeOptionId)
                )

                if (previous.bucketsBySize[nextBucketKey]) {
                    return {
                        ...previous,
                        selectedSizeOptionId: nextSizeOptionId,
                    }
                }

                return {
                    ...previous,
                    selectedSizeOptionId: nextSizeOptionId,
                    bucketsBySize: {
                        ...previous.bucketsBySize,
                        [nextBucketKey]: getDefaultBucket(),
                    },
                }
            })
        },
        [hasSizeVariants, resolveSizeOptionId, updateState]
    )

    const setSelectedFabric = useCallback(
        (fabricId: string) => {
            updateState((previous) => {
                const bucketKey = resolveBucketKeyFromState(previous)
                const bucket = previous.bucketsBySize[bucketKey] ?? getDefaultBucket()
                return {
                    ...previous,
                    bucketsBySize: {
                        ...previous.bucketsBySize,
                        [bucketKey]: {
                            ...bucket,
                            selectedFabricId: fabricId,
                            activeVariantId:
                                variants.find((variant) => variant.fabric_id === fabricId)?.id ??
                                null,
                            colorSearch: '',
                            activeImageIndex: 0,
                        },
                    },
                }
            })
        },
        [resolveBucketKeyFromState, updateState, variants]
    )

    const setActiveVariantId = useCallback(
        (variantId: string | null) => {
            updateState((previous) => {
                const bucketKey = resolveBucketKeyFromState(previous)
                const bucket = previous.bucketsBySize[bucketKey] ?? getDefaultBucket()
                return {
                    ...previous,
                    bucketsBySize: {
                        ...previous.bucketsBySize,
                        [bucketKey]: {
                            ...bucket,
                            activeVariantId: variantId,
                        },
                    },
                }
            })
        },
        [resolveBucketKeyFromState, updateState]
    )

    const setActiveImageIndex = useCallback(
        (value: SetStateAction<number>) => {
            updateState((previous) => {
                const bucketKey = resolveBucketKeyFromState(previous)
                const bucket = previous.bucketsBySize[bucketKey] ?? getDefaultBucket()
                return {
                    ...previous,
                    bucketsBySize: {
                        ...previous.bucketsBySize,
                        [bucketKey]: {
                            ...bucket,
                            activeImageIndex:
                                typeof value === 'function'
                                    ? clampQuantity(value(bucket.activeImageIndex))
                                    : clampQuantity(value),
                        },
                    },
                }
            })
        },
        [resolveBucketKeyFromState, updateState]
    )

    const setColorSearch = useCallback(
        (value: SetStateAction<string>) => {
            updateState((previous) => {
                const bucketKey = resolveBucketKeyFromState(previous)
                const bucket = previous.bucketsBySize[bucketKey] ?? getDefaultBucket()
                return {
                    ...previous,
                    bucketsBySize: {
                        ...previous.bucketsBySize,
                        [bucketKey]: {
                            ...bucket,
                            colorSearch:
                                typeof value === 'function' ? value(bucket.colorSearch) : value,
                        },
                    },
                }
            })
        },
        [resolveBucketKeyFromState, updateState]
    )

    const setShowFullDescription = useCallback(
        (value: SetStateAction<boolean>) => {
            updateState((previous) => ({
                ...previous,
                showFullDescription:
                    typeof value === 'function' ? value(previous.showFullDescription) : value,
            }))
        },
        [updateState]
    )

    const setVariantQuantity = useCallback(
        (variantId: string, value: SetStateAction<number>) => {
            updateState((previous) => {
                const bucketKey = resolveBucketKeyFromState(previous)
                const bucket = previous.bucketsBySize[bucketKey] ?? getDefaultBucket()
                const currentQuantity = bucket.quantities[variantId] ?? 0
                const nextQuantity = typeof value === 'function' ? value(currentQuantity) : value
                const normalizedQuantity = clampQuantity(nextQuantity)
                const nextQuantities = { ...bucket.quantities }

                if (normalizedQuantity === 0) {
                    delete nextQuantities[variantId]
                } else {
                    nextQuantities[variantId] = normalizedQuantity
                }

                return {
                    ...previous,
                    bucketsBySize: {
                        ...previous.bucketsBySize,
                        [bucketKey]: {
                            ...bucket,
                            activeVariantId: variantId,
                            quantities: nextQuantities,
                        },
                    },
                }
            })
        },
        [resolveBucketKeyFromState, updateState]
    )

    const clearQuantities = useCallback(() => {
        updateState((previous) => {
            const bucketKey = resolveBucketKeyFromState(previous)
            const bucket = previous.bucketsBySize[bucketKey] ?? getDefaultBucket()
            return {
                ...previous,
                bucketsBySize: {
                    ...previous.bucketsBySize,
                    [bucketKey]: {
                        ...bucket,
                        quantities: {},
                    },
                },
            }
        })
    }, [resolveBucketKeyFromState, updateState])

    const resetSelection = useCallback(() => {
        setState({
            ...INITIAL_SELECTION_STATE,
            scopeKey,
        })
    }, [scopeKey])

    return {
        selectedSizeOptionId,
        selectedSizeOption,
        selectedFabric,
        selectedFabricGroup,
        activeVariantId,
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
    }
}
