'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ThemeToggleProps {
    /** Size variant */
    size?: 'sm' | 'md'
    /** Additional class names */
    className?: string
}

export function ThemeToggle({ size = 'md', className = '' }: ThemeToggleProps) {
    const { theme, setTheme, resolvedTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    if (!mounted) {
        // Render a placeholder with same dimensions to prevent layout shift
        const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
        return <div className={`${dim} rounded-full ${className}`} />
    }

    const isDark = resolvedTheme === 'dark'
    const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
    const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

    return (
        <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`
                ${dim} relative flex items-center justify-center rounded-full
                border border-border/50
                bg-card/80 backdrop-blur-sm
                text-muted-foreground
                hover:text-foreground hover:bg-accent/60
                transition-colors duration-200
                cursor-pointer
                ${className}
            `}
            aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
            <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                    <motion.div
                        key="sun"
                        initial={{ rotate: -90, scale: 0, opacity: 0 }}
                        animate={{ rotate: 0, scale: 1, opacity: 1 }}
                        exit={{ rotate: 90, scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                    >
                        <Sun className={`${iconSize} text-amber-400`} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="moon"
                        initial={{ rotate: 90, scale: 0, opacity: 0 }}
                        animate={{ rotate: 0, scale: 1, opacity: 1 }}
                        exit={{ rotate: -90, scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                    >
                        <Moon className={`${iconSize} text-primary/70`} />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    )
}
