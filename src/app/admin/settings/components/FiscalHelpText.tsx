'use client'

import { Info } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface FiscalHelpTextProps {
    text: string
    className?: string
}

export function FiscalHelpText({ text, className }: FiscalHelpTextProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger render={
                    <button
                        type="button"
                        className={`inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors ${className || ''}`}
                    >
                        <Info className="h-3.5 w-3.5" />
                    </button>
                } />
                <TooltipContent
                    side="top"
                    className="max-w-xs text-xs leading-relaxed"
                >
                    {text}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
