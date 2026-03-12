'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SystemSettings } from '@/lib/types'

interface SettingsContextType {
    settings: SystemSettings | null
    loading: boolean
    refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchSettings = async () => {
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .limit(1)
                .single()
            
            if (data) {
                setSettings(data as SystemSettings)
            }
        } catch (err) {
            console.error('Error fetching system settings:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    return (
        <SettingsContext.Provider value={{ settings, loading, refresh: fetchSettings }}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings() {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}
