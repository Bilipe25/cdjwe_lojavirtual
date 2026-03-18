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
import { NoticeCard } from '@/components/store/NoticeCard'
import { useSettings } from '@/components/providers/settings-provider'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'

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
        title: 'Catalogo de Produtos',
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
        title: 'Catalogo de Tecidos',
        icon: Scissors,
        href: '/fabrics',
        color: 'bg-primary/5 hover:bg-primary/10',
        iconColor: 'text-primary',
        enabled: true,
    },
    {
        title: 'Meu Perfil',
        icon: User,
        href: '/profile',
        color: 'bg-primary/5 hover:bg-primary/10',
        iconColor: 'text-primary',
        enabled: true,
    },
    {
        title: 'Sobre',
        icon: Info,
        href: '/about',
        color: 'bg-navy/5 hover:bg-navy/10',
        iconColor: 'text-navy',
        enabled: true,
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
    const { settings } = useSettings()
    const { isStandalone } = usePwaRuntime()
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

    const [greeting, setGreeting] = useState('Ola')

    useEffect(() => {
        const hour = new Date().getHours()
        if (hour < 12) setGreeting('Bom dia')
        else if (hour < 18) setGreeting('Boa tarde')
        else setGreeting('Boa noite')
    }, [])

    return (
        <div className={`mx-auto px-4 py-6 ${isStandalone ? 'max-w-6xl lg:px-6 lg:py-8' : 'max-w-lg'}`}>
            {/* Greeting */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-8 ${isStandalone ? 'lg:flex lg:items-start lg:justify-between lg:gap-6' : ''}`}
            >
                {loading ? (
                    <div className="space-y-2">
                        <div className="h-9 w-64 rounded-md bg-navy/10 animate-pulse" />
                        <div className="h-5 w-72 rounded-md bg-muted animate-pulse" />
                    </div>
                ) : (
                    <div className={`space-y-4 ${isStandalone ? 'lg:flex lg:flex-1 lg:items-start lg:justify-between lg:gap-6 lg:space-y-0' : ''}`}>
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-3xl font-bold font-heading tracking-tight text-gradient-navy">
                                    Bem-vindo(a), {userName || 'visitante'}
                                </h1>
                            </div>
                            <p className="mt-1 text-balance text-muted-foreground">
                                {greeting}. Escolha um atalho para continuar sua operacao.
                            </p>
                        </div>

                        {isStandalone && (
                            <div className="hidden min-w-[280px] rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:block">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Workspace
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl bg-navy/[0.04] px-3 py-3">
                                        <p className="text-2xl font-bold font-heading text-navy">{dashboardCards.length}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">atalhos ativos</p>
                                    </div>
                                    <div className="rounded-2xl bg-bronze/[0.08] px-3 py-3">
                                        <p className="text-sm font-semibold text-foreground">Fluxo rapido</p>
                                        <p className="mt-1 text-xs text-muted-foreground">catalogo, pedidos e perfil</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>

            {/* Quick Access Grid */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className={`grid gap-3 ${isStandalone ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}
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
                                role="button"
                                aria-disabled="true"
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

            {/* Catalog Notice - Mobile only visibility handled by caller preference or layout */}
            <NoticeCard 
                notice={settings?.catalog_notice} 
                type={settings?.catalog_notice_type}
                className="mt-8" 
            />
        </div>
    )
}

