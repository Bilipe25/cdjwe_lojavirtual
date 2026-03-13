'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Send, Users, Bell, Smartphone, Link as LinkIcon, Image as ImageIcon, XCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function PushPage() {
    const [loading, setLoading] = useState(true)
    const [subCount, setSubCount] = useState(0)
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState('')
    const [message, setMessage] = useState('')
    const [link, setLink] = useState('')
    const [sending, setSending] = useState(false)

    useEffect(() => {
        loadStats()
    }, [])

    const loadStats = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { count, error } = await supabase
                .from('push_subscriptions')
                .select('id', { count: 'exact', head: true })
            if (error) throw error
            setSubCount(count || 0)
        } catch (err: any) {
            toast.error('Erro ao carregar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSendPush = async () => {
        if (!title.trim()) {
            toast.error('Título é obrigatório.')
            return
        }
        setSending(true)
        try {
            const res = await fetch('/api/marketing/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    body: message.trim(),
                    url: link.trim() || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
            toast.success(`Push enviado para ${data.sent || 0} dispositivos!`)
            setShowForm(false)
            setTitle('')
            setMessage('')
            setLink('')
        } catch (err: any) {
            toast.error('Erro ao enviar: ' + err.message)
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Send className="h-6 w-6" />
                        Push Notifications
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Envie notificações push para os navegadores dos clientes.</p>
                </div>
                <Button onClick={() => setShowForm(true)} className="gradient-bronze text-white gap-2">
                    <Send className="h-4 w-4" />
                    Enviar Push
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-card rounded-xl border p-5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center">
                            <Smartphone className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Dispositivos Registrados</p>
                            <p className="text-2xl font-bold">{loading ? '—' : subCount}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-card rounded-xl border p-5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Bell className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Status</p>
                            <p className="text-sm font-medium text-emerald-600 mt-0.5">
                                {subCount > 0 ? 'Pronto para enviar' : 'Aguardando inscrições'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="bg-card rounded-xl border p-5">
                <h3 className="text-sm font-bold mb-2">Como funciona?</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                    <p>1. Os clientes acessam a loja e permitem notificações no navegador.</p>
                    <p>2. O dispositivo é registrado automaticamente.</p>
                    <p>3. Você pode enviar notificações push a qualquer momento.</p>
                    <p>4. As notificações aparecem no navegador/dispositivo do cliente.</p>
                </div>
            </div>

            {/* Empty state when no subscribers */}
            {!loading && subCount === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                        <Smartphone className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-semibold">Nenhum dispositivo registrado</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        Os clientes precisam acessar a loja e permitir notificações para receber push notifications.
                    </p>
                </div>
            )}

            {/* Send Form */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold font-heading">Enviar Push Notification</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Será enviada para {subCount} dispositivos registrados.</p>
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
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Link de Redirecionamento</label>
                                <div className="relative">
                                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={link}
                                        onChange={e => setLink(e.target.value)}
                                        placeholder="https://..."
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t flex items-center justify-between">
                            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button onClick={handleSendPush} disabled={sending || subCount === 0} className="gradient-bronze text-white gap-2">
                                <Send className="h-4 w-4" />
                                Enviar Push
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
