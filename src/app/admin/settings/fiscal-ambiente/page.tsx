'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Hash,
  Loader2,
  MessageSquarePlus,
  Package,
  Plus,
  Power,
  Radio,
  Save,
  Shield,
  Trash2,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FiscalHelpText } from '../components/FiscalHelpText'
import { FiscalReadinessCard } from '../components/FiscalReadinessCard'
import { FiscalPageSummaryPanel } from '../components/FiscalPageSummaryPanel'
import { loadFiscalEnvironmentAction, saveFiscalEnvironmentAction } from './actions'
import type { CompanyFiscalEnvironment } from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIPO_EMISSAO_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'contingencia_scan', label: 'Contingência SCAN' },
  { value: 'contingencia_dpec', label: 'Contingência DPEC' },
  { value: 'contingencia_fsda', label: 'Contingência FS-DA' },
  { value: 'contingencia_svcan', label: 'Contingência SVC-AN' },
  { value: 'contingencia_svcrs', label: 'Contingência SVC-RS' },
]

const MODALIDADE_FRETE_OPTIONS = [
  { value: 'emitente', label: 'Contratação do Frete por conta do remetente (CIF)' },
  { value: 'destinatario', label: 'Contratação do Frete por conta do destinatário (FOB)' },
  { value: 'terceiros', label: 'Contratação do Frete por conta de terceiros' },
  { value: 'proprio_remetente', label: 'Transporte próprio por conta do remetente' },
  { value: 'proprio_destinatario', label: 'Transporte próprio por conta do destinatário' },
  { value: 'sem_frete', label: 'Sem ocorrência de transporte' },
]

const CODIGO_REFERENCIA_OPTIONS = [
  { value: 'codigo_barras', label: 'Código de barras' },
  { value: 'codigo_fabricante', label: 'Código do produto no fabricante' },
  { value: 'codigo_erp', label: 'Código de integração (ERP)' },
  { value: 'codigo_interno', label: 'Código interno (Painel de Controle)' },
]

interface ItemInfoField {
  key: string
  label: string
  legend: string
  enabled: boolean
}

const DEFAULT_ITEM_INFO_FIELDS: ItemInfoField[] = [
  { key: 'desconto_percentual', label: 'Desconto percentual', legend: 'Desconto percentual', enabled: false },
  { key: 'numero_item_atendimento', label: 'Número do item no atendimento', legend: 'Número item', enabled: false },
  { key: 'observacao_item', label: 'Observação do item no atendimento', legend: 'Inf. complementar', enabled: true },
  { key: 'produto_acesso_rapido', label: 'Produto - Acesso rápido', legend: 'Acesso rápido', enabled: false },
  { key: 'produto_categoria', label: 'Produto - Categoria', legend: 'Categoria', enabled: false },
  { key: 'produto_codigo_barras', label: 'Produto - Código de barras', legend: 'Cód. barras', enabled: false },
  { key: 'produto_fabricante', label: 'Produto - Fabricante', legend: 'Fabricante', enabled: true },
]

/* ------------------------------------------------------------------ */
/*  Form state                                                         */
/* ------------------------------------------------------------------ */

interface FormState {
  ambiente: string
  // NF-e
  seriePadraoNfe: string
  proximoNumeroNfe: string
  ultimaNotaNfe: string
  // NFC-e
  serieNfce: string
  notaInicialNfce: string
  ultimaNotaNfce: string
  cscIdNfce: string
  cscNumeroNfce: string
  // General
  maxItensPorNota: string
  tipoEmissao: string
  emissaoAtiva: boolean
  // Reference code
  codigoReferenciaNota: string
  // Taxes & freight
  descontoImpostosPrazo: boolean
  bloquearRetornoParcialRemessa: boolean
  icmsBasePisCofins: boolean
  freteBaseIcms: boolean
  modalidadeFretePadrao: string
  // JSONB-backed
  itemInfoFields: ItemInfoField[]
  observacoesPadrao: string[]
}

const initialForm: FormState = {
  ambiente: 'homologacao',
  seriePadraoNfe: '1',
  proximoNumeroNfe: '1',
  ultimaNotaNfe: '0',
  serieNfce: '0',
  notaInicialNfce: '1',
  ultimaNotaNfce: '0',
  cscIdNfce: '',
  cscNumeroNfce: '',
  maxItensPorNota: '100',
  tipoEmissao: 'normal',
  emissaoAtiva: false,
  codigoReferenciaNota: 'codigo_interno',
  descontoImpostosPrazo: true,
  bloquearRetornoParcialRemessa: false,
  icmsBasePisCofins: false,
  freteBaseIcms: false,
  modalidadeFretePadrao: 'destinatario',
  itemInfoFields: DEFAULT_ITEM_INFO_FIELDS,
  observacoesPadrao: [],
}

