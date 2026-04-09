'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
    Save,
    Loader2,
    Landmark,
    ArrowRight,
    Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { loadEmitterFederalTaxConfig, saveEmitterFederalTaxConfig } from '../emitter-taxes'
import { loadFiscalProfileAction } from '../actions'
import { FiscalHelpText } from '../../components/FiscalHelpText'
import type { EmitterFederalTaxConfig } from '@/lib/types'
import Link from 'next/link'

// ====== Constants ======

const ARTIGO_SC_MVA_OPTIONS = [
    { value: 'nenhum', label: 'Nenhum' },
    { value: 'artigo_8', label: 'Artigo 8°' },
    { value: 'artigo_9', label: 'Artigo 9°' },
    { value: 'artigo_10', label: 'Artigo 10' },
]

const REGIME_LABELS: Record<string, string> = {
    simples_nacional: 'Simples Nacional',
    simples_excesso: 'Simples Nacional — Excesso de Sublimite',
    lucro_presumido: 'Lucro Presumido',
    lucro_real: 'Lucro Real',
}

// ====== Form State ======

interface FederalFormState {
    aliquotaPis: string
    aliquotaCofins: string
    artigoScMva: string
    exibirTotalTributos: boolean
    creditoPresumidoIcms: boolean
    ultrapassouSublimite: boolean
}

const initialFederalForm: FederalFormState = {
    aliquotaPis: '0',
    aliquotaCofins: '0',
    artigoScMva: 'nenhum',
    exibirTotalTributos: true,
    creditoPresumidoIcms: false,
    ultrapassouSublimite: false,
}

