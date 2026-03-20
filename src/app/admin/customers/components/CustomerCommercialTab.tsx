'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Building2, CreditCard, Loader2, Save, ShieldAlert, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
    FINANCIAL_PROFILE_DESCRIPTIONS,
    FINANCIAL_PROFILE_LABELS,
    type FinancialProfile,
} from '@/lib/commercial/types'
import { getCustomerCommercialSetup, upsertCustomerCommercialSettings } from '../actions'

type PriceTableLookup = {
    id: string
    name: string
    is_default: boolean
    is_active: boolean
}

type PaymentMethodLookup = {
    id: string
    code: string
    name: string
    is_active: boolean
}

type PaymentConditionLookup = {
    id: string
    name: string
    installments: number
    is_active: boolean
}

type PaymentMethodConditionLookup = {
    id: string
    payment_method_id: string
    payment_condition_id: string
    is_active: boolean
}

type RepresentativeLookup = {
    id: string
    full_name: string
    role: string
}

type CommercialSettingsResponse = {
    id?: string
    store_id?: string
    override_price_table_id?: string | null
    override_payment_method_id?: string | null
    override_payment_condition_id?: string | null
    financial_profile?: string | null
    max_discount_percentage?: number | null
    credit_limit?: number | null
    commercial_notes?: string | null
}

type FormState = {
    overridePriceTableId: string
    overridePaymentMethodId: string
    overridePaymentConditionId: string
    financialProfile: FinancialProfile
    maxDiscountPercentage: string
    creditLimit: string
    commercialNotes: string
    representativeId: string
}

const EMPTY_FORM: FormState = {
    overridePriceTableId: '',
    overridePaymentMethodId: '',
    overridePaymentConditionId: '',
    financialProfile: 'no_restriction',
    maxDiscountPercentage: '',
    creditLimit: '',
    commercialNotes: '',
    representativeId: '',
}

interface CustomerCommercialTabProps {
    storeId: string
    initialRepresentativeId?: string | null
    onRepresentativeUpdated?: (representativeId: string | null) => void
}

function mapSettingsToForm(
    settings: CommercialSettingsResponse | null,
    representativeId: string | null | undefined
): FormState {
    return {
        overridePriceTableId: settings?.override_price_table_id || '',
        overridePaymentMethodId: settings?.override_payment_method_id || '',
        overridePaymentConditionId: settings?.override_payment_condition_id || '',
        financialProfile:
            settings?.financial_profile === 'cash_only' || settings?.financial_profile === 'block_sales'
                ? settings.financial_profile
                : 'no_restriction',
        maxDiscountPercentage:
            settings?.max_discount_percentage !== null &&
            settings?.max_discount_percentage !== undefined
                ? String(settings.max_discount_percentage)
                : '',
        creditLimit:
            settings?.credit_limit !== null && settings?.credit_limit !== undefined
                ? String(settings.credit_limit)
                : '',
        commercialNotes: settings?.commercial_notes || '',
        representativeId: representativeId || '',
    }
}

