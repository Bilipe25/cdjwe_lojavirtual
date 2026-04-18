'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  FileText,
  Send,
  XCircle,
  Edit3,
  Download,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  Ban,
  FileWarning,
  AlertTriangle,
  Eye,
} from 'lucide-react'
import {
  emitNFeAction,
  cancelNFeAction,
  sendCartaCorrecaoAction,
  generateDanfeAction,
  getFiscalEmissionEnvironmentAction,
} from '@/app/admin/fiscal-review/actions'
import { OrderFiscalWorkspaceTabs, useOrderFiscalWorkspace } from '@/app/admin/orders/components/OrderFiscalWorkspaceTabs'

interface FiscalDoc {
  id: string
  document_model: string
  document_status: string
  chave_acesso: string | null
  numero_nf: number | null
  serie: string | null
  natureza_operacao: string | null
  protocolo_autorizacao: string | null
  data_autorizacao: string | null
  codigo_status: number | null
  motivo_status: string | null
  ambiente: string | null
  emitted_at: string | null
  cancelled_at: string | null
  correction_count: number | null
  danfe_path: string | null
  valor_total_nota: number | null
}

interface FiscalOperationalEnvironment {
  ambiente: 'homologacao' | 'producao'
  emissaoAtiva: boolean
  tipoEmissao: string
  seriePadraoNfe: string | null
  proximoNumeroNfe: number | null
  serieNfce: string | null
  proximoNumeroNfce: number | null
}

type FiscalStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'authorized'
  | 'denied'
  | 'cancelled'
  | 'correction'
  | 'error'

const FISCAL_STATUS_CONFIG: Record<
  FiscalStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  none: { label: 'Sem NF-e', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: FileWarning },
  pending: { label: 'Pendente', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
  processing: { label: 'Processando', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Loader2 },
  authorized: { label: 'Autorizada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ShieldCheck },
  denied: { label: 'Rejeitada', color: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
  cancelled: { label: 'Cancelada', color: 'bg-slate-100 text-slate-500 border-slate-300', icon: Ban },
  correction: { label: 'CC-e', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: Edit3 },
  error: { label: 'Erro', color: 'bg-red-50 text-red-700 border-red-200', icon: ShieldX },
}

const REEMITTABLE_DOCUMENT_STATUSES = new Set(['denied', 'cancelled', 'error'])

interface FiscalSectionProps {
  orderId: string
  orderStatus: string
}

function humanizeFiscalSchemaError(message: string) {
  const normalized = message.trim()
  const lower = normalized.toLowerCase()

  const schemaMappings: Array<{ pattern: RegExp; replacement: string }> = [
    {
      pattern: /emit\/enderemit\/xlgr/i,
      replacement: 'Endereco fiscal do emitente: logradouro nao informado ou invalido.',
    },
    {
      pattern: /emit\/enderemit\/xbairro/i,
      replacement: 'Endereco fiscal do emitente: bairro nao informado ou invalido.',
    },
    {
      pattern: /emit\/enderemit\/xmun/i,
      replacement: 'Endereco fiscal do emitente: cidade nao informada ou invalida.',
    },
    {
      pattern: /emit\/enderemit\/cmun/i,
      replacement: 'Endereco fiscal do emitente: codigo IBGE do municipio nao informado ou invalido.',
    },
    {
      pattern: /emit\/enderemit\/uf/i,
      replacement: 'Endereco fiscal do emitente: UF nao informada ou invalida.',
    },
    {
      pattern: /emit\/enderemit\/cep/i,
      replacement: 'Endereco fiscal do emitente: CEP invalido.',
    },
    {
      pattern: /emit\/ie/i,
      replacement: 'Emitente: inscricao estadual nao informada ou invalida.',
    },
    {
      pattern: /dest\/enderdest\/xlgr/i,
      replacement: 'Endereco fiscal do destinatario: logradouro nao informado ou invalido.',
    },
    {
      pattern: /dest\/enderdest\/xbairro/i,
      replacement: 'Endereco fiscal do destinatario: bairro nao informado ou invalido.',
    },
    {
      pattern: /dest\/enderdest\/xmun/i,
      replacement: 'Endereco fiscal do destinatario: cidade nao informada ou invalida.',
    },
    {
      pattern: /dest\/enderdest\/cmun/i,
      replacement: 'Endereco fiscal do destinatario: codigo IBGE do municipio nao informado ou invalido.',
    },
    {
      pattern: /dest\/enderdest\/uf/i,
      replacement: 'Endereco fiscal do destinatario: UF nao informada ou invalida.',
    },
    {
      pattern: /dest\/enderdest\/cep/i,
      replacement: 'Endereco fiscal do destinatario: CEP invalido.',
    },
    {
      pattern: /dest\/ie/i,
      replacement: 'Destinatario: inscricao estadual nao informada ou invalida.',
    },
    {
      pattern: /cofins\/cofinsoutr\/cst/i,
      replacement: 'COFINS CST incompatível com o grupo XML gerado para o item.',
    },
    {
      pattern: /pis\/pisoutr\/cst/i,
      replacement: 'PIS CST incompatível com o grupo XML gerado para o item.',
    },
    {
      pattern: /imposto\/ipi\//i,
      replacement: 'IPI do item incompatível com a ordem ou estrutura XML gerada.',
    },
    {
      pattern: /icms\/icms00\/vbcfcp/i,
      replacement: 'FCP do item foi gerado com campo incompatível para o grupo ICMS00.',
    },
  ]

  for (const mapping of schemaMappings) {
    if (mapping.pattern.test(lower)) {
      return mapping.replacement
    }
  }

  return normalized
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string' && message.trim()) return humanizeFiscalSchemaError(message)
  }

  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = error.details
    if (details && typeof details === 'object' && 'motivoStatus' in details) {
      const motivoStatus = details.motivoStatus
      if (typeof motivoStatus === 'string' && motivoStatus.trim()) {
        return humanizeFiscalSchemaError(motivoStatus)
      }
    }
  }

  if (typeof error === 'string' && error.trim()) return humanizeFiscalSchemaError(error)

  return fallback
}

