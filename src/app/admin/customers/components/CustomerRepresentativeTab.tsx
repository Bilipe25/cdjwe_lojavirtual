'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, BadgeCheck, Loader2, Save, Search, Shield, Tag, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { getRepresentativeCommercialSetup, upsertRepresentativeCommercialSettings } from '../actions'

type PriceTableLookup = {
    id: string
    name: string
    discount_percentage: number
    is_default: boolean
    is_active: boolean
}

type RepresentativeSettingsResponse = {
    max_discount_percentage?: number | null
    allow_free_negotiation?: boolean | null
    can_override_price_table?: boolean | null
    notes?: string | null
}

type AccessPolicyResponse = {
    scopeMode?: 'assigned_only' | 'all_admin_portfolio' | 'filtered_portfolio'
    allowedStates?: string[]
    allowedCities?: string[]
}

type FormState = {
    maxDiscountPercentage: string
    allowFreeNegotiation: boolean
    canOverridePriceTable: boolean
    notes: string
    allowedPriceTableIds: string[]
    customerAccessMode: 'assigned_only' | 'all_admin_portfolio' | 'filtered_portfolio'
    allowedStates: string[]
    allowedCities: string[]
}

const EMPTY_FORM: FormState = {
    maxDiscountPercentage: '',
    allowFreeNegotiation: true,
    canOverridePriceTable: true,
    notes: '',
    allowedPriceTableIds: [],
    customerAccessMode: 'assigned_only',
    allowedStates: [],
    allowedCities: [],
}

function mapSettingsToForm(
    settings: RepresentativeSettingsResponse | null,
    allowedPriceTableIds: string[],
    accessPolicy: AccessPolicyResponse
): FormState {
    return {
        maxDiscountPercentage:
            settings?.max_discount_percentage !== null &&
            settings?.max_discount_percentage !== undefined
                ? String(settings.max_discount_percentage)
                : '',
        allowFreeNegotiation: settings?.allow_free_negotiation !== false,
        canOverridePriceTable: settings?.can_override_price_table !== false,
        notes: settings?.notes || '',
        allowedPriceTableIds,
        customerAccessMode: accessPolicy.scopeMode || 'assigned_only',
        allowedStates: accessPolicy.allowedStates || [],
        allowedCities: accessPolicy.allowedCities || [],
    }
}

interface CustomerRepresentativeTabProps {
    profileId: string
}

