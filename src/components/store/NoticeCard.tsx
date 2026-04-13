'use client'

import React from 'react'
import { Info, Tag, AlertTriangle, Mail } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface NoticeCardProps {
    notice: string | null | undefined
    noticeHtml?: string | null
    type?: 'info' | 'promotion' | 'attention' | 'message' | null
    className?: string
}

const VARIANTS = {
    info: {
        bg: 'bg-blue-50/50 md:bg-bronze/5 dark:bg-blue-500/10 md:dark:bg-bronze/5',
        border: 'border-blue-100 md:border-bronze/10 dark:border-blue-500/20 md:dark:border-bronze/10',
        accent: 'bg-blue-400 md:bg-bronze/40 dark:bg-blue-500 md:dark:bg-bronze/50',
        iconBg: 'bg-blue-100 md:bg-bronze/10 dark:bg-blue-500/20 md:dark:bg-bronze/20',
        iconColor: 'text-blue-600 md:text-bronze dark:text-blue-400 md:dark:text-bronze/90',
        icon: Info,
    },
    promotion: {
        bg: 'bg-emerald-50/80 dark:bg-emerald-500/10',
        border: 'border-emerald-100 dark:border-emerald-500/20',
        accent: 'bg-emerald-400 dark:bg-emerald-500/70',
        iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        icon: Tag,
    },
    attention: {
        bg: 'bg-amber-50/80 dark:bg-amber-500/10',
        border: 'border-amber-100 dark:border-amber-500/20',
        accent: 'bg-amber-400 dark:bg-amber-500/70',
        iconBg: 'bg-amber-100 dark:bg-amber-500/20',
        iconColor: 'text-amber-600 dark:text-amber-400',
        icon: AlertTriangle,
    },
    message: {
        bg: 'bg-slate-50/80 dark:bg-slate-500/10',
        border: 'border-slate-200 dark:border-slate-500/20',
        accent: 'bg-slate-400 dark:bg-slate-500/70',
        iconBg: 'bg-slate-100 dark:bg-slate-500/20',
        iconColor: 'text-slate-600 dark:text-slate-400',
        icon: Mail,
    },
}

const RICH_NOTICE_CONTENT_CLASSNAME = cn(
    'text-sm leading-relaxed text-navy/85 dark:text-foreground/90',
    '[&_p]:m-0 [&_p+*]:mt-3',
    '[&_h3]:m-0 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-navy dark:[&_h3]:text-foreground',
    '[&_h3+*]:mt-3',
    '[&_h4]:m-0 [&_h4]:font-heading [&_h4]:text-[0.95rem] [&_h4]:font-semibold [&_h4]:tracking-tight [&_h4]:text-navy dark:[&_h4]:text-foreground',
    '[&_h4+*]:mt-2.5',
    '[&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc',
    '[&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal',
    '[&_li]:pl-1 [&_li+li]:mt-1.5',
    '[&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary/80',
    '[&_strong]:font-semibold dark:[&_strong]:text-foreground',
    '[&_em]:italic',
    '[&_u]:underline',
)

export function NoticeCard({ notice, noticeHtml, type = 'info', className }: NoticeCardProps) {
    const hasRichNotice = Boolean(noticeHtml && noticeHtml.trim() !== '')
    const hasLegacyNotice = Boolean(notice && notice.trim() !== '')

    if (!hasRichNotice && !hasLegacyNotice) return null

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
                    <div className="min-w-0 flex-1">
                        {hasRichNotice ? (
                            <div
                                className={RICH_NOTICE_CONTENT_CLASSNAME}
                                dangerouslySetInnerHTML={{ __html: noticeHtml ?? '' }}
                            />
                        ) : (
                            <p className="whitespace-pre-line text-sm leading-relaxed font-medium text-navy/80 dark:text-foreground/80">
                                {notice}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
