'use client'

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Boxes,
  Calculator,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FiscalAutocompleteField } from '@/app/admin/fiscal-bases/components/FiscalAutocompleteField'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'
import { searchCfopConfigOptionsAction } from '@/app/admin/actions/cfop-configs'
import {
  getOrderFiscalWorkspaceAction,
  recalculateOrderFiscalWorkspaceAction,
  saveOrderFiscalWorkspaceAction,
  suggestOrderFiscalNaturezaAction,
  type OrderFiscalWorkspaceCalculationSummary,
  type OrderFiscalWorkspaceItemDraft,
  type OrderFiscalWorkspacePayload,
  type SaveOrderFiscalWorkspaceInput,
} from '@/app/admin/orders/fiscal-actions'
import type {
  NaturezaOperacaoDirection,
  OrderFiscalBuyerPresence,
  OrderFiscalDeliveryForm,
  OrderFiscalFreightMode,
  OrderFiscalOperationPurpose,
} from '@/lib/types'

interface OrderFiscalWorkspaceContextValue {
  isDirty: boolean
  saveDraft: () => Promise<boolean>
}

const OrderFiscalWorkspaceContext = createContext<OrderFiscalWorkspaceContextValue | null>(null)

export function useOrderFiscalWorkspace() {
  return useContext(OrderFiscalWorkspaceContext)
}

const PURPOSE_OPTIONS: Array<{ value: OrderFiscalOperationPurpose; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'complementar', label: 'Complementar' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'devolucao', label: 'Devolucao' },
]

const BUYER_PRESENCE_OPTIONS: Array<{ value: OrderFiscalBuyerPresence; label: string }> = [
  { value: 'nao_se_aplica', label: 'Nao se aplica' },
  { value: 'presencial', label: 'Operacao presencial' },
  { value: 'internet', label: 'Internet' },
  { value: 'teleatendimento', label: 'Teleatendimento' },
  { value: 'entrega_domicilio', label: 'Entrega em domicilio' },
  { value: 'presencial_fora_estabelecimento', label: 'Presencial fora do estabelecimento' },
  { value: 'outros', label: 'Outros' },
]

const FREIGHT_MODE_OPTIONS: Array<{ value: OrderFiscalFreightMode; label: string; sefazCode: number }> = [
  { value: 'emitente', label: 'Por conta do emitente', sefazCode: 0 },
  { value: 'destinatario', label: 'Por conta do destinatario', sefazCode: 1 },
  { value: 'terceiros', label: 'Por conta de terceiros', sefazCode: 2 },
  { value: 'proprio_remetente', label: 'Transporte proprio do remetente', sefazCode: 3 },
  { value: 'proprio_destinatario', label: 'Transporte proprio do destinatario', sefazCode: 4 },
  { value: 'sem_frete', label: 'Sem frete', sefazCode: 9 },
]

const DELIVERY_FORM_OPTIONS: Array<{ value: OrderFiscalDeliveryForm; label: string }> = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'transportadora', label: 'Transportadora' },
  { value: 'frota_propria', label: 'Frota propria' },
  { value: 'correios', label: 'Correios' },
  { value: 'entrega_expressa', label: 'Entrega expressa' },
  { value: 'balcao', label: 'Balcao' },
]

interface VolumeDraft {
  id: string
  quantity: number
  species: string
  brand: string
  numbering: string
  grossWeight: string
  netWeight: string
}

interface ItemDraft extends OrderFiscalWorkspaceItemDraft {
  cfopOverrideCodeInput: string
}

