'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
    Save,
    Loader2,
    Building2,
    MapPin,
    Phone,
    Mail,
    Landmark,
    FileText,
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
import { loadFiscalProfileAction, saveFiscalProfileAction } from './actions'
import { FiscalHelpText } from '../components/FiscalHelpText'
import type { CompanyFiscalProfile } from '@/lib/types'

// ====== Masks ======

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

function maskCNAE(value: string): string {
    return value
        .replace(/\D/g, '')
        .replace(/^(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d)(\d{2})/, '$1/$2')
        .slice(0, 9)
}

// ====== Form State ======

interface FormState {
    razaoSocial: string
    nomeFantasia: string
    cnpj: string
    inscricaoEstadual: string
    inscricaoMunicipal: string
    regimeTributario: string
    crt: string
    cnaePrincipal: string
    indicadorContribuinte: string
    fiscalEmail: string
    fiscalPhone: string
    fiscalAddress: string
    fiscalNumber: string
    fiscalComplement: string
    fiscalNeighborhood: string
    fiscalCity: string
    fiscalState: string
    fiscalZipCode: string
    fiscalMunicipalityCodeIbge: string
    fiscalCountryCode: string
}

const initialForm: FormState = {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    regimeTributario: '',
    crt: '',
    cnaePrincipal: '',
    indicadorContribuinte: 'contributor',
    fiscalEmail: '',
    fiscalPhone: '',
    fiscalAddress: '',
    fiscalNumber: '',
    fiscalComplement: '',
    fiscalNeighborhood: '',
    fiscalCity: '',
    fiscalState: '',
    fiscalZipCode: '',
    fiscalMunicipalityCodeIbge: '',
    fiscalCountryCode: '1058',
}

const REGIME_OPTIONS = [
    { value: 'simples_nacional', label: 'Simples Nacional' },
    { value: 'simples_excesso', label: 'Simples Nacional — Excesso de Sublimite' },
    { value: 'lucro_presumido', label: 'Lucro Presumido' },
    { value: 'lucro_real', label: 'Lucro Real' },
]

const CRT_MAP: Record<string, string> = {
    simples_nacional: '1',
    simples_excesso: '2',
    lucro_presumido: '3',
    lucro_real: '3',
}

const CONTRIBUINTE_OPTIONS = [
    { value: 'contributor', label: 'Contribuinte ICMS' },
    { value: 'non_contributor', label: 'Não Contribuinte' },
    { value: 'exempt', label: 'Isento' },
]

