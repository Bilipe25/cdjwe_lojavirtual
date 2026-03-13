'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Image as ImageIcon, Plus, Pencil, Trash2, Eye, EyeOff, Link as LinkIcon, Calendar, XCircle } from 'lucide-react'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface Popup {
    id: string
    title: string
    description: string | null
    image_url: string | null
    button_text: string | null
    button_link: string | null
    is_active: boolean
    display_from: string | null
    display_until: string | null
    created_at: string
}

export default function PopupsPage() {
    const [popups, setPopups] = useState<Popup[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editingPopup, setEditingPopup] = useState<Popup | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)

    // Form state
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imageUrl, setImageUrl] = useState('')
    const [buttonText, setButtonText] = useState('')
    const [buttonLink, setButtonLink] = useState('')
    const [isActive, setIsActive] = useState(false)
    const [displayFrom, setDisplayFrom] = useState('')
    const [displayUntil, setDisplayUntil] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchPopups()
    }, [])

    const fetchPopups = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('promotional_popups')
                .select('*')
                .order('created_at', { ascending: false })
            if (error) throw error
            setPopups(data || [])
        } catch (err: any) {
            toast.error('Erro ao carregar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        setTitle('')
        setDescription('')
        setImageFile(null)
        setImageUrl('')
        setButtonText('')
        setButtonLink('')
        setIsActive(false)
        setDisplayFrom('')
        setDisplayUntil('')
        setEditingPopup(null)
    }

    const openEditForm = (popup: Popup) => {
        setTitle(popup.title)
        setDescription(popup.description || '')
        setImageUrl(popup.image_url || '')
        setButtonText(popup.button_text || '')
        setButtonLink(popup.button_link || '')
        setIsActive(popup.is_active)
        setDisplayFrom(popup.display_from ? popup.display_from.slice(0, 16) : '')
        setDisplayUntil(popup.display_until ? popup.display_until.slice(0, 16) : '')
        setEditingPopup(popup)
        setShowForm(true)
    }

    const handleSave = async () => {
        if (!title.trim()) {
            toast.error('Título é obrigatório.')
            return
        }
        setSaving(true)
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Não autenticado')

            let uploadedUrl = imageUrl
            if (imageFile) {
                const ext = imageFile.name.split('.').pop()
                const path = `popups/${Date.now()}.${ext}`
                const { error: uploadError } = await supabase.storage.from('campaign-images').upload(path, imageFile)
                if (uploadError) throw uploadError
                const { data: { publicUrl } } = supabase.storage.from('campaign-images').getPublicUrl(path)
                uploadedUrl = publicUrl
            }

            // If activating this popup, deactivate all others
            if (isActive) {
                await supabase
                    .from('promotional_popups')
                    .update({ is_active: false })
                    .neq('id', editingPopup?.id || '')
            }

            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                image_url: uploadedUrl || null,
                button_text: buttonText.trim() || null,
                button_link: buttonLink.trim() || null,
                is_active: isActive,
                display_from: displayFrom ? new Date(displayFrom).toISOString() : null,
                display_until: displayUntil ? new Date(displayUntil).toISOString() : null,
            }

            if (editingPopup) {
                const { error } = await supabase
                    .from('promotional_popups')
                    .update(payload)
                    .eq('id', editingPopup.id)
                if (error) throw error
                toast.success('Popup atualizado!')
            } else {
                const { error } = await supabase
                    .from('promotional_popups')
                    .insert({ ...payload, created_by: user.id })
                if (error) throw error
                toast.success('Popup criado!')
            }

            setShowForm(false)
            resetForm()
            fetchPopups()
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    const toggleActive = async (popup: Popup) => {
        try {
            const supabase = createClient()
            // If activating, deactivate all others first
            if (!popup.is_active) {
                await supabase.from('promotional_popups').update({ is_active: false }).neq('id', popup.id)
            }
            const { error } = await supabase
                .from('promotional_popups')
                .update({ is_active: !popup.is_active })
                .eq('id', popup.id)
            if (error) throw error
            toast.success(popup.is_active ? 'Popup desativado!' : 'Popup ativado!')
            fetchPopups()
        } catch (err: any) {
            toast.error('Erro: ' + err.message)
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return
        try {
            const supabase = createClient()
            const { error } = await supabase.from('promotional_popups').delete().eq('id', deleteId)
            if (error) throw error
            toast.success('Popup excluído!')
            setDeleteId(null)
            fetchPopups()
        } catch (err: any) {
            toast.error('Erro: ' + err.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <ImageIcon className="h-6 w-6" />
                        Popups Promocionais
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Configure popups promocionais para o painel do cliente.</p>
                </div>
                <Button onClick={() => { resetForm(); setShowForm(true) }} className="gradient-bronze text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Novo Popup
                </Button>
            </div>

            {/* List */}
            {loading ? (
                <div className="grid gap-4">
                    {[1, 2].map(i => (
                        <div key={i} className="bg-card rounded-xl border p-5 animate-pulse">
                            <div className="h-5 bg-muted rounded w-1/3 mb-3" />
                            <div className="h-4 bg-muted rounded w-2/3" />
                        </div>
                    ))}
                </div>
            ) : popups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                        <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-semibold">Nenhum popup configurado</p>
                    <p className="text-xs text-muted-foreground mt-1">Crie um popup promocional para o painel do cliente.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {popups.map(p => (
                        <div key={p.id} className="bg-card rounded-xl border hover:shadow-md transition-shadow p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-base font-bold truncate">{p.title}</h3>
                                        <Badge className={`text-[10px] ${p.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                            {p.is_active ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                    </div>
                                    {p.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{p.description}</p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                        {p.button_text && <span className="bg-muted/60 px-2 py-0.5 rounded-full">Botão: {p.button_text}</span>}
                                        {p.display_from && <span>De: {new Date(p.display_from).toLocaleDateString('pt-BR')}</span>}
                                        {p.display_until && <span>Até: {new Date(p.display_until).toLocaleDateString('pt-BR')}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" onClick={() => toggleActive(p)} title={p.is_active ? 'Desativar' : 'Ativar'}>
                                        {p.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => openEditForm(p)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)} className="text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                            <h2 className="text-lg font-bold font-heading">
                                {editingPopup ? 'Editar Popup' : 'Novo Popup'}
                            </h2>
                            <button onClick={() => { setShowForm(false); resetForm() }} className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
                                <XCircle className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Título *</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do popup" />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Texto da Promoção</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Descrição da promoção..."
                                    className="w-full rounded-lg border px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Imagem</label>
                                <label className="cursor-pointer">
                                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm text-muted-foreground">
                                        <ImageIcon className="h-4 w-4" />
                                        {imageFile ? imageFile.name : 'Escolher imagem'}
                                    </div>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Texto do Botão</label>
                                    <Input value={buttonText} onChange={e => setButtonText(e.target.value)} placeholder="Ex: Ver promoção" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Link do Botão</label>
                                    <Input value={buttonLink} onChange={e => setButtonLink(e.target.value)} placeholder="https://..." />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Exibir a partir de</label>
                                    <Input type="datetime-local" value={displayFrom} onChange={e => setDisplayFrom(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Exibir até</label>
                                    <Input type="datetime-local" value={displayUntil} onChange={e => setDisplayUntil(e.target.value)} />
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsActive(!isActive)}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? 'bg-primary' : 'bg-muted'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-5' : ''}`} />
                                </button>
                                <span className="text-sm font-medium">{isActive ? 'Ativo' : 'Inativo'}</span>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between rounded-b-2xl">
                            <Button variant="outline" onClick={() => { setShowForm(false); resetForm() }}>Cancelar</Button>
                            <Button onClick={handleSave} disabled={saving} className="gradient-bronze text-white">
                                {editingPopup ? 'Atualizar' : 'Criar Popup'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir popup?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
