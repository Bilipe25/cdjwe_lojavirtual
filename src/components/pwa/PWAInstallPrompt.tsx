'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone, Zap, Bell, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

// How long to suppress the prompt after "Agora não" (7 days in ms)
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const DISMISS_KEY = 'pwa-install-dismissed-at'

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [isInstalled, setIsInstalled] = useState(false)

    // Check if already installed (standalone mode)
    useEffect(() => {
        if (typeof window === 'undefined') return

        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true

        if (isStandalone) {
            setIsInstalled(true)
            return
        }

        // Check dismiss cooldown
        const dismissedAt = localStorage.getItem(DISMISS_KEY)
        if (dismissedAt) {
            const elapsed = Date.now() - parseInt(dismissedAt, 10)
            if (elapsed < DISMISS_COOLDOWN_MS) return // Still in cooldown
        }

        const handler = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            // Small delay to not interrupt page load
            setTimeout(() => setShowModal(true), 2000)
        }

        window.addEventListener('beforeinstallprompt', handler)

        // Listen for successful installation
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true)
            setShowModal(false)
            setDeferredPrompt(null)
        })

        return () => {
            window.removeEventListener('beforeinstallprompt', handler)
        }
    }, [])

    const handleInstall = useCallback(async () => {
        if (!deferredPrompt) return

        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        if (outcome === 'accepted') {
            setIsInstalled(true)
        }

        setShowModal(false)
        setDeferredPrompt(null)
    }, [deferredPrompt])

    const handleDismiss = useCallback(() => {
        setShowModal(false)
        localStorage.setItem(DISMISS_KEY, Date.now().toString())
    }, [])

    if (isInstalled || !showModal) return null

    const benefits = [
        { icon: Zap, text: 'Acesso rápido com um toque' },
        { icon: Bell, text: 'Notificações de novos pedidos' },
        { icon: WifiOff, text: 'Funciona mesmo sem internet' },
        { icon: Smartphone, text: 'Experiência de app nativo' },
    ]

    return (
        <AnimatePresence>
            {showModal && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-9998"
                        onClick={handleDismiss}
                    />

                    {/* Modal - centered on desktop, bottom sheet on mobile */}
                    <motion.div
                        initial={{ opacity: 0, y: 100, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 100, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="
                            fixed z-9999
                            bottom-0 left-0 right-0
                            sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
                            w-full sm:max-w-md
                            bg-white rounded-t-3xl sm:rounded-2xl
                            shadow-2xl shadow-navy/20
                            overflow-hidden
                        "
                    >
                        {/* Pull indicator (mobile only) */}
                        <div className="flex justify-center pt-3 sm:hidden">
                            <div className="w-10 h-1 rounded-full bg-gray-300" />
                        </div>

                        {/* Close button */}
                        <button
                            onClick={handleDismiss}
                            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                            aria-label="Fechar"
                        >
                            <X className="h-5 w-5 text-gray-400" />
                        </button>

                        <div className="px-6 pt-6 pb-8 sm:px-8 sm:pt-8 sm:pb-8">
                            {/* Header */}
                            <div className="flex items-center gap-4 mb-6">
                                <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-gray-100 shrink-0">
                                    <Image
                                        src="/icons/icon-192.png"
                                        alt="JWE B2B"
                                        fill
                                        className="object-contain p-1"
                                    />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-[#1a2744]">
                                        Instale nosso app
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        JWE Centro de Distribuição
                                    </p>
                                </div>
                            </div>

                            {/* Benefits */}
                            <div className="grid grid-cols-2 gap-3 mb-8">
                                {benefits.map(({ icon: Icon, text }, i) => (
                                    <motion.div
                                        key={text}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 * (i + 1) }}
                                        className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[#1a2744] to-[#2a3d63] flex items-center justify-center shrink-0">
                                            <Icon className="h-4 w-4 text-white" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-700 leading-tight">
                                            {text}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                <Button
                                    onClick={handleInstall}
                                    className="w-full h-12 text-base font-semibold rounded-xl gap-2 shadow-lg shadow-[#1a2744]/20"
                                    style={{
                                        background: 'linear-gradient(135deg, #1a2744, #2a3d63)',
                                        color: 'white',
                                        border: 'none',
                                    }}
                                >
                                    <Download className="h-5 w-5" />
                                    Instalar Aplicativo
                                </Button>
                                <Button
                                    onClick={handleDismiss}
                                    variant="ghost"
                                    className="w-full h-11 text-sm text-gray-500 hover:text-gray-700 rounded-xl"
                                >
                                    Agora não
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