interface FiscalWorkspaceFormState {
  cfopGlobalCode: string
  naturezaOperacaoId: string
  operationDirection: NaturezaOperacaoDirection
  finalidadeNfe: OrderFiscalOperationPurpose
  presencaComprador: OrderFiscalBuyerPresence
  consumidorFinal: boolean
  freightMode: OrderFiscalFreightMode
  deliveryForm: OrderFiscalDeliveryForm
  transporterName: string
  transporterDocument: string
  transporterAddress: string
  transporterCity: string
  transporterState: string
  transporterIe: string
  vehiclePlate: string
  vehicleUf: string
  anttCode: string
  freightValue: string
  insuranceValue: string
  otherExpensesValue: string
  items: ItemDraft[]
  volumes: VolumeDraft[]
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeCfopCode(value?: string | null) {
  const digits = normalizeDigits(String(value || '')).slice(0, 4)
  return /^\d{4}$/.test(digits) ? digits : ''
}

function getCfopSourceLabel(value?: string | null) {
  switch (value) {
    case 'item_override':
      return 'override por item'
    case 'order_global':
      return 'cfop global'
    case 'rule_override':
      return 'regra fiscal'
    case 'profile_default':
      return 'perfil tributario'
    case 'geographic_inference':
      return 'inferencia geografica'
    default:
      return 'pending'
  }
}

function toCurrencyString(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function toNumberInputString(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function emptyVolumeDraft(index: number): VolumeDraft {
  return {
    id: `new-${index}-${Date.now()}`,
    quantity: 1,
    species: '',
    brand: '',
    numbering: '',
    grossWeight: '',
    netWeight: '',
  }
}

function getNaturezaSnapshotDescription(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object') return null
  const descricao = value.descricao
  return typeof descricao === 'string' && descricao.trim().length > 0 ? descricao.trim() : null
}

function getPreviewItemCfop(item: ItemDraft, globalCfopCode?: string | null) {
  const overrideCode = normalizeCfopCode(item.cfopOverrideCodeInput || item.cfopOverrideCode)
  if (overrideCode) {
    return {
      code: overrideCode,
      source: 'item_override',
    } as const
  }

  const globalCode = normalizeCfopCode(globalCfopCode)
  if (globalCode) {
    return {
      code: globalCode,
      source: 'order_global',
    } as const
  }

  return {
    code: normalizeCfopCode(item.effectiveCfopCode),
    source: item.cfopSource || 'pending',
  } as const
}

function buildFormState(workspace: OrderFiscalWorkspacePayload): FiscalWorkspaceFormState {
  return {
    cfopGlobalCode: workspace.settings.cfopGlobalCode || '',
    naturezaOperacaoId: workspace.settings.naturezaOperacaoId || '',
    operationDirection: workspace.settings.operationDirection || 'outbound',
    finalidadeNfe: workspace.settings.finalidadeNfe,
    presencaComprador: workspace.settings.presencaComprador,
    consumidorFinal: workspace.settings.consumidorFinal,
    freightMode: workspace.settings.freightMode,
    deliveryForm: workspace.settings.deliveryForm,
    transporterName: workspace.settings.transporterName || '',
    transporterDocument: workspace.settings.transporterDocument || '',
    transporterAddress: workspace.settings.transporterAddress || '',
    transporterCity: workspace.settings.transporterCity || '',
    transporterState: workspace.settings.transporterState || '',
    transporterIe: workspace.settings.transporterIe || '',
    vehiclePlate: workspace.settings.vehiclePlate || '',
    vehicleUf: workspace.settings.vehicleUf || '',
    anttCode: workspace.settings.anttCode || '',
    freightValue: toNumberInputString(workspace.settings.freightValue),
    insuranceValue: toNumberInputString(workspace.settings.insuranceValue),
    otherExpensesValue: toNumberInputString(workspace.settings.otherExpensesValue),
    items: workspace.items.map((item) => ({
      ...item,
      cfopOverrideCodeInput: item.cfopOverrideCode || '',
    })),
    volumes: workspace.volumes.map((volume) => ({
      id: volume.id,
      quantity: volume.quantity,
      species: volume.species,
      brand: volume.brand || '',
      numbering: volume.numbering || '',
      grossWeight: toNumberInputString(volume.gross_weight),
      netWeight: toNumberInputString(volume.net_weight),
    })),
  }
}

function NumericSummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-black text-foreground">{value}</p>
    </div>
  )
}

function WarningList({
  title,
  entries,
  tone,
}: {
  title: string
  entries: OrderFiscalWorkspaceCalculationSummary['validation']['errors']
  tone: 'error' | 'warning'
}) {
  if (entries.length === 0) return null

  const isError = tone === 'error'
  return (
    <div className={`rounded-2xl border px-4 py-3 ${isError ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className={`flex items-center gap-2 text-sm font-bold ${isError ? 'text-red-700' : 'text-amber-700'}`}>
        <AlertTriangle className="h-4 w-4" />
        {title}
      </div>
      <ul className={`mt-3 space-y-2 text-sm ${isError ? 'text-red-800' : 'text-amber-800'}`}>
        {entries.map((entry, index) => (
          <li key={`${entry.code}-${index}`} className="rounded-xl bg-white/80 px-3 py-2">
            {entry.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OrderFiscalWorkspaceTabs({
  orderId,
  children,
}: {
  orderId: string
  children: ReactNode
}) {
  const [workspace, setWorkspace] = useState<OrderFiscalWorkspacePayload | null>(null)
  const [form, setForm] = useState<FiscalWorkspaceFormState | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [cfopOptions, setCfopOptions] = useState<FiscalSearchOption[]>([])
  const [cfopSearchLoading, setCfopSearchLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [isDirty, setIsDirty] = useState(false)

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true)
    const result = await getOrderFiscalWorkspaceAction(orderId)
    if (!result.success || !result.data) {
      toast.error(result.error || 'Nao foi possivel carregar o workspace fiscal do pedido.')
      setWorkspaceLoading(false)
      return
    }

    setWorkspace(result.data)
    setForm(buildFormState(result.data))
    setIsDirty(false)
    setWorkspaceLoading(false)
  }, [orderId])

  useEffect(() => {
    startTransition(() => {
      void loadWorkspace()
    })
  }, [loadWorkspace])

  useEffect(() => {
    if (!form?.cfopGlobalCode) return

    let cancelled = false

    void searchCfopConfigOptionsAction({
      query: form.cfopGlobalCode,
      operationDirection: form.operationDirection === 'inbound' ? 'inbound' : 'outbound',
      limit: 10,
    }).then((result) => {
      if (cancelled || !result.success) return
      setCfopOptions(result.data || [])
    })

    return () => {
      cancelled = true
    }
  }, [form?.cfopGlobalCode, form?.operationDirection])

  const natureCatalog = useMemo(() => workspace?.naturezaCatalog || [], [workspace?.naturezaCatalog])
  const calculation = workspace?.calculation || null
  const selectedNatureza = useMemo(
    () => natureCatalog.find((natureza) => natureza.id === form?.naturezaOperacaoId) || null,
    [natureCatalog, form?.naturezaOperacaoId]
  )
  const selectedCfopOption = (() => {
    if (!form?.cfopGlobalCode) return null
    const matchedOption = cfopOptions.find((option) => option.code === form.cfopGlobalCode)
    if (matchedOption) return matchedOption

    return {
      id: `selected-${form.cfopGlobalCode}`,
      versionId: '',
      versionLabel: '',
      code: form.cfopGlobalCode,
      description: 'CFOP selecionado',
      secondaryText: null,
    } satisfies FiscalSearchOption
  })()

  const handleFieldChange = <K extends keyof FiscalWorkspaceFormState>(field: K, value: FiscalWorkspaceFormState[K]) => {
    setIsDirty(true)
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  const handleVolumeChange = (volumeId: string, field: keyof VolumeDraft, value: string | number) => {
    setIsDirty(true)
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        volumes: current.volumes.map((volume) =>
          volume.id === volumeId
            ? { ...volume, [field]: value }
            : volume
        ),
      }
    })
  }

  const handleItemOverrideChange = (orderItemId: string, value: string) => {
    const normalized = normalizeDigits(value).slice(0, 4)
    setIsDirty(true)
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) =>
          item.orderItemId === orderItemId
            ? { ...item, cfopOverrideCodeInput: normalized }
            : item
        ),
      }
    })
  }

  const handleSearchCfop = async (query: string) => {
    setCfopSearchLoading(true)
    const result = await searchCfopConfigOptionsAction({
      query,
      operationDirection: form?.operationDirection === 'inbound' ? 'inbound' : 'outbound',
      limit: 12,
    })

    if (result.success) {
      setCfopOptions(result.data || [])
    }
    setCfopSearchLoading(false)
  }

  const handleSelectCfop = async (option: FiscalSearchOption) => {
    setIsDirty(true)
    setForm((current) => current ? { ...current, cfopGlobalCode: option.code } : current)

    const suggestion = await suggestOrderFiscalNaturezaAction({
      cfopCode: option.code,
      naturezaOperacaoId: form?.naturezaOperacaoId || null,
      operationDirection: form?.operationDirection || 'outbound',
    })

    if (suggestion.success && suggestion.data) {
      setForm((current) => current ? {
        ...current,
        naturezaOperacaoId: suggestion.data.id || '',
        operationDirection: suggestion.data.tipoOperacao === 'inbound' ? 'inbound' : 'outbound',
      } : current)
    }
  }

  const saveWorkspace = useCallback(async () => {
    if (!form) return false
    setSaving(true)

    const payload: SaveOrderFiscalWorkspaceInput = {
      orderId,
      cfopGlobalCode: form.cfopGlobalCode,
      naturezaOperacaoId: form.naturezaOperacaoId || null,
      operationDirection: form.operationDirection,
      finalidadeNfe: form.finalidadeNfe,
      presencaComprador: form.presencaComprador,
      consumidorFinal: form.consumidorFinal,
      freightMode: form.freightMode,
      deliveryForm: form.deliveryForm,
      transporterName: form.transporterName,
      transporterDocument: form.transporterDocument,
      transporterAddress: form.transporterAddress,
      transporterCity: form.transporterCity,
      transporterState: form.transporterState,
      transporterIe: form.transporterIe,
      vehiclePlate: form.vehiclePlate,
      vehicleUf: form.vehicleUf,
      anttCode: form.anttCode,
      freightValue: Number(form.freightValue || 0),
      insuranceValue: Number(form.insuranceValue || 0),
      otherExpensesValue: Number(form.otherExpensesValue || 0),
      volumes: form.volumes.map((volume, index) => ({
        quantity: Number(volume.quantity || 0),
        species: volume.species,
        brand: volume.brand,
        numbering: volume.numbering,
        grossWeight: volume.grossWeight === '' ? null : Number(volume.grossWeight),
        netWeight: volume.netWeight === '' ? null : Number(volume.netWeight),
        sortOrder: index,
      })),
      itemOverrides: form.items.map((item) => ({
        orderItemId: item.orderItemId,
        cfopOverrideCode: item.cfopOverrideCodeInput || null,
      })),
    }

    const result = await saveOrderFiscalWorkspaceAction(payload)
    if (!result.success || !result.data) {
      toast.error(result.error || 'Falha ao salvar o draft fiscal do pedido.')
      setSaving(false)
      return false
    }

    setWorkspace(result.data)
    setForm(buildFormState(result.data))
    setIsDirty(false)
    toast.success('Workspace fiscal do pedido salvo e recalculado.', {
      description: `${result.data.volumes.length} volume(s) persistido(s) no draft fiscal.`,
    })
    setSaving(false)
    return true
  }, [form, orderId])

  const recalculateWorkspace = async () => {
    setRecalculating(true)
    const result = await recalculateOrderFiscalWorkspaceAction(orderId)
    if (!result.success || !result.data) {
      toast.error(result.error || 'Falha ao recalcular os impostos do pedido.')
      setRecalculating(false)
      return
    }

    setWorkspace(result.data)
    setForm(buildFormState(result.data))
    setIsDirty(false)
    toast.success('Impostos recalculados com a configuracao fiscal atual do pedido.')
    setRecalculating(false)
  }

  const canRender = !workspaceLoading && workspace && form
  const workspaceContextValue = useMemo<OrderFiscalWorkspaceContextValue>(() => ({
    isDirty,
    saveDraft: saveWorkspace,
  }), [isDirty, saveWorkspace])

  return (
    <OrderFiscalWorkspaceContext.Provider value={workspaceContextValue}>
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-navy" />
              <h4 className="text-lg font-bold text-navy">Workspace fiscal do pedido</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Prepare CFOP, natureza da operacao, transporte, volumes e o resumo tributario antes da emissao da NF-e.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={recalculateWorkspace}
              disabled={workspaceLoading || recalculating || saving}
            >
              {recalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Recalcular impostos
            </Button>
            <Button
              className="gap-2 rounded-xl bg-navy font-bold text-white hover:bg-navy/90"
              onClick={saveWorkspace}
              disabled={workspaceLoading || saving || recalculating}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar draft fiscal
            </Button>
          </div>
        </div>

        {canRender ? (
          <div className="flex flex-wrap gap-2">
            {form.cfopGlobalCode ? (
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                CFOP global {form.cfopGlobalCode}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              Direcao: {form.operationDirection === 'inbound' ? 'Entrada' : 'Saida'}
            </Badge>
            {selectedNatureza ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Natureza: {selectedNatureza.descricao}
              </Badge>
            ) : null}
            {calculation?.validation.is_valid ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Estrutura fiscal valida
              </Badge>
            ) : (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                Pendencias fiscais para emissao
              </Badge>
            )}
          </div>
        ) : null}
      </div>

      {workspaceLoading || !workspace || !form ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto rounded-2xl bg-slate-100/80 p-1">
            <TabsTrigger value="general" className="gap-2 rounded-xl px-4">
              <Settings2 className="h-4 w-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="taxes" className="gap-2 rounded-xl px-4">
              <Calculator className="h-4 w-4" />
              Tributacao
            </TabsTrigger>
            <TabsTrigger value="transport" className="gap-2 rounded-xl px-4">
              <Truck className="h-4 w-4" />
              Transporte
            </TabsTrigger>
            <TabsTrigger value="volumes" className="gap-2 rounded-xl px-4">
              <Boxes className="h-4 w-4" />
              Volumes
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2 rounded-xl px-4">
              <FileText className="h-4 w-4" />
              Documentos / DANFE Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <FiscalAutocompleteField
                      label="CFOP global do pedido"
                      placeholder="Selecione um CFOP configurado"
                      value={selectedCfopOption}
                      options={cfopOptions}
                      loading={cfopSearchLoading}
                      onSearch={handleSearchCfop}
                      onSelect={handleSelectCfop}
                      onClear={() => {
                        setCfopOptions([])
                        handleFieldChange('cfopGlobalCode', '')
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Natureza da operacao</Label>
                    <Select
                      value={form.naturezaOperacaoId || '__none__'}
                      onValueChange={(nextValue) => handleFieldChange('naturezaOperacaoId', !nextValue || nextValue === '__none__' ? '' : nextValue)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a natureza da operacao" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem natureza definida</SelectItem>
                        {natureCatalog.map((natureza) => (
                          <SelectItem key={natureza.id} value={natureza.id}>
                            {natureza.descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Tipo de operacao</Label>
                    <div className="flex h-8 items-center rounded-lg border border-input bg-slate-50 px-3 text-sm font-medium">
                      {form.operationDirection === 'inbound' ? 'Entrada' : 'Saida'}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Finalidade da NF-e</Label>
                    <Select
                      value={form.finalidadeNfe}
                      onValueChange={(nextValue) => handleFieldChange('finalidadeNfe', nextValue as OrderFiscalOperationPurpose)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PURPOSE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Presenca do comprador</Label>
                    <Select
                      value={form.presencaComprador}
                      onValueChange={(nextValue) => handleFieldChange('presencaComprador', nextValue as OrderFiscalBuyerPresence)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUYER_PRESENCE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Consumidor final</p>
                        <p className="text-xs text-muted-foreground">
                          Ajusta a leitura fiscal do destinatario e impacta regras de DIFAL.
                        </p>
                      </div>
                      <Switch
                        checked={form.consumidorFinal}
                        onCheckedChange={(checked) => handleFieldChange('consumidorFinal', checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-navy">Leitura operacional</p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Natureza sugerida</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {selectedNatureza?.descricao || getNaturezaSnapshotDescription(workspace.settings.naturezaOperacaoSnapshot) || 'Nao definida'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Regras do pedido</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedNatureza?.aplica_st ? (
                        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Aplica ST</Badge>
                      ) : null}
                      {selectedNatureza?.aplica_difal ? (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Aplica DIFAL</Badge>
                      ) : null}
                      {selectedNatureza?.aplica_devolucao ? (
                        <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">Fluxo de devolucao</Badge>
                      ) : null}
                      {!selectedNatureza?.aplica_st && !selectedNatureza?.aplica_difal && !selectedNatureza?.aplica_devolucao ? (
                        <span className="text-xs text-muted-foreground">Sem regra especial destacada.</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-navy">CFOP por item</p>
                  <p className="text-xs text-muted-foreground">
                    O CFOP global do pedido pode ser sobrescrito por item quando houver excecao fiscal.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>NCM</TableHead>
                      <TableHead>CFOP efetivo</TableHead>
                      <TableHead>Fonte</TableHead>
                      <TableHead>Override por item</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.items.map((item) => (
                      (() => {
                        const previewCfop = getPreviewItemCfop(item, form.cfopGlobalCode)

                        return (
                          <TableRow key={item.orderItemId}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-slate-900">{item.productName}</p>
                                <p className="text-xs text-muted-foreground">Qtd. {item.quantity}</p>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.ncm || '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{previewCfop.code || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                {getCfopSourceLabel(previewCfop.source)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.cfopOverrideCodeInput}
                                onChange={(event) => handleItemOverrideChange(item.orderItemId, event.target.value)}
                                placeholder="Ex.: 5102"
                                maxLength={4}
                                className="w-28 font-mono"
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })()
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="taxes" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <NumericSummaryCard label="ICMS" value={toCurrencyString(calculation?.totals.vICMS || 0)} tone="border-blue-200 bg-blue-50/70" />
              <NumericSummaryCard label="ST" value={toCurrencyString(calculation?.totals.vST || 0)} tone="border-orange-200 bg-orange-50/70" />
              <NumericSummaryCard label="FCP" value={toCurrencyString(calculation?.totals.vFCP || 0)} tone="border-fuchsia-200 bg-fuchsia-50/70" />
              <NumericSummaryCard label="PIS" value={toCurrencyString(calculation?.totals.vPIS || 0)} tone="border-emerald-200 bg-emerald-50/70" />
              <NumericSummaryCard label="COFINS" value={toCurrencyString(calculation?.totals.vCOFINS || 0)} tone="border-cyan-200 bg-cyan-50/70" />
              <NumericSummaryCard label="IPI" value={toCurrencyString(calculation?.totals.vIPI || 0)} tone="border-violet-200 bg-violet-50/70" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4">
                <WarningList title="Erros bloqueantes" entries={calculation?.validation.errors || []} tone="error" />
                <WarningList title="Warnings de consistencia" entries={calculation?.validation.warnings || []} tone="warning" />
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                    Perfil por item + CFOP resolvido
                  </Badge>
                  {calculation?.operation.cfop_global_code ? (
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      CFOP global {calculation.operation.cfop_global_code}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Natureza {calculation?.operation.natureza_operacao_descricao || 'nao definida'}
                  </Badge>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>CFOP</TableHead>
                        <TableHead className="text-right">ICMS</TableHead>
                        <TableHead className="text-right">PIS</TableHead>
                        <TableHead className="text-right">COFINS</TableHead>
                        <TableHead className="text-right">IPI</TableHead>
                        <TableHead className="text-right">Total tributos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(calculation?.items || []).map((item) => (
                        <TableRow key={item.orderItemId}>
                          <TableCell className="font-medium text-slate-900">{item.productName}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{item.cfop}</span>
                              <span className="text-[11px] text-muted-foreground">{item.cfopSource}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{toCurrencyString(item.icms)}</TableCell>
                          <TableCell className="text-right">{toCurrencyString(item.pis)}</TableCell>
                          <TableCell className="text-right">{toCurrencyString(item.cofins)}</TableCell>
                          <TableCell className="text-right">{toCurrencyString(item.ipi)}</TableCell>
                          <TableCell className="text-right font-semibold">{toCurrencyString(item.totalTributos)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transport" className="space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Modalidade do frete</Label>
                  <Select
                    value={form.freightMode}
                    onValueChange={(nextValue) => handleFieldChange('freightMode', nextValue as OrderFiscalFreightMode)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREIGHT_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.sefazCode} - {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Forma de entrega</Label>
                  <Select
                    value={form.deliveryForm}
                    onValueChange={(nextValue) => handleFieldChange('deliveryForm', nextValue as OrderFiscalDeliveryForm)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_FORM_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Transportadora</Label>
                  <Input value={form.transporterName} onChange={(event) => handleFieldChange('transporterName', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF/CNPJ transportador</Label>
                  <Input value={form.transporterDocument} onChange={(event) => handleFieldChange('transporterDocument', normalizeDigits(event.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Endereco do transportador</Label>
                  <Input value={form.transporterAddress} onChange={(event) => handleFieldChange('transporterAddress', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Municipio do transportador</Label>
                  <Input value={form.transporterCity} onChange={(event) => handleFieldChange('transporterCity', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>UF do transportador</Label>
                  <Input value={form.transporterState} maxLength={2} onChange={(event) => handleFieldChange('transporterState', event.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label>IE do transportador</Label>
                  <Input value={form.transporterIe} onChange={(event) => handleFieldChange('transporterIe', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Placa do veiculo</Label>
                  <Input value={form.vehiclePlate} onChange={(event) => handleFieldChange('vehiclePlate', event.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label>UF do veiculo</Label>
                  <Input value={form.vehicleUf} maxLength={2} onChange={(event) => handleFieldChange('vehicleUf', event.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label>Codigo ANTT</Label>
                  <Input value={form.anttCode} onChange={(event) => handleFieldChange('anttCode', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor do frete</Label>
                  <Input type="number" step="0.01" value={form.freightValue} onChange={(event) => handleFieldChange('freightValue', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Seguro</Label>
                  <Input type="number" step="0.01" value={form.insuranceValue} onChange={(event) => handleFieldChange('insuranceValue', event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Outras despesas</Label>
                  <Input type="number" step="0.01" value={form.otherExpensesValue} onChange={(event) => handleFieldChange('otherExpensesValue', event.target.value)} />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                O frete, o seguro e as outras despesas compoem o draft fiscal do pedido e influenciam tanto os totais fiscais quanto o preview da DANFE.
              </div>
            </div>
          </TabsContent>

          <TabsContent value="volumes" className="space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-navy">Volumes da NF-e</p>
                  <p className="text-xs text-muted-foreground">
                    Cadastre multiplos volumes para refletir corretamente transporte e DANFE.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl"
                  onClick={() => {
                    setIsDirty(true)
                    setForm((current) => current ? {
                      ...current,
                      volumes: [...current.volumes, emptyVolumeDraft(current.volumes.length)],
                    } : current)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar volume
                </Button>
              </div>

              <div className="space-y-3">
                {form.volumes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum volume cadastrado ainda para este pedido.
                  </div>
                ) : (
                  form.volumes.map((volume, index) => (
                    <div key={volume.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-900">Volume {index + 1}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setIsDirty(true)
                            setForm((current) => current ? {
                              ...current,
                              volumes: current.volumes.filter((entry) => entry.id !== volume.id),
                            } : current)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label>Quantidade</Label>
                          <Input
                            type="number"
                            min={1}
                            value={volume.quantity}
                            onChange={(event) => handleVolumeChange(volume.id, 'quantity', Number(event.target.value || 1))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Especie</Label>
                          <Input value={volume.species} onChange={(event) => handleVolumeChange(volume.id, 'species', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Marca</Label>
                          <Input value={volume.brand} onChange={(event) => handleVolumeChange(volume.id, 'brand', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Numeracao</Label>
                          <Input value={volume.numbering} onChange={(event) => handleVolumeChange(volume.id, 'numbering', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Peso bruto</Label>
                          <Input type="number" step="0.001" value={volume.grossWeight} onChange={(event) => handleVolumeChange(volume.id, 'grossWeight', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Peso liquido</Label>
                          <Input type="number" step="0.001" value={volume.netWeight} onChange={(event) => handleVolumeChange(volume.id, 'netWeight', event.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Separator className="my-4" />

              <div className="grid gap-3 md:grid-cols-3">
                <NumericSummaryCard label="Qtde de volumes" value={String(calculation?.totals.volume_count || 0)} tone="border-slate-200 bg-slate-50/70" />
                <NumericSummaryCard label="Peso bruto total" value={`${(calculation?.totals.total_gross_weight || 0).toFixed(3)} kg`} tone="border-slate-200 bg-slate-50/70" />
                <NumericSummaryCard label="Peso liquido total" value={`${(calculation?.totals.total_net_weight || 0).toFixed(3)} kg`} tone="border-slate-200 bg-slate-50/70" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            {children}
          </TabsContent>
        </Tabs>
      )}
    </div>
    </OrderFiscalWorkspaceContext.Provider>
  )
}
