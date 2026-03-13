'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Maximize2, Package, Search } from 'lucide-react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface ProductImage {
    id: string
    url: string
}

interface ProductImageGalleryProps {
    images: ProductImage[]
    productName: string
    activeImageIndex?: number
    onImageChange?: (index: number) => void
}

export function ProductImageGallery({
    images,
    productName,
    activeImageIndex = 0,
    onImageChange
}: ProductImageGalleryProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
    const [isHovering, setIsHovering] = useState(false)
    const [imagesLoaded, setImagesLoaded] = useState<Record<string, boolean>>({})
    
    // Embla Carousel for Main Image
    const [emblaMainRef, emblaMainApi] = useEmblaCarousel({
        loop: true,
        duration: 25,
        startIndex: activeImageIndex
    })

    // Embla Carousel for Thumbnails (Responsive axis)
    const [emblaThumbsRef, emblaThumbsApi] = useEmblaCarousel({
        containScroll: 'keepSnaps',
        dragFree: true,
        axis: 'y', // Default to vertical for desktop
        startIndex: activeImageIndex
    })

    // Separate state for mobile/horizontal axis
    const [emblaMobileThumbsRef, emblaMobileThumbsApi] = useEmblaCarousel({
        containScroll: 'keepSnaps',
        dragFree: true,
        axis: 'x', // Horizontal for mobile
        startIndex: activeImageIndex
    })

    // Synchronize carousels with prop index
    useEffect(() => {
        if (emblaMainApi) emblaMainApi.scrollTo(activeImageIndex)
        if (emblaThumbsApi) emblaThumbsApi.scrollTo(activeImageIndex)
        if (emblaMobileThumbsApi) emblaMobileThumbsApi.scrollTo(activeImageIndex)
    }, [activeImageIndex, emblaMainApi, emblaThumbsApi, emblaMobileThumbsApi])

    const onThumbClick = useCallback(
        (index: number) => {
            if (!emblaMainApi) return
            emblaMainApi.scrollTo(index)
            onImageChange?.(index)
        },
        [emblaMainApi, onImageChange]
    )

    const onSelect = useCallback(() => {
        if (!emblaMainApi) return
        const index = emblaMainApi.selectedScrollSnap()
        onImageChange?.(index)
        if (emblaThumbsApi) emblaThumbsApi.scrollTo(index)
        if (emblaMobileThumbsApi) emblaMobileThumbsApi.scrollTo(index)
    }, [emblaMainApi, emblaThumbsApi, emblaMobileThumbsApi, onImageChange])

    useEffect(() => {
        if (!emblaMainApi) return
        emblaMainApi.on('select', onSelect)
        return () => { emblaMainApi.off('select', onSelect) }
    }, [emblaMainApi, onSelect])

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - left) / width) * 100
        const y = ((e.clientY - top) / height) * 100
        setHoverPos({ x, y })
    }

    const handleImageLoad = (id: string) => {
        setImagesLoaded(prev => ({ ...prev, [id]: true }))
    }

    if (!images || images.length === 0) {
        return (
            <div className="aspect-square w-full rounded-2xl bg-muted flex items-center justify-center">
                <Package className="h-16 w-16 text-muted-foreground/20" />
            </div>
        )
    }

    const slides = images.map(img => ({ src: img.url }))

    return (
        <div className="flex flex-col md:flex-row gap-4">
            {/* Desktop Thumbnails (Vertical) */}
            {images.length > 1 && (
                <div className="hidden md:block w-20 shrink-0">
                    <div className="overflow-hidden h-[450px]" ref={emblaThumbsRef}>
                        <div className="flex flex-col gap-3 py-1">
                            {images.map((img, index) => (
                                <button
                                    key={`vthumb-${img.id}-${index}`}
                                    onClick={() => onThumbClick(index)}
                                    className={`relative min-h-[80px] w-full rounded-xl overflow-hidden border-2 transition-all ${
                                        index === activeImageIndex
                                            ? 'border-primary ring-2 ring-primary/20 shadow-lg scale-105'
                                            : 'border-transparent opacity-60 hover:opacity-100 hover:scale-102'
                                    }`}
                                >
                                    <Image
                                        src={img.url}
                                        alt={`Miniatura ${index + 1}`}
                                        fill
                                        className="object-cover"
                                    />
                                    {!imagesLoaded[img.id] && (
                                        <Skeleton className="absolute inset-0 z-10" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Gallery Wrapper */}
            <div className="flex-1 min-w-0 relative group">
                <div className="overflow-hidden rounded-2xl bg-muted glass-card aspect-square touch-pan-y" ref={emblaMainRef}>
                    <div className="flex">
                        {images.map((img, index) => (
                            <div 
                                key={img.id + '-' + index} 
                                className="relative flex-[0_0_100%] min-w-0 aspect-square cursor-zoom-in group/main"
                                onMouseMove={handleMouseMove}
                                onMouseEnter={() => setIsHovering(true)}
                                onMouseLeave={() => setIsHovering(false)}
                                onClick={() => setLightboxOpen(true)}
                            >
                                <Image
                                    src={img.url}
                                    alt={`${productName} - Imagem ${index + 1}`}
                                    fill
                                    priority={index <= 1}
                                    className="object-cover"
                                    onLoad={() => handleImageLoad(img.id)}
                                />
                                
                                {!imagesLoaded[img.id] && (
                                    <Skeleton className="absolute inset-0 z-10" />
                                )}
                                
                                {/* Hover Zoom Effect (Desktop Only) */}
                                <AnimatePresence>
                                    {isHovering && index === activeImageIndex && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 pointer-events-none z-20 hidden md:block overflow-hidden rounded-2xl"
                                        >
                                            <div 
                                                className="absolute inset-0 scale-[3]"
                                                style={{
                                                    backgroundImage: `url(${img.url})`,
                                                    backgroundPosition: `${hoverPos.x}% ${hoverPos.y}%`,
                                                    backgroundSize: 'cover'
                                                }}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Zoom Indicator Label */}
                                <div className="absolute top-4 right-4 z-30 opacity-0 group-hover/main:opacity-100 transition-opacity hidden md:flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-1.5 rounded-full text-white text-[10px] font-bold tracking-wider pointer-events-none uppercase">
                                    <Search className="h-3 w-3" />
                                    Passe o mouse para zoom
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Navigation Arrows (Visible on group hover or mobile) */}
                {images.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 backdrop-blur shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex z-30"
                            onClick={(e) => { e.stopPropagation(); emblaMainApi?.scrollPrev() }}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/80 backdrop-blur shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex z-30"
                            onClick={(e) => { e.stopPropagation(); emblaMainApi?.scrollNext() }}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </>
                )}

                {/* Expand Trigger */}
                <button 
                    onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
                    className="absolute bottom-4 right-4 h-11 w-11 rounded-full bg-white/90 backdrop-blur shadow-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform z-30"
                    aria-label="Expandir imagem"
                >
                    <Maximize2 className="h-5.5 w-5.5" />
                </button>

                {/* Counter (Mobile) */}
                <div className="absolute bottom-4 left-4 px-3 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-bold md:hidden z-30">
                    {activeImageIndex + 1} <span className="text-white/50 px-1">/</span> {images.length}
                </div>
            </div>

            {/* Mobile Thumbnails (Horizontal Carousel) */}
            {images.length > 1 && (
                <div className="md:hidden overflow-hidden" ref={emblaMobileThumbsRef}>
                    <div className="flex gap-3 pb-2 pt-1 px-1">
                        {images.map((img, index) => (
                            <button
                                key={`hthumb-${img.id}-${index}`}
                                onClick={() => onThumbClick(index)}
                                className={`relative h-18 w-18 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                                    index === activeImageIndex
                                        ? 'border-primary shadow-md'
                                        : 'border-transparent opacity-50'
                                }`}
                            >
                                <Image
                                    src={img.url}
                                    alt={`Miniatura ${index + 1}`}
                                    fill
                                    className="object-cover"
                                    onLoad={() => handleImageLoad(`thumb-${img.id}`)}
                                />
                                {!imagesLoaded[`thumb-${img.id}`] && (
                                    <Skeleton className="absolute inset-0 z-10" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Fullscreen Lightbox */}
            <Lightbox
                open={lightboxOpen}
                close={() => setLightboxOpen(false)}
                index={activeImageIndex}
                slides={slides}
                plugins={[Zoom, Thumbnails]}
                zoom={{
                    maxZoomPixelRatio: 4,
                    zoomInMultiplier: 2.5,
                    doubleTapDelay: 300,
                    doubleClickDelay: 300,
                    doubleClickMaxStops: 2,
                    keyboardMoveDistance: 50,
                    wheelZoomDistanceFactor: 100,
                    pinchZoomDistanceFactor: 100,
                    scrollToZoom: true,
                }}
                styles={{
                    container: { backgroundColor: "rgba(0, 0, 0, .95)" },
                }}
            />
        </div>
    )
}
