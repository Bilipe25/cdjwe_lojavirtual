'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, useScroll, useSpring, useTransform } from 'framer-motion'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void
    children: React.ReactNode
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [startY, setStartY] = useState(0)
    const [pullDistance, setPullDistance] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)
    
    const PULL_THRESHOLD = 80
    
    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) {
            setStartY(e.touches[0].pageY)
        }
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        if (startY === 0 || window.scrollY > 0) return
        
        const currentY = e.touches[0].pageY
        const diff = currentY - startY
        
        if (diff > 0) {
            // Resistance formula
            const easedDiff = Math.pow(diff, 0.85)
            setPullDistance(Math.min(easedDiff, PULL_THRESHOLD + 20))
            
            // Prevent scrolling when pulling
            if (diff > 10 && e.cancelable) {
                e.preventDefault()
            }
        }
    }

    const handleTouchEnd = async () => {
        if (pullDistance >= PULL_THRESHOLD) {
            setIsRefreshing(true)
            setPullDistance(PULL_THRESHOLD)
            try {
                await onRefresh()
            } finally {
                setTimeout(() => {
                    setIsRefreshing(false)
                    setPullDistance(0)
                }, 500)
            }
        } else {
            setPullDistance(0)
        }
        setStartY(0)
    }

    return (
        <div 
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative"
        >
            {/* Pull Indicator */}
            <div 
                className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-50 overflow-hidden"
                style={{ 
                    top: 0,
                    height: pullDistance,
                    opacity: pullDistance / PULL_THRESHOLD
                }}
            >
                <motion.div
                    animate={isRefreshing ? { rotate: 360 } : { rotate: (pullDistance / PULL_THRESHOLD) * 180 }}
                    transition={isRefreshing ? { duration: 1, repeat: Infinity, ease: "linear" } : { type: "spring", damping: 20 }}
                    className="p-2 bg-white rounded-full shadow-lg border border-border/40 text-primary"
                >
                    <RefreshCw className="h-5 w-5" />
                </motion.div>
            </div>

            <motion.div
                animate={{ y: pullDistance }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="relative z-10"
            >
                {children}
            </motion.div>
        </div>
    )
}
