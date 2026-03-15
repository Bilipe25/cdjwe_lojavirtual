import type { Fabric, FabricColor, ProductVariant } from '@/lib/types'

export const PRODUCT_VARIANT_DETAIL_SELECT = `
    *,
    fabric:fabrics(*),
    fabric_color:fabric_colors!product_variants_fabric_color_fk(*)
`

export type ProductDetailVariant = ProductVariant & {
    fabric: Fabric
    fabric_color: FabricColor
}

export type ProductFabricGroup = Fabric & {
    colors: FabricColor[]
}

export function buildProductFabricGroups(variants: ProductDetailVariant[]): ProductFabricGroup[] {
    const fabricMap = new Map<string, ProductFabricGroup>()

    variants.forEach((variant) => {
        if (!variant.fabric || !variant.fabric_color) return

        if (!fabricMap.has(variant.fabric_id)) {
            fabricMap.set(variant.fabric_id, {
                ...variant.fabric,
                colors: [],
            })
        }

        const fabric = fabricMap.get(variant.fabric_id)
        if (!fabric) return

        if (!fabric.colors.find((color) => color.id === variant.fabric_color_id)) {
            fabric.colors.push(variant.fabric_color)
        }
    })

    return Array.from(fabricMap.values())
        .map((fabric) => ({
            ...fabric,
            colors: [...fabric.colors].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        }))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}