export function EmitterFederalTaxesSection() {
    const [config, setConfig] = useState<EmitterFederalTaxConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<FederalFormState>(initialFederalForm)
    const [savedForm, setSavedForm] = useState<FederalFormState>(initialFederalForm)
    const [regimeTributario, setRegimeTributario] = useState<string>('')

    const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)

    const updateField = useCallback(<K extends keyof FederalFormState>(key: K, value: FederalFormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }, [])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const [taxResult, profileResult] = await Promise.all([
                loadEmitterFederalTaxConfig(),
                loadFiscalProfileAction(),
            ])

            if (profileResult.data?.regime_tributario) {
                setRegimeTributario(profileResult.data.regime_tributario)
            }

            if (taxResult.data) {
                setConfig(taxResult.data)
                const loaded: FederalFormState = {
                    aliquotaPis: taxResult.data.aliquota_pis?.toString() || '0',
                    aliquotaCofins: taxResult.data.aliquota_cofins?.toString() || '0',
                    artigoScMva: taxResult.data.artigo_sc_mva || 'nenhum',
                    exibirTotalTributos: taxResult.data.exibir_total_tributos,
                    creditoPresumidoIcms: taxResult.data.credito_presumido_icms,
                    ultrapassouSublimite: taxResult.data.ultrapassou_sublimite,
                }
                setForm(loaded)
                setSavedForm(loaded)
            }
            setLoading(false)
        }
        load()
    }, [])

    const handleSave = async () => {
        const pis = parseFloat(form.aliquotaPis.replace(',', '.'))
        const cofins = parseFloat(form.aliquotaCofins.replace(',', '.'))

        if (isNaN(pis) || pis < 0 || pis > 100) {
            toast.error('Alíquota PIS deve ser um valor entre 0 e 100.')
            return
        }
        if (isNaN(cofins) || cofins < 0 || cofins > 100) {
            toast.error('Alíquota COFINS deve ser um valor entre 0 e 100.')
            return
        }

        setSaving(true)
        const result = await saveEmitterFederalTaxConfig({
            id: config?.id,
            aliquota_pis: pis,
            aliquota_cofins: cofins,
            artigo_sc_mva: form.artigoScMva,
            exibir_total_tributos: form.exibirTotalTributos,
            credito_presumido_icms: form.creditoPresumidoIcms,
            ultrapassou_sublimite: form.ultrapassouSublimite,
        })

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Impostos federais salvos com sucesso!')
            setSavedForm({ ...form })
        }
        setSaving(false)
    }

    if (loading) {
        return (
            <Card className="glass-card border-0">
                <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-6 w-48" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="glass-card border-0">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-heading flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-bronze" />
                        Impostos Federais
                    </CardTitle>
                    {hasChanges && (
                        <Button
                            size="sm"
                            className="gradient-navy border-0 text-white gap-1.5"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Salvar
                        </Button>
                    )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                    Preencha os campos a seguir para configurar os impostos da empresa emitente.
                </p>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Regime Tributário — Read-only */}
                <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/5">
                    <div className="flex items-center gap-3">
                        <Info className="h-5 w-5 text-muted-foreground/50" />
                        <div>
                            <div className="text-sm font-medium">Regime Tributário</div>
                            <div className="text-xs text-muted-foreground">
                                {regimeTributario
                                    ? REGIME_LABELS[regimeTributario] || regimeTributario
                                    : 'Não definido — configure nos Dados Cadastrais'}
                            </div>
                        </div>
                    </div>
                    <Link
                        href="/admin/settings/fiscal-emitente"
                        className="text-xs text-bronze hover:text-bronze/80 flex items-center gap-1"
                        onClick={(e) => {
                            e.preventDefault()
                            // Scroll to top / switch tab in parent
                            window.dispatchEvent(new CustomEvent('switch-emitente-tab', { detail: 'cadastro' }))
                        }}
                    >
                        Alterar
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>

                {/* Alíquotas PIS e COFINS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            Alíquota PIS *
                            <FiscalHelpText text="Informe a alíquota de PIS aplicável nas operações da empresa. Exemplo: 0,65 para Lucro Presumido ou 1,65 para Lucro Real." />
                        </Label>
                        <Input
                            type="text"
                            inputMode="decimal"
                            value={form.aliquotaPis}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('aliquotaPis', e.target.value)}
                            placeholder="0,65"
                            className="bg-white/60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            Alíquota COFINS *
                            <FiscalHelpText text="Informe a alíquota de COFINS aplicável nas operações da empresa. Exemplo: 3,00 para Lucro Presumido ou 7,60 para Lucro Real." />
                        </Label>
                        <Input
                            type="text"
                            inputMode="decimal"
                            value={form.aliquotaCofins}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('aliquotaCofins', e.target.value)}
                            placeholder="3,00"
                            className="bg-white/60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            Artigo SC - MVA
                            <FiscalHelpText text="De acordo com o Decreto nº 3.467 de Santa Catarina, indica se esta empresa se enquadra em um dos artigos que alteram a MVA para fins de ICMS-ST." />
                        </Label>
                        <Select
                            value={form.artigoScMva}
                            onValueChange={(v) => updateField('artigoScMva', v || 'nenhum')}
                        >
                            <SelectTrigger className="bg-white/60">
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                {ARTIGO_SC_MVA_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Separator />

                {/* Toggles */}
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-0">
                    {/* Total dos tributos */}
                    <div className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/5 transition-colors">
                        <div>
                            <div className="text-sm font-medium">Total dos tributos nos documentos fiscais</div>
                            <div className="text-xs text-muted-foreground max-w-xl">
                                Exibir o total dos tributos nos documentos fiscais, conforme a Lei nº 12.741, tais como o valor aproximado correspondente à totalidade dos tributos federais, estaduais e municipais.
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                            <input
                                type="checkbox"
                                checked={form.exibirTotalTributos}
                                onChange={(e) => updateField('exibirTotalTributos', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>

                    {/* Crédito presumido */}
                    <div className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/5 transition-colors">
                        <div>
                            <div className="text-sm font-medium">Aproveitamento de crédito presumido</div>
                            <div className="text-xs text-muted-foreground max-w-xl">
                                Marque esta opção para permitir a geração do aproveitamento de crédito presumido de ICMS nas operações fiscais da empresa.
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                            <input
                                type="checkbox"
                                checked={form.creditoPresumidoIcms}
                                onChange={(e) => updateField('creditoPresumidoIcms', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>

                    {/* Sublimite */}
                    <div className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/5 transition-colors">
                        <div>
                            <div className="text-sm font-medium">Ultrapassou o sublimite de receita bruta</div>
                            <div className="text-xs text-muted-foreground max-w-xl">
                                Marque esta opção quando a empresa ultrapassar o sublimite de receita bruta do Simples Nacional, o que impacta a forma de cálculo do ICMS e ISS.
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                            <input
                                type="checkbox"
                                checked={form.ultrapassouSublimite}
                                onChange={(e) => updateField('ultrapassouSublimite', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                    </div>
                </motion.div>
            </CardContent>
        </Card>
    )
}
