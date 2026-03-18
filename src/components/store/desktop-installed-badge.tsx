'use client'

import { Monitor, CheckCircle2 } from 'lucide-react'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'
import { cn } from '@/lib/utils'

interface DesktopInstalledBadgeProps {
    label?: string
    detail?: string
    className?: string
}

export function DesktopInstalledBadge({
    label = 'App instalado',
    detail = 'Modo desktop ativo',
    className,
}: DesktopInstalledBadgeProps) {
    const { isStandalone } = usePwaRuntime()

    if (!isStandalone) return null

    return (
        <div
            className={cn(
                'hidden md:inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-primary shadow-sm backdrop-blur-sm',
                className
            )}
        >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
                <Monitor className="h-3.5 w-3.5" />
            </span>
            <span className="leading-none">{label}</span>
            <span className="hidden items-center gap-1 text-[10px] font-medium text-muted-foreground xl:inline-flex">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {detail}
            </span>
        </div>
    )
}
