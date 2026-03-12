'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
    Save,
    Loader2,
    Building2,
    Phone,
    Mail,
    MapPin,
    Package,
    Eye,
    Upload,
    X,
    ImageIcon,
    Globe,
    MessageCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { loadSettingsAction, saveSettingsAction, uploadLogoAction } from './actions'
import type { SystemSettings } from '@/lib/types'

// ====== Input Masks ======

function maskCNPJ(value: string): string {
    return value
        .replace(/\D/g, '')
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .slice(0, 18)
}

function maskPhone(value: string): string {
    return value
        .replace(/\D/g, '')
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15)
}

function maskCEP(value: string): string {
    return value
        .replace(/\D/g, '')
        .replace(/^(\d{5})(\d)/, '$1-$2')
        .slice(0, 9)
}

// ====== Form State Type ======

interface FormState {
    systemName: string
    cnpj: string
    address: string
    city: string
    state: string
    zipCode: string
    phone: string
    phoneSecondary: string
    email: string
    minOrderAmount: string
    defaultDeliveryDays: string
    showPricesToUnapproved: boolean
    logoUrl: string
    whatsapp: string
    instagram: string
    facebook: string
}

const initialForm: FormState = {
    systemName: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    phoneSecondary: '',
    email: '',
    minOrderAmount: '0',
    defaultDeliveryDays: '30',
    showPricesToUnapproved: false,
    logoUrl: '',
    whatsapp: '',
    instagram: '',
    facebook: '',
}

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [form, setForm] = useState<FormState>(initialForm)
    const [savedForm, setSavedForm] = useState<FormState>(initialForm)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)

    const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }, [])

    // ====== Load Settings ======

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            setLoadError(null)
            const result = await loadSettingsAction()
            if (result.error) {
                setLoadError(result.error)
            } else if (result.data) {
                setSettings(result.data)
                const loaded: FormState = {
                    systemName: result.data.system_name || '',
                    cnpj: result.data.cnpj || '',
                    address: result.data.address || '',
                    city: result.data.city || '',
                    state: result.data.state || '',
                    zipCode: result.data.zip_code || '',
                    phone: result.data.phone || '',
                    phoneSecondary: result.data.phone_secondary || '',
                    email: result.data.email || '',
                    minOrderAmount: result.data.min_order_amount?.toString() || '0',
                    defaultDeliveryDays: result.data.default_delivery_days?.toString() || '30',
                    showPricesToUnapproved: result.data.show_prices_to_unapproved || false,
                    logoUrl: result.data.logo_url || '',
                    whatsapp: result.data.whatsapp || '',
                    instagram: result.data.instagram || '',
                    facebook: result.data.facebook || '',
                }
                setForm(loaded)
                setSavedForm(loaded)
            }
            setLoading(false)
        }
        load()
    }, [])

    // ====== Save ======

    const handleSave = async () => {
        if (!form.systemName.trim()) {
            toast.error('Nome do sistema é obrigatório.')
            return
        }
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            toast.error('Email inválido.')
            return
        }

        setSaving(true)
        const result = await saveSettingsAction({
            id: settings?.id,
            system_name: form.systemName,
            logo_url: form.logoUrl || null,
            cnpj: form.cnpj || null,
            address: form.address || null,
            city: form.city || null,
            state: form.state || null,
            zip_code: form.zipCode || null,
            phone: form.phone || null,
            phone_secondary: form.phoneSecondary || null,
            email: form.email || null,
            min_order_amount: parseFloat(form.minOrderAmount) || 0,
            default_delivery_days: parseInt(form.defaultDeliveryDays) || 30,
            show_prices_to_unapproved: form.showPricesToUnapproved,
            whatsapp: form.whatsapp || null,
            instagram: form.instagram || null,
            facebook: form.facebook || null,
        })

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Configurações salvas com sucesso!')
            setSavedForm({ ...form })
        }
        setSaving(false)
    }

    // ====== Logo Upload ======

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadingLogo(true)
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadLogoAction(formData)
        if (result.error) {
            toast.error(result.error)
        } else if (result.url) {
            updateField('logoUrl', result.url)
            toast.success('Logo enviada! Salve para confirmar.')
        }
        setUploadingLogo(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ====== Loading State ======

    if (loading) {
        return (
            <div className="space-y-6 max-w-4xl">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-96" />
                <div className="grid gap-6">
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <Skeleton className="h-48 w-full rounded-xl" />
                </div>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="space-y-6 max-w-3xl">
                <h1 className="hidden md:block text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                    Configurações
                </h1>
                <Card className="glass-card border-0">
                    <CardContent className="py-12 text-center">
                        <p className="text-destructive font-medium">{loadError}</p>
                        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                            Tentar novamente
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                        Configurações
                    </h1>
                    <p className="text-muted-foreground mt-1">Configurações gerais do sistema</p>
                </div>
                <div className="flex items-center gap-3">
                    {hasChanges && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full font-medium animate-pulse">
                            Alterações não salvas
                        </span>
                    )}
                    <Button
                        className="gradient-navy border-0 text-white gap-2"
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="empresa">
                <TabsList variant="line" className="w-full justify-start border-b pb-0">
                    <TabsTrigger value="empresa" className="gap-1.5">
                        <Building2 className="h-4 w-4" />
                        Empresa
                    </TabsTrigger>
                    <TabsTrigger value="pedidos" className="gap-1.5">
                        <Package className="h-4 w-4" />
                        Pedidos
                    </TabsTrigger>
                    <TabsTrigger value="visibilidade" className="gap-1.5">
                        <Eye className="h-4 w-4" />
                        Visibilidade
                    </TabsTrigger>
                    <TabsTrigger value="social" className="gap-1.5">
                        <Globe className="h-4 w-4" />
                        Redes Sociais
                    </TabsTrigger>
                </TabsList>

                {/* ====== TAB: Empresa ====== */}
                <TabsContent value="empresa">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4">
                        {/* Logo */}
                        <Card className="glass-card border-0">
                            <CardHeader>
                                <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                                    <ImageIcon className="h-5 w-5 text-bronze" />
                                    Logo da Empresa
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-6">
                                    <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                                        {form.logoUrl ? (
                                            <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain" />
                                        ) : (
                                            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-2"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploadingLogo}
                                            >
                                                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                                {uploadingLogo ? 'Enviando...' : 'Enviar Logo'}
                                            </Button>
                                            {form.logoUrl && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive gap-1"
                                                    onClick={() => updateField('logoUrl', '')}
                                                >
                                                    <X className="h-4 w-4" />
                                                    Remover
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            PNG, JPEG, WebP ou SVG. Máximo 2MB.
                                        </p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                            className="hidden"
                                            onChange={handleLogoUpload}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Dados da Empresa */}
                        <Card className="glass-card border-0">
                            <CardHeader>
                                <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-bronze" />
                                    Dados da Empresa
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label>
                                            Nome do Sistema <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            value={form.systemName}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('systemName', e.target.value)}
                                            placeholder="CDJWE Estofados"
                                            className="bg-white/60"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>CNPJ</Label>
                                        <Input
                                            value={form.cnpj}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('cnpj', maskCNPJ(e.target.value))}
                                            placeholder="00.000.000/0000-00"
                                            className="bg-white/60"
                                            maxLength={18}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input
                                            type="email"
                                            value={form.email}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('email', e.target.value)}
                                            placeholder="contato@empresa.com"
                                            className="bg-white/60"
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Phone className="h-4 w-4" />
                                    <span className="text-sm font-medium">Telefones</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Telefone Principal</Label>
                                        <Input
                                            value={form.phone}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('phone', maskPhone(e.target.value))}
                                            placeholder="(00) 00000-0000"
                                            className="bg-white/60"
                                            maxLength={15}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Telefone Secundário</Label>
                                        <Input
                                            value={form.phoneSecondary}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('phoneSecondary', maskPhone(e.target.value))}
                                            placeholder="(00) 00000-0000"
                                            className="bg-white/60"
                                            maxLength={15}
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    <span className="text-sm font-medium">Endereço</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label>Endereço</Label>
                                        <Textarea
                                            value={form.address}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('address', e.target.value)}
                                            placeholder="Rua, número, bairro, complemento"
                                            className="bg-white/60 min-h-[60px]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Cidade</Label>
                                        <Input
                                            value={form.city}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('city', e.target.value)}
                                            placeholder="Cidade"
                                            className="bg-white/60"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Estado</Label>
                                            <Input
                                                value={form.state}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('state', e.target.value.toUpperCase().slice(0, 2))}
                                                placeholder="UF"
                                                className="bg-white/60"
                                                maxLength={2}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>CEP</Label>
                                            <Input
                                                value={form.zipCode}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('zipCode', maskCEP(e.target.value))}
                                                placeholder="00000-000"
                                                className="bg-white/60"
                                                maxLength={9}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </TabsContent>

                {/* ====== TAB: Pedidos ====== */}
                <TabsContent value="pedidos">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4">
                        <Card className="glass-card border-0">
                            <CardHeader>
                                <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                                    <Package className="h-5 w-5 text-bronze" />
                                    Configurações de Pedidos
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Pedido Mínimo (R$)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.minOrderAmount}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('minOrderAmount', e.target.value)}
                                            placeholder="0,00"
                                            className="bg-white/60"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Valor mínimo para que um cliente possa finalizar um pedido. Use 0 para sem limite.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Prazo de Entrega Padrão (dias)</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={form.defaultDeliveryDays}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('defaultDeliveryDays', e.target.value)}
                                            placeholder="30"
                                            className="bg-white/60"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Prazo estimado de entrega exibido para os clientes na loja.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </TabsContent>

                {/* ====== TAB: Visibilidade ====== */}
                <TabsContent value="visibilidade">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4">
                        <Card className="glass-card border-0">
                            <CardHeader>
                                <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                                    <Eye className="h-5 w-5 text-bronze" />
                                    Visibilidade do Catálogo
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-medium">Mostrar preços para clientes não aprovados</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Se ativado, clientes pendentes de aprovação poderão ver os preços dos produtos no catálogo.
                                            Caso contrário, apenas a imagem e nome serão exibidos.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={form.showPricesToUnapproved}
                                        onCheckedChange={(checked: boolean) => updateField('showPricesToUnapproved', checked)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </TabsContent>

                {/* ====== TAB: Redes Sociais ====== */}
                <TabsContent value="social">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4">
                        <Card className="glass-card border-0">
                            <CardHeader>
                                <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                                    <Globe className="h-5 w-5 text-bronze" />
                                    Redes Sociais & Contato
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <MessageCircle className="h-4 w-4 text-green-600" />
                                            WhatsApp
                                        </Label>
                                        <Input
                                            value={form.whatsapp}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('whatsapp', maskPhone(e.target.value))}
                                            placeholder="(00) 00000-0000"
                                            className="bg-white/60"
                                            maxLength={15}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Número do WhatsApp exibido no rodapé e contato da loja.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <svg className="h-4 w-4 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153a4.908 4.908 0 0 1 1.153 1.772c.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 0 1-1.153 1.772 4.915 4.915 0 0 1-1.772 1.153c-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 0 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
                                            </svg>
                                            Instagram
                                        </Label>
                                        <Input
                                            value={form.instagram}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('instagram', e.target.value)}
                                            placeholder="https://instagram.com/suaempresa"
                                            className="bg-white/60"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                            </svg>
                                            Facebook
                                        </Label>
                                        <Input
                                            value={form.facebook}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('facebook', e.target.value)}
                                            placeholder="https://facebook.com/suaempresa"
                                            className="bg-white/60"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </TabsContent>
            </Tabs>

            {/* Save Button (mobile sticky) */}
            <div className="sm:hidden sticky bottom-4 z-10">
                <Button
                    className="w-full h-12 gradient-navy border-0 text-white text-base gap-2 shadow-lg"
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Salvar Configurações
                </Button>
            </div>
        </div>
    )
}