export function CustomerCommercialTab({
    storeId,
    initialRepresentativeId,
    onRepresentativeUpdated,
}: CustomerCommercialTabProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [schemaReady, setSchemaReady] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [priceTables, setPriceTables] = useState<PriceTableLookup[]>([])
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethodLookup[]>([])
    const [paymentConditions, setPaymentConditions] = useState<PaymentConditionLookup[]>([])
    const [paymentMethodConditions, setPaymentMethodConditions] = useState<
        PaymentMethodConditionLookup[]
    >([])
    const [representatives, setRepresentatives] = useState<RepresentativeLookup[]>([])

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await getCustomerCommercialSetup(storeId)
            if (!('data' in response) || !response.data) {
                setError('error' in response ? response.error || 'Falha ao carregar.' : 'Falha ao carregar.')
                return
            }

            const setup = response.data
            setSchemaReady(Boolean(setup.schemaReady))
            setPriceTables((setup.lookups.priceTables || []) as PriceTableLookup[])
            setPaymentMethods((setup.lookups.paymentMethods || []) as PaymentMethodLookup[])
            setPaymentConditions((setup.lookups.paymentConditions || []) as PaymentConditionLookup[])
            setPaymentMethodConditions(
                (setup.lookups.paymentMethodConditions || []) as PaymentMethodConditionLookup[]
            )
            setRepresentatives((setup.lookups.representatives || []) as RepresentativeLookup[])
            setForm(mapSettingsToForm((setup.settings || null) as CommercialSettingsResponse | null, initialRepresentativeId))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar configuracoes comerciais.')
        } finally {
            setLoading(false)
        }
    }, [initialRepresentativeId, storeId])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const availableConditions = useMemo(() => {
        if (!form.overridePaymentMethodId) return paymentConditions

        const allowedConditionIds = new Set(
            paymentMethodConditions
                .filter(
                    (link) => link.is_active && link.payment_method_id === form.overridePaymentMethodId
                )
                .map((link) => link.payment_condition_id)
        )

        return paymentConditions.filter((condition) => allowedConditionIds.has(condition.id))
    }, [form.overridePaymentMethodId, paymentConditions, paymentMethodConditions])

    useEffect(() => {
        if (!form.overridePaymentConditionId) return

        const stillAvailable = availableConditions.some(
            (condition) => condition.id === form.overridePaymentConditionId
        )

        if (!stillAvailable) {
            setForm((previous) => ({
                ...previous,
                overridePaymentConditionId: '',
            }))
        }
    }, [availableConditions, form.overridePaymentConditionId])

    const hasPriceTableOverride = Boolean(form.overridePriceTableId)
    const hasPaymentOverride = Boolean(form.overridePaymentMethodId || form.overridePaymentConditionId)
    const selectedPriceTableLabel = useMemo(() => {
        if (!form.overridePriceTableId) return 'Padrao do sistema'
        const table = priceTables.find((item) => item.id === form.overridePriceTableId)
        if (!table) return 'Tabela selecionada'
        return `${table.name}${table.is_default ? ' (padrao)' : ''}`
    }, [form.overridePriceTableId, priceTables])

    const selectedPaymentMethodLabel = useMemo(() => {
        if (!form.overridePaymentMethodId) return 'Padrao do sistema'
        const method = paymentMethods.find((item) => item.id === form.overridePaymentMethodId)
        return method?.name || 'Meio selecionado'
    }, [form.overridePaymentMethodId, paymentMethods])

    const selectedPaymentConditionLabel = useMemo(() => {
        if (!form.overridePaymentConditionId) return 'Padrao do sistema'
        const condition = availableConditions.find((item) => item.id === form.overridePaymentConditionId)
        if (!condition) return 'Condicao selecionada'
        return `${condition.name} (${condition.installments}x)`
    }, [availableConditions, form.overridePaymentConditionId])

    const selectedRepresentativeLabel = useMemo(() => {
        if (!form.representativeId) return 'Sem representante'
        const representative = representatives.find((item) => item.id === form.representativeId)
        return representative?.full_name || 'Representante selecionado'
    }, [form.representativeId, representatives])

    const handleSave = async () => {
        setSaving(true)
        try {
            const maxDiscount =
                form.maxDiscountPercentage.trim().length > 0
                    ? Number(form.maxDiscountPercentage.replace(',', '.'))
                    : null
            const creditLimit =
                form.creditLimit.trim().length > 0
                    ? Number(form.creditLimit.replace(',', '.'))
                    : null

            const result = await upsertCustomerCommercialSettings({
                storeId,
                overridePriceTableId: form.overridePriceTableId || null,
                overridePaymentMethodId: form.overridePaymentMethodId || null,
                overridePaymentConditionId: form.overridePaymentConditionId || null,
                financialProfile: form.financialProfile,
                maxDiscountPercentage: maxDiscount,
                creditLimit,
                commercialNotes: form.commercialNotes || null,
                representativeId: form.representativeId || null,
            })

            if (!('success' in result) || !result.success) {
                toast.error('error' in result ? result.error || 'Falha ao salvar.' : 'Falha ao salvar.')
                return
            }

            onRepresentativeUpdated?.(form.representativeId || null)
            toast.success('Configuracoes comerciais salvas com sucesso.')
            await loadData()
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-3">
                <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadData()}>
                    Tentar novamente
                </Button>
            </div>
        )
    }

    if (!schemaReady) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-amber-700" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800">
                            Banco desatualizado para Financeiro/Comercial
                        </p>
                        <p className="mt-1 text-sm text-amber-700">
                            Aplique a migration `031_store_commercial_settings.sql` para habilitar esta aba.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        variant={hasPriceTableOverride ? 'default' : 'outline'}
                        className={cn(
                            hasPriceTableOverride ? 'bg-navy text-white' : 'text-slate-600',
                            'rounded-full'
                        )}
                    >
                        Tabela de preco: {hasPriceTableOverride ? 'Override ativo' : 'Padrao do sistema'}
                    </Badge>
                    <Badge
                        variant={hasPaymentOverride ? 'default' : 'outline'}
                        className={cn(
                            hasPaymentOverride ? 'bg-bronze text-white' : 'text-slate-600',
                            'rounded-full'
                        )}
                    >
                        Pagamento: {hasPaymentOverride ? 'Override ativo' : 'Padrao do sistema'}
                    </Badge>
                    <Badge
                        variant="outline"
                        className={cn(
                            'rounded-full',
                            form.financialProfile === 'block_sales'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : form.financialProfile === 'cash_only'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        )}
                    >
                        Perfil financeiro: {FINANCIAL_PROFILE_LABELS[form.financialProfile]}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-navy">
                        <Building2 className="h-4 w-4" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                            Configuracoes Comerciais
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <Label>Tabela de preco especifica</Label>
                        <Select
                            value={form.overridePriceTableId || '__default__'}
                            onValueChange={(value: string | null) =>
                                setForm((previous) => ({
                                    ...previous,
                                    overridePriceTableId:
                                        value && value !== '__default__' ? value : '',
                                }))
                            }
                        >
                            <SelectTrigger className="h-10 rounded-lg">
                                <SelectValue>{selectedPriceTableLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__">Padrao do sistema</SelectItem>
                                {priceTables
                                    .filter((table) => table.is_active)
                                    .map((table) => (
                                        <SelectItem key={table.id} value={table.id}>
                                            {table.name}
                                            {table.is_default ? ' (padrao)' : ''}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Desconto maximo (%)</Label>
                        <Input
                            value={form.maxDiscountPercentage}
                            onChange={(event) =>
                                setForm((previous) => ({
                                    ...previous,
                                    maxDiscountPercentage: event.target.value,
                                }))
                            }
                            placeholder="Ex.: 10"
                            inputMode="decimal"
                        />
                    </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-navy">
                        <CreditCard className="h-4 w-4" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                            Condicoes e Pagamento
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <Label>Meio de pagamento especifico</Label>
                        <Select
                            value={form.overridePaymentMethodId || '__default__'}
                            onValueChange={(value: string | null) =>
                                setForm((previous) => ({
                                    ...previous,
                                    overridePaymentMethodId:
                                        value && value !== '__default__' ? value : '',
                                }))
                            }
                        >
                            <SelectTrigger className="h-10 rounded-lg">
                                <SelectValue>{selectedPaymentMethodLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__">Padrao do sistema</SelectItem>
                                {paymentMethods
                                    .filter((method) => method.is_active)
                                    .map((method) => (
                                        <SelectItem key={method.id} value={method.id}>
                                            {method.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Condicao de pagamento especifica</Label>
                        <Select
                            value={form.overridePaymentConditionId || '__default__'}
                            onValueChange={(value: string | null) =>
                                setForm((previous) => ({
                                    ...previous,
                                    overridePaymentConditionId:
                                        value && value !== '__default__' ? value : '',
                                }))
                            }
                        >
                            <SelectTrigger className="h-10 rounded-lg">
                                <SelectValue>{selectedPaymentConditionLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__default__">Padrao do sistema</SelectItem>
                                {availableConditions
                                    .filter((condition) => condition.is_active)
                                    .map((condition) => (
                                        <SelectItem key={condition.id} value={condition.id}>
                                            {condition.name} ({condition.installments}x)
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                </section>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-navy">
                        <ShieldAlert className="h-4 w-4" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                            Restricoes Financeiras
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <Label>Perfil Financeiro</Label>
                        <Select
                            value={form.financialProfile}
                            onValueChange={(value) =>
                                setForm((previous) => ({
                                    ...previous,
                                    financialProfile: value as FinancialProfile,
                                }))
                            }
                        >
                            <SelectTrigger className="h-10 rounded-lg">
                                <SelectValue>{FINANCIAL_PROFILE_LABELS[form.financialProfile]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="no_restriction">Sem Restricao</SelectItem>
                                <SelectItem value="cash_only">Somente a vista</SelectItem>
                                <SelectItem value="block_sales">Restringir todas as vendas</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {FINANCIAL_PROFILE_DESCRIPTIONS[form.financialProfile]}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Limite de credito (R$)</Label>
                        <Input
                            value={form.creditLimit}
                            onChange={(event) =>
                                setForm((previous) => ({
                                    ...previous,
                                    creditLimit: event.target.value,
                                }))
                            }
                            placeholder="Ex.: 50000"
                            inputMode="decimal"
                        />
                    </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-navy">
                        <UserRound className="h-4 w-4" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                            Vinculos e Observacoes
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <Label>Representante vinculado</Label>
                        <Select
                            value={form.representativeId || '__none__'}
                            onValueChange={(value: string | null) =>
                                setForm((previous) => ({
                                    ...previous,
                                    representativeId: value && value !== '__none__' ? value : '',
                                }))
                            }
                        >
                            <SelectTrigger className="h-10 rounded-lg">
                                <SelectValue>{selectedRepresentativeLabel}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Sem representante</SelectItem>
                                {representatives.map((representative) => (
                                    <SelectItem key={representative.id} value={representative.id}>
                                        {representative.full_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Observacoes comerciais</Label>
                        <Textarea
                            value={form.commercialNotes}
                            onChange={(event) =>
                                setForm((previous) => ({
                                    ...previous,
                                    commercialNotes: event.target.value,
                                }))
                            }
                            rows={5}
                            placeholder="Acordos comerciais, regras especiais e observacoes internas."
                            className="resize-none"
                        />
                    </div>
                </section>
            </div>

            <Separator />

            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="h-10 rounded-lg gradient-navy border-0 text-white"
                >
                    {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar configuracoes
                </Button>
            </div>
        </div>
    )
}
