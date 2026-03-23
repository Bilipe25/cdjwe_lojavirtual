'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, BadgeCheck, Clock3, Loader2, Save, Search, Shield, Tag, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  getRepresentativeCommercialSetup,
  searchRepresentativePortfolioStores,
  upsertRepresentativeCommercialSettings,
} from '../actions'

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

type CandidateStoreLookup = {
  id: string
  company_name?: string | null
  trade_name?: string | null
  customer_code?: string | null
  city?: string | null
  state?: string | null
}

type ManualRuleResponse = {
  store_id: string
  decision: 'allow' | 'deny'
  reason?: string | null
  store?: CandidateStoreLookup | CandidateStoreLookup[] | null
}

type AuditLogResponse = {
  id: string
  event_type?: string | null
  entity_type?: string | null
  before_state?: Record<string, unknown> | null
  after_state?: Record<string, unknown> | null
  notes?: string | null
  created_at?: string | null
  changed_by_profile?:
    | { id?: string; full_name?: string | null; email?: string | null }
    | Array<{ id?: string; full_name?: string | null; email?: string | null }>
    | null
  store?: CandidateStoreLookup | CandidateStoreLookup[] | null
}

type FormManualRule = {
  storeId: string
  decision: 'allow' | 'deny'
  reason: string
  store: CandidateStoreLookup | null
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
  manualCustomerRules: FormManualRule[]
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
  manualCustomerRules: [],
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function mapSettingsToForm(
  settings: RepresentativeSettingsResponse | null,
  allowedPriceTableIds: string[],
  accessPolicy: AccessPolicyResponse,
  manualRules: ManualRuleResponse[]
): FormState {
  return {
    maxDiscountPercentage:
      settings?.max_discount_percentage !== null && settings?.max_discount_percentage !== undefined
        ? String(settings.max_discount_percentage)
        : '',
    allowFreeNegotiation: settings?.allow_free_negotiation !== false,
    canOverridePriceTable: settings?.can_override_price_table !== false,
    notes: settings?.notes || '',
    allowedPriceTableIds,
    customerAccessMode: accessPolicy.scopeMode || 'assigned_only',
    allowedStates: accessPolicy.allowedStates || [],
    allowedCities: accessPolicy.allowedCities || [],
    manualCustomerRules: manualRules.map((rule) => ({
      storeId: rule.store_id,
      decision: rule.decision === 'deny' ? 'deny' : 'allow',
      reason: (rule.reason || '').trim(),
      store: pickFirst(rule.store),
    })),
  }
}

function formatStoreLabel(store?: CandidateStoreLookup | null) {
  if (!store) return 'Cliente sem identificacao'
  return store.trade_name || store.company_name || store.customer_code || store.id
}

function formatStoreMeta(store?: CandidateStoreLookup | null) {
  if (!store) return '-'
  const city = (store.city || '').trim()
  const state = (store.state || '').trim().toUpperCase()
  const location = city && state ? `${city}/${state}` : city || state || '-'
  return store.customer_code ? `${location} - Cod: ${store.customer_code}` : location
}

function formatAuditLabel(eventType?: string | null, entityType?: string | null) {
  const event = (eventType || '').toLowerCase()
  const entity = (entityType || '').toLowerCase()
  const entityMap: Record<string, string> = {
    commercial_settings: 'Config comercial',
    price_tables: 'Tabelas',
    access_policy: 'Politica',
    manual_customer_rule: 'Regra manual',
  }
  const eventMap: Record<string, string> = {
    created: 'criada',
    updated: 'atualizada',
    deleted: 'removida',
  }
  return `${entityMap[entity] || entity || 'alteracao'} - ${eventMap[event] || event || 'atualizada'}`
}

function pretty(value: Record<string, unknown> | null | undefined) {
  if (!value) return '-'
  return JSON.stringify(value, null, 2)
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
  const [manualSearch, setManualSearch] = useState('')
  const [manualSearchLoading, setManualSearchLoading] = useState(false)
  const [assignedCustomers, setAssignedCustomers] = useState(0)
  const [priceTables, setPriceTables] = useState<PriceTableLookup[]>([])
  const [availableStates, setAvailableStates] = useState<string[]>([])
  const [availableCities, setAvailableCities] = useState<string[]>([])
  const [candidateStores, setCandidateStores] = useState<CandidateStoreLookup[]>([])
  const [manualSearchResults, setManualSearchResults] = useState<CandidateStoreLookup[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogResponse[]>([])
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

      const stores = (setup.lookups?.candidateStores || []) as CandidateStoreLookup[]
      setCandidateStores(stores)
      setManualSearchResults(stores)
      setAuditLogs(
        ((setup.auditLogs || []) as AuditLogResponse[]).map((item) => ({
          ...item,
          changed_by_profile: pickFirst(item.changed_by_profile),
          store: pickFirst(item.store),
        }))
      )

      setForm(
        mapSettingsToForm(
          (setup.settings || null) as RepresentativeSettingsResponse | null,
          (setup.allowedPriceTableIds || []) as string[],
          {
            scopeMode: setup.accessPolicy?.scopeMode,
            allowedStates: setup.accessPolicy?.allowedStates || [],
            allowedCities: setup.accessPolicy?.allowedCities || [],
          },
          (setup.manualRules || []) as ManualRuleResponse[]
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

  useEffect(() => {
    if (!schemaReady) return
    let active = true
    const timeout = setTimeout(async () => {
      setManualSearchLoading(true)
      try {
        const response = await searchRepresentativePortfolioStores({
          representativeId: profileId,
          term: manualSearch.trim(),
          limit: 40,
        })
        if (!active) return
        if ('data' in response && response.data) {
          setManualSearchResults(response.data as CandidateStoreLookup[])
        } else {
          setManualSearchResults(candidateStores)
        }
      } finally {
        if (active) setManualSearchLoading(false)
      }
    }, 280)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [profileId, manualSearch, schemaReady, candidateStores])

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

  const ruleMap = useMemo(() => new Map(form.manualCustomerRules.map((rule) => [rule.storeId, rule])), [form.manualCustomerRules])

  const activeAllowedCount = form.allowedPriceTableIds.filter((id) =>
    priceTables.some((table) => table.id === id && table.is_active)
  ).length

  const togglePriceTable = (tableId: string) => {
    setForm((previous) => ({
      ...previous,
      allowedPriceTableIds: previous.allowedPriceTableIds.includes(tableId)
        ? previous.allowedPriceTableIds.filter((id) => id !== tableId)
        : [...previous.allowedPriceTableIds, tableId],
    }))
  }

  const toggleState = (state: string) => {
    setForm((previous) => ({
      ...previous,
      allowedStates: previous.allowedStates.includes(state)
        ? previous.allowedStates.filter((value) => value !== state)
        : [...previous.allowedStates, state],
    }))
  }

  const toggleCity = (city: string) => {
    setForm((previous) => ({
      ...previous,
      allowedCities: previous.allowedCities.includes(city)
        ? previous.allowedCities.filter((value) => value !== city)
        : [...previous.allowedCities, city],
    }))
  }

  const addManualRule = (store: CandidateStoreLookup, decision: 'allow' | 'deny') => {
    setForm((previous) => {
      if (previous.manualCustomerRules.some((rule) => rule.storeId === store.id)) return previous
      return {
        ...previous,
        manualCustomerRules: [{ storeId: store.id, decision, reason: '', store }, ...previous.manualCustomerRules],
      }
    })
  }

  const updateManualRule = (storeId: string, patch: Partial<FormManualRule>) => {
    setForm((previous) => ({
      ...previous,
      manualCustomerRules: previous.manualCustomerRules.map((rule) =>
        rule.storeId === storeId ? { ...rule, ...patch } : rule
      ),
    }))
  }

  const removeManualRule = (storeId: string) => {
    setForm((previous) => ({
      ...previous,
      manualCustomerRules: previous.manualCustomerRules.filter((rule) => rule.storeId !== storeId),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const parsed = form.maxDiscountPercentage.trim().replace(',', '.')
      const maxDiscount = parsed.length > 0 ? Number(parsed) : null
      if (maxDiscount !== null && Number.isNaN(maxDiscount)) {
        toast.error('Informe um desconto maximo valido.')
        return
      }

      if (form.customerAccessMode === 'filtered_portfolio' && form.allowedStates.length === 0 && form.allowedCities.length === 0) {
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
        manualCustomerRules: form.manualCustomerRules.map((rule) => ({
          storeId: rule.storeId,
          decision: rule.decision,
          reason: rule.reason.trim() || null,
        })),
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
            <p className="text-sm font-semibold text-amber-800">Banco desatualizado para configuracao de representante</p>
            <p className="mt-1 text-sm text-amber-700">Aplique as migrations 033, 035 e 036 para habilitar politicas, regras manuais e auditoria.</p>
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
            <BadgeCheck className="mr-1 h-3.5 w-3.5" />Perfil de representante ativo
          </Badge>
          <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
            <Users className="mr-1 h-3.5 w-3.5" />{assignedCustomers} cliente(s) sob gestao
          </Badge>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-700">
            <Tag className="mr-1 h-3.5 w-3.5" />{form.allowedPriceTableIds.length} tabela(s) permitida(s)
          </Badge>
          <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-indigo-700">
            <Shield className="mr-1 h-3.5 w-3.5" />{form.manualCustomerRules.length} regra(s) manual(is)
          </Badge>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-navy">
            <Shield className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">Governanca Comercial</h3>
          </div>
          <div className="space-y-2">
            <Label>Desconto maximo (%)</Label>
            <Input
              value={form.maxDiscountPercentage}
              onChange={(event) => setForm((previous) => ({ ...previous, maxDiscountPercentage: event.target.value }))}
              placeholder="Ex.: 8"
              inputMode="decimal"
            />
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Permitir negociacao livre</p>
                <p className="text-xs text-muted-foreground">Controla descontos/acrescimos manuais.</p>
              </div>
              <Switch checked={form.allowFreeNegotiation} onCheckedChange={(checked) => setForm((previous) => ({ ...previous, allowFreeNegotiation: checked }))} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Permitir troca de tabela</p>
                <p className="text-xs text-muted-foreground">Controla troca manual de tabela no pedido.</p>
              </div>
              <Switch checked={form.canOverridePriceTable} onCheckedChange={(checked) => setForm((previous) => ({ ...previous, canOverridePriceTable: checked }))} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-navy">
            <Tag className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">Tabelas de Preco</h3>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tabela..." className="pl-9" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{activeAllowedCount} ativa(s) permitida(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setForm((previous) => ({ ...previous, allowedPriceTableIds: priceTables.filter((table) => table.is_active).map((table) => table.id) }))}>
                Selecionar ativas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setForm((previous) => ({ ...previous, allowedPriceTableIds: [] }))}>Limpar</Button>
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
                      selected ? 'border-navy bg-navy/5 text-navy' : 'border-slate-200 bg-white hover:bg-slate-50'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">{table.name}</p>
                      <p className="text-xs text-muted-foreground">Desconto base: {Number(table.discount_percentage || 0).toFixed(2)}%</p>
                    </div>
                    <Badge variant={selected ? 'default' : 'outline'} className={cn(selected ? 'bg-navy text-white' : 'text-slate-600', !table.is_active && 'border-amber-300 bg-amber-50 text-amber-700')}>
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
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">Escopo da Carteira Admin</h3>
        </div>
        <p className="text-xs text-muted-foreground">Prioridade: cliente especifico &gt; cidade &gt; estado &gt; global. Cliente de outro representante nunca fica disponivel.</p>

        <div className="grid gap-2 md:grid-cols-3">
          {[
            { value: 'assigned_only', label: 'Nenhum', hint: 'Somente proprios/atribuidos.' },
            { value: 'all_admin_portfolio', label: 'Todos', hint: 'Toda carteira admin sem representante.' },
            { value: 'filtered_portfolio', label: 'Filtrado', hint: 'Permissao por estado e cidade.' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setForm((previous) => ({ ...previous, customerAccessMode: item.value as FormState['customerAccessMode'] }))}
              className={cn('rounded-lg border px-3 py-3 text-left transition-colors', form.customerAccessMode === item.value ? 'border-navy bg-navy/5 text-navy' : 'border-slate-200 bg-white hover:bg-slate-50')}
            >
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </button>
          ))}
        </div>

        {form.customerAccessMode === 'filtered_portfolio' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Estados permitidos</Label>
              <Input value={stateSearch} onChange={(event) => setStateSearch(event.target.value)} />
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                {filteredStates.map((state) => (
                  <button key={state} type="button" onClick={() => toggleState(state)} className={cn('w-full rounded-md border px-3 py-2 text-left text-xs transition-colors', form.allowedStates.includes(state) ? 'border-navy bg-navy/5 text-navy' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                    {state}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cidades permitidas</Label>
              <Input value={citySearch} onChange={(event) => setCitySearch(event.target.value)} />
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                {filteredCities.map((city) => (
                  <button key={city} type="button" onClick={() => toggleCity(city)} className={cn('w-full rounded-md border px-3 py-2 text-left text-xs transition-colors', form.allowedCities.includes(city) ? 'border-navy bg-navy/5 text-navy' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-navy">
          <Shield className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">Whitelist/Blacklist Manual</h3>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={manualSearch} onChange={(event) => setManualSearch(event.target.value)} placeholder="Buscar cliente especifico..." className="pl-9" />
        </div>

        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
          {manualSearchLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando clientes...</div>
          ) : manualSearchResults.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : (
            manualSearchResults.map((store) => {
              const current = ruleMap.get(store.id)
              return (
                <div key={store.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{formatStoreLabel(store)}</p>
                      <p className="text-xs text-muted-foreground">{formatStoreMeta(store)}</p>
                    </div>
                    {current ? (
                      <Badge variant="outline" className={cn(current.decision === 'allow' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-300 bg-red-50 text-red-700')}>
                        {current.decision === 'allow' ? 'Liberado' : 'Bloqueado'}
                      </Badge>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 border-emerald-300 text-emerald-700" onClick={() => addManualRule(store, 'allow')}>Liberar</Button>
                        <Button size="sm" variant="outline" className="h-8 border-red-300 text-red-700" onClick={() => addManualRule(store, 'deny')}>Bloquear</Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="space-y-2">
          <Label>Regras aplicadas</Label>
          {form.manualCustomerRules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-muted-foreground">Nenhuma regra manual configurada.</p>
          ) : (
            <div className="space-y-3">
              {form.manualCustomerRules.map((rule) => (
                <div key={rule.storeId} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{formatStoreLabel(rule.store)}</p>
                      <p className="text-xs text-muted-foreground">{formatStoreMeta(rule.store)}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-500 hover:text-red-600" onClick={() => removeManualRule(rule.storeId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <button type="button" onClick={() => updateManualRule(rule.storeId, { decision: 'allow' })} className={cn('rounded-md border px-3 py-2 text-left text-xs transition-colors', rule.decision === 'allow' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                      Whitelist
                    </button>
                    <button type="button" onClick={() => updateManualRule(rule.storeId, { decision: 'deny' })} className={cn('rounded-md border px-3 py-2 text-left text-xs transition-colors', rule.decision === 'deny' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                      Blacklist
                    </button>
                  </div>

                  <Input value={rule.reason} onChange={(event) => updateManualRule(rule.storeId, { reason: event.target.value })} placeholder="Motivo opcional da regra" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-navy">
          <Clock3 className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">Auditoria de Carteira</h3>
        </div>

        <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem eventos para este representante.</p>
          ) : (
            auditLogs.map((entry) => {
              const actor = pickFirst(entry.changed_by_profile)
              const store = pickFirst(entry.store)
              return (
                <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold">{formatAuditLabel(entry.event_type, entry.entity_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {(actor?.full_name || actor?.email || 'Sistema')} - {entry.created_at ? new Date(entry.created_at).toLocaleString('pt-BR') : '-'}
                  </p>
                  {store ? <p className="mt-1 text-xs text-muted-foreground">Cliente: {formatStoreLabel(store)}</p> : null}
                  {entry.notes ? <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p> : null}
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <pre className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">{pretty(entry.before_state)}</pre>
                    <pre className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">{pretty(entry.after_state)}</pre>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <Label>Observacoes internas</Label>
        <Textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows={4} placeholder="Politicas combinadas e orientacoes de auditoria." className="resize-none" />
      </section>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="h-10 rounded-lg gradient-navy border-0 text-white">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar configuracoes
        </Button>
      </div>
    </div>
  )
}
