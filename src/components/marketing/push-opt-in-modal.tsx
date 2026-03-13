'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellRing, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PushOptInModalProps {
    onRequestPermission: () => Promise<void>
}

export function PushOptInModal({ onRequestPermission }: PushOptInModalProps) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const checkPermissionAndShow = async () => {
            // Check if user has already been asked via this modal
            const hasDismissed = localStorage.getItem('push_opt_in_dismissed') === 'true'
            
            // Allow time for the main UI to settle
            setTimeout(async () => {
                if ('Notification' in window) {
                    const permission = window.Notification.permission
                    // Only show if we haven't asked and they haven't blocked it directly
                    if (permission === 'default' && !hasDismissed) {
                        setVisible(true)
                    }
                }
            }, 3000)
        }

        checkPermissionAndShow()
    }, [])

    const handleDismiss = () => {
        localStorage.setItem('push_opt_in_dismissed', 'true')
        setVisible(false)
    }

    const handleAllow = async () => {
        setVisible(false)
        localStorage.setItem('push_opt_in_dismissed', 'true')
        await onRequestPermission()
    }

    if (!visible) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed bottom-4 right-4 z-[90] w-[calc(100%-2rem)] sm:w-80 bg-white rounded-2xl shadow-2xl border overflow-hidden"
            >
                {/* Close Button */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 z-10 h-6 w-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-500 hover:text-slate-700"
                    aria-label="Agorar Não"
                >
                    <X className="h-3.5 w-3.5" />
                </button>

                {/* Banner Gradient */}
                <div className="h-16 gradient-blue relative flex items-center justify-center">
                    <div className="absolute -bottom-8 h-16 w-16 bg-white rounded-2xl shadow-sm flex items-center justify-center border-4 border-white">
                        <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                            <BellRing className="h-6 w-6 text-blue-600 animate-pulse" />
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="pt-10 p-5 text-center">
                    <h3 className="text-base font-bold font-heading mb-1 text-slate-900">
                        Ativar Notificações
                    </h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">
                        Fique por dentro do andamento dos seus pedidos e receba ofertas exclusivas em primeira mão!
                    </p>

                    <div className="flex flex-col gap-2">
                        <Button 
                            onClick={handleAllow} 
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium w-full"
                        >
                            <Bell className="h-4 w-4 mr-2" />
                            Quero receber
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={handleDismiss} 
                            className="text-muted-foreground hover:text-slate-900 text-sm h-9"
                        >
                            Agora não
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
