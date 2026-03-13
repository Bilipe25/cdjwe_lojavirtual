'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PushNotificationProvider() {
    const [registered, setRegistered] = useState(false)

    useEffect(() => {
        registerPushSubscription()
    }, [])

    const registerPushSubscription = async () => {
        try {
            // Check prerequisites
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            if (!vapidKey) return

            // Get current user
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Register service worker
            const registration = await navigator.serviceWorker.register('/sw.js')
            await navigator.serviceWorker.ready

            // Check existing subscription
            let subscription = await registration.pushManager.getSubscription()

            if (!subscription) {
                // Request permission
                const permission = await Notification.requestPermission()
                if (permission !== 'granted') return

                // Subscribe
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey),
                })
            }

            // Save subscription to backend
            const subJson = subscription.toJSON()
            await fetch('/api/marketing/push', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: {
                        endpoint: subJson.endpoint,
                        keys: subJson.keys,
                    },
                    profile_id: user.id,
                    user_agent: navigator.userAgent,
                }),
            })

            setRegistered(true)
        } catch {
            // Silent — push is optional
        }
    }

    return null
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
