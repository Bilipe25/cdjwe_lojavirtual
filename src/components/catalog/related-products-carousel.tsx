'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RelatedProduct } from '@/lib/products/related-products'
import { RelatedProductCard } from '@/components/catalog/related-product-card'

interface RelatedProductsCarouselProps {
    products: RelatedProduct[]
    detailsBasePath?: string
}

export function RelatedProductsCarousel({
    products,
    detailsBasePath = '/catalog',
}: RelatedProductsCarouselProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: 'start',
        containScroll: 'trimSnaps',
        dragFree: true,
    })
    const [canScrollPrev, setCanScrollPrev] = useState(false)
    const [canScrollNext, setCanScrollNext] = useState(false)

    const syncNavigation = useCallback(() => {
        if (!emblaApi) return
        setCanScrollPrev(emblaApi.canScrollPrev())
        setCanScrollNext(emblaApi.canScrollNext())
    }, [emblaApi])

    useEffect(() => {
        if (!emblaApi) return
        const frame = window.requestAnimationFrame(syncNavigation)
        emblaApi.on('select', syncNavigation)
        emblaApi.on('reInit', syncNavigation)

        return () => {
            window.cancelAnimationFrame(frame)
            emblaApi.off('select', syncNavigation)
            emblaApi.off('reInit', syncNavigation)
        }
    }, [emblaApi, syncNavigation])

    return (
        <div className="space-y-4">
            <div className="hidden items-center justify-end gap-2 md:flex">
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full bg-background/85 shadow-sm backdrop-blur-md"
                    onClick={() => emblaApi?.scrollPrev()}
                    disabled={!canScrollPrev}
                    aria-label="Ver produtos anteriores"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full bg-background/85 shadow-sm backdrop-blur-md"
                    onClick={() => emblaApi?.scrollNext()}
                    disabled={!canScrollNext}
                    aria-label="Ver proximos produtos"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="overflow-hidden" ref={emblaRef}>
                <div className="-ml-3 flex">
                    {products.map((product) => (
                        <div
                            key={product.id}
                            className="min-w-0 flex-[0_0_82%] pl-3 sm:flex-[0_0_48%] lg:flex-[0_0_32%] xl:flex-[0_0_24%]"
                        >
                            <RelatedProductCard
                                product={product}
                                detailsBasePath={detailsBasePath}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
