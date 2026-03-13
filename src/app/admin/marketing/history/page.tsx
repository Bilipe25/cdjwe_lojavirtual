'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { History, Mail, Bell, Send, Image as ImageIcon, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface SendEntry {
    id: string
    channel: string
    status: string
    recipient_email: string | null
    error_message: string | null
    sent_at: string
    campaigns?: { title: string } | null
}

const channelConfig: Record<string, { icon: any; label: string; color: string }> = {
    email: { icon: Mail, label: 'E-mail', color: 'text-blue-600 bg-blue-50' },
    notification: { icon: Bell, label: 'Notificação', color: 'text-purple-600 bg-purple-50' },
    push: { icon: Send, label: 'Push', color: 'text-emerald-600 bg-emerald-50' },
    popup: { icon: ImageIcon, label: 'Popup', color: 'text-amber-600 bg-amber-50' },
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
    delivered: { label: 'Entregue', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    failed: { label: 'Falhou', color: 'bg-red-100 text-red-700', icon: XCircle },
    opened: { label: 'Aberto', color: 'bg-amber-100 text-amber-700', icon: CheckCircle2 },
}

export default function HistoryPage() {
    const [entries, setEntries] = useState<SendEntry[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHistory()
    }, [])

    const fetchHistory = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('campaign_send_history')
                .select('*, campaigns(title)')
                .order('sent_at', { ascending: false })
                .limit(200)
            if (error) throw error
            setEntries(data || [])
        } catch { /* silent */ } finally {
            setLoading(false)
        }
    }

    // Group stats
    const totalSent = entries.length
    const totalFailed = entries.filter(e => e.status === 'failed').length
    const byChannel = Object.entries(
        entries.reduce((acc, e) => { acc[e.channel] = (acc[e.channel] || 0) + 1; return acc }, {} as Record<string, number>)
    )

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                    <History className="h-6 w-6" />
                    Histórico de Envios
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Veja o histórico de todos os envios realizados.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card rounded-xl border p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total</p>
                    <p className="text-2xl font-bold mt-1">{totalSent}</p>
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

            {/* History List */}
            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-card rounded-xl border p-4 animate-pulse">
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
                    <p className="text-sm font-semibold">Nenhum envio realizado</p>
                    <p className="text-xs text-muted-foreground mt-1">O histórico aparecerá aqui quando você enviar campanhas.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {entries.map(e => {
                        const ch = channelConfig[e.channel] || channelConfig.email
                        const st = statusConfig[e.status] || statusConfig.sent
                        const ChIcon = ch.icon
                        const StIcon = st.icon
                        return (
                            <div key={e.id} className="bg-card rounded-xl border p-4 flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${ch.color}`}>
                                    <ChIcon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold truncate">{e.campaigns?.title || 'Envio direto'}</p>
                                        <Badge className={`text-[9px] border ${st.color} gap-1`}>
                                            <StIcon className="h-2.5 w-2.5" />
                                            {st.label}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                        <span>{ch.label}</span>
                                        {e.recipient_email && <span>• {e.recipient_email}</span>}
                                        <span>• {new Date(e.sent_at).toLocaleString('pt-BR')}</span>
                                    </div>
                                    {e.error_message && (
                                        <p className="text-[10px] text-red-500 mt-0.5">{e.error_message}</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