export default function FiscalEmitentePage() {
    const [profile, setProfile] = useState<CompanyFiscalProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<FormState>(initialForm)
    const [savedForm, setSavedForm] = useState<FormState>(initialForm)

    const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)

    const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm(prev => ({ ...prev, [key]: value }))
    }, [])

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const result = await loadFiscalProfileAction()
            if (result.data) {
                setProfile(result.data)
                const loaded: FormState = {
                    razaoSocial: result.data.razao_social || '',
                    nomeFantasia: result.data.nome_fantasia || '',
                    cnpj: maskCNPJ(result.data.cnpj || ''),
                    inscricaoEstadual: result.data.inscricao_estadual || '',
                    inscricaoMunicipal: result.data.inscricao_municipal || '',
                    regimeTributario: result.data.regime_tributario || '',
                    crt: result.data.crt || '',
                    cnaePrincipal: result.data.cnae_principal || '',
                    indicadorContribuinte: result.data.indicador_contribuinte || 'contributor',
                    fiscalEmail: result.data.fiscal_email || '',
                    fiscalPhone: result.data.fiscal_phone || '',
                    fiscalAddress: result.data.fiscal_address || '',
                    fiscalNumber: result.data.fiscal_number || '',
                    fiscalComplement: result.data.fiscal_complement || '',
                    fiscalNeighborhood: result.data.fiscal_neighborhood || '',
                    fiscalCity: result.data.fiscal_city || '',
                    fiscalState: result.data.fiscal_state || '',
                    fiscalZipCode: result.data.fiscal_zip_code || '',
                    fiscalMunicipalityCodeIbge: result.data.fiscal_municipality_code_ibge || '',
                    fiscalCountryCode: result.data.fiscal_country_code || '1058',
                }
                setForm(loaded)
                setSavedForm(loaded)
            }
            setLoading(false)
        }
        load()
    }, [])

    const handleRegimeChange = (value: string | null) => {
        updateField('regimeTributario', value || '')
        updateField('crt', CRT_MAP[value || ''] || '')
    }

    const handleSave = async () => {
        if (!form.razaoSocial.trim()) {
            toast.error('Razão Social é obrigatória.')
            return
        }
        const cnpjDigits = form.cnpj.replace(/\D/g, '')
        if (cnpjDigits.length !== 14) {
            toast.error('CNPJ deve ter 14 dígitos.')
            return
        }
        if (form.indicadorContribuinte === 'contributor' && !form.inscricaoEstadual.trim()) {
            toast.error('Inscrição Estadual é obrigatória para contribuinte ICMS.')
            return
        }

        setSaving(true)
        const result = await saveFiscalProfileAction({
            id: profile?.id,
            razao_social: form.razaoSocial,
            nome_fantasia: form.nomeFantasia || null,
            cnpj: cnpjDigits,
            inscricao_estadual: form.inscricaoEstadual || null,
            inscricao_municipal: form.inscricaoMunicipal || null,
            regime_tributario: form.regimeTributario || null,
            crt: form.crt || null,
            cnae_principal: form.cnaePrincipal || null,
            indicador_contribuinte: form.indicadorContribuinte,
            fiscal_email: form.fiscalEmail || null,
            fiscal_phone: form.fiscalPhone || null,
            fiscal_address: form.fiscalAddress || null,
            fiscal_number: form.fiscalNumber || null,
            fiscal_complement: form.fiscalComplement || null,
            fiscal_neighborhood: form.fiscalNeighborhood || null,
            fiscal_city: form.fiscalCity || null,
            fiscal_state: form.fiscalState || null,
            fiscal_zip_code: form.fiscalZipCode || null,
            fiscal_municipality_code_ibge: form.fiscalMunicipalityCodeIbge || null,
            fiscal_country_code: form.fiscalCountryCode || '1058',
        })

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Dados fiscais do emitente salvos com sucesso!')
            setSavedForm({ ...form })
        }
        setSaving(false)
    }

    if (loading) {
        return (
            <div className="space-y-6 max-w-4xl">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-96" />
                <Skeleton className="h-48 w-full rounded-xl" />
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
                        Dados Fiscais do Emitente
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Dados da empresa emissora para NF-e e documentos fiscais
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
                {/* Identificação Fiscal */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-bronze" />
                            Identificação Fiscal
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>
                                    Razão Social <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    value={form.razaoSocial}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('razaoSocial', e.target.value)}
                                    placeholder="Razão Social completa conforme contrato social"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Nome Fantasia</Label>
                                <Input
                                    value={form.nomeFantasia}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('nomeFantasia', e.target.value)}
                                    placeholder="Nome comercial"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>
                                    CNPJ <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    value={form.cnpj}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('cnpj', maskCNPJ(e.target.value))}
                                    placeholder="00.000.000/0000-00"
                                    className="bg-white/60"
                                    maxLength={18}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Inscrição Estadual
                                    {form.indicadorContribuinte === 'contributor' && (
                                        <span className="text-destructive">*</span>
                                    )}
                                    <FiscalHelpText text="Número de registro estadual da empresa. Obrigatório para contribuintes do ICMS. Use ISENTO se a empresa for isenta." />
                                </Label>
                                <Input
                                    value={form.inscricaoEstadual}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('inscricaoEstadual', e.target.value)}
                                    placeholder={form.indicadorContribuinte === 'exempt' ? 'ISENTO' : 'Ex: 123.456.789.012'}
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Inscrição Municipal
                                    <FiscalHelpText text="Cadastro municipal necessário para empresas que prestam serviços (ISS)." />
                                </Label>
                                <Input
                                    value={form.inscricaoMunicipal}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('inscricaoMunicipal', e.target.value)}
                                    placeholder="Registro municipal"
                                    className="bg-white/60"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Regime Tributário */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Landmark className="h-5 w-5 text-bronze" />
                            Regime Tributário
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Regime Tributário
                                    <FiscalHelpText text="Define como os impostos da empresa são calculados. Impacta diretamente os CSTs e alíquotas na emissão da NF-e." />
                                </Label>
                                <Select value={form.regimeTributario} onValueChange={handleRegimeChange}>
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REGIME_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    CRT — Código de Regime Tributário
                                    <FiscalHelpText text="Derivado automaticamente do Regime Tributário. 1 = Simples Nacional, 2 = Excesso de sublimite, 3 = Regime Normal." />
                                </Label>
                                <Input
                                    value={form.crt ? `${form.crt} — ${form.crt === '1' ? 'Simples Nacional' : form.crt === '2' ? 'Excesso Sublimite' : 'Regime Normal'}` : ''}
                                    disabled
                                    className="bg-muted/30"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    CNAE Principal
                                    <FiscalHelpText text="Classificação Nacional de Atividades Econômicas. Identifica a atividade principal da empresa no formato XXXX-X/XX." />
                                </Label>
                                <Input
                                    value={form.cnaePrincipal}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('cnaePrincipal', maskCNAE(e.target.value))}
                                    placeholder="0000-0/00"
                                    className="bg-white/60"
                                    maxLength={9}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    Indicador de Contribuinte
                                    <FiscalHelpText text="Define se a empresa é contribuinte do ICMS. Impacta o CFOP e a tributação das operações." />
                                </Label>
                                <Select value={form.indicadorContribuinte} onValueChange={(v) => updateField('indicadorContribuinte', v || 'contributor')}>
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONTRIBUINTE_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Contato Fiscal */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <Mail className="h-5 w-5 text-bronze" />
                            Contato Fiscal
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Mail className="h-3.5 w-3.5" />
                                    Email Fiscal
                                </Label>
                                <Input
                                    type="email"
                                    value={form.fiscalEmail}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalEmail', e.target.value)}
                                    placeholder="fiscal@empresa.com"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" />
                                    Telefone Fiscal
                                </Label>
                                <Input
                                    value={form.fiscalPhone}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalPhone', maskPhone(e.target.value))}
                                    placeholder="(00) 00000-0000"
                                    className="bg-white/60"
                                    maxLength={15}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Endereço Fiscal */}
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-bronze" />
                            Endereço Fiscal
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Logradouro</Label>
                                <Input
                                    value={form.fiscalAddress}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalAddress', e.target.value)}
                                    placeholder="Rua, Avenida, Travessa..."
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4 sm:col-span-2">
                                <div className="space-y-2">
                                    <Label>Número</Label>
                                    <Input
                                        value={form.fiscalNumber}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalNumber', e.target.value)}
                                        placeholder="Nº"
                                        className="bg-white/60"
                                    />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label>Complemento</Label>
                                    <Input
                                        value={form.fiscalComplement}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalComplement', e.target.value)}
                                        placeholder="Sala, Andar, Bloco..."
                                        className="bg-white/60"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Bairro</Label>
                                <Input
                                    value={form.fiscalNeighborhood}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalNeighborhood', e.target.value)}
                                    placeholder="Bairro"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>CEP</Label>
                                <Input
                                    value={form.fiscalZipCode}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalZipCode', maskCEP(e.target.value))}
                                    placeholder="00000-000"
                                    className="bg-white/60"
                                    maxLength={9}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Cidade</Label>
                                <Input
                                    value={form.fiscalCity}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalCity', e.target.value)}
                                    placeholder="Cidade"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>UF</Label>
                                    <Input
                                        value={form.fiscalState}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalState', e.target.value.toUpperCase().slice(0, 2))}
                                        placeholder="UF"
                                        className="bg-white/60"
                                        maxLength={2}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1">
                                        Cód. IBGE
                                        <FiscalHelpText text="Código do município no IBGE (7 dígitos). Utilizado na emissão de NF-e para identificar o município." />
                                    </Label>
                                    <Input
                                        value={form.fiscalMunicipalityCodeIbge}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('fiscalMunicipalityCodeIbge', e.target.value.replace(/\D/g, '').slice(0, 7))}
                                        placeholder="0000000"
                                        className="bg-white/60"
                                        maxLength={7}
                                    />
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                                País: Brasil (código {form.fiscalCountryCode})
                            </span>
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
                    Salvar Dados Fiscais
                </Button>
            </div>
        </div>
    )
}