function getActionErrorDescription(error: unknown) {
  if (!error || typeof error !== 'object' || !('details' in error)) return undefined

  const details = error.details
  if (!details || typeof details !== 'object') return undefined

  const parts: string[] = []

  if ('codigoStatus' in details && typeof details.codigoStatus === 'number') {
    parts.push(`SEFAZ cStat ${details.codigoStatus}`)
  }

  if ('ambiente' in details && typeof details.ambiente === 'string') {
    parts.push(`Ambiente ${details.ambiente === 'producao' ? 'producao' : 'homologacao'}`)
  }

  if ('modelo' in details && typeof details.modelo === 'string') {
    parts.push(details.modelo === '65' ? 'Modelo NFC-e' : 'Modelo NF-e')
  }

  return parts.length > 0 ? parts.join(' | ') : undefined
}

function FiscalSectionContent({ orderId, orderStatus }: FiscalSectionProps) {
  const workspace = useOrderFiscalWorkspace()
  const [fiscalDoc, setFiscalDoc] = useState<FiscalDoc | null>(null)
  const [operationalEnvironment, setOperationalEnvironment] = useState<FiscalOperationalEnvironment | null>(null)
  const [loading, setLoading] = useState(true)
  const [emitting, setEmitting] = useState(false)
  const [generatingDanfe, setGeneratingDanfe] = useState(false)
  const [emitModal, setEmitModal] = useState<'55' | '65' | null>(null)
  const [cancelModal, setCancelModal] = useState(false)
  const [correctionModal, setCorrectionModal] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [correcaoText, setCorrecaoText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadFiscalDoc = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data, error }, envResult] = await Promise.all([
      supabase
        .from('fiscal_documents')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getFiscalEmissionEnvironmentAction(),
    ])

    const nextFiscalDoc = !error && data ? (data as FiscalDoc) : null
    const nextOperationalEnvironment = envResult.success && envResult.data
      ? (envResult.data as FiscalOperationalEnvironment)
      : null

    setFiscalDoc(nextFiscalDoc)
    setOperationalEnvironment(nextOperationalEnvironment)

    setLoading(false)

    return {
      fiscalDoc: nextFiscalDoc,
      operationalEnvironment: nextOperationalEnvironment,
    }
  }, [orderId])

  useEffect(() => {
    loadFiscalDoc()
  }, [loadFiscalDoc])

  const status: FiscalStatus = fiscalDoc
    ? ((fiscalDoc.document_status as FiscalStatus) || 'pending')
    : 'none'

  const config = FISCAL_STATUS_CONFIG[status] || FISCAL_STATUS_CONFIG.none
  const StatusIcon = config.icon
  const emissionToastId = `order-fiscal-emission-${orderId}`

  const ensureSavedWorkspace = useCallback(async () => {
    if (!workspace?.isDirty) return true

    toast.info('Salvando draft fiscal antes de continuar...')
    const saved = await workspace.saveDraft()
    if (!saved) {
      toast.error('Nao foi possivel salvar o draft fiscal atual. Revise volumes, transporte e CFOP antes de continuar.')
      return false
    }

    await loadFiscalDoc()
    return true
  }, [workspace, loadFiscalDoc])

  const handleEmit = async (modelo: '55' | '65') => {
    const ready = await ensureSavedWorkspace()
    if (!ready) {
      setEmitModal(null)
      return
    }

    setEmitting(true)
    setEmitModal(null)
    toast.dismiss(emissionToastId)
    toast.info(modelo === '55' ? 'Emitindo NF-e...' : 'Emitindo NFC-e...', {
      id: emissionToastId,
      duration: Infinity,
    })

    try {
      const result = await emitNFeAction(orderId, modelo)
      if (result.success) {
        const refreshed = await loadFiscalDoc()
        const ambiente = result.data?.ambiente === 'producao' ? 'produção' : 'homologação'
        toast.success('Documento fiscal processado com sucesso!', {
          id: emissionToastId,
          description: [
            result.data?.chaveAcesso
              ? `Chave: ${result.data.chaveAcesso.substring(0, 20)}...`
              : refreshed.fiscalDoc?.chave_acesso
                ? `Chave: ${refreshed.fiscalDoc.chave_acesso.substring(0, 20)}...`
                : null,
            `Ambiente: ${ambiente}`,
          ].filter(Boolean).join(' | '),
        })
      } else {
        const refreshed = await loadFiscalDoc()
        const resultErrorDetails =
          result.error && typeof result.error === 'object' && 'details' in result.error
            ? result.error.details
            : undefined
        const refreshedErrorMessage = refreshed.fiscalDoc?.motivo_status?.trim()
        const message = getActionErrorMessage(
          refreshedErrorMessage
            ? { message: refreshedErrorMessage, details: resultErrorDetails }
            : result.error,
          'Erro na emissao.'
        )

        const refreshedDescription = [
          getActionErrorDescription(result.error),
          refreshed.fiscalDoc?.numero_nf ? `Ultima tentativa: NF-e ${refreshed.fiscalDoc.numero_nf}` : null,
          refreshed.fiscalDoc?.document_status ? `Status ${refreshed.fiscalDoc.document_status}` : null,
        ].filter(Boolean).join(' | ')

        const compactMessage = message.length > 96 ? 'Falha na emissao fiscal.' : message
        const combinedDescription = [message, refreshedDescription]
          .filter(Boolean)
          .join(' | ')

        toast.error(compactMessage, {
          id: emissionToastId,
          description: combinedDescription || undefined,
        })
      }
    } catch {
      toast.error('Erro inesperado ao emitir documento fiscal.', {
        id: emissionToastId,
      })
    } finally {
      setEmitting(false)
    }
  }

  const handleCancel = async () => {
    if (justificativa.trim().length < 15) {
      toast.error('Justificativa deve ter no minimo 15 caracteres.')
      return
    }
    if (!fiscalDoc) return

    setSubmitting(true)
    try {
      const result = await cancelNFeAction(fiscalDoc.id, justificativa.trim())
      if (result.success) {
        toast.success('NF-e cancelada com sucesso!')
        setCancelModal(false)
        setJustificativa('')
        await loadFiscalDoc()
      } else {
        toast.error(getActionErrorMessage(result.error, 'Erro no cancelamento.'))
      }
    } catch {
      toast.error('Erro inesperado ao cancelar.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCorrection = async () => {
    if (correcaoText.trim().length < 15) {
      toast.error('Texto da correcao deve ter no minimo 15 caracteres.')
      return
    }
    if (!fiscalDoc) return

    setSubmitting(true)
    try {
      const result = await sendCartaCorrecaoAction(fiscalDoc.id, correcaoText.trim())
      if (result.success) {
        toast.success('Carta de Correcao enviada com sucesso!')
        setCorrectionModal(false)
        setCorrecaoText('')
        await loadFiscalDoc()
      } else {
        toast.error(getActionErrorMessage(result.error, 'Erro na carta de correcao.'))
      }
    } catch {
      toast.error('Erro inesperado.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDanfe = async () => {
    if (!fiscalDoc) return
    setGeneratingDanfe(true)
    try {
      const result = await generateDanfeAction(fiscalDoc.id)
      if (result.success && result.data?.storagePath) {
        window.open(`/api/fiscal/danfe/${fiscalDoc.id}`, '_blank')
        toast.success('DANFE gerado!')
      } else {
        toast.error(getActionErrorMessage(result.error, 'Erro ao gerar DANFE.'))
      }
    } catch {
      toast.error('Erro ao gerar DANFE.')
    } finally {
      setGeneratingDanfe(false)
    }
  }

  const handleDanfePreview = async (modelo: '55' | '65' = '55') => {
    const ready = await ensureSavedWorkspace()
    if (!ready) return

    window.open(`/api/fiscal/danfe-preview/order/${orderId}?modelo=${modelo}`, '_blank', 'noopener,noreferrer')
  }

  const handleOpenFiscalReview = () => {
    const targetUrl = fiscalDoc?.id
      ? `/admin/fiscal-review/documentos/${fiscalDoc.id}`
      : `/admin/fiscal-review/${orderId}`

    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  const canEmit = !fiscalDoc && !['cancelled', 'pending'].includes(orderStatus)
  const canReEmit = Boolean(fiscalDoc?.document_status && REEMITTABLE_DOCUMENT_STATUSES.has(fiscalDoc.document_status))
  const canCancel = fiscalDoc?.document_status === 'authorized'
  const canCorrect = ['authorized', 'correction'].includes(fiscalDoc?.document_status || '')
  const canDanfe = ['authorized', 'correction', 'pending', 'processing'].includes(fiscalDoc?.document_status || '')
  const effectiveEnvironment = fiscalDoc?.ambiente || operationalEnvironment?.ambiente || null
  const isHomologacao = effectiveEnvironment === 'homologacao'
  const isProduction = effectiveEnvironment === 'producao'

  return (
    <>
      <div className="space-y-3">
        <h4 className="flex items-center gap-2 text-lg font-bold text-navy">
          <FileText className="h-5 w-5" />
          Nota Fiscal Eletronica
        </h4>

        {workspace?.isDirty ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Existem alteracoes fiscais pendentes neste pedido. O preview da DANFE e a emissao vao salvar o draft atual automaticamente antes de continuar.
          </div>
        ) : null}

        {!fiscalDoc && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <FileWarning className="h-6 w-6 text-slate-400" />
            </div>
            <p className="mb-1 text-sm font-medium text-slate-600">
              Nenhuma NF-e vinculada a este pedido
            </p>
            <p className="mb-4 text-xs text-slate-400">
              Gere um preview sem valor fiscal para conferencia ou emita a nota para produzir a DANFE oficial.
            </p>

            {operationalEnvironment && (
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                <Badge
                  variant="outline"
                  className={operationalEnvironment.ambiente === 'producao'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'}
                >
                  Ambiente atual: {operationalEnvironment.ambiente === 'producao' ? 'Produção' : 'Homologação'}
                </Badge>
                <Badge
                  variant="outline"
                  className={operationalEnvironment.emissaoAtiva
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-100 text-slate-600'}
                >
                  {operationalEnvironment.emissaoAtiva ? 'Emissão ativa' : 'Emissão inativa'}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-600"
                >
                  Tipo: {operationalEnvironment.tipoEmissao || 'normal'}
                </Badge>
              </div>
            )}

            {operationalEnvironment && (
              <p className={`mb-4 text-xs ${isHomologacao ? 'text-amber-700' : 'text-slate-500'}`}>
                {isHomologacao
                  ? 'A próxima emissão será enviada em homologação e, se autorizada, ficará marcada como sem valor fiscal.'
                  : isProduction
                    ? 'A próxima emissão será enviada em produção com validade jurídica, se a SEFAZ autorizar.'
                    : 'O ambiente operacional atual será usado na próxima emissão fiscal.'}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 rounded-xl border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50"
                onClick={() => handleDanfePreview('55')}
              >
                <Eye className="h-4 w-4" />
                Preview DANFE
              </Button>

              {canEmit && (
                <>
                <Button
                  size="sm"
                  className="gap-2 rounded-xl bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"
                  onClick={() => setEmitModal('55')}
                  disabled={emitting}
                >
                  {emitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Emitir NF-e
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-xl border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setEmitModal('65')}
                  disabled={emitting}
                >
                  <Send className="h-4 w-4" />
                  Emitir NFC-e
                </Button>
                </>
              )}
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              O preview abre um DANFE de conferencia sem valor fiscal e sem autorizacao da SEFAZ.
            </p>

            {!canEmit && orderStatus === 'pending' && (
              <p className="mt-2 text-xs text-amber-600">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                Pedido com status &quot;Pendente&quot; nao permite emissao fiscal.
              </p>
            )}

            {!operationalEnvironment && (
              <p className="mt-2 text-xs text-amber-600">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                Não foi possível carregar o ambiente operacional da emissão para este pedido.
              </p>
            )}
          </div>
        )}

        {fiscalDoc && (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm">
            {isHomologacao && (
              <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                SEM VALOR FISCAL - Emitido em ambiente de homologacao
              </div>
            )}

            {['denied', 'error'].includes(fiscalDoc.document_status || '') && fiscalDoc.motivo_status && (
              <div className="border-b border-red-200 bg-red-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">
                      Motivo da ultima rejeicao
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-red-800">
                      {humanizeFiscalSchemaError(fiscalDoc.motivo_status)}
                    </p>
                    {typeof fiscalDoc.codigo_status === 'number' && (
                      <p className="mt-1 text-xs text-red-700/80">
                        SEFAZ cStat {fiscalDoc.codigo_status}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.color}`}>
                  <StatusIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy">
                      {fiscalDoc.document_model === '65' ? 'NFC-e' : 'NF-e'} #{fiscalDoc.numero_nf}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                      {config.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Serie {fiscalDoc.serie} • {fiscalDoc.natureza_operacao}
                  </p>
                </div>
              </div>

              {fiscalDoc.valor_total_nota && (
                <span className="text-lg font-black text-gradient-bronze">
                  R$ {Number(fiscalDoc.valor_total_nota).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 p-4 text-sm sm:grid-cols-2">
              <div>
                <span className="mb-0.5 block text-xs text-muted-foreground">Chave de Acesso</span>
                <span className="break-all font-mono text-xs text-slate-700">
                  {fiscalDoc.chave_acesso ? fiscalDoc.chave_acesso.replace(/(.{4})/g, '$1 ').trim() : '-'}
                </span>
              </div>
              <div>
                <span className="mb-0.5 block text-xs text-muted-foreground">Protocolo de Autorizacao</span>
                <span className="font-mono text-xs text-slate-700">
                  {fiscalDoc.protocolo_autorizacao || '-'}
                </span>
              </div>
              {fiscalDoc.data_autorizacao && (
                <div>
                  <span className="mb-0.5 block text-xs text-muted-foreground">Data Autorizacao</span>
                  <span className="text-xs text-slate-700">
                    {new Date(fiscalDoc.data_autorizacao).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
              {fiscalDoc.motivo_status && (
                <div>
                  <span className="mb-0.5 block text-xs text-muted-foreground">Motivo SEFAZ</span>
                  <span className="text-xs text-slate-700">{fiscalDoc.motivo_status}</span>
                </div>
              )}
              {fiscalDoc.correction_count && fiscalDoc.correction_count > 0 && (
                <div>
                  <span className="mb-0.5 block text-xs text-muted-foreground">Cartas de Correcao</span>
                  <Badge
                    variant="outline"
                    className="border-orange-200 bg-orange-50 text-[10px] text-orange-700"
                  >
                    {fiscalDoc.correction_count} CC-e enviada(s)
                  </Badge>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2 p-4">
              {canReEmit ? (
                <>
                  <Button
                    size="sm"
                    className="gap-2 rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"
                    onClick={() => setEmitModal('55')}
                    disabled={emitting}
                  >
                    {emitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Emitir novamente NF-e
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-lg border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setEmitModal('65')}
                    disabled={emitting}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Emitir novamente NFC-e
                  </Button>
                </>
              ) : null}

              {canDanfe && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-lg text-xs font-bold"
                  onClick={handleDanfe}
                  disabled={generatingDanfe}
                >
                  {generatingDanfe ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {isHomologacao ? 'DANFE (Sem Valor)' : 'DANFE'}
                </Button>
              )}

              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-lg border-red-200 text-xs font-bold text-red-600 hover:bg-red-50"
                  onClick={() => setCancelModal(true)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancelar NF-e
                </Button>
              )}

              {canCorrect && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-lg border-orange-200 text-xs font-bold text-orange-600 hover:bg-orange-50"
                  onClick={() => setCorrectionModal(true)}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Carta de Correcao
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="ml-auto gap-2 rounded-lg text-xs font-bold text-navy"
                onClick={handleOpenFiscalReview}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {fiscalDoc ? 'Abrir nota fiscal' : 'Revisao Fiscal'}
              </Button>
            </div>

            {canReEmit ? (
              <div className="border-t border-slate-200/80 px-4 py-3 text-xs text-slate-500">
                Este documento teve encerramento sem autorizacao final. Voce pode emitir novamente usando a mesma base fiscal atual do pedido.
              </div>
            ) : null}
          </div>
        )}
      </div>
      <Dialog open={emitModal !== null} onOpenChange={(open) => !open && setEmitModal(null)}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <Send className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogTitle className="text-center text-xl">
              Emitir {emitModal === '65' ? 'NFC-e' : 'NF-e'}?
            </DialogTitle>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Isso vai gerar o XML fiscal, assinar digitalmente e submeter ao SEFAZ.
              Confirme para prosseguir.
            </p>
          </DialogHeader>
          <DialogFooter className="mt-4 flex-row gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setEmitModal(null)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-xl bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"
              onClick={() => emitModal && handleEmit(emitModal)}
              disabled={emitting}
            >
              {emitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Confirmar Emissao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelModal} onOpenChange={setCancelModal}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <XCircle className="h-7 w-7 text-red-600" />
            </div>
            <DialogTitle className="text-center text-xl">Cancelar NF-e</DialogTitle>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Informe a justificativa do cancelamento (minimo 15 caracteres).
            </p>
          </DialogHeader>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Motivo do cancelamento..."
            className="h-28 w-full resize-none rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            maxLength={255}
          />
          <div className="text-right text-xs text-muted-foreground">
            {justificativa.trim().length}/255 (min. 15)
          </div>
          <DialogFooter className="mt-2 flex-row gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCancelModal(false)}>
              Voltar
            </Button>
            <Button
              className="flex-1 rounded-xl bg-red-600 font-bold text-white shadow-lg shadow-red-200 hover:bg-red-700"
              onClick={handleCancel}
              disabled={submitting || justificativa.trim().length < 15}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctionModal} onOpenChange={setCorrectionModal}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50">
              <Edit3 className="h-7 w-7 text-orange-600" />
            </div>
            <DialogTitle className="text-center text-xl">Carta de Correcao</DialogTitle>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Descreva a correcao a ser registrada (minimo 15 caracteres). Nao pode alterar
              valores ou dados cadastrais.
            </p>
          </DialogHeader>
          <textarea
            value={correcaoText}
            onChange={(e) => setCorrecaoText(e.target.value)}
            placeholder="Texto da correcao..."
            className="h-28 w-full resize-none rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            maxLength={1000}
          />
          <div className="text-right text-xs text-muted-foreground">
            {correcaoText.trim().length}/1000 (min. 15)
          </div>
          <DialogFooter className="mt-2 flex-row gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCorrectionModal(false)}>
              Voltar
            </Button>
            <Button
              className="flex-1 rounded-xl bg-orange-600 font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-700"
              onClick={handleCorrection}
              disabled={submitting || correcaoText.trim().length < 15}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit3 className="mr-2 h-4 w-4" />}
              Enviar CC-e
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function FiscalSection(props: FiscalSectionProps) {
  return (
    <OrderFiscalWorkspaceTabs orderId={props.orderId}>
      <FiscalSectionContent {...props} />
    </OrderFiscalWorkspaceTabs>
  )
}

export { FISCAL_STATUS_CONFIG }
export type { FiscalStatus }
