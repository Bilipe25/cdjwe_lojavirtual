'use client'

import { useCallback, useMemo, useState, type SetStateAction } from 'react'
import type { ProductDetailVariant, ProductFabricGroup } from '@/lib/products/product-detail'

interface SelectionState {
    scopeKey: string | null
    selectedFabricId: string | null
    activeVariantId: string | null
    quantities: Record<string, number>
    activeImageIndex: number
    colorSearch: string
    showFullDescription: boolean
}

interface UseProductSelectionStateOptions {
    scopeKey: string | null
    fabrics: ProductFabricGroup[]
    variants: ProductDetailVariant[]
}

const INITIAL_SELECTION_STATE: SelectionState = {
    scopeKey: null,
    selectedFabricId: null,
    activeVariantId: null,
    quantities: {},
    activeImageIndex: 0,
    colorSearch: '',
    showFullDescription: false,
}

function clampQuantity(value: number) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function useProductSelectionState({
    scopeKey,
    fabrics,
    variants,
}: UseProductSelectionStateOptions) {
    const [state, setState] = useState<SelectionState>(INITIAL_SELECTION_STATE)

    const isCurrentScope = scopeKey !== null && state.scopeKey === scopeKey

    const selectedFabric = useMemo(() => {
        if (
            isCurrentScope &&
            state.selectedFabricId &&
            fabrics.some((fabric) => fabric.id === state.selectedFabricId)
        ) {
            return state.selectedFabricId
        }

        return fabrics[0]?.id ?? null
    }, [fabrics, isCurrentScope, state.selectedFabricId])

    const activeVariantId = useMemo(() => {
        if (
            isCurrentScope &&
            state.activeVariantId &&
            variants.some((variant) => variant.id === state.activeVariantId)
        ) {
            return state.activeVariantId
        }

        return variants.find((variant) => variant.fabric_id === selectedFabric)?.id ?? null
    }, [isCurrentScope, selectedFabric, state.activeVariantId, variants])

    const quantities = isCurrentScope ? state.quantities : INITIAL_SELECTION_STATE.quantities
    const activeImageIndex = isCurrentScope ? state.activeImageIndex : INITIAL_SELECTION_STATE.activeImageIndex
    const colorSearch = isCurrentScope ? state.colorSearch : INITIAL_SELECTION_STATE.colorSearch
    const showFullDescription = isCurrentScope
        ? state.showFullDescription
        : INITIAL_SELECTION_STATE.showFullDescription

    const selectedFabricGroup = fabrics.find((fabric) => fabric.id === selectedFabric) ?? null
    const activeVariant =
        variants.find((variant) => variant.id === activeVariantId) ||
        variants.find((variant) => variant.fabric_id === selectedFabric) ||
        null
    const totalQuantity = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0)

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

    const setSelectedFabric = useCallback(
        (fabricId: string) => {
            updateState((previous) => ({
                ...previous,
                selectedFabricId: fabricId,
                activeVariantId:
                    variants.find((variant) => variant.fabric_id === fabricId)?.id ?? null,
                quantities: {},
                colorSearch: '',
                activeImageIndex: 0,
            }))
        },
        [updateState, variants]
    )

    const setActiveVariantId = useCallback(
        (variantId: string | null) => {
            updateState((previous) => ({
                ...previous,
                activeVariantId: variantId,
            }))
        },
        [updateState]
    )

    const setActiveImageIndex = useCallback(
        (value: SetStateAction<number>) => {
            updateState((previous) => ({
                ...previous,
                activeImageIndex:
                    typeof value === 'function'
                        ? clampQuantity(value(previous.activeImageIndex))
                        : clampQuantity(value),
            }))
        },
        [updateState]
    )

    const setColorSearch = useCallback(
        (value: SetStateAction<string>) => {
            updateState((previous) => ({
                ...previous,
                colorSearch: typeof value === 'function' ? value(previous.colorSearch) : value,
            }))
        },
        [updateState]
    )

    const setShowFullDescription = useCallback(
        (value: SetStateAction<boolean>) => {
            updateState((previous) => ({
                ...previous,
                showFullDescription:
                    typeof value === 'function'
                        ? value(previous.showFullDescription)
                        : value,
            }))
        },
        [updateState]
    )

    const setVariantQuantity = useCallback(
        (variantId: string, value: SetStateAction<number>) => {
            updateState((previous) => {
                const currentQuantity = previous.quantities[variantId] ?? 0
                const nextQuantity =
                    typeof value === 'function' ? value(currentQuantity) : value
                const normalizedQuantity = clampQuantity(nextQuantity)
                const nextQuantities = { ...previous.quantities }

                if (normalizedQuantity === 0) {
                    delete nextQuantities[variantId]
                } else {
                    nextQuantities[variantId] = normalizedQuantity
                }

                return {
                    ...previous,
                    activeVariantId: variantId,
                    quantities: nextQuantities,
                }
            })
        },
        [updateState]
    )

    const clearQuantities = useCallback(() => {
        updateState((previous) => ({
            ...previous,
            quantities: {},
        }))
    }, [updateState])

    const resetSelection = useCallback(() => {
        setState({
            ...INITIAL_SELECTION_STATE,
            scopeKey,
        })
    }, [scopeKey])

    return {
        selectedFabric,
        selectedFabricGroup,
        activeVariantId,
        activeVariant,
        quantities,
        totalQuantity,
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
    }
}
