export interface GalleryImageItem {
    id: string
    url: string
}

interface GalleryHighlightImage {
    id?: string | null
    imageUrl?: string | null
}

function normalizeUrl(url: string) {
    return url.trim()
}

function dedupeByUrl(images: GalleryImageItem[]) {
    const seen = new Set<string>()

    return images.filter((image) => {
        const normalizedUrl = normalizeUrl(image.url)
        if (!normalizedUrl || seen.has(normalizedUrl)) {
            return false
        }

        seen.add(normalizedUrl)
        return true
    })
}

export function buildBaseGalleryImages(images: Array<{ id: string; url: string }>): GalleryImageItem[] {
    return dedupeByUrl(
        images.map((image) => ({
            id: image.id,
            url: image.url,
        }))
    )
}

export function buildDisplayGalleryImages(
    baseImages: GalleryImageItem[],
    highlightImage?: GalleryHighlightImage | null
): GalleryImageItem[] {
    if (!highlightImage?.imageUrl) {
        return baseImages
    }

    return dedupeByUrl([
        {
            id: `highlight-${highlightImage.id ?? 'image'}`,
            url: highlightImage.imageUrl,
        },
        ...baseImages,
    ])
}
