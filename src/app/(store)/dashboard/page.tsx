'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
    Package,
    ClipboardList,
    Heart,
    Scissors,
    User,
    Info,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DashboardCard {
    title: string
    icon: React.ElementType
    href: string
    color: string
    iconColor: string
    enabled: boolean
    badge?: string
}

const dashboardCards: DashboardCard[] = [
    {
        title: 'Catálogo de Produtos',
        icon: Package,
        href: '/catalog',
        color: 'bg-navy/5 hover:bg-navy/10',
        iconColor: 'text-navy',
        enabled: true,
    },
    {
        title: 'Meus Pedidos',
        icon: ClipboardList,
        href: '/orders',
        color: 'bg-bronze/10 hover:bg-bronze/20',
        iconColor: 'text-bronze',
        enabled: true,
    },
    {
        title: 'Favoritos',
        icon: Heart,
        href: '/favorites',
        color: 'bg-primary/5 hover:bg-primary/10',
        iconColor: 'text-primary',
        enabled: true,
    },
    {
        title: 'Catálogo de Tecidos',
        icon: Scissors,
        href: '#',
        color: 'bg-slate-50',
        iconColor: 'text-slate-300',
        enabled: false,
        badge: 'Em breve',
    },
    {
        title: 'Meu Perfil',
        icon: User,
        href: '/profile',
        color: 'bg-emerald-50 hover:bg-emerald-100/80',
        iconColor: 'text-emerald-600',
        enabled: true,
    },
    {
        title: 'Sobre',
        icon: Info,
        href: '#',
        color: 'bg-slate-50',
        iconColor: 'text-slate-300',
        enabled: false,
        badge: 'Em breve',
    },
]

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.06,
        },
    },
}

const item = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

export default function DashboardPage() {
    const [userName, setUserName] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadUser = async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name')
                        .eq('id', user.id)
                        .single()
                    if (profile?.full_name) {
                        setUserName(profile.full_name.split(' ')[0])
                    }
                }
            } catch { /* silent */ } finally {
                setLoading(false)
            }
        }
        loadUser()
    }, [])

    const getGreeting = () => {
        const hour = new Date().getHours()
        if (hour < 12) return 'Bom dia'
        if (hour < 18) return 'Boa tarde'
        return 'Boa noite'
    }

    return (
        <div className="px-4 py-6 max-w-lg mx-auto">
            {/* Greeting */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                {loading ? (
                    <div className="space-y-2">
                        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
                        <div className="h-4 w-32 bg-muted/60 animate-pulse rounded-md" />
                    </div>
                ) : (
                    <>
                        <h1 className="text-2xl font-bold font-heading text-gradient-navy">
                            {getGreeting()}{userName ? `, ${userName}` : ''}! 👋
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            O que deseja fazer hoje?
                        </p>
                    </>
                )}
            </motion.div>

            {/* Quick Access Grid */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            >
                {dashboardCards.map((card) => (
                    <motion.div key={card.title} variants={item}>
                        {card.enabled ? (
                            <Link href={card.href}>
                                <motion.div
                                    whileTap={{ scale: 0.95 }}
                                    className={`relative flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border border-border/40 transition-all duration-200 ${card.color} min-h-[110px] shadow-sm`}
                                >
                                    <card.icon className={`h-8 w-8 ${card.iconColor}`} />
                                    <span className="text-xs font-semibold text-foreground text-center leading-tight">
                                        {card.title}
                                    </span>
                                </motion.div>
                            </Link>
                        ) : (
                            <div
                                className={`relative flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border border-border/30 ${card.color} min-h-[110px] opacity-60 cursor-not-allowed`}
                            >
                                <card.icon className={`h-8 w-8 ${card.iconColor}`} />
                                <span className="text-xs font-semibold text-muted-foreground text-center leading-tight">
                                    {card.title}
                                </span>
                                {card.badge && (
                                    <span className="absolute top-2 right-2 text-[9px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                        {card.badge}
                                    </span>
                                )}
                            </div>
                        )}
                    </motion.div>
                ))}
            </motion.div>
        </div>
    )
}
