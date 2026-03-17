import { MailWarning, UserCheck, UserMinus, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface CustomerOverviewStats {
    total: number
    registered: number
    unregistered: number
    withoutEmail: number
}

export type OverviewFilterKey = 'total' | 'registered' | 'unregistered' | 'withoutEmail'

interface CustomerOverviewCardsProps {
    stats: CustomerOverviewStats
    loading?: boolean
    activeKey?: OverviewFilterKey
    onCardClick?: (key: OverviewFilterKey) => void
}

const cards = [
    {
        key: 'total' as const,
        title: 'Total de clientes',
        icon: Users,
        tone: 'text-navy',
        iconBg: 'bg-navy/10',
    },
    {
        key: 'registered' as const,
        title: 'Clientes cadastrados',
        icon: UserCheck,
        tone: 'text-emerald-700',
        iconBg: 'bg-emerald-100',
    },
    {
        key: 'unregistered' as const,
        title: 'Clientes nao cadastrados',
        icon: UserMinus,
        tone: 'text-amber-700',
        iconBg: 'bg-amber-100',
    },
    {
        key: 'withoutEmail' as const,
        title: 'Clientes sem email',
        icon: MailWarning,
        tone: 'text-orange-700',
        iconBg: 'bg-orange-100',
    },
]

export function CustomerOverviewCards({ stats, loading = false, activeKey = 'total', onCardClick }: CustomerOverviewCardsProps) {
    return (
        <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Visao rapida (clique em um card para filtrar)</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {cards.map((card) => {
                    const Icon = card.icon
                    const value = stats[card.key]
                    const isActive = activeKey === card.key
                    return (
                        <button
                            key={card.key}
                            type="button"
                            onClick={() => onCardClick?.(card.key)}
                            className="w-full text-left"
                        >
                            <Card className={`border transition-all ${isActive ? 'border-navy/50 ring-1 ring-navy/40 bg-navy/[0.04]' : 'border-slate-200/80 bg-white/80 hover:border-slate-300'} shadow-sm`}>
                                <CardContent className="px-3 py-2.5 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[11px] leading-none text-muted-foreground">{card.title}</p>
                                        <p className={`text-lg sm:text-xl font-semibold tracking-tight mt-1 ${card.tone}`}>
                                            {loading ? '--' : value.toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${card.iconBg}`}>
                                        <Icon className={`h-4 w-4 ${card.tone}`} />
                                    </div>
                                </CardContent>
                            </Card>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
