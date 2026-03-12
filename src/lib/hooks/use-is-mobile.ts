'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true if the screen is smaller than the `md` breakpoint (768px).
 * Useful for conditionally rendering Bottom Sheet vs Modal.
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)

        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    return isMobile
}
