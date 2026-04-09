'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Save,
    Loader2,
    Gauge,
    AlertTriangle,
    CheckCircle2,
    Shield,
    Radio,
    Hash,
    Power,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { loadFiscalEnvironmentAction, saveFiscalEnvironmentAction } from './actions'
import { FiscalHelpText } from '../components/FiscalHelpText'
import type { CompanyFiscalEnvironment } from '@/lib/types'

// ====== Form State ======

interface FormState {
    ambiente: string
    seriePadraoNfe: string
    proximoNumeroNfe: string
    tipoEmissao: string
    emissaoAtiva: boolean
}

const initialForm: FormState = {
    ambiente: 'homologacao',
    seriePadraoNfe: '1',
    proximoNumeroNfe: '1',
    tipoEmissao: 'normal',
    emissaoAtiva: false,
}

const TIPO_EMISSAO_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'contingencia_scan', label: 'Contingência SCAN' },
    { value: 'contingencia_dpec', label: 'Contingência DPEC' },
    { value: 'contingencia_fsda', label: 'Contingência FS-DA' },
    { value: 'contingencia_svcan', label: 'Contingência SVC-AN' },
    { value: 'contingencia_svcrs', label: 'Contingência SVC-RS' },
]

export default function FiscalAmbientePage() {
    const [env, setEnv] = useState<CompanyFiscalEnvironment | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<FormState>(initialForm)
    const [savedForm, setSavedForm] = useState<FormState>(initialForm)
    const [confirmProducao, setConfirmProducao] = useState(false)
    const [pendingAmbiente, setPendingAmbiente] = useState<string | null>(null)

    const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)

    const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }, [])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const result = await loadFiscalEnvironmentAction()
            if (result.data) {
                setEnv(result.data)
                const loaded: FormState = {
                    ambiente: result.data.ambiente || 'homologacao',
                    seriePadraoNfe: result.data.serie_padrao_nfe || '1',
                    proximoNumeroNfe: result.data.proximo_numero_nfe?.toString() || '1',
                    tipoEmissao: result.data.tipo_emissao || 'normal',
                    emissaoAtiva: result.data.emissao_ativa || false,
                }
                setForm(loaded)
                setSavedForm(loaded)
            }
            setLoading(false)
        }
        load()
    }, [])

    const handleAmbienteChange = (value: string) => {
        if (value === 'producao' && form.ambiente !== 'producao') {
            setPendingAmbiente(value)
            setConfirmProducao(true)
        } else {
            updateField('ambiente', value)
        }
    }

    const handleConfirmProducao = () => {
        if (pendingAmbiente) {
            updateField('ambiente', pendingAmbiente)
        }
        setConfirmProducao(false)
        setPendingAmbiente(null)
    }

    const handleSave = async () => {
        setSaving(true)
        const result = await saveFiscalEnvironmentAction({
            id: env?.id,
            ambiente: form.ambiente,
            serie_padrao_nfe: form.seriePadraoNfe,
            proximo_numero_nfe: parseInt(form.proximoNumeroNfe) || 1,
            tipo_emissao: form.tipoEmissao,
            emissao_ativa: form.emissaoAtiva,
        })

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Configuração fiscal salva com sucesso!')
            setSavedForm({ ...form })
        }
        setSaving(false)
    }

    if (loading) {
        return (
            <div className="space-y-6 max-w-4xl">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Configuração Fiscal
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Parâmetros de ambiente, série e numeração para emissão fiscal
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
                {/* Ambiente de Emissão */}
                <Card className="glass-card border-0 overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Radio className="h-5 w-5 text-bronze" />
                            Ambiente de Emissão
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Toggle Visual */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={() => handleAmbienteChange('homologacao')}
                                className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                                    form.ambiente === 'homologacao'
                                        ? 'border-blue-500 bg-blue-50 shadow-md'
                                        : 'border-muted/40 bg-muted/10 hover:border-muted/60'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                        form.ambiente === 'homologacao' ? 'bg-blue-500' : 'bg-muted/30'
                                    }`}>
                                        <Shield className={`h-5 w-5 ${form.ambiente === 'homologacao' ? 'text-white' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div>
                                        <div className={`font-semibold ${form.ambiente === 'homologacao' ? 'text-blue-700' : 'text-muted-foreground'}`}>
                                            Homologação
                                        </div>
                                        <div className="text-xs text-muted-foreground">Ambiente de testes</div>
                                    </div>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAmbienteChange('producao')}
                                className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                                    form.ambiente === 'producao'
                                        ? 'border-emerald-500 bg-emerald-50 shadow-md'
                                        : 'border-muted/40 bg-muted/10 hover:border-muted/60'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                        form.ambiente === 'producao' ? 'bg-emerald-500' : 'bg-muted/30'
                                    }`}>
                                        <CheckCircle2 className={`h-5 w-5 ${form.ambiente === 'producao' ? 'text-white' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div>
                                        <div className={`font-semibold ${form.ambiente === 'producao' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                                            Produção
                                        </div>
                                        <div className="text-xs text-muted-foreground">Notas com validade jurídica</div>
                                    </div>
                                </div>
                            </button>
                        </div>

                        <AnimatePresence>
                            {form.ambiente === 'homologacao' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm"
                                >
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>As notas emitidas em homologação <strong>não possuem validade jurídica</strong>. Use para testes e validações.</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </CardContent>
                </Card>

                {/* Séries e Numeração */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Hash className="h-5 w-5 text-bronze" />
                            Séries e Numeração
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Série Padrão da NF-e
                                    <FiscalHelpText text="Número da série da NF-e. O padrão é 1. Pode ser alterado se a empresa emite em múltiplas séries." />
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max="999"
                                    value={form.seriePadraoNfe}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('seriePadraoNfe', e.target.value)}
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Próximo Número da NF-e
                                    <FiscalHelpText text="Número a ser usado na próxima NF-e emitida. O sistema incrementa automaticamente após cada emissão." />
                                </Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={form.proximoNumeroNfe}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('proximoNumeroNfe', e.target.value)}
                                    className="bg-white/60"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Parâmetros Operacionais */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Gauge className="h-5 w-5 text-bronze" />
                            Parâmetros Operacionais
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Tipo de Emissão
                                    <FiscalHelpText text="Modo de emissão da NF-e. Use 'Normal' para operação padrão. Os modos de contingência são usados quando o serviço da Sefaz está indisponível." />
                                </Label>
                                <Select value={form.tipoEmissao} onValueChange={(v) => updateField('tipoEmissao', v || 'normal')}>
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TIPO_EMISSAO_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/5">
                            <div className="flex items-center gap-3">
                                <Power className={`h-5 w-5 ${form.emissaoAtiva ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                <div>
                                    <div className="text-sm font-medium">Emissão Ativa</div>
                                    <div className="text-xs text-muted-foreground">
                                        {form.emissaoAtiva
                                            ? 'O sistema está autorizado a emitir NF-e.'
                                            : 'A emissão de NF-e está desativada em todo o sistema.'
                                        }
                                    </div>
                                </div>
                            </div>
                            <Switch
                                checked={form.emissaoAtiva}
                                onCheckedChange={v => updateField('emissaoAtiva', v)}
                            />
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
                    Salvar Configuração
                </Button>
            </div>

            {/* Confirm Produção Dialog */}
            <AlertDialog open={confirmProducao} onOpenChange={setConfirmProducao}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Confirmar Ambiente de Produção
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Ao mudar para <strong>Produção</strong>, as notas fiscais emitidas terão <strong>validade jurídica</strong> e serão transmitidas à Sefaz.
                            <br /><br />
                            Certifique-se de que todos os dados fiscais da empresa estão corretos antes de prosseguir.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmProducao} className="bg-emerald-600 hover:bg-emerald-700">
                            Confirmar Produção
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
