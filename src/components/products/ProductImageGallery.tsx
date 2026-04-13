'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Maximize2, Package, Search } from 'lucide-react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { motion, AnimatePresence } from 'framer-motion'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

interface ProductImage {
    id: string
    url: string
}

interface ProductImageGalleryProps {
    images: ProductImage[]
    productName: string
    activeImageIndex?: number
    onImageChange?: (index: number) => void
    layoutContext?: 'quickview' | 'detail'
}

export function ProductImageGallery({
    images,
    productName,
    activeImageIndex = 0,
    onImageChange,
    layoutContext = 'detail',
}: ProductImageGalleryProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
    const [isHovering, setIsHovering] = useState(false)
    const [imagesLoaded, setImagesLoaded] = useState<Record<string, boolean>>({})
    const isMobile = useIsMobile()
    
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

    // Sincronizar carousels com prop index
    useEffect(() => {
        if (emblaMainApi) emblaMainApi.scrollTo(activeImageIndex)
        if (emblaThumbsApi) emblaThumbsApi.scrollTo(activeImageIndex)
        if (emblaMobileThumbsApi) emblaMobileThumbsApi.scrollTo(activeImageIndex)
    }, [activeImageIndex, emblaMainApi, emblaThumbsApi, emblaMobileThumbsApi])

    // Notificar estado do lightbox para outros componentes (ex: Vaul Drawer)
    useEffect(() => {
        const event = new CustomEvent('lightbox-state-change', { detail: { open: lightboxOpen } })
        window.dispatchEvent(event)
    }, [lightboxOpen])

    // Quando a lightbox abre, o Radix (base do Vaul) seta pointer-events:none no body
    // bloqueando o portal da lightbox. Precisamos forçar reset aqui.
    useEffect(() => {
        if (!lightboxOpen) return
        const prev = document.body.style.pointerEvents
        const prevTouch = document.body.style.touchAction
        document.body.style.pointerEvents = 'auto'
        document.body.style.touchAction = 'auto'
        return () => {
            document.body.style.pointerEvents = prev
            document.body.style.touchAction = prevTouch
        }
    }, [lightboxOpen])

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
    const isQuickView = layoutContext === 'quickview'
    const wrapperSpacingClass = isQuickView ? 'gap-1.5 md:gap-3 p-1.5 md:p-3' : 'gap-2 md:gap-4 p-2 md:p-4'
    const desktopThumbRailClass = isQuickView ? 'w-[64px]' : 'w-[72px]'
    const desktopThumbItemClass = isQuickView ? 'min-h-[72px]' : 'min-h-[80px]'
    const mainImageClassName = isQuickView
        ? 'object-contain p-1.5 sm:p-2.5 md:p-3 lg:p-3.5 xl:p-4'
        : 'object-contain p-2 sm:p-3 md:p-4 lg:p-5 xl:p-6'
    const thumbImagePaddingClass = isQuickView ? 'object-contain p-0.5' : 'object-contain p-1'
    const mobileThumbSizeClass = isQuickView ? 'h-16 w-16' : 'h-[4.5rem] w-[4.5rem]'

    return (
        <div className={`flex h-full flex-col md:flex-row ${wrapperSpacingClass}`}>
            {/* Desktop Thumbnails (Vertical) */}
            {images.length > 1 && (
                <div className={`hidden h-full shrink-0 flex-col md:flex ${desktopThumbRailClass}`}> 
                    <div className="overflow-hidden flex-1 relative" ref={emblaThumbsRef}>
                        <div className="flex flex-col gap-3 py-1">
                            {images.map((img, index) => (
                                <button
                                    key={`vthumb-${img.id}-${index}`}
                                    onClick={() => onThumbClick(index)}
                                    className={`relative w-full rounded-xl overflow-hidden border-2 transition-all ${desktopThumbItemClass} ${
                                        index === activeImageIndex
                                            ? 'border-primary ring-2 ring-primary/20 shadow-lg scale-105 bg-background/90'
                                            : 'border-transparent opacity-60 hover:opacity-100 hover:scale-102 bg-background/70'
                                    }`}
                                >
                                    <Image
                                        src={img.url}
                                        alt={`Miniatura ${index + 1}`}
                                        fill
                                        sizes="96px"
                                        className={thumbImagePaddingClass}
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
            <div className="flex-1 min-w-0 relative group flex flex-col justify-center">
                <div className={`overflow-hidden rounded-2xl bg-muted/30 aspect-square flex items-center justify-center${lightboxOpen ? ' pointer-events-none' : ''}`} ref={emblaMainRef}>
                    <div className="flex w-full h-full">
                        {images.map((img, index) => (
                            <div 
                                key={img.id + '-' + index} 
                                className="relative flex-[0_0_100%] min-w-0 h-full cursor-zoom-in group/main"
                                onMouseMove={handleMouseMove}
                                onMouseEnter={() => setIsHovering(true)}
                                onMouseLeave={() => setIsHovering(false)}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (!lightboxOpen) setLightboxOpen(true)
                                }}
                            >
                                {isMobile ? (
                                    <TransformWrapper
                                        initialScale={1}
                                        disabled={lightboxOpen}
                                        panning={{ disabled: lightboxOpen }}
                                        pinch={{ disabled: lightboxOpen }}
                                        wheel={{ disabled: true }}
                                        doubleClick={{ disabled: lightboxOpen }}
                                    >
                                        <TransformComponent 
                                            wrapperClass="absolute inset-0 w-full h-full" 
                                            contentClass="w-full h-full"
                                            wrapperStyle={{ width: '100%', height: '100%' }}
                                            contentStyle={{ width: '100%', height: '100%' }}
                                        >
                                            <div className="relative w-full h-full">
                                                <Image
                                                    src={img.url}
                                                    alt={`${productName} - Imagem ${index + 1}`}
                                                    fill
                                                    sizes="(max-width: 768px) 100vw, 50vw"
                                                    priority={index <= 1}
                                                    className={mainImageClassName}
                                                    onLoad={() => handleImageLoad(img.id)}
                                                />
                                            </div>
                                        </TransformComponent>
                                    </TransformWrapper>
                                ) : (
                                    <Image
                                        src={img.url}
                                        alt={`${productName} - Imagem ${index + 1}`}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                        priority={index <= 1}
                                        className={mainImageClassName}
                                        onLoad={() => handleImageLoad(img.id)}
                                    />
                                )}
                                
                                {!imagesLoaded[img.id] && (
                                    <Skeleton className="absolute inset-0 z-10 pointer-events-none" />
                                )}
                                
                                {/* Hover Zoom Effect (Desktop Only) */}
                                <AnimatePresence>
                                    {isHovering && index === activeImageIndex && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="absolute inset-0 pointer-events-none z-20 hidden md:block overflow-hidden rounded-2xl"
                                        >
                                            <motion.div 
                                                className="absolute inset-0"
                                                animate={{ 
                                                    backgroundPosition: `${hoverPos.x}% ${hoverPos.y}%`
                                                }}
                                                transition={{ type: "spring", stiffness: 100, damping: 20, mass: 0.5 }}
                                                style={{
                                                    backgroundImage: `url(${img.url})`,
                                                    backgroundSize: '250%', // Professional 2.5x zoom
                                                    backgroundRepeat: 'no-repeat'
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
                            className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex z-30"
                            onClick={(e) => { e.stopPropagation(); emblaMainApi?.scrollPrev() }}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 backdrop-blur shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex z-30"
                            onClick={(e) => { e.stopPropagation(); emblaMainApi?.scrollNext() }}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </>
                )}

                {/* Expand Trigger */}
                <button 
                    onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
                    className="absolute bottom-4 right-4 h-11 w-11 rounded-full bg-background/90 backdrop-blur shadow-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform z-30"
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
                                className={`relative rounded-xl overflow-hidden shrink-0 border-2 transition-all ${mobileThumbSizeClass} ${
                                    index === activeImageIndex
                                        ? 'border-primary shadow-md bg-background/90'
                                        : 'border-transparent opacity-50 bg-background/70'
                                }`}
                            >
                                <Image
                                    src={img.url}
                                    alt={`Miniatura ${index + 1}`}
                                    fill
                                    sizes="72px"
                                    className={thumbImagePaddingClass}
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

            {/* Lightbox — renderiza em portal no document.body, z-index 9999 */}
            <Lightbox
                    open={lightboxOpen}
                    close={() => setLightboxOpen(false)}
                    index={activeImageIndex}
                    slides={slides}
                    plugins={[Zoom, Thumbnails]}
                    on={{
                        view: ({ index }) => onImageChange?.(index)
                    }}
                    carousel={{
                        finite: false,
                        preload: 2,
                        padding: isMobile ? "16px" : "0px",
                    }}
                    controller={{
                        closeOnPullDown: false,
                        closeOnPullUp: false,
                        closeOnBackdropClick: true,
                    }}
                    zoom={{
                        maxZoomPixelRatio: 4,
                        zoomInMultiplier: 2.5,
                        doubleTapDelay: 300,
                        doubleClickDelay: 300,
                        doubleClickMaxStops: 2,
                        keyboardMoveDistance: 50,
                        wheelZoomDistanceFactor: 100,
                        pinchZoomDistanceFactor: 100,
                        scrollToZoom: !isMobile,
                    }}
                    styles={{
                        container: { 
                            backgroundColor: "rgba(0, 0, 0, 1)", 
                            zIndex: 9999 
                        },
                    }}
                />
        </div>
    )
}
