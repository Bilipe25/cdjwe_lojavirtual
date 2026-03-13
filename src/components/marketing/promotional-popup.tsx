'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Gift } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface PopupData {
    id: string
    title: string
    description: string | null
    image_url: string | null
    button_text: string | null
    button_link: string | null
}

export function PromotionalPopup() {
    const [popup, setPopup] = useState<PopupData | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        fetchActivePopup()
    }, [])

    const fetchActivePopup = async () => {
        try {
            const supabase = createClient()
            const now = new Date().toISOString()

            const { data, error } = await supabase
                .from('promotional_popups')
                .select('id, title, description, image_url, button_text, button_link')
                .eq('is_active', true)
                .or(`display_from.is.null,display_from.lte.${now}`)
                .or(`display_until.is.null,display_until.gte.${now}`)
                .limit(1)
                .single()

            if (error || !data) return

            // Check if user already dismissed this popup
            const dismissedStr = localStorage.getItem('dismissed_popup')
            if (dismissedStr === data.id) return

            setPopup(data)
            // Small delay before showing for a smoother experience
            setTimeout(() => setVisible(true), 1500)
        } catch {
            // Table may not exist yet — silent
        }
    }

    const handleDismiss = () => {
        setVisible(false)
        if (popup) {
            localStorage.setItem('dismissed_popup', popup.id)
        }
    }

    if (!popup) return null

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={handleDismiss}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            onClick={handleDismiss}
                            className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-colors"
                            aria-label="Fechar"
                        >
                            <X className="h-4 w-4 text-white" />
                        </button>

                        {/* Image */}
                        {popup.image_url ? (
                            <div className="relative w-full aspect-video">
                                <Image
                                    src={popup.image_url}
                                    alt={popup.title}
                                    fill
                                    className="object-cover"
                                />
                                {/* Gradient overlay */}
                                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                            </div>
                        ) : (
                            <div className="h-32 gradient-bronze flex items-center justify-center">
                                <Gift className="h-12 w-12 text-white/80" />
                            </div>
                        )}

                        {/* Content */}
                        <div className="p-6 text-center">
                            <h2 className="text-xl font-bold font-heading mb-2">{popup.title}</h2>
                            {popup.description && (
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    {popup.description}
                                </p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2 justify-center">
                                {popup.button_text && popup.button_link ? (
                                    <Link href={popup.button_link} onClick={handleDismiss}>
                                        <Button className="gradient-bronze text-white w-full sm:w-auto px-8">
                                            {popup.button_text}
                                        </Button>
                                    </Link>
                                ) : null}
                                <Button variant="ghost" onClick={handleDismiss} className="text-muted-foreground">
                                    Fechar
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
