import type { Category, Product, ProductSizeOption } from '@/lib/types'

export interface RelatedProductImage {
    url: string
    is_primary: boolean
    sort_order?: number | null
}

export interface RelatedProduct
    extends Omit<Product, 'category' | 'images' | 'size_options'> {
    category?: Pick<Category, 'name'> | null
    images?: RelatedProductImage[]
    size_options?: ProductSizeOption[]
}

type RelatedProductCandidate = RelatedProduct & {
    variants_filter?: Array<{ id: string }> | null
}

export const RELATED_PRODUCTS_SELECT = `
    id,
    name,
    slug,
    description,
    category_id,
    size,
    has_size_variants,
    base_price,
    is_active,
    is_featured,
    sort_order,
    created_at,
    updated_at,
    category:categories(name),
    images:product_images(url, is_primary, sort_order),
    size_options:product_size_options(*),
    variants_filter:product_variants!inner(
        id,
        is_active,
        fabric:fabrics!inner(id, is_active),
        fabric_color:fabric_colors!product_variants_fabric_color_fk!inner(id, is_active)
    )
`

function normalizeText(value: string | null | undefined) {
    return value?.trim().toLowerCase() || ''
}

function hasPrimaryImage(product: RelatedProduct) {
    return Boolean(product.images?.some((image) => image.is_primary) || product.images?.length)
}

function activeSizeOptionsCount(product: RelatedProduct) {
    return (product.size_options || []).filter((sizeOption) => sizeOption.is_active).length
}

function priceDistance(currentProduct: Product, candidate: RelatedProduct) {
    const base = Math.max(currentProduct.base_price || 0, 1)
    return Math.abs((candidate.base_price || 0) - (currentProduct.base_price || 0)) / base
}

function scoreRelatedProduct(currentProduct: Product, candidate: RelatedProduct) {
    const sameCategory = Boolean(
        currentProduct.category_id &&
            candidate.category_id &&
            currentProduct.category_id === candidate.category_id
    )
    const sameSizeLabel =
        normalizeText(currentProduct.size) !== '' &&
        normalizeText(currentProduct.size) === normalizeText(candidate.size)
    const sameSizeMode =
        Boolean(currentProduct.has_size_variants) === Boolean(candidate.has_size_variants)
    const descriptionScore = candidate.description?.trim() ? 14 : 0
    const imageScore = hasPrimaryImage(candidate) ? 32 : 0
    const featuredScore = candidate.is_featured ? 12 : 0
    const sizeOptionsScore = Math.min(activeSizeOptionsCount(candidate), 4) * 3
    const priceScore = Math.max(0, 240 - priceDistance(currentProduct, candidate) * 240)

    return (
        (sameCategory ? 600 : 0) +
        priceScore +
        (sameSizeLabel ? 80 : 0) +
        (sameSizeMode ? 36 : 0) +
        imageScore +
        descriptionScore +
        featuredScore +
        sizeOptionsScore
    )
}

function dedupeProducts(products: RelatedProductCandidate[]) {
    const deduped = new Map<string, RelatedProductCandidate>()

    products.forEach((product) => {
        if (!product?.id || deduped.has(product.id)) return
        deduped.set(product.id, product)
    })

    return Array.from(deduped.values())
}

function sortCandidates(currentProduct: Product, candidates: RelatedProductCandidate[]) {
    return dedupeProducts(candidates)
        .filter((candidate) => candidate.id !== currentProduct.id && candidate.is_active)
        .sort((left, right) => {
            const scoreDelta = scoreRelatedProduct(currentProduct, right) - scoreRelatedProduct(currentProduct, left)
            if (scoreDelta !== 0) return scoreDelta

            const imageDelta = Number(hasPrimaryImage(right)) - Number(hasPrimaryImage(left))
            if (imageDelta !== 0) return imageDelta

            const featuredDelta = Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured))
            if (featuredDelta !== 0) return featuredDelta

            const priceDelta = priceDistance(currentProduct, left) - priceDistance(currentProduct, right)
            if (priceDelta !== 0) return priceDelta

            return left.name.localeCompare(right.name, 'pt-BR')
        })
}

export function resolveRelatedProducts({
    currentProduct,
    sameCategoryCandidates,
    fallbackCandidates,
    limit = 8,
}: {
    currentProduct: Product
    sameCategoryCandidates: RelatedProductCandidate[]
    fallbackCandidates: RelatedProductCandidate[]
    limit?: number
}) {
    const sameCategory = sortCandidates(currentProduct, sameCategoryCandidates)
    if (sameCategory.length >= limit) {
        return sameCategory.slice(0, limit)
    }

    const usedIds = new Set(sameCategory.map((product) => product.id))
    const fallback = sortCandidates(currentProduct, fallbackCandidates).filter(
        (product) => !usedIds.has(product.id)
    )

    return [...sameCategory, ...fallback].slice(0, limit)
}
