'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    History,
    Mail,
    Bell,
    Send,
    Image as ImageIcon,
    CheckCircle2,
    XCircle,
    RotateCcw,
    type LucideIcon,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

type ChannelFilter = 'all' | 'email' | 'notification' | 'push' | 'popup'
type StatusFilter = 'all' | 'sent' | 'delivered' | 'failed' | 'opened'
type PeriodFilter = '7d' | '30d' | '90d' | 'all'

interface SendEntry {
    id: string
    channel: string
    status: string
    recipient_email: string | null
    error_message: string | null
    sent_at: string
    campaigns?: { title: string } | null
}

type HistoryStats = {
    totalAttempts: number
    totalFailed: number
    byChannel: Record<string, number>
}

const channelConfig: Record<string, { icon: LucideIcon; label: string; color: string }> = {
    email: { icon: Mail, label: 'E-mail', color: 'text-blue-600 bg-blue-50' },
    notification: { icon: Bell, label: 'Notificação', color: 'text-purple-600 bg-purple-50' },
    push: { icon: Send, label: 'Push', color: 'text-emerald-600 bg-emerald-50' },
    popup: { icon: ImageIcon, label: 'Popup', color: 'text-amber-600 bg-amber-50' },
}

const statusConfig: Record<string, { label: string; color: string; icon: LucideIcon }> = {
    sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
    delivered: { label: 'Entregue', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    failed: { label: 'Falhou', color: 'bg-red-100 text-red-700', icon: XCircle },
    opened: { label: 'Aberto', color: 'bg-amber-100 text-amber-700', icon: CheckCircle2 },
}

export default function HistoryPage() {
    const [entries, setEntries] = useState<SendEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [totalEntries, setTotalEntries] = useState(0)
    const [stats, setStats] = useState<HistoryStats>({
        totalAttempts: 0,
        totalFailed: 0,
        byChannel: { email: 0, notification: 0, push: 0, popup: 0 },
    })

    const pageSize = 30

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                channel: channelFilter,
                status: statusFilter,
                period: periodFilter,
                page: String(page),
                pageSize: String(pageSize),
            })

            const response = await fetch(`/api/marketing/history?${params.toString()}`)
            const payload = await response.json()

            if (!response.ok) {
                throw new Error(payload.error || 'Falha ao carregar histórico.')
            }

            setEntries(payload.entries || [])
            setHasMore(Boolean(payload.pagination?.hasMore))
            setTotalEntries(payload.pagination?.total || 0)
            setStats(
                payload.stats || {
                    totalAttempts: 0,
                    totalFailed: 0,
                    byChannel: { email: 0, notification: 0, push: 0, popup: 0 },
                },
            )
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Erro ao carregar histórico.'
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }, [channelFilter, statusFilter, periodFilter, page])

    useEffect(() => {
        void fetchHistory()
    }, [fetchHistory])

    const applyChannelFilter = (next: ChannelFilter) => {
        setPage(1)
        setChannelFilter(next)
    }

    const applyStatusFilter = (next: StatusFilter) => {
        setPage(1)
        setStatusFilter(next)
    }

    const applyPeriodFilter = (next: PeriodFilter) => {
        setPage(1)
        setPeriodFilter(next)
    }

    const totalFailed = stats.totalFailed
    const byChannel = Object.entries(stats.byChannel)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                    <History className="h-6 w-6" />
                    Histórico de Envios
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Veja o histórico de todos os envios realizados.</p>
            </div>

            <div className="bg-card rounded-xl border p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={periodFilter === '7d' ? 'default' : 'outline'} onClick={() => applyPeriodFilter('7d')}>7 dias</Button>
                    <Button size="sm" variant={periodFilter === '30d' ? 'default' : 'outline'} onClick={() => applyPeriodFilter('30d')}>30 dias</Button>
                    <Button size="sm" variant={periodFilter === '90d' ? 'default' : 'outline'} onClick={() => applyPeriodFilter('90d')}>90 dias</Button>
                    <Button size="sm" variant={periodFilter === 'all' ? 'default' : 'outline'} onClick={() => applyPeriodFilter('all')}>Tudo</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={channelFilter === 'all' ? 'default' : 'outline'} onClick={() => applyChannelFilter('all')}>Canal: Todos</Button>
                    <Button size="sm" variant={channelFilter === 'email' ? 'default' : 'outline'} onClick={() => applyChannelFilter('email')}>Email</Button>
                    <Button size="sm" variant={channelFilter === 'notification' ? 'default' : 'outline'} onClick={() => applyChannelFilter('notification')}>Notificação</Button>
                    <Button size="sm" variant={channelFilter === 'push' ? 'default' : 'outline'} onClick={() => applyChannelFilter('push')}>Push</Button>
                    <Button size="sm" variant={channelFilter === 'popup' ? 'default' : 'outline'} onClick={() => applyChannelFilter('popup')}>Popup</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => applyStatusFilter('all')}>Status: Todos</Button>
                    <Button size="sm" variant={statusFilter === 'sent' ? 'default' : 'outline'} onClick={() => applyStatusFilter('sent')}>Enviado</Button>
                    <Button size="sm" variant={statusFilter === 'delivered' ? 'default' : 'outline'} onClick={() => applyStatusFilter('delivered')}>Entregue</Button>
                    <Button size="sm" variant={statusFilter === 'failed' ? 'default' : 'outline'} onClick={() => applyStatusFilter('failed')}>Falhou</Button>
                    <Button size="sm" variant={statusFilter === 'opened' ? 'default' : 'outline'} onClick={() => applyStatusFilter('opened')}>Aberto</Button>
                    <Button size="sm" variant="outline" onClick={() => void fetchHistory()} className="ml-auto gap-1">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Atualizar
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card rounded-xl border p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total</p>
                    <p className="text-2xl font-bold mt-1">{stats.totalAttempts}</p>
                </div>
                <div className="bg-card rounded-xl border p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Falharam</p>
                    <p className="text-2xl font-bold mt-1 text-red-600">{totalFailed}</p>
                </div>
                {byChannel.map(([ch, count]) => {
                    const config = channelConfig[ch] || channelConfig.email
                    const ChIcon = config.icon
                    return (
                        <div key={ch} className="bg-card rounded-xl border p-4">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
                                <ChIcon className="h-3 w-3" />
                                {config.label}
                            </p>
                            <p className="text-2xl font-bold mt-1">{count}</p>
                        </div>
                    )
                })}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((item) => (
                        <div key={item} className="bg-card rounded-xl border p-4 animate-pulse">
                            <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                            <div className="h-3 bg-muted rounded w-2/3" />
                        </div>
                    ))}
                </div>
            ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                        <History className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-semibold">Nenhum envio encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou realize um novo envio.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {entries.map((entry) => {
                        const channel = channelConfig[entry.channel] || channelConfig.email
                        const status = statusConfig[entry.status] || statusConfig.sent
                        const ChannelIcon = channel.icon
                        const StatusIcon = status.icon

                        return (
                            <div key={entry.id} className="bg-card rounded-xl border p-4 flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${channel.color}`}>
                                    <ChannelIcon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold truncate">{entry.campaigns?.title || 'Envio direto'}</p>
                                        <Badge className={`text-[9px] border ${status.color} gap-1`}>
                                            <StatusIcon className="h-2.5 w-2.5" />
                                            {status.label}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                        <span>{channel.label}</span>
                                        {entry.recipient_email && <span>- {entry.recipient_email}</span>}
                                        <span>- {new Date(entry.sent_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                    {entry.error_message && (
                                        <p className="text-[10px] text-red-500 mt-0.5">{entry.error_message}</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-muted-foreground">
                            Página {page} - {totalEntries} registros
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={page <= 1}
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                className="gap-1"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                Anterior
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!hasMore}
                                onClick={() => setPage((current) => current + 1)}
                                className="gap-1"
                            >
                                Próxima
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
