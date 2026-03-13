'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Megaphone, Plus, Search, Calendar, Mail, Bell, Send, Image as ImageIcon,
    MoreHorizontal, Eye, Pencil, Trash2, Clock, CheckCircle2, XCircle, Filter,
} from 'lucide-react'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AudienceSelector, TargetSegment } from '@/components/admin/marketing/audience-selector'
import { toast } from 'sonner'

interface Campaign {
    id: string
    title: string
    description: string | null
    message: string | null
    image_url: string | null
    channels: string[]
    status: string
    send_type: string
    button_link: string | null
    is_active: boolean
    scheduled_at: string | null
    display_from: string | null
    display_until: string | null
    target_audience: 'all' | 'segment'
    target_segment?: TargetSegment | null
    created_at: string
    updated_at: string
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock },
    scheduled: { label: 'Agendada', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Calendar },
    sent: { label: 'Enviada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
}

const channelIcons: Record<string, any> = {
    email: Mail,
    notification: Bell,
    push: Send,
    popup: ImageIcon,
}

const channelLabels: Record<string, string> = {
    email: 'E-mail',
    notification: 'Notificação',
    push: 'Push',
    popup: 'Popup',
}

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [showForm, setShowForm] = useState(false)
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)

    // Form state
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [message, setMessage] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [channels, setChannels] = useState<string[]>([])
    const [sendType, setSendType] = useState('immediate')
    const [scheduledAt, setScheduledAt] = useState('')
    const [displayFrom, setDisplayFrom] = useState('')
    const [displayUntil, setDisplayUntil] = useState('')
    const [targetAudience, setTargetAudience] = useState('all')
    const [targetSegment, setTargetSegment] = useState<TargetSegment>({ states: [], cities: [] })
    const [saving, setSaving] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)

    useEffect(() => {
        fetchCampaigns()
    }, [])

    const fetchCampaigns = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('campaigns')
                .select('*')
                .order('created_at', { ascending: false })
            if (error) throw error
            setCampaigns(data || [])
        } catch (err: any) {
            toast.error('Erro ao carregar campanhas: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        setTitle('')
        setDescription('')
        setMessage('')
        setImageUrl('')
        setChannels([])
        setSendType('immediate')
        setScheduledAt('')
        setDisplayFrom('')
        setDisplayUntil('')
        setTargetAudience('all')
        setTargetSegment({ states: [], cities: [] })
        setEditingCampaign(null)
        setImageFile(null)
    }

    const openCreateForm = () => {
        resetForm()
        setShowForm(true)
    }

    const openEditForm = (campaign: Campaign) => {
        setTitle(campaign.title)
        setDescription(campaign.description || '')
        setMessage(campaign.message || '')
        setImageUrl(campaign.image_url || '')
        setChannels(campaign.channels || [])
        setSendType(campaign.send_type)
        setScheduledAt(campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : '')
        setDisplayFrom(campaign.display_from ? campaign.display_from.slice(0, 16) : '')
        setDisplayUntil(campaign.display_until ? campaign.display_until.slice(0, 16) : '')
        setTargetAudience(campaign.target_audience)
        setTargetSegment(campaign.target_segment || { states: [], cities: [] })
        setEditingCampaign(campaign)
        setShowForm(true)
    }

    const toggleChannel = (ch: string) => {
        setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])
    }

    const uploadImage = async (): Promise<string | null> => {
        if (!imageFile) return imageUrl || null
        try {
            const supabase = createClient()
            const ext = imageFile.name.split('.').pop()
            const path = `campaigns/${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('campaign-images').upload(path, imageFile)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('campaign-images').getPublicUrl(path)
            return publicUrl
        } catch (err: any) {
            toast.error('Erro no upload: ' + err.message)
            return imageUrl || null
        }
    }

    const handleSave = async (asDraft: boolean = true) => {
        if (!title.trim()) {
            toast.error('Título é obrigatório.')
            return
        }
        setSaving(true)
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Não autenticado')

            const uploadedUrl = await uploadImage()
            const status = asDraft ? 'draft' : (sendType === 'scheduled' ? 'scheduled' : 'sent')

            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                message: message.trim() || null,
                image_url: uploadedUrl,
                channels,
                status,
                send_type: sendType,
                scheduled_at: sendType === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
                display_from: displayFrom ? new Date(displayFrom).toISOString() : null,
                display_until: displayUntil ? new Date(displayUntil).toISOString() : null,
                target_audience: targetAudience,
                target_segment: targetAudience === 'segment' ? targetSegment : null,
            }

            if (editingCampaign) {
                const { error } = await supabase
                    .from('campaigns')
                    .update(payload)
                    .eq('id', editingCampaign.id)
                if (error) throw error
                toast.success('Campanha atualizada!')
            } else {
                const { error } = await supabase
                    .from('campaigns')
                    .insert({ ...payload, created_by: user.id })
                if (error) throw error
                toast.success(asDraft ? 'Rascunho salvo!' : 'Campanha criada!')
            }

            // If sending immediately (not draft), dispatch to channels
            if (!asDraft && status === 'sent') {
                try {
                    await fetch('/api/marketing/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...payload, channels }),
                    })
                } catch { /* send errors are non-blocking */ }
            }

            setShowForm(false)
            resetForm()
            fetchCampaigns()
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return
        try {
            const supabase = createClient()
            const { error } = await supabase.from('campaigns').delete().eq('id', deleteId)
            if (error) throw error
            toast.success('Campanha excluída!')
            setDeleteId(null)
            fetchCampaigns()
        } catch (err: any) {
            toast.error('Erro ao excluir: ' + err.message)
        }
    }

    const filteredCampaigns = campaigns.filter(c => {
        if (statusFilter !== 'all' && c.status !== statusFilter) return false
        if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Megaphone className="h-6 w-6" />
                        Campanhas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Gerencie suas campanhas de marketing e comunicação.</p>
                </div>
                <Button onClick={openCreateForm} className="gradient-bronze text-white gap-2 shadow-sm">
                    <Plus className="h-4 w-4" />
                    Nova Campanha
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar campanhas..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    {['all', 'draft', 'scheduled', 'sent', 'cancelled'].map(s => (
                        <Button
                            key={s}
                            variant={statusFilter === s ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter(s)}
                            className={statusFilter === s ? 'gradient-bronze text-white border-0' : ''}
                        >
                            {s === 'all' ? 'Todas' : statusConfig[s]?.label || s}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Campaign List */}
            {loading ? (
                <div className="grid gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-card rounded-xl border p-5 animate-pulse">
                            <div className="h-5 bg-muted rounded w-1/3 mb-3" />
                            <div className="h-4 bg-muted rounded w-2/3" />
                        </div>
                    ))}
                </div>
            ) : filteredCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                        <Megaphone className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-semibold">Nenhuma campanha encontrada</p>
                    <p className="text-xs text-muted-foreground mt-1">Crie sua primeira campanha de marketing.</p>
                    <Button onClick={openCreateForm} className="mt-4 gradient-bronze text-white gap-2">
                        <Plus className="h-4 w-4" />
                        Criar Campanha
                    </Button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredCampaigns.map(c => {
                        const config = statusConfig[c.status] || statusConfig.draft
                        const StatusIcon = config.icon
                        return (
                            <div key={c.id} className="bg-card rounded-xl border hover:shadow-md transition-shadow p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-base font-bold truncate">{c.title}</h3>
                                            <Badge className={`text-[10px] border ${config.color} gap-1`}>
                                                <StatusIcon className="h-3 w-3" />
                                                {config.label}
                                            </Badge>
                                        </div>
                                        {c.description && (
                                            <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{c.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {c.channels.map(ch => {
                                                const ChIcon = channelIcons[ch] || Bell
                                                return (
                                                    <span
                                                        key={ch}
                                                        className="inline-flex items-center gap-1 text-[10px] font-medium bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full"
                                                    >
                                                        <ChIcon className="h-3 w-3" />
                                                        {channelLabels[ch] || ch}
                                                    </span>
                                                )
                                            })}
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(c.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger render={
                                            <Button variant="ghost" size="icon" className="shrink-0" />
                                        }>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditForm(c)} className="cursor-pointer">
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Editar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setDeleteId(c.id)} className="cursor-pointer text-destructive">
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Excluir
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Create/Edit Form Dialog */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                            <h2 className="text-lg font-bold font-heading">
                                {editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}
                            </h2>
                            <button onClick={() => { setShowForm(false); resetForm() }} className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
                                <XCircle className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Title */}
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Título da Campanha *</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Promoção de Verão" />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Descrição</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Breve descrição da campanha..."
                                    className="w-full rounded-lg border px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            {/* Message */}
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Mensagem</label>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Conteúdo da mensagem enviada ao cliente..."
                                    className="w-full rounded-lg border px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            {/* Image Upload */}
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Imagem Promocional</label>
                                <div className="flex items-center gap-3">
                                    <label className="cursor-pointer">
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm text-muted-foreground">
                                            <ImageIcon className="h-4 w-4" />
                                            {imageFile ? imageFile.name : 'Escolher imagem'}
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={e => setImageFile(e.target.files?.[0] || null)}
                                        />
                                    </label>
                                    {(imageUrl || imageFile) && (
                                        <button
                                            onClick={() => { setImageFile(null); setImageUrl('') }}
                                            className="text-xs text-destructive hover:underline"
                                        >
                                            Remover
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Channels */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">Canais de Envio</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {Object.entries(channelLabels).map(([key, label]) => {
                                        const ChIcon = channelIcons[key]
                                        const selected = channels.includes(key)
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => toggleChannel(key)}
                                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                                    selected
                                                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                                        : 'border-border text-muted-foreground hover:border-primary/30'
                                                }`}
                                            >
                                                <ChIcon className="h-4 w-4" />
                                                {label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Send Type */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">Tipo de Envio</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSendType('immediate')}
                                        className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                            sendType === 'immediate'
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border text-muted-foreground hover:border-primary/30'
                                        }`}
                                    >
                                        <Send className="h-4 w-4 mx-auto mb-1" />
                                        Imediato
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSendType('scheduled')}
                                        className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                            sendType === 'scheduled'
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border text-muted-foreground hover:border-primary/30'
                                        }`}
                                    >
                                        <Calendar className="h-4 w-4 mx-auto mb-1" />
                                        Agendado
                                    </button>
                                </div>
                            </div>

                            {/* Schedule Date */}
                            {sendType === 'scheduled' && (
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Data de Envio</label>
                                    <Input
                                        type="datetime-local"
                                        value={scheduledAt}
                                        onChange={e => setScheduledAt(e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Display Period */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Exibir a partir de</label>
                                    <Input
                                        type="datetime-local"
                                        value={displayFrom}
                                        onChange={e => setDisplayFrom(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Exibir até</label>
                                    <Input
                                        type="datetime-local"
                                        value={displayUntil}
                                        onChange={e => setDisplayUntil(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Target Audience */}
                            <AudienceSelector
                                value={targetAudience as 'all' | 'segment'}
                                segmentData={targetSegment}
                                onChangeValue={(val) => setTargetAudience(val)}
                                onChangeSegment={setTargetSegment}
                            />
                        </div>

                        {/* Footer Actions */}
                        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between gap-3 rounded-b-2xl">
                            <Button variant="outline" onClick={() => { setShowForm(false); resetForm() }}>
                                Cancelar
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
                                    Salvar Rascunho
                                </Button>
                                <Button onClick={() => handleSave(false)} disabled={saving} className="gradient-bronze text-white gap-2">
                                    <Send className="h-4 w-4" />
                                    {sendType === 'scheduled' ? 'Agendar' : 'Enviar Agora'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A campanha e todo o histórico de envios serão removidos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
