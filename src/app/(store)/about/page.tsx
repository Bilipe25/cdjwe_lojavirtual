'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, ArrowRight } from 'lucide-react'
import { loadSettingsAction } from '@/app/admin/settings/actions'
import type { SystemSettings } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

export default function AboutPage() {
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const result = await loadSettingsAction()
            if (result.data) {
                setSettings(result.data)
            }
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="container max-w-6xl mx-auto px-4 py-12 md:py-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-12 w-full max-w-md" />
                        <div className="space-y-3">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-[80%]" />
                        </div>
                    </div>
                    <Skeleton className="aspect-video md:aspect-4/3 rounded-3xl" />
                </div>
            </div>
        )
    }

    const title = settings?.about_title || 'Sobre Nós'
    const text = settings?.about_text || 'A CDJWE é dedicada a oferecer o melhor em tecidos e soluções têxteis, focando em qualidade, inovação e no sucesso dos nossos clientes.'
    const imageUrl = settings?.about_image_url

    return (
        <main className="min-h-[calc(100vh-80px)] bg-white overflow-hidden">
            <div className="container max-w-6xl mx-auto px-4 py-12 md:py-24">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                    {/* Content Column */}
                    <motion.div 
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="order-2 lg:order-1"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-bronze/10 text-bronze text-xs font-bold tracking-wider mb-6">
                            <Building2 className="h-3.5 w-3.5" />
                            INSTITUCIONAL
                        </div>
                        
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-navy mb-8 leading-tight font-heading">
                            {title}
                        </h1>

                        <div className="prose prose-slate max-w-none">
                            {text.split('\n').map((paragraph, idx) => (
                                paragraph.trim() && (
                                    <p key={idx} className="text-lg md:text-xl text-slate-600 leading-relaxed mb-6">
                                        {paragraph}
                                    </p>
                                )
                            ))}
                        </div>

                        {/* Additional Branding Elements */}
                        <div className="mt-12 pt-12 border-t border-slate-100 grid grid-cols-2 gap-8">
                            <div>
                                <div className="text-bronze font-bold text-3xl mb-1 italic">CDJWE</div>
                                <p className="text-sm text-slate-500 uppercase tracking-widest font-medium">Excelência Têxtil</p>
                            </div>
                            <div className="flex items-center justify-end">
                                <div className="text-right">
                                    <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">Atendimento</p>
                                    <p className="text-navy font-semibold">{settings?.phone || '(79) 99860-1651'}</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Image Column */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="order-1 lg:order-2 relative"
                    >
                        {/* Decorative background elements */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-bronze/5 rounded-full blur-3xl -z-10" />
                        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-navy/5 rounded-full blur-3xl -z-10" />

                        <div className="relative aspect-video lg:aspect-4/5 overflow-hidden rounded-[2.5rem] shadow-2xl border-8 border-white group">
                            {imageUrl ? (
                                <img 
                                    src={imageUrl} 
                                    alt={title}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full bg-slate-50 flex items-center justify-center p-12">
                                    <Building2 className="h-32 w-32 text-slate-200/50" />
                                </div>
                            )}
                            
                            {/* Overlay tag */}
                            <div className="absolute bottom-10 left-10 right-10 p-6 glass-card backdrop-blur-md rounded-2xl border-white/40 shadow-xl hidden md:block translate-y-20 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                                <p className="text-navy font-bold text-lg mb-1 italic">Qualidade que você sente.</p>
                                <p className="text-slate-600 text-sm">Desde a fibra até o acabamento.</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </main>
    )
}
