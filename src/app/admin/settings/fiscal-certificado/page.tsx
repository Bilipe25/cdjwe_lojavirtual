'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
    Save,
    Loader2,
    ShieldCheck,
    ShieldAlert,
    ShieldOff,
    Upload,
    Clock,
    FileKey2,
    AlertTriangle,
    CheckCircle2,
    CalendarClock,
    Eye,
    EyeOff,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { loadCertificateAction, saveCertificateAction, uploadCertificateAction } from './actions'
import { FiscalHelpText } from '../components/FiscalHelpText'
import type { CompanyCertificateConfig } from '@/lib/types'

// ====== Form State ======

interface FormState {
    certificateName: string
    certificateStatus: string
    validFrom: string
    validTo: string
    certificateSerial: string
    certificateIssuer: string
    certificateStoragePath: string
    isActive: boolean
    alertDaysBeforeExpiry: string
}

const initialForm: FormState = {
    certificateName: '',
    certificateStatus: 'pending',
    validFrom: '',
    validTo: '',
    certificateSerial: '',
    certificateIssuer: '',
    certificateStoragePath: '',
    isActive: false,
    alertDaysBeforeExpiry: '30',
}

function getDaysUntilExpiry(validTo: string | null): number | null {
    if (!validTo) return null
    const now = new Date()
    const expiry = new Date(validTo)
    const diff = expiry.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDateBR(isoDate: string | null): string {
    if (!isoDate) return '—'
    try {
        return new Date(isoDate).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
    } catch {
        return '—'
    }
}

export default function FiscalCertificadoPage() {
    const [cert, setCert] = useState<CompanyCertificateConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [form, setForm] = useState<FormState>(initialForm)
    const [savedForm, setSavedForm] = useState<FormState>(initialForm)
    const [showPassword, setShowPassword] = useState(false)
    const [certPassword, setCertPassword] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)

    const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }, [])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const result = await loadCertificateAction()
            if (result.data) {
                setCert(result.data)
                const loaded: FormState = {
                    certificateName: result.data.certificate_name || '',
                    certificateStatus: result.data.certificate_status || 'pending',
                    validFrom: result.data.valid_from || '',
                    validTo: result.data.valid_to || '',
                    certificateSerial: result.data.certificate_serial || '',
                    certificateIssuer: result.data.certificate_issuer || '',
                    certificateStoragePath: result.data.certificate_storage_path || '',
                    isActive: result.data.is_active || false,
                    alertDaysBeforeExpiry: result.data.alert_days_before_expiry?.toString() || '30',
                }
                setForm(loaded)
                setSavedForm(loaded)
            }
            setLoading(false)
        }
        load()
    }, [])

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        const result = await uploadCertificateAction(formData)
        if (result.error) {
            toast.error(result.error)
        } else if (result.path) {
            updateField('certificateStoragePath', result.path)
            updateField('certificateName', file.name.replace(/\.(pfx|p12)$/i, ''))
            toast.success('Certificado enviado com sucesso!')
        }
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleSave = async () => {
        setSaving(true)
        const result = await saveCertificateAction({
            id: cert?.id,
            certificate_name: form.certificateName || null,
            certificate_status: form.certificateStatus,
            valid_from: form.validFrom || null,
            valid_to: form.validTo || null,
            certificate_serial: form.certificateSerial || null,
            certificate_issuer: form.certificateIssuer || null,
            certificate_storage_path: form.certificateStoragePath || null,
            is_active: form.isActive,
            alert_days_before_expiry: parseInt(form.alertDaysBeforeExpiry) || 30,
        })

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Configuração de certificado salva com sucesso!')
            setSavedForm({ ...form })
        }
        setSaving(false)
    }

    const daysUntilExpiry = getDaysUntilExpiry(form.validTo)
    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= parseInt(form.alertDaysBeforeExpiry || '30')
    const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0

    if (loading) {
        return (
            <div className="space-y-6 max-w-4xl">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Segurança Fiscal
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Certificado digital A1 para assinatura de documentos fiscais
                    </p>
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

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                {/* Status do Certificado */}
                <Card className="glass-card border-0 overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            {/* Status Icon */}
                            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 ${
                                form.isActive && form.certificateStatus === 'active'
                                    ? 'bg-emerald-100'
                                    : isExpired || form.certificateStatus === 'expired'
                                        ? 'bg-red-100'
                                        : 'bg-amber-100'
                            }`}>
                                {form.isActive && form.certificateStatus === 'active' ? (
                                    <ShieldCheck className="h-8 w-8 text-emerald-600" />
                                ) : isExpired || form.certificateStatus === 'expired' ? (
                                    <ShieldOff className="h-8 w-8 text-red-600" />
                                ) : (
                                    <ShieldAlert className="h-8 w-8 text-amber-600" />
                                )}
                            </div>

                            {/* Status Info */}
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold font-heading">
                                        {form.isActive && form.certificateStatus === 'active'
                                            ? 'Certificado Ativo'
                                            : isExpired || form.certificateStatus === 'expired'
                                                ? 'Certificado Expirado'
                                                : form.certificateStoragePath
                                                    ? 'Certificado Pendente'
                                                    : 'Nenhum Certificado'
                                        }
                                    </h2>
                                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                                        form.isActive && form.certificateStatus === 'active'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : isExpired || form.certificateStatus === 'expired'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {form.certificateStatus === 'active' ? 'Ativo'
                                            : form.certificateStatus === 'expired' ? 'Expirado'
                                            : form.certificateStatus === 'revoked' ? 'Revogado'
                                            : 'Pendente'
                                        }
                                    </span>
                                </div>
                                {form.certificateName && (
                                    <p className="text-sm text-muted-foreground mt-1">{form.certificateName}</p>
                                )}
                                {daysUntilExpiry !== null && (
                                    <div className={`flex items-center gap-1 mt-2 text-sm ${
                                        isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-600' : 'text-muted-foreground'
                                    }`}>
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {isExpired
                                            ? `Expirado há ${Math.abs(daysUntilExpiry)} dias`
                                            : `Expira em ${daysUntilExpiry} dias`
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Validity Dates */}
                            {(form.validFrom || form.validTo) && (
                                <div className="text-right space-y-1 text-sm text-muted-foreground">
                                    <div><span className="font-medium">Emitido:</span> {formatDateBR(form.validFrom)}</div>
                                    <div><span className="font-medium">Validade:</span> {formatDateBR(form.validTo)}</div>
                                </div>
                            )}
                        </div>

                        {/* Expiry Warning */}
                        {isExpiringSoon && !isExpired && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm"
                            >
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>O certificado digital expira em <strong>{daysUntilExpiry} dias</strong>. Providencie a renovação para evitar interrupção na emissão fiscal.</span>
                            </motion.div>
                        )}
                    </CardContent>
                </Card>

                {/* Detalhes do Certificado */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <FileKey2 className="h-5 w-5 text-bronze" />
                            Detalhes do Certificado
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nome do Certificado</Label>
                                <Input
                                    value={form.certificateName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('certificateName', e.target.value)}
                                    placeholder="e-CNPJ A1 2025"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Número Serial</Label>
                                <Input
                                    value={form.certificateSerial}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('certificateSerial', e.target.value)}
                                    placeholder="Número serial do certificado"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Autoridade Certificadora</Label>
                                <Input
                                    value={form.certificateIssuer}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('certificateIssuer', e.target.value)}
                                    placeholder="Ex: AC SOLUTI, SERASA, CERTISIGN"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Dias de Alerta
                                    <FiscalHelpText text="Quantos dias antes do vencimento o sistema deve começar a exibir alertas sobre a renovação." />
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={form.alertDaysBeforeExpiry}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('alertDaysBeforeExpiry', e.target.value)}
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Válido de</Label>
                                <Input
                                    type="date"
                                    value={form.validFrom ? form.validFrom.split('T')[0] : ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('validFrom', e.target.value ? new Date(e.target.value).toISOString() : '')}
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Válido até</Label>
                                <Input
                                    type="date"
                                    value={form.validTo ? form.validTo.split('T')[0] : ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('validTo', e.target.value ? new Date(e.target.value).toISOString() : '')}
                                    className="bg-white/60"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Upload e Ativação */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Upload className="h-5 w-5 text-bronze" />
                            Upload e Configuração
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {/* Upload */}
                        <div className="space-y-3">
                            <Label>Arquivo do Certificado (.pfx / .p12)</Label>
                            <div
                                className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                                    form.certificateStoragePath ? 'border-emerald-300 bg-emerald-50/50' : 'border-muted/40 hover:border-muted/60'
                                }`}
                                onClick={() => fileInputRef.current?.click()}
                                role="button"
                                tabIndex={0}
                            >
                                {uploading ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                                        <span className="text-sm text-muted-foreground">Enviando certificado...</span>
                                    </div>
                                ) : form.certificateStoragePath ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                        <span className="text-sm text-emerald-700 font-medium">Certificado carregado</span>
                                        <span className="text-xs text-muted-foreground">Clique para substituir</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload className="h-8 w-8 text-muted-foreground/50" />
                                        <span className="text-sm text-muted-foreground">Clique ou arraste o arquivo .pfx / .p12</span>
                                        <span className="text-xs text-muted-foreground">Máximo 10MB</span>
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pfx,.p12"
                                    onChange={handleUpload}
                                    className="hidden"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-2 max-w-md">
                            <Label className="flex items-center gap-1">
                                Senha do Certificado
                                <FiscalHelpText text="A senha é usada apenas para validação no momento do upload. Ela é armazenada de forma segura (hash)." />
                            </Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    value={certPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCertPassword(e.target.value)}
                                    placeholder="Senha do certificado digital"
                                    className="bg-white/60 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <Separator />

                        {/* Ativação */}
                        <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/5">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className={`h-5 w-5 ${form.isActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                <div>
                                    <div className="text-sm font-medium">Certificado Ativo</div>
                                    <div className="text-xs text-muted-foreground">
                                        {form.isActive
                                            ? 'Este certificado será usado para assinatura de documentos fiscais.'
                                            : 'Ative este certificado para usá-lo na assinatura fiscal.'
                                        }
                                    </div>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(e) => {
                                        updateField('isActive', e.target.checked)
                                        if (e.target.checked) updateField('certificateStatus', 'active')
                                    }}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Mobile Save */}
            <div className="sm:hidden sticky bottom-4 z-10">
                <Button
                    className="w-full h-12 gradient-navy border-0 text-white text-base gap-2 shadow-lg"
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Salvar Certificado
                </Button>
            </div>
        </div>
    )
}
