'use client'

import { Suspense } from 'react'
import { StoreHeader } from '@/components/layout/store-header'
import { StoreFooter } from '@/components/layout/store-footer'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useNetworkStatus } from '@/lib/hooks/use-network-status'
import { PromotionalPopup } from '@/components/marketing/promotional-popup'
import { PushNotificationProvider } from '@/components/providers/push-notification-provider'
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt'
import { WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle, ArrowUp, Instagram } from 'lucide-react'
import { useSettings } from '@/components/providers/settings-provider'
import { getWhatsAppLink } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { setViewAsCustomerAction } from '@/app/admin/actions/view-as-customer'
import { PriceTableInitializer } from '@/components/store/PriceTableInitializer'

export default function StoreLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isOnline } = useNetworkStatus()
    const pathname = usePathname()
    const router = useRouter()
    const [isViewingAsCustomer, setIsViewingAsCustomer] = useState(false)

    useEffect(() => {
        const checkViewAsCustomer = () => {
            const hasCookie = document.cookie.includes('view_as_customer=true')
            setIsViewingAsCustomer(hasCookie)
        }
        checkViewAsCustomer()
        
        // Polling cookie changes as secondary measure
        const interval = setInterval(checkViewAsCustomer, 2000)
        return () => clearInterval(interval)
    }, [])

    const handleReturnToAdmin = async () => {
        await setViewAsCustomerAction(false)
        router.push('/admin/dashboard')
    }

    return (
        <SettingsProvider>
            <ErrorBoundary>
                <div className="min-h-screen flex flex-col relative">
                    {/* Sticky Header Group */}
                    <div className="sticky top-0 z-50 w-full">
                        <AnimatePresence>
                            {!isOnline && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="bg-destructive text-destructive-foreground text-[10px] font-bold py-1 px-4 flex items-center justify-center gap-2 border-b border-destructive/20"
                                >
                                    <WifiOff className="h-3 w-3" />
                                    Você está offline. Algumas funções podem não funcionar.
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {isViewingAsCustomer && (
                            <div className="bg-linear-to-r from-orange-500 to-amber-600 text-white w-full py-1.5 px-4 text-xs font-semibold flex items-center justify-between z-60 shadow-sm relative overflow-hidden">
                                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPHBhdGggZD0iTTAgMEw4IDhaTTAgOEw4IDBaIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-30"></div>
                                <div className="flex items-center gap-2 max-w-7xl mx-auto w-full justify-between relative z-10">
                                    <span className="flex items-center gap-1.5 truncate">
                                        <span className="relative flex h-2 w-2 shrink-0">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                        </span>
                                        <span className="truncate">MODO DE VISUALIZAÇÃO: CLIENTE</span>
                                    </span>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        className="h-6 text-[10px] bg-white text-orange-600 hover:bg-orange-50 border-white/20 hover:text-orange-700 shadow-sm px-3 ml-2 shrink-0 transition-colors"
                                        onClick={handleReturnToAdmin}
                                    >
                                        Retornar ao Painel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Desktop Header */}
                        <Suspense fallback={<div className="h-16 border-b bg-muted/10 animate-pulse hidden md:block" />}>
                            <StoreHeader />
                        </Suspense>

                        {/* Mobile TopBar */}
                        <Suspense fallback={<div className="h-12 border-b bg-muted/20 animate-pulse md:hidden" />}>
                            <MobileTopBar />
                        </Suspense>
                    </div>

                    <main id="main-content" className="flex-1 pb-(--bottom-nav-height) md:pb-0">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={pathname}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="w-full h-full"
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    </main>

                    <CartDrawer />

                    {/* Desktop Footer - hidden on mobile */}
                    <div className="hidden md:block">
                        <StoreFooter />
                    </div>

                    {/* Mobile Bottom Nav - hidden on desktop */}
                    <MobileBottomNav />

                    {/* Price Table State Populator (Client-side) */}
                    <PriceTableInitializer />

                    {/* Global Floating Actions - Correctly nested inside Providers */}
                    <GlobalFloatingActions />

                    {/* Promotional Popup */}
                    <PromotionalPopup />

                    {/* PWA Install Prompt */}
                    <PWAInstallPrompt />

                    {/* Push Notification Provider (invisible — registers SW) */}
                    <PushNotificationProvider />
                </div>
            </ErrorBoundary>
        </SettingsProvider>
    )
}

function GlobalFloatingActions() {
    const { settings } = useSettings()
    const [showScrollTop, setShowScrollTop] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const whatsappLink = getWhatsAppLink(settings?.whatsapp)
    const instagramUrl = settings?.instagram ? (settings.instagram.startsWith('http') ? settings.instagram : `https://instagram.com/${settings.instagram.replace('@', '')}`) : null

    return (
        <div className="fixed bottom-24 md:bottom-6 right-4 lg:right-8 z-50 flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {showScrollTop && (
                    <motion.div
                        key="scroll-top"
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.8 }}
                        className="pointer-events-auto"
                    >
                        <motion.div whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}>
                            <Button
                                size="icon"
                                className="h-12 w-12 rounded-full gradient-bronze text-white shadow-xl hover:shadow-2xl border-none transition-all duration-300"
                                onClick={scrollToTop}
                                aria-label="Voltar ao topo"
                            >
                                <ArrowUp className="h-6 w-6" />
                            </Button>
                        </motion.div>
                    </motion.div>
                )}

                {instagramUrl && (
                    <motion.div
                        key="instagram-float"
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="pointer-events-auto"
                    >
                        <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
                            <Button
                                size="icon"
                                className="h-12 w-12 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-500 text-white shadow-xl hover:shadow-2xl hover:opacity-90 border-none transition-all duration-300"
                                aria-label="Instagram"
                            >
                                <Instagram className="h-6 w-6" />
                            </Button>
                        </a>
                    </motion.div>
                )}

                {whatsappLink && (
                    <motion.div
                        key="whatsapp-float"
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="pointer-events-auto"
                    >
                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                            <Button
                                size="icon"
                                className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-xl hover:shadow-2xl border-none transition-all duration-300"
                                aria-label="Falar no WhatsApp"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                </svg>
                            </Button>
                        </a>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
