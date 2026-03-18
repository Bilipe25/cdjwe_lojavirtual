'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone, Zap, Bell, Share, PlusSquare, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const DISMISS_KEY = 'pwa-install-dismissed-at'

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallSurface = 'mobile' | 'desktop' | 'ios'

function isIosInstallCandidate() {
    if (typeof window === 'undefined') return false

    const userAgent = window.navigator.userAgent.toLowerCase()
    const isiOS = /iphone|ipad|ipod/.test(userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    return isiOS && !isStandalone
}

function detectPromptSurface(): InstallSurface {
    if (typeof window === 'undefined') return 'mobile'

    if (isIosInstallCandidate()) return 'ios'

    const prefersDesktopLayout = window.matchMedia('(min-width: 1024px)').matches
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches

    return prefersDesktopLayout && hasFinePointer ? 'desktop' : 'mobile'
}

export function PWAInstallPrompt() {
    const { isStandalone } = usePwaRuntime()
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [appInstalled, setAppInstalled] = useState(false)
    const [installSurface, setInstallSurface] = useState<InstallSurface>('mobile')
    const isInstalled = isStandalone || appInstalled
    const showIosGuide = installSurface === 'ios'
    const isDesktopPrompt = installSurface === 'desktop'

    useEffect(() => {
        if (typeof window === 'undefined') return

        const dismissedAt = localStorage.getItem(DISMISS_KEY)
        if (dismissedAt) {
            const elapsed = Date.now() - parseInt(dismissedAt, 10)
            if (elapsed < DISMISS_COOLDOWN_MS) return
        }

        const beforeInstallHandler = (event: Event) => {
            event.preventDefault()
            setInstallSurface(detectPromptSurface())
            setDeferredPrompt(event as BeforeInstallPromptEvent)
            window.setTimeout(() => setShowModal(true), 1800)
        }

        const installedHandler = () => {
            setAppInstalled(true)
            setShowModal(false)
            setInstallSurface('mobile')
            setDeferredPrompt(null)
        }

        window.addEventListener('beforeinstallprompt', beforeInstallHandler)
        window.addEventListener('appinstalled', installedHandler)

        if (isIosInstallCandidate()) {
            const timer = window.setTimeout(() => {
                setInstallSurface('ios')
                setShowModal(true)
            }, 2200)

            return () => {
                window.clearTimeout(timer)
                window.removeEventListener('beforeinstallprompt', beforeInstallHandler)
                window.removeEventListener('appinstalled', installedHandler)
            }
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', beforeInstallHandler)
            window.removeEventListener('appinstalled', installedHandler)
        }
    }, [isStandalone])

    const handleInstall = useCallback(async () => {
        if (!deferredPrompt) return

        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        if (outcome === 'accepted') {
            setAppInstalled(true)
        }

        setShowModal(false)
        setDeferredPrompt(null)
    }, [deferredPrompt])

    const handleDismiss = useCallback(() => {
        setShowModal(false)
        setInstallSurface('mobile')
        localStorage.setItem(DISMISS_KEY, Date.now().toString())
    }, [])

    const benefits = useMemo(
        () =>
            isDesktopPrompt
                ? [
                      { icon: Monitor, text: 'Janela propria para o portal' },
                      { icon: Zap, text: 'Abertura mais rapida no escritorio' },
                      { icon: Bell, text: 'Notificacoes sem depender da aba do navegador' },
                      { icon: Download, text: 'Acesso fixo pelo computador' },
                  ]
                : [
                      { icon: Zap, text: 'Abertura mais rapida' },
                      { icon: Bell, text: 'Notificacoes de pedidos' },
                      { icon: Smartphone, text: 'Tela cheia, sem navegador' },
                      { icon: Download, text: 'Acesso direto na tela inicial' },
                  ],
        [isDesktopPrompt]
    )

    if (isInstalled || !showModal) return null

    return (
        <AnimatePresence>
            {showModal && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-9998 bg-black/40 backdrop-blur-sm"
                        onClick={handleDismiss}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 100, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 100, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="
                            fixed z-9999 bottom-0 left-0 right-0
                            w-full
                            sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
                            sm:max-w-md
                            lg:max-w-xl
                            overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-navy/20
                            sm:rounded-2xl
                        "
                    >
                        <div className="flex justify-center pt-3 sm:hidden">
                            <div className="h-1 w-10 rounded-full bg-gray-300" />
                        </div>

                        <button
                            onClick={handleDismiss}
                            className="absolute right-4 top-4 rounded-full p-1.5 transition-colors hover:bg-gray-100"
                            aria-label="Fechar"
                        >
                            <X className="h-5 w-5 text-gray-400" />
                        </button>

                        <div className="px-6 pb-8 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
                            <div className="mb-6 flex items-center gap-4">
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-gray-100 shadow-lg">
                                    <Image src="/icons/icon-192.png" alt="JWE B2B" fill className="object-contain p-1" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-[#1a2744]">
                                        {showIosGuide ? 'Adicionar a tela inicial' : isDesktopPrompt ? 'Instale no computador' : 'Instale nosso app'}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-gray-500">
                                        {isDesktopPrompt ? 'Versao desktop do portal B2B' : 'JWE Centro de Distribuicao'}
                                    </p>
                                </div>
                            </div>

                            {showIosGuide ? (
                                <div className="space-y-5">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-sm font-medium text-slate-800">
                                            No iPhone ou iPad, a instalacao e feita pelo menu do navegador:
                                        </p>
                                        <div className="mt-4 space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-navy shadow-sm">
                                                    1
                                                </div>
                                                <div className="text-sm text-slate-700">
                                                    Toque em <strong>Compartilhar</strong> <Share className="ml-1 inline h-4 w-4 align-text-bottom text-navy" />
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-navy shadow-sm">
                                                    2
                                                </div>
                                                <div className="text-sm text-slate-700">
                                                    Escolha <strong>Adicionar a Tela de Inicio</strong> <PlusSquare className="ml-1 inline h-4 w-4 align-text-bottom text-navy" />
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-navy shadow-sm">
                                                    3
                                                </div>
                                                <div className="text-sm text-slate-700">
                                                    Confirme para abrir o portal em modo app, com acesso direto na tela inicial
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                                        Dica: depois de instalado, o portal abre em tela cheia e fica mais pratico para o uso diario da equipe.
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className={`mb-8 grid gap-3 ${isDesktopPrompt ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
                                        {benefits.map(({ icon: Icon, text }, index) => (
                                            <motion.div
                                                key={text}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.1 * (index + 1) }}
                                                className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3"
                                            >
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-[#1a2744] to-[#2a3d63]">
                                                    <Icon className="h-4 w-4 text-white" />
                                                </div>
                                                <span className="text-xs font-medium leading-tight text-gray-700">{text}</span>
                                            </motion.div>
                                        ))}
                                    </div>

                                    <div className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                                        {isDesktopPrompt
                                            ? 'No desktop, o portal instalado abre em janela propria e reduz a dependencia do navegador no uso diario da equipe.'
                                            : 'O aplicativo instalado melhora o acesso diario, as notificacoes e a navegacao em tela cheia.'}
                                    </div>
                                </>
                            )}

                            <div className="mt-6 space-y-3">
                                {!showIosGuide && (
                                    <Button
                                        onClick={handleInstall}
                                        className="w-full h-12 gap-2 rounded-xl text-base font-semibold shadow-lg shadow-[#1a2744]/20"
                                        style={{
                                            background: 'linear-gradient(135deg, #1a2744, #2a3d63)',
                                            color: 'white',
                                            border: 'none',
                                        }}
                                    >
                                        <Download className="h-5 w-5" />
                                        {isDesktopPrompt ? 'Instalar no computador' : 'Instalar aplicativo'}
                                    </Button>
                                )}
                                <Button
                                    onClick={handleDismiss}
                                    variant="ghost"
                                    className="h-11 w-full rounded-xl text-sm text-gray-500 hover:text-gray-700"
                                >
                                    Agora nao
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