export function CustomerRepresentativeTab({ profileId }: CustomerRepresentativeTabProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [schemaReady, setSchemaReady] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [stateSearch, setStateSearch] = useState('')
    const [citySearch, setCitySearch] = useState('')
    const [assignedCustomers, setAssignedCustomers] = useState(0)
    const [priceTables, setPriceTables] = useState<PriceTableLookup[]>([])
    const [availableStates, setAvailableStates] = useState<string[]>([])
    const [availableCities, setAvailableCities] = useState<string[]>([])
    const [form, setForm] = useState<FormState>(EMPTY_FORM)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await getRepresentativeCommercialSetup(profileId)
            if (!('data' in response) || !response.data) {
                setError('error' in response ? response.error || 'Falha ao carregar.' : 'Falha ao carregar.')
                return
            }

            const setup = response.data
            setSchemaReady(Boolean(setup.schemaReady))
            setAssignedCustomers(Number(setup.stats?.assignedCustomers || 0))
            setPriceTables((setup.lookups?.priceTables || []) as PriceTableLookup[])
            setAvailableStates((setup.lookups?.availableStates || []) as string[])
            setAvailableCities((setup.lookups?.availableCities || []) as string[])
            setForm(
                mapSettingsToForm(
                    (setup.settings || null) as RepresentativeSettingsResponse | null,
                    (setup.allowedPriceTableIds || []) as string[],
                    {
                        scopeMode: setup.accessPolicy?.scopeMode,
                        allowedStates: setup.accessPolicy?.allowedStates || [],
                        allowedCities: setup.accessPolicy?.allowedCities || [],
                    }
                )
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar configuracao do representante.')
        } finally {
            setLoading(false)
        }
    }, [profileId])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const filteredPriceTables = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return priceTables
        return priceTables.filter((table) => table.name.toLowerCase().includes(term))
    }, [priceTables, search])

    const filteredStates = useMemo(() => {
        const term = stateSearch.trim().toLowerCase()
        if (!term) return availableStates
        return availableStates.filter((state) => state.toLowerCase().includes(term))
    }, [availableStates, stateSearch])

    const filteredCities = useMemo(() => {
        const term = citySearch.trim().toLowerCase()
        if (!term) return availableCities
        return availableCities.filter((city) => city.toLowerCase().includes(term))
    }, [availableCities, citySearch])

    const allowedCount = form.allowedPriceTableIds.length
    const activeAllowedCount = form.allowedPriceTableIds.filter((id) =>
        priceTables.some((table) => table.id === id && table.is_active)
    ).length

    const togglePriceTable = (tableId: string) => {
        setForm((previous) => {
            const hasTable = previous.allowedPriceTableIds.includes(tableId)
            return {
                ...previous,
                allowedPriceTableIds: hasTable
                    ? previous.allowedPriceTableIds.filter((id) => id !== tableId)
                    : [...previous.allowedPriceTableIds, tableId],
            }
        })
    }

    const handleSelectAllActive = () => {
        setForm((previous) => ({
            ...previous,
            allowedPriceTableIds: priceTables.filter((table) => table.is_active).map((table) => table.id),
        }))
    }

    const handleClearAll = () => {
        setForm((previous) => ({
            ...previous,
            allowedPriceTableIds: [],
        }))
    }

    const toggleState = (state: string) => {
        setForm((previous) => {
            const alreadySelected = previous.allowedStates.includes(state)
            return {
                ...previous,
                allowedStates: alreadySelected
                    ? previous.allowedStates.filter((value) => value !== state)
                    : [...previous.allowedStates, state],
            }
        })
    }

    const toggleCity = (city: string) => {
        setForm((previous) => {
            const alreadySelected = previous.allowedCities.includes(city)
            return {
                ...previous,
                allowedCities: alreadySelected
                    ? previous.allowedCities.filter((value) => value !== city)
                    : [...previous.allowedCities, city],
            }
        })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const maxDiscount =
                form.maxDiscountPercentage.trim().length > 0
                    ? Number(form.maxDiscountPercentage.replace(',', '.'))
                    : null

            if (
                form.customerAccessMode === 'filtered_portfolio' &&
                form.allowedStates.length === 0 &&
                form.allowedCities.length === 0
            ) {
                toast.error('Selecione ao menos um estado ou cidade para o escopo filtrado.')
                return
            }

            const result = await upsertRepresentativeCommercialSettings({
                profileId,
                maxDiscountPercentage: maxDiscount,
                allowFreeNegotiation: form.allowFreeNegotiation,
                canOverridePriceTable: form.canOverridePriceTable,
                notes: form.notes || null,
                allowedPriceTableIds: form.allowedPriceTableIds,
                customerAccessMode: form.customerAccessMode,
                allowedStates: form.allowedStates,
                allowedCities: form.allowedCities,
            })

            if (!('success' in result) || !result.success) {
                toast.error('error' in result ? result.error || 'Falha ao salvar.' : 'Falha ao salvar.')
                return
            }

            toast.success('Configuracoes do representante salvas com sucesso.')
            await loadData()
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-3">
                <div className="h-10 w-72 animate-pulse rounded-lg bg-slate-100" />
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
                            Banco desatualizado para configuracao de representante
                        </p>
                        <p className="mt-1 text-sm text-amber-700">
                            Aplique as migrations `033_representative_commercial_settings.sql` e `035_representative_customer_access_policies.sql`.
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
                    <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Perfil com acesso ao painel de representante
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Users className="mr-1 h-3.5 w-3.5" />
                        {assignedCustomers} cliente(s) sob gestao
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
                        <Tag className="mr-1 h-3.5 w-3.5" />
                        {allowedCount} tabela(s) permitida(s)
                    </Badge>
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-navy">
                        <Shield className="h-4 w-4" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                            Governanca Comercial
                        </h3>
                    </div>

                    <div className="space-y-2">
                        <Label>Desconto maximo de negociacao (%)</Label>
                        <Input
                            value={form.maxDiscountPercentage}
                            onChange={(event) =>
                                setForm((previous) => ({
                                    ...previous,
                                    maxDiscountPercentage: event.target.value,
                                }))
                            }
                            placeholder="Ex.: 8"
                            inputMode="decimal"
                        />
                        <p className="text-xs text-muted-foreground">
                            Limita o desconto aplicado no fechamento de pedidos pelo representante.
                        </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-foreground">Permitir negociacao livre</p>
                                <p className="text-xs text-muted-foreground">
                                    Se desativado, bloqueia descontos/acrescimos manuais na finalizacao do pedido.
                                </p>
                            </div>
                            <Switch
                                checked={form.allowFreeNegotiation}
                                onCheckedChange={(checked) =>
                                    setForm((previous) => ({
                                        ...previous,
                                        allowFreeNegotiation: checked,
                                    }))
                                }
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-foreground">Permitir troca manual de tabela</p>
                                <p className="text-xs text-muted-foreground">
                                    Se desativado, o representante nao pode escolher uma tabela diferente no pedido.
                                </p>
                            </div>
                            <Switch
                                checked={form.canOverridePriceTable}
                                onCheckedChange={(checked) =>
                                    setForm((previous) => ({
                                        ...previous,
                                        canOverridePriceTable: checked,
                                    }))
                                }
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-navy">
                        <Tag className="h-4 w-4" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                            Tabelas de Preco Permitidas
                        </h3>
                    </div>

                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar tabela..."
                            className="pl-9"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            {activeAllowedCount} tabela(s) ativa(s) permitida(s)
                        </p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleSelectAllActive}>
                                Selecionar ativas
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleClearAll}>
                                Limpar
                            </Button>
                        </div>
                    </div>

                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                        {filteredPriceTables.length === 0 ? (
                            <p className="px-2 py-4 text-sm text-muted-foreground">Nenhuma tabela encontrada.</p>
                        ) : (
                            filteredPriceTables.map((table) => {
                                const selected = form.allowedPriceTableIds.includes(table.id)
                                return (
                                    <button
                                        key={table.id}
                                        type="button"
                                        onClick={() => togglePriceTable(table.id)}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
                                            selected
                                                ? 'border-navy bg-navy/5 text-navy'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        )}
                                    >
                                        <div>
                                            <p className="text-sm font-medium">{table.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Desconto base: {Number(table.discount_percentage || 0).toFixed(2)}%
                                            </p>
                                        </div>
                                        <Badge
                                            variant={selected ? 'default' : 'outline'}
                                            className={cn(
                                                selected ? 'bg-navy text-white' : 'text-slate-600',
                                                !table.is_active && 'border-amber-300 bg-amber-50 text-amber-700'
                                            )}
                                        >
                                            {!table.is_active ? 'Inativa' : selected ? 'Permitida' : 'Disponivel'}
                                        </Badge>
                                    </button>
                                )
                            })
                        )}
                    </div>
                </section>
            </div>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-navy">
                    <Users className="h-4 w-4" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">
                        Escopo de Carteira do Admin
                    </h3>
                </div>

                <p className="text-xs text-muted-foreground">
                    O representante sempre acessa clientes proprios/atribuídos ({`stores.representative_id = representante`}).
                    Este bloco define acesso adicional aos clientes da carteira geral criados/geridos pelo admin.
                </p>

                <div className="grid gap-2 md:grid-cols-3">
                    <button
                        type="button"
                        onClick={() =>
                            setForm((previous) => ({
                                ...previous,
                                customerAccessMode: 'assigned_only',
                            }))
                        }
                        className={cn(
                            'rounded-lg border px-3 py-3 text-left transition-colors',
                            form.customerAccessMode === 'assigned_only'
                                ? 'border-navy bg-navy/5 text-navy'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                        )}
                    >
                        <p className="text-sm font-semibold">Nenhum</p>
                        <p className="mt-1 text-xs text-muted-foreground">Somente clientes próprios/atribuídos.</p>
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setForm((previous) => ({
                                ...previous,
                                customerAccessMode: 'all_admin_portfolio',
                            }))
                        }
                        className={cn(
                            'rounded-lg border px-3 py-3 text-left transition-colors',
                            form.customerAccessMode === 'all_admin_portfolio'
                                ? 'border-navy bg-navy/5 text-navy'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                        )}
                    >
                        <p className="text-sm font-semibold">Todos</p>
                        <p className="mt-1 text-xs text-muted-foreground">Acessa toda carteira admin sem representante.</p>
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setForm((previous) => ({
                                ...previous,
                                customerAccessMode: 'filtered_portfolio',
                            }))
                        }
                        className={cn(
                            'rounded-lg border px-3 py-3 text-left transition-colors',
                            form.customerAccessMode === 'filtered_portfolio'
                                ? 'border-navy bg-navy/5 text-navy'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                        )}
                    >
                        <p className="text-sm font-semibold">Filtrado</p>
                        <p className="mt-1 text-xs text-muted-foreground">Por estado e/ou cidade (multi seleção).</p>
                    </button>
                </div>

                {form.customerAccessMode === 'filtered_portfolio' && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Estados permitidos</Label>
                            <Input
                                value={stateSearch}
                                onChange={(event) => setStateSearch(event.target.value)}
                                placeholder="Buscar estado..."
                            />
                            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                                {filteredStates.length === 0 ? (
                                    <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum estado disponivel.</p>
                                ) : (
                                    filteredStates.map((state) => {
                                        const selected = form.allowedStates.includes(state)
                                        return (
                                            <button
                                                key={state}
                                                type="button"
                                                onClick={() => toggleState(state)}
                                                className={cn(
                                                    'w-full rounded-md border px-3 py-2 text-left text-xs transition-colors',
                                                    selected
                                                        ? 'border-navy bg-navy/5 text-navy'
                                                        : 'border-slate-200 bg-white hover:bg-slate-50'
                                                )}
                                            >
                                                {state}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Cidades permitidas</Label>
                            <Input
                                value={citySearch}
                                onChange={(event) => setCitySearch(event.target.value)}
                                placeholder="Buscar cidade..."
                            />
                            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                                {filteredCities.length === 0 ? (
                                    <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma cidade disponivel.</p>
                                ) : (
                                    filteredCities.map((city) => {
                                        const selected = form.allowedCities.includes(city)
                                        return (
                                            <button
                                                key={city}
                                                type="button"
                                                onClick={() => toggleCity(city)}
                                                className={cn(
                                                    'w-full rounded-md border px-3 py-2 text-left text-xs transition-colors',
                                                    selected
                                                        ? 'border-navy bg-navy/5 text-navy'
                                                        : 'border-slate-200 bg-white hover:bg-slate-50'
                                                )}
                                            >
                                                {city}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                <Label>Observacoes internas do representante</Label>
                <Textarea
                    value={form.notes}
                    onChange={(event) =>
                        setForm((previous) => ({
                            ...previous,
                            notes: event.target.value,
                        }))
                    }
                    rows={4}
                    placeholder="Politicas combinadas, observacoes de governanca e orientacoes para auditoria."
                    className="resize-none"
                />
            </section>

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
