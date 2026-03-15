'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product, ProductImage } from '@/lib/types'
import {
    buildProductFabricGroups,
    PRODUCT_VARIANT_DETAIL_SELECT,
    type ProductDetailVariant,
    type ProductFabricGroup,
} from '@/lib/products/product-detail'

interface UseProductDetailDataOptions {
    productId: string | null
    enabled?: boolean
}

export interface ProductDetailData {
    product: Product | null
    images: ProductImage[]
    fabrics: ProductFabricGroup[]
    variants: ProductDetailVariant[]
    loading: boolean
    error: string | null
    reload: () => Promise<void>
}

const EMPTY_DETAIL_DATA: Omit<ProductDetailData, 'loading' | 'reload'> = {
    product: null,
    images: [],
    fabrics: [],
    variants: [],
    error: null,
}

export function useProductDetailData({
    productId,
    enabled = true,
}: UseProductDetailDataOptions): ProductDetailData {
    const [product, setProduct] = useState<Product | null>(EMPTY_DETAIL_DATA.product)
    const [images, setImages] = useState<ProductImage[]>(EMPTY_DETAIL_DATA.images)
    const [fabrics, setFabrics] = useState<ProductFabricGroup[]>(EMPTY_DETAIL_DATA.fabrics)
    const [variants, setVariants] = useState<ProductDetailVariant[]>(EMPTY_DETAIL_DATA.variants)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(EMPTY_DETAIL_DATA.error)

    const resetState = useCallback(() => {
        setProduct(EMPTY_DETAIL_DATA.product)
        setImages(EMPTY_DETAIL_DATA.images)
        setFabrics(EMPTY_DETAIL_DATA.fabrics)
        setVariants(EMPTY_DETAIL_DATA.variants)
        setError(EMPTY_DETAIL_DATA.error)
        setLoading(false)
    }, [])

    const loadProduct = useCallback(async (id: string) => {
        setLoading(true)
        setError(null)
        const supabase = createClient()

        try {
            const [productRes, imagesRes, variantsRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('*, category:categories(*)')
                    .eq('id', id)
                    .single(),
                supabase
                    .from('product_images')
                    .select('*')
                    .eq('product_id', id)
                    .order('sort_order'),
                supabase
                    .from('product_variants')
                    .select(PRODUCT_VARIANT_DETAIL_SELECT)
                    .eq('product_id', id)
                    .eq('is_active', true),
            ])

            if (productRes.error || !productRes.data) {
                setProduct(null)
                setImages([])
                setVariants([])
                setFabrics([])
                setError('Produto não encontrado ou indisponível.')
                return
            }

            if (variantsRes.error) {
                setProduct(productRes.data as Product)
                setImages(imagesRes.data || [])
                setVariants([])
                setFabrics([])
                setError('Falha ao carregar variações do produto.')
                return
            }

            const nextVariants = (variantsRes.data || []) as ProductDetailVariant[]
            setProduct(productRes.data as Product)
            setImages(imagesRes.data || [])
            setVariants(nextVariants)
            setFabrics(buildProductFabricGroups(nextVariants))
        } catch (err) {
            console.error('[PRODUCT_DETAIL_DATA] Load error:', err)
            setProduct(null)
            setImages([])
            setVariants([])
            setFabrics([])
            setError('Não foi possível carregar este produto. Verifique sua conexão.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!enabled || !productId) {
            resetState()
            return
        }

        void loadProduct(productId)
    }, [enabled, productId, loadProduct, resetState])

    const reload = useCallback(async () => {
        if (!productId || !enabled) return
        await loadProduct(productId)
    }, [enabled, loadProduct, productId])

    return { product, images, fabrics, variants, loading, error, reload }
}
