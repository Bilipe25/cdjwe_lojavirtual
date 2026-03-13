'use client'

import React from 'react'
import { Info, Tag, AlertTriangle, Mail } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface NoticeCardProps {
    notice: string | null | undefined
    type?: 'info' | 'promotion' | 'attention' | 'message' | null
    className?: string
}

const VARIANTS = {
    info: {
        bg: 'bg-blue-50/50 md:bg-bronze/5',
        border: 'border-blue-100 md:border-bronze/10',
        accent: 'bg-blue-400 md:bg-bronze/40',
        iconBg: 'bg-blue-100 md:bg-bronze/10',
        iconColor: 'text-blue-600 md:text-bronze',
        icon: Info,
    },
    promotion: {
        bg: 'bg-emerald-50/80',
        border: 'border-emerald-100',
        accent: 'bg-emerald-400',
        iconBg: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        icon: Tag,
    },
    attention: {
        bg: 'bg-amber-50/80',
        border: 'border-amber-100',
        accent: 'bg-amber-400',
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        icon: AlertTriangle,
    },
    message: {
        bg: 'bg-slate-50/80',
        border: 'border-slate-200',
        accent: 'bg-slate-400',
        iconBg: 'bg-slate-100',
        iconColor: 'text-slate-600',
        icon: Mail,
    },
}

export function NoticeCard({ notice, type = 'info', className }: NoticeCardProps) {
    if (!notice || notice.trim() === '') return null

    const variant = VARIANTS[type as keyof typeof VARIANTS] || VARIANTS.info
    const IconComp = variant.icon

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={className}
        >
            <Card className={cn(
                "border shadow-sm overflow-hidden relative group transition-all",
                variant.bg,
                variant.border
            )}>
                {/* Subtle Decorative Element */}
                <div className={cn("absolute top-0 left-0 w-1 h-full", variant.accent)} />
                
                <CardContent className="p-4 flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                        <div className={cn("p-1.5 rounded-lg", variant.iconBg)}>
                            <IconComp className={cn("h-4 w-4", variant.iconColor)} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-navy/80 leading-relaxed font-medium">
                            {notice}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