function buildFormState(record: CompanyFiscalEnvironment | null): FormState {
  if (!record) return initialForm

  const params = (record.parametros_jsonb || {}) as Record<string, unknown>
  const savedItems = Array.isArray(params.item_info_fields) ? (params.item_info_fields as ItemInfoField[]) : null
  const savedObs = Array.isArray(params.observacoes_padrao) ? (params.observacoes_padrao as string[]) : []

  return {
    ambiente: record.ambiente || 'homologacao',
    seriePadraoNfe: record.serie_padrao_nfe || '1',
    proximoNumeroNfe: record.proximo_numero_nfe?.toString() || '1',
    ultimaNotaNfe: record.ultima_nota_nfe?.toString() || '0',
    serieNfce: record.serie_nfce || '0',
    notaInicialNfce: record.nota_inicial_nfce?.toString() || '1',
    ultimaNotaNfce: record.ultima_nota_nfce?.toString() || '0',
    cscIdNfce: record.csc_id_nfce || '',
    cscNumeroNfce: record.csc_numero_nfce || '',
    maxItensPorNota: record.max_itens_por_nota?.toString() || '100',
    tipoEmissao: record.tipo_emissao || 'normal',
    emissaoAtiva: record.emissao_ativa || false,
    codigoReferenciaNota: record.codigo_referencia_nota || 'codigo_interno',
    descontoImpostosPrazo: record.desconto_impostos_prazo ?? true,
    bloquearRetornoParcialRemessa: record.bloquear_retorno_parcial_remessa ?? false,
    icmsBasePisCofins: record.icms_base_pis_cofins ?? false,
    freteBaseIcms: record.frete_base_icms ?? false,
    modalidadeFretePadrao: record.modalidade_frete_padrao || 'destinatario',
    itemInfoFields: savedItems || DEFAULT_ITEM_INFO_FIELDS,
    observacoesPadrao: savedObs,
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FiscalAmbientePage() {
  const [env, setEnv] = useState<CompanyFiscalEnvironment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmProducao, setConfirmProducao] = useState(false)
  const [pendingAmbiente, setPendingAmbiente] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(initialForm)
  const [savedForm, setSavedForm] = useState<FormState>(initialForm)

  const hasChanges = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm])

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const result = await loadFiscalEnvironmentAction()
      if (result.data) {
        setEnv(result.data)
        const loaded = buildFormState(result.data)
        setForm(loaded)
        setSavedForm(loaded)
      }
      setLoading(false)
    }

    load()
  }, [])

  /* ── Ambiente handlers ──────────────────────────────────────────── */

  const handleAmbienteChange = (value: string) => {
    if (value === 'producao' && form.ambiente !== 'producao') {
      setPendingAmbiente(value)
      setConfirmProducao(true)
      return
    }
    updateField('ambiente', value)
  }

  const handleConfirmProducao = () => {
    if (pendingAmbiente) updateField('ambiente', pendingAmbiente)
    setConfirmProducao(false)
    setPendingAmbiente(null)
  }

  /* ── Item info toggle ───────────────────────────────────────────── */

  const toggleItemInfo = useCallback((key: string) => {
    setForm((prev) => ({
      ...prev,
      itemInfoFields: prev.itemInfoFields.map((f) =>
        f.key === key ? { ...f, enabled: !f.enabled } : f
      ),
    }))
  }, [])

  /* ── Observações padrão ─────────────────────────────────────────── */

  const addObservacao = useCallback(() => {
    setForm((prev) => ({ ...prev, observacoesPadrao: [...prev.observacoesPadrao, ''] }))
  }, [])

  const updateObservacao = useCallback((index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      observacoesPadrao: prev.observacoesPadrao.map((o, i) => (i === index ? value : o)),
    }))
  }, [])

  const removeObservacao = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      observacoesPadrao: prev.observacoesPadrao.filter((_, i) => i !== index),
    }))
  }, [])

  /* ── Save ────────────────────────────────────────────────────────── */

  const handleSave = async () => {
    setSaving(true)
    const result = await saveFiscalEnvironmentAction({
      id: env?.id,
      ambiente: form.ambiente,
      serie_padrao_nfe: form.seriePadraoNfe,
      proximo_numero_nfe: parseInt(form.proximoNumeroNfe, 10) || 1,
      tipo_emissao: form.tipoEmissao,
      emissao_ativa: form.emissaoAtiva,
      max_itens_por_nota: parseInt(form.maxItensPorNota, 10) || 100,
      ultima_nota_nfe: parseInt(form.ultimaNotaNfe, 10) || 0,
      serie_nfce: form.serieNfce,
      nota_inicial_nfce: parseInt(form.notaInicialNfce, 10) || 1,
      ultima_nota_nfce: parseInt(form.ultimaNotaNfce, 10) || 0,
      csc_id_nfce: form.cscIdNfce.trim() || null,
      csc_numero_nfce: form.cscNumeroNfce.trim() || null,
      codigo_referencia_nota: form.codigoReferenciaNota,
      desconto_impostos_prazo: form.descontoImpostosPrazo,
      bloquear_retorno_parcial_remessa: form.bloquearRetornoParcialRemessa,
      icms_base_pis_cofins: form.icmsBasePisCofins,
      frete_base_icms: form.freteBaseIcms,
      modalidade_frete_padrao: form.modalidadeFretePadrao,
      parametros_jsonb: {
        item_info_fields: form.itemInfoFields,
        observacoes_padrao: form.observacoesPadrao.filter((o) => o.trim()),
      },
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Ambiente de emissão salvo com sucesso.')
      setSavedForm({ ...form })
    }
    setSaving(false)
  }

  /* ── Loading skeleton ───────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    )
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold font-heading text-gradient-navy">Ambiente de Emissão</h1>
          <p className="text-muted-foreground mt-1">
            Controle de homologação, produção, série, numeração, impostos e habilitação operacional.
          </p>
        </div>
        <Button className="gradient-navy border-0 text-white gap-2" onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      {/* Summary Panel */}
      <FiscalPageSummaryPanel
        badges={[
          { label: form.ambiente === 'producao' ? 'Produção' : 'Homologação', tone: form.ambiente === 'producao' ? 'success' : 'info' },
          { label: form.emissaoAtiva ? 'Emissão ativa' : 'Emissão inativa', tone: form.emissaoAtiva ? 'success' : 'warning' },
          { label: 'Controle operacional', tone: 'neutral' },
        ]}
        items={[
          {
            label: 'Status',
            value: form.emissaoAtiva ? 'Operação habilitada' : 'Operação controlada',
            detail: 'Esta página define como a empresa opera na emissão, não as regras fiscais da base.',
          },
          {
            label: 'Pendências',
            value: form.seriePadraoNfe && form.proximoNumeroNfe && form.tipoEmissao ? 'Sem lacunas locais' : 'Revisar parâmetros básicos',
            detail: 'A checagem final ainda depende da prontidão fiscal geral da empresa.',
          },
          {
            label: 'Última atualização',
            value: env?.updated_at ? new Date(env.updated_at).toLocaleDateString('pt-BR') : 'Ainda não salvo',
            detail: hasChanges ? 'Existem alterações locais ainda não salvas.' : 'Sem alterações pendentes nesta página.',
          },
        ]}
        helperText="Aqui ficam parâmetros operacionais de emissão, configurações da nota, impostos e frete. Dados do emissor, vínculos com bases fiscais e certificado digital são administrados em páginas separadas."
      />

      <FiscalReadinessCard />

      {/* Production warning */}
      <div className="rounded-2xl border bg-amber-50/60 p-4 text-sm text-amber-800 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          A liberação de produção e a ativação da emissão passam por uma checagem real de prontidão fiscal no backend.
          Se houver bloqueios, o salvamento explica o que ainda precisa ser resolvido.
        </span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 1) AMBIENTE OPERACIONAL                                   */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Radio className="h-5 w-5 text-bronze" />
              Ambiente operacional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
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
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${form.ambiente === 'homologacao' ? 'bg-blue-500' : 'bg-muted/30'}`}>
                    <Shield className={`h-5 w-5 ${form.ambiente === 'homologacao' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <div className={`font-semibold ${form.ambiente === 'homologacao' ? 'text-blue-700' : 'text-muted-foreground'}`}>Homologação</div>
                    <div className="text-xs text-muted-foreground">Ambiente de testes e validações</div>
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
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${form.ambiente === 'producao' ? 'bg-emerald-500' : 'bg-muted/30'}`}>
                    <CheckCircle2 className={`h-5 w-5 ${form.ambiente === 'producao' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <div className={`font-semibold ${form.ambiente === 'producao' ? 'text-emerald-700' : 'text-muted-foreground'}`}>Produção</div>
                    <div className="text-xs text-muted-foreground">NF-e com validade jurídica</div>
                  </div>
                </div>
              </button>
            </div>

            <AnimatePresence>
              {form.ambiente === 'homologacao' ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Notas emitidas em homologação não possuem validade jurídica e devem ser usadas apenas em testes.</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 2) CONFIGURAÇÕES DA NOTA                                  */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <FileText className="h-5 w-5 text-bronze" />
              Configurações da nota
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Max items */}
            <div className="space-y-2 max-w-xs">
              <Label className="flex items-center gap-1">
                Número máximo de itens
                <FiscalHelpText text="Quantidade máxima de itens que uma nota fiscal pode conter. O padrão são 100 itens." />
              </Label>
              <Input
                type="number"
                min="1"
                max="990"
                value={form.maxItensPorNota}
                onChange={(e) => updateField('maxItensPorNota', e.target.value)}
                className="bg-white/60"
              />
            </div>

            <Separator />

            {/* NF-e */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Configurações da NF-e</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Série
                    <FiscalHelpText text="Série usada na emissão de NF-e. O padrão mais comum é 1." />
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="999"
                    value={form.seriePadraoNfe}
                    onChange={(e) => updateField('seriePadraoNfe', e.target.value)}
                    className="bg-white/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Nota inicial
                    <FiscalHelpText text="Número da primeira nota fiscal a ser emitida nesta série." />
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.proximoNumeroNfe}
                    onChange={(e) => updateField('proximoNumeroNfe', e.target.value)}
                    className="bg-white/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Última nota
                    <FiscalHelpText text="Número da última nota fiscal emitida nesta série. Usado para controle e continuidade." />
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.ultimaNotaNfe}
                    onChange={(e) => updateField('ultimaNotaNfe', e.target.value)}
                    className="bg-white/60"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* NFC-e */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Configurações da NFC-e</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Série</Label>
                  <Input
                    type="number"
                    min="0"
                    max="999"
                    value={form.serieNfce}
                    onChange={(e) => updateField('serieNfce', e.target.value)}
                    className="bg-white/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nota inicial</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.notaInicialNfce}
                    onChange={(e) => updateField('notaInicialNfce', e.target.value)}
                    className="bg-white/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Última nota</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.ultimaNotaNfce}
                    onChange={(e) => updateField('ultimaNotaNfce', e.target.value)}
                    className="bg-white/60"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    CSC Identificador
                    <FiscalHelpText text="Código de Segurança do Contribuinte fornecido pela SEFAZ. Obrigatório para emissão de NFC-e em produção." />
                  </Label>
                  <Input
                    value={form.cscIdNfce}
                    onChange={(e) => updateField('cscIdNfce', e.target.value)}
                    placeholder="Ex: 1234567890"
                    className="bg-white/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    CSC Número
                    <FiscalHelpText text="Token alfanumérico do CSC fornecido pela SEFAZ. Usado junto com o identificador para validar NFC-e." />
                  </Label>
                  <Input
                    value={form.cscNumeroNfce}
                    onChange={(e) => updateField('cscNumeroNfce', e.target.value)}
                    placeholder="Token do CSC"
                    className="bg-white/60"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 3) CÓDIGO DE REFERÊNCIA NA NOTA                           */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Hash className="h-5 w-5 text-bronze" />
              Código de referência na nota
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border p-5 bg-muted/5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Para alterar o código de referência do produto destacado no DANFE, todos os produtos devem possuir o código escolhido
                devidamente configurado. Para isso, escolha qual das opções de referência abaixo será destacada no DANFE:
              </p>
              <div className="space-y-3">
                {CODIGO_REFERENCIA_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <div className="relative flex items-center justify-center">
                      <input
                        type="radio"
                        name="codigoReferencia"
                        value={option.value}
                        checked={form.codigoReferenciaNota === option.value}
                        onChange={() => updateField('codigoReferenciaNota', option.value)}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 peer-checked:border-blue-600 transition-colors" />
                      <div className="absolute h-2.5 w-2.5 rounded-full bg-blue-600 scale-0 peer-checked:scale-100 transition-transform" />
                    </div>
                    <span className="text-sm group-hover:text-foreground transition-colors">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 4) IMPOSTOS E FRETE                                       */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Truck className="h-5 w-5 text-bronze" />
              Impostos e frete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {/* Toggle rows */}
            {[
              {
                key: 'descontoImpostosPrazo' as const,
                label: 'Considerar desconto nos impostos em venda à prazo',
                help: 'Quando habilitado, o desconto de condição de pagamento é aplicado antes do cálculo dos impostos.',
              },
              {
                key: 'bloquearRetornoParcialRemessa' as const,
                label: 'Bloquear retorno parcial das mercadorias em remessa para venda fora do estabelecimento',
                help: 'Impede que seja feito retorno parcial em operações de remessa fora do estabelecimento.',
              },
              {
                key: 'icmsBasePisCofins' as const,
                label: 'Considerar valor de ICMS na base de cálculo do PIS e COFINS',
                help: 'Quando habilitado, o valor de ICMS compõe a base de cálculo de PIS e COFINS.',
              },
              {
                key: 'freteBaseIcms' as const,
                label: 'Considerar o valor do frete no cálculo do ICMS',
                help: 'Quando habilitado, o valor do frete é adicionado à base de cálculo do ICMS.',
              },
            ].map((item, index, arr) => (
              <div key={item.key}>
                <div className="flex items-center justify-between py-4 px-1">
                  <div className="flex-1 pr-4">
                    <Label className="flex items-center gap-1 text-sm font-normal cursor-pointer">
                      {item.label}
                      <FiscalHelpText text={item.help} />
                    </Label>
                  </div>
                  <Switch
                    checked={form[item.key]}
                    onCheckedChange={(value) => updateField(item.key, value)}
                  />
                </div>
                {index < arr.length - 1 && <Separator />}
              </div>
            ))}

            <Separator />

            <div className="pt-4 space-y-2">
              <Label className="flex items-center gap-1">
                Modalidade padrão do frete
                <FiscalHelpText text="Define a modalidade de frete assumida por padrão ao emitir uma NF-e. Pode ser alterada individualmente por documento." />
              </Label>
              <Select value={form.modalidadeFretePadrao} onValueChange={(value) => updateField('modalidadeFretePadrao', value || form.modalidadeFretePadrao)}>
                <SelectTrigger className="bg-white/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODALIDADE_FRETE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 5) INFORMAÇÕES ADICIONAIS DOS ITENS                       */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Package className="h-5 w-5 text-bronze" />
              Informações adicionais dos itens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {form.itemInfoFields.map((field, index) => (
              <div key={field.key}>
                <div className="flex items-center justify-between py-3.5 px-1">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="text-sm font-medium">{field.label}</div>
                    <div className="text-xs text-muted-foreground">Legenda: {field.legend}</div>
                  </div>
                  <Switch
                    checked={field.enabled}
                    onCheckedChange={() => toggleItemInfo(field.key)}
                  />
                </div>
                {index < form.itemInfoFields.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 6) OBSERVAÇÕES PADRÃO                                     */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-bronze" />
              Observações padrão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.observacoesPadrao.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma observação cadastrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {form.observacoesPadrao.map((obs, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Input
                      value={obs}
                      onChange={(e) => updateObservacao(index, e.target.value)}
                      placeholder="Digite a observação padrão..."
                      className="bg-white/60 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-red-500"
                      onClick={() => removeObservacao(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="gap-2 text-sm"
              onClick={addObservacao}
            >
              <Plus className="h-4 w-4" />
              Adicionar observação
            </Button>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 7) TIPO DE EMISSÃO + EMISSÃO ATIVA                       */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Power className="h-5 w-5 text-bronze" />
              Tipo de emissão e controle operacional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Tipo de emissão
                <FiscalHelpText text="Use Normal no fluxo principal. Os modos de contingência entram apenas quando a operação fiscal exigir procedimentos alternativos autorizados." />
              </Label>
              <Select value={form.tipoEmissao} onValueChange={(value) => updateField('tipoEmissao', value || 'normal')}>
                <SelectTrigger className="bg-white/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_EMISSAO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/5">
              <div className="flex items-center gap-3">
                <Power className={`h-5 w-5 ${form.emissaoAtiva ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-sm font-medium">Emissão ativa</div>
                  <div className="text-xs text-muted-foreground">
                    Quando ativada, a operação fica autorizada a emitir NF-e dentro do ambiente configurado.
                  </div>
                </div>
              </div>
              <Switch checked={form.emissaoAtiva} onCheckedChange={(value) => updateField('emissaoAtiva', value)} />
            </div>
          </CardContent>
        </Card>

      </motion.div>

      {/* Mobile sticky save */}
      <div className="sm:hidden sticky bottom-4 z-10">
        <Button className="w-full h-12 gradient-navy border-0 text-white text-base gap-2 shadow-lg" onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Salvar ambiente de emissão
        </Button>
      </div>

      {/* Production confirmation dialog */}
      <AlertDialog open={confirmProducao} onOpenChange={setConfirmProducao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar uso em produção
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ao mudar para <strong>Produção</strong>, o sistema passa a tratar a empresa como candidata à emissão com validade jurídica.
              O backend continuará bloqueando a gravação se a prontidão fiscal ainda estiver incompleta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmProducao} className="bg-emerald-600 hover:bg-emerald-700">
              Confirmar produção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
