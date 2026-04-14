'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import {
    RELATED_PRODUCTS_SELECT,
    resolveRelatedProducts,
    type RelatedProduct,
} from '@/lib/products/related-products'

interface UseRelatedProductsOptions {
    currentProduct: Product | null
    enabled?: boolean
    limit?: number
}

interface UseRelatedProductsResult {
    products: RelatedProduct[]
    loading: boolean
    error: string | null
    reload: () => Promise<void>
}

const EMPTY_RESULT = {
    products: [] as RelatedProduct[],
    error: null as string | null,
}

function normalizeRelatedProduct(row: Record<string, unknown>): RelatedProduct {
    const categoryValue = Array.isArray(row.category) ? row.category[0] : row.category

    return {
        ...row,
        category:
            categoryValue && typeof categoryValue === 'object' && 'name' in categoryValue
                ? { name: String((categoryValue as { name: unknown }).name || '') }
                : null,
        images: Array.isArray(row.images)
            ? row.images.map((image) => ({
                  url: String((image as { url?: unknown }).url || ''),
                  is_primary: Boolean((image as { is_primary?: unknown }).is_primary),
                  sort_order:
                      typeof (image as { sort_order?: unknown }).sort_order === 'number'
                          ? ((image as { sort_order?: number }).sort_order ?? null)
                          : null,
              }))
            : [],
        size_options: Array.isArray(row.size_options)
            ? (row.size_options as RelatedProduct['size_options'])
            : [],
    } as RelatedProduct
}

export function useRelatedProducts({
    currentProduct,
    enabled = true,
    limit = 8,
}: UseRelatedProductsOptions): UseRelatedProductsResult {
    const [products, setProducts] = useState<RelatedProduct[]>(EMPTY_RESULT.products)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(EMPTY_RESULT.error)

    const reset = useCallback(() => {
        setProducts(EMPTY_RESULT.products)
        setError(EMPTY_RESULT.error)
        setLoading(false)
    }, [])

    const load = useCallback(async () => {
        if (!enabled || !currentProduct) {
            reset()
            return
        }

        setLoading(true)
        setError(null)

        const supabase = createClient()
        const fetchLimit = Math.max(limit * 3, 18)

        try {
            const baseQuery = () =>
                supabase
                    .from('products')
                    .select(RELATED_PRODUCTS_SELECT)
                    .eq('is_active', true)
                    .neq('id', currentProduct.id)
                    .eq('variants_filter.is_active', true)
                    .eq('variants_filter.fabric.is_active', true)
                    .eq('variants_filter.fabric_color.is_active', true)
                    .order('is_featured', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(fetchLimit)

            const sameCategoryPromise = currentProduct.category_id
                ? baseQuery().eq('category_id', currentProduct.category_id)
                : Promise.resolve({ data: [], error: null })

            const fallbackPromise = baseQuery()

            const [sameCategoryRes, fallbackRes] = await Promise.all([
                sameCategoryPromise,
                fallbackPromise,
            ])

            if (sameCategoryRes.error || fallbackRes.error) {
                throw sameCategoryRes.error || fallbackRes.error
            }

            const resolved = resolveRelatedProducts({
                currentProduct,
                sameCategoryCandidates: Array.isArray(sameCategoryRes.data)
                    ? sameCategoryRes.data.map((row) =>
                          normalizeRelatedProduct(row as Record<string, unknown>)
                      )
                    : [],
                fallbackCandidates: Array.isArray(fallbackRes.data)
                    ? fallbackRes.data.map((row) =>
                          normalizeRelatedProduct(row as Record<string, unknown>)
                      )
                    : [],
                limit,
            })

            setProducts(resolved)
        } catch (loadError) {
            console.error('[RELATED_PRODUCTS] Load error:', loadError)
            setProducts([])
            setError('Nao foi possivel carregar os produtos relacionados.')
        } finally {
            setLoading(false)
        }
    }, [currentProduct, enabled, limit, reset])

    useEffect(() => {
        void load()
    }, [load])

    const reload = useCallback(async () => {
        await load()
    }, [load])

    return { products, loading, error, reload }
}
