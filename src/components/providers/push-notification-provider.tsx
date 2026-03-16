'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PushOptInModal } from '@/components/marketing/push-opt-in-modal'

export function PushNotificationProvider() {
    const [registered, setRegistered] = useState(false)
    const [subscriptionStatus, setSubscriptionStatus] = useState<'pending' | 'granted' | 'denied' | 'default'>('pending')
    const [showOptIn, setShowOptIn] = useState(false)

    const syncSubscription = useCallback(async () => {
        try {
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            if (!vapidKey) return

            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return // Don't sync push without a logged-in user

            const registration = await navigator.serviceWorker.ready
            let subscription = await registration.pushManager.getSubscription()

            // If permitted but not subscribed, subscribe now
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey) as any,
                })
            }

            // Save to backend
            const subJson = subscription.toJSON()
            await fetch('/api/marketing/push', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: {
                        endpoint: subJson.endpoint,
                        keys: subJson.keys,
                    },
                    user_agent: navigator.userAgent,
                }),
            })

            setRegistered(true)
        } catch (err) {
            console.warn('Failed to sync push subscription:', err)
        }
    }, [])

    const checkAndRegisterExisting = useCallback(async () => {
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
            
            // Allow notification permission to be read
            const permission = window.Notification.permission
            setSubscriptionStatus(permission as any)

            // Register service worker regardless of permission 
            // (it does no harm and handles future subscriptions)
            await navigator.serviceWorker.register('/sw.js')

            // If already granted, ensure subscription is synced to backend
            if (permission === 'granted') {
                await syncSubscription()
            } else if (permission === 'default' && localStorage.getItem('push_opt_in_dismissed') !== 'true') {
                // If not asked yet and not dismissed, show modal after a small delay
                const timer = setTimeout(() => setShowOptIn(true), 3000)
                return () => clearTimeout(timer)
            }
        } catch (err) {
            console.warn('Service worker registration failed:', err)
        }
    }, [syncSubscription])

    useEffect(() => {
        // Initial setup and check
        checkAndRegisterExisting()
    }, [checkAndRegisterExisting])

    const handleRequestPermission = async () => {
        setShowOptIn(false)
        try {
            const permission = await Notification.requestPermission()
            setSubscriptionStatus(permission as any)
            if (permission === 'granted') {
                await syncSubscription()
            }
        } catch { /* silent */ }
    }

    return (
        <>
            {showOptIn && <PushOptInModal onRequestPermission={handleRequestPermission} />}
        </>
    )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}
