'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Bell, CheckCircle2, Clock, Send, XCircle } from 'lucide-react'
import { AudienceSelector, TargetSegment } from '@/components/admin/marketing/audience-selector'
import { toast } from 'sonner'

interface NotificationEntry {
    id: string
    title: string
    message: string | null
    type: string
    is_read: boolean
    created_at: string
    profile_id: string
    profiles?: { full_name: string; email: string }
}

export default function NotificationsPage() {
    const [loading, setLoading] = useState(true)
    const [notifications, setNotifications] = useState<NotificationEntry[]>([])
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState('')
    const [message, setMessage] = useState('')
    const [targetAudience, setTargetAudience] = useState<'all' | 'segment' | 'specific'>('all')
    const [targetSegment, setTargetSegment] = useState<TargetSegment>({ states: [], cities: [], clientIds: [] })
    const [sending, setSending] = useState(false)

    useEffect(() => {
        fetchNotifications()
    }, [])

    const fetchNotifications = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('client_notifications')
                .select('*, profiles(full_name, email)')
                .order('created_at', { ascending: false })
                .limit(100)
            if (error) throw error
            setNotifications(data || [])
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar notificacoes.'
            toast.error('Erro ao carregar: ' + message)
        } finally {
            setLoading(false)
        }
    }

    const handleSendNotification = async () => {
        if (!title.trim()) {
            toast.error('Titulo obrigatorio.')
            return
        }

        setSending(true)
        try {
            const response = await fetch('/api/marketing/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    message: message.trim() || null,
                    channels: ['notification'],
                    target_audience: targetAudience,
                    target_segment: targetAudience === 'all' ? null : targetSegment,
                }),
            })

            const payload = await response.json()
            if (!response.ok) {
                throw new Error(payload.error || 'Falha ao enviar notificacao.')
            }

            const sentCount = payload?.results?.notification ?? 0
            toast.success(`Notificacao enviada para ${sentCount} clientes!`)
            setShowForm(false)
            setTitle('')
            setMessage('')
            setTargetAudience('all')
            setTargetSegment({ states: [], cities: [], clientIds: [] })
            fetchNotifications()
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Erro ao enviar notificacao.'
            toast.error('Erro ao enviar: ' + message)
        } finally {
            setSending(false)
        }
    }

    const readCount = notifications.filter(n => n.is_read).length
    const unreadCount = notifications.filter(n => !n.is_read).length

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Bell className="h-6 w-6" />
                        Notificações
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Envie notificações diretamente para o painel dos clientes.</p>
                </div>
                <Button onClick={() => setShowForm(true)} className="gradient-bronze text-white gap-2">
                    <Send className="h-4 w-4" />
                    Enviar Notificação
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-card rounded-xl border p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total Enviadas</p>
                    <p className="text-2xl font-bold mt-1">{notifications.length}</p>
                </div>
                <div className="bg-card rounded-xl border p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Lidas</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600">{readCount}</p>
                </div>
                <div className="bg-card rounded-xl border p-4">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Não Lidas</p>
                    <p className="text-2xl font-bold mt-1 text-blue-600">{unreadCount}</p>
                </div>
            </div>

            {/* Recent Notifications */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-card rounded-xl border p-4 animate-pulse">
                            <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                            <div className="h-3 bg-muted rounded w-2/3" />
                        </div>
                    ))}
                </div>
            ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                        <Bell className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-semibold">Nenhuma notificação enviada</p>
                    <p className="text-xs text-muted-foreground mt-1">Envie sua primeira notificação aos clientes.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {notifications.slice(0, 50).map(n => (
                        <div key={n.id} className="bg-card rounded-xl border p-4 flex items-start gap-3">
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${n.is_read ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                                {n.is_read ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-blue-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold truncate">{n.title}</p>
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                        {new Date(n.created_at).toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                                {n.message && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.message}</p>}
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-[9px]">
                                        {n.is_read ? 'Lida' : 'Não lida'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Send Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold font-heading">Enviar Notificação Interna</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Aparecerá no painel de notificações do sistema para os clientes selecionados.</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
                                <XCircle className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Título *</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da notificação" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Mensagem</label>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Conteúdo da notificação..."
                                    className="w-full rounded-lg border px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            
                            {/* Target Audience */}
                            <AudienceSelector
                                value={targetAudience}
                                segmentData={targetSegment}
                                onChangeValue={setTargetAudience}
                                onChangeSegment={setTargetSegment}
                            />
                        </div>
                        <div className="px-6 py-4 border-t flex items-center justify-between">
                            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button onClick={handleSendNotification} disabled={sending} className="gradient-bronze text-white gap-2">
                                <Send className="h-4 w-4" />
                                Enviar Notificação
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
