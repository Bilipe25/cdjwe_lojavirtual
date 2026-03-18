'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

interface PwaRuntimeContextValue {
    isStandalone: boolean
    isServiceWorkerReady: boolean
}

const PwaRuntimeContext = createContext<PwaRuntimeContextValue>({
    isStandalone: false,
    isServiceWorkerReady: false,
})

function detectStandaloneMode() {
    if (typeof window === 'undefined') return false

    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    )
}

export function PwaRuntimeProvider({ children }: { children: React.ReactNode }) {
    const [isStandalone, setIsStandalone] = useState(false)
    const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return

        const html = document.documentElement
        const body = document.body
        const mediaQuery = window.matchMedia('(display-mode: standalone)')

        const applyDisplayMode = () => {
            const standalone = detectStandaloneMode()
            setIsStandalone(standalone)
            html.dataset.displayMode = standalone ? 'standalone' : 'browser'
            html.classList.toggle('pwa-standalone', standalone)
            body.classList.toggle('pwa-standalone', standalone)
        }

        const registerServiceWorker = async () => {
            if (!('serviceWorker' in navigator)) return

            try {
                await navigator.serviceWorker.register('/sw.js', { scope: '/' })
                await navigator.serviceWorker.ready
                setIsServiceWorkerReady(true)
            } catch (error) {
                console.warn('PWA service worker registration failed:', error)
            }
        }

        applyDisplayMode()
        void registerServiceWorker()

        const handleInstalled = () => applyDisplayMode()
        const handleModeChange = () => applyDisplayMode()

        window.addEventListener('appinstalled', handleInstalled)
        mediaQuery.addEventListener('change', handleModeChange)

        return () => {
            window.removeEventListener('appinstalled', handleInstalled)
            mediaQuery.removeEventListener('change', handleModeChange)
        }
    }, [])

    const value = useMemo(
        () => ({
            isStandalone,
            isServiceWorkerReady,
        }),
        [isServiceWorkerReady, isStandalone]
    )

    return <PwaRuntimeContext.Provider value={value}>{children}</PwaRuntimeContext.Provider>
}

export function usePwaRuntime() {
    return useContext(PwaRuntimeContext)
}
