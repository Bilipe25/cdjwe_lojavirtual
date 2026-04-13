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
} from 'lucide-react'
import {
  emitNFeAction,
  cancelNFeAction,
  sendCartaCorrecaoAction,
  generateDanfeAction,
} from '@/app/admin/fiscal-review/actions'

// ─── Types ────────────────────────────────────────

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

type FiscalStatus = 'none' | 'pending' | 'processing' | 'authorized' | 'denied' | 'cancelled' | 'correction' | 'error'

const FISCAL_STATUS_CONFIG: Record<FiscalStatus, { label: string; color: string; icon: React.ElementType }> = {
  none:       { label: 'Sem NF-e',    color: 'bg-slate-100 text-slate-600 border-slate-200',      icon: FileWarning },
  pending:    { label: 'Pendente',    color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Clock },
  processing: { label: 'Processando', color: 'bg-amber-50 text-amber-700 border-amber-200',      icon: Loader2 },
  authorized: { label: 'Autorizada',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ShieldCheck },
  denied:     { label: 'Rejeitada',   color: 'bg-red-50 text-red-700 border-red-200',             icon: ShieldAlert },
  cancelled:  { label: 'Cancelada',   color: 'bg-slate-100 text-slate-500 border-slate-300',      icon: Ban },
  correction: { label: 'CC-e',        color: 'bg-orange-50 text-orange-700 border-orange-200',    icon: Edit3 },
  error:      { label: 'Erro',        color: 'bg-red-50 text-red-700 border-red-200',             icon: ShieldX },
}

// ─── Props ────────────────────────────────────────

interface FiscalSectionProps {
  orderId: string
  orderStatus: string
}

// ─── Component ────────────────────────────────────

export function FiscalSection({ orderId, orderStatus }: FiscalSectionProps) {
  const [fiscalDoc, setFiscalDoc] = useState<FiscalDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [emitting, setEmitting] = useState(false)
  const [generatingDanfe, setGeneratingDanfe] = useState(false)

  // Modal states
  const [emitModal, setEmitModal] = useState<'55' | '65' | null>(null)
  const [cancelModal, setCancelModal] = useState(false)
  const [correctionModal, setCorrectionModal] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [correcaoText, setCorrecaoText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadFiscalDoc = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('fiscal_documents')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      setFiscalDoc(data as FiscalDoc)
    } else {
      setFiscalDoc(null)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    loadFiscalDoc()
  }, [loadFiscalDoc])

  const status: FiscalStatus = fiscalDoc
    ? (fiscalDoc.document_status as FiscalStatus) || 'pending'
    : 'none'

  const config = FISCAL_STATUS_CONFIG[status] || FISCAL_STATUS_CONFIG.none
  const StatusIcon = config.icon

  // ─── Handlers ─────────────────────────────────

  const handleEmit = async (modelo: '55' | '65') => {
    setEmitting(true)
    setEmitModal(null)
    toast.info(modelo === '55' ? 'Emitindo NF-e...' : 'Emitindo NFC-e...', { duration: 10000 })

    try {
      const result = await emitNFeAction(orderId, modelo)
      if (result.success) {
        toast.success('Documento fiscal processado com sucesso!', {
          description: result.data?.chaveAcesso
            ? `Chave: ${result.data.chaveAcesso.substring(0, 20)}...`
            : undefined,
        })
        await loadFiscalDoc()
      } else {
        const errorMsg = typeof result.error === 'object' && result.error !== null
          ? (result.error as Record<string, string>).message || 'Erro na emissão.'
          : String(result.error || 'Erro na emissão.')
        toast.error(errorMsg)
      }
    } catch {
      toast.error('Erro inesperado ao emitir documento fiscal.')
    } finally {
      setEmitting(false)
    }
  }

  const handleCancel = async () => {
    if (justificativa.trim().length < 15) {
      toast.error('Justificativa deve ter no mínimo 15 caracteres.')
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
        const errorMsg = typeof result.error === 'object' && result.error !== null
          ? (result.error as Record<string, string>).message || 'Erro no cancelamento.'
          : String(result.error || 'Erro no cancelamento.')
        toast.error(errorMsg)
      }
    } catch {
      toast.error('Erro inesperado ao cancelar.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCorrection = async () => {
    if (correcaoText.trim().length < 15) {
      toast.error('Texto da correção deve ter no mínimo 15 caracteres.')
      return
    }
    if (!fiscalDoc) return

    setSubmitting(true)
    try {
      const result = await sendCartaCorrecaoAction(fiscalDoc.id, correcaoText.trim())
      if (result.success) {
        toast.success('Carta de Correção enviada com sucesso!')
        setCorrectionModal(false)
        setCorrecaoText('')
        await loadFiscalDoc()
      } else {
        const errorMsg = typeof result.error === 'object' && result.error !== null
          ? (result.error as Record<string, string>).message || 'Erro na carta de correção.'
          : String(result.error || 'Erro na carta de correção.')
        toast.error(errorMsg)
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
        // Open DANFE download via API route
        window.open(`/api/fiscal/danfe/${fiscalDoc.id}`, '_blank')
        toast.success('DANFE gerado!')
      } else {
        const errorMsg = typeof result.error === 'object' && result.error !== null
          ? (result.error as Record<string, string>).message || 'Erro ao gerar DANFE.'
          : String(result.error || 'Erro ao gerar DANFE.')
        toast.error(errorMsg)
      }
    } catch {
      toast.error('Erro ao gerar DANFE.')
    } finally {
      setGeneratingDanfe(false)
    }
  }

  // ─── Render ───────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  const canEmit = !fiscalDoc && !['cancelled', 'pending'].includes(orderStatus)
  const canCancel = fiscalDoc?.document_status === 'authorized'
  const canCorrect = ['authorized', 'correction'].includes(fiscalDoc?.document_status || '')
  const canDanfe = ['authorized', 'correction', 'pending', 'processing'].includes(fiscalDoc?.document_status || '')
  const isHomologacao = fiscalDoc?.ambiente === 'homologacao'

  return (
    <>
      <div className="space-y-3">
        <h4 className="font-bold text-lg text-navy flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Nota Fiscal Eletrônica
        </h4>

        {/* No fiscal document */}
        {!fiscalDoc && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <FileWarning className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">
              Nenhuma NF-e vinculada a este pedido
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Emita uma nota fiscal para gerar o documento auxiliar (DANFE).
            </p>
            {canEmit && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 rounded-xl font-bold"
                  onClick={() => setEmitModal('55')}
                  disabled={emitting}
                >
                  {emitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Emitir NF-e
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-xl font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setEmitModal('65')}
                  disabled={emitting}
                >
                  <Send className="h-4 w-4" />
                  Emitir NFC-e
                </Button>
              </div>
            )}
            {!canEmit && orderStatus === 'pending' && (
              <p className="text-xs text-amber-600 mt-2">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Pedido com status &quot;Pendente&quot; não permite emissão fiscal.
              </p>
            )}
          </div>
        )}

        {/* Fiscal document exists */}
        {fiscalDoc && (
          <div className="rounded-xl border border-border/60 bg-white shadow-sm overflow-hidden">
            {/* Homologação Banner */}
            {isHomologacao && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 font-medium flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                SEM VALOR FISCAL — Emitido em ambiente de homologação
              </div>
            )}

            {/* Header with status */}
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.color}`}>
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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Série {fiscalDoc.serie} • {fiscalDoc.natureza_operacao}
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

            {/* Details grid */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">Chave de Acesso</span>
                <span className="font-mono text-xs break-all text-slate-700">
                  {fiscalDoc.chave_acesso
                    ? fiscalDoc.chave_acesso.replace(/(.{4})/g, '$1 ').trim()
                    : '—'
                  }
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-0.5">Protocolo de Autorização</span>
                <span className="font-mono text-xs text-slate-700">
                  {fiscalDoc.protocolo_autorizacao || '—'}
                </span>
              </div>
              {fiscalDoc.data_autorizacao && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-0.5">Data Autorização</span>
                  <span className="text-xs text-slate-700">
                    {new Date(fiscalDoc.data_autorizacao).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
              {fiscalDoc.motivo_status && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-0.5">Motivo SEFAZ</span>
                  <span className="text-xs text-slate-700">{fiscalDoc.motivo_status}</span>
                </div>
              )}
              {fiscalDoc.correction_count && fiscalDoc.correction_count > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-0.5">Cartas de Correção</span>
                  <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                    {fiscalDoc.correction_count} CC-e enviada(s)
                  </Badge>
                </div>
              )}
            </div>

            <Separator />

            {/* Action buttons */}
            <div className="p-4 flex flex-wrap gap-2">
              {canDanfe && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-lg text-xs font-bold"
                  onClick={handleDanfe}
                  disabled={generatingDanfe}
                >
                  {generatingDanfe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {isHomologacao ? 'DANFE (Sem Valor)' : 'DANFE'}
                </Button>
              )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-lg text-xs font-bold text-red-600 border-red-200 hover:bg-red-50"
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
                  className="gap-2 rounded-lg text-xs font-bold text-orange-600 border-orange-200 hover:bg-orange-50"
                  onClick={() => setCorrectionModal(true)}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Carta de Correção
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 rounded-lg text-xs font-bold text-navy ml-auto"
                onClick={() => window.open(`/admin/fiscal-review/${orderId}`, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Revisão Fiscal
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Emit Confirmation Modal ─── */}
      <Dialog open={emitModal !== null} onOpenChange={(open) => !open && setEmitModal(null)}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
              <Send className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogTitle className="text-center text-xl">
              Emitir {emitModal === '65' ? 'NFC-e' : 'NF-e'}?
            </DialogTitle>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Isso irá gerar o XML fiscal, assinar digitalmente e submeter ao SEFAZ.
              Confirme para prosseguir.
            </p>
          </DialogHeader>
          <DialogFooter className="flex-row gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setEmitModal(null)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-200 font-bold"
              onClick={() => emitModal && handleEmit(emitModal)}
              disabled={emitting}
            >
              {emitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Confirmar Emissão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Modal ─── */}
      <Dialog open={cancelModal} onOpenChange={setCancelModal}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto h-14 w-14 rounded-full bg-red-50 flex items-center justify-center mb-2">
              <XCircle className="h-7 w-7 text-red-600" />
            </div>
            <DialogTitle className="text-center text-xl">Cancelar NF-e</DialogTitle>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Informe a justificativa do cancelamento (mínimo 15 caracteres).
            </p>
          </DialogHeader>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Motivo do cancelamento..."
            className="w-full h-28 p-3 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
            maxLength={255}
          />
          <div className="text-right text-xs text-muted-foreground">
            {justificativa.trim().length}/255 (mín. 15)
          </div>
          <DialogFooter className="flex-row gap-3 mt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCancelModal(false)}>
              Voltar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-200 font-bold"
              onClick={handleCancel}
              disabled={submitting || justificativa.trim().length < 15}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Correction Modal ─── */}
      <Dialog open={correctionModal} onOpenChange={setCorrectionModal}>
        <DialogContent className="max-w-md rounded-2xl border-0 shadow-2xl">
          <DialogHeader>
            <div className="mx-auto h-14 w-14 rounded-full bg-orange-50 flex items-center justify-center mb-2">
              <Edit3 className="h-7 w-7 text-orange-600" />
            </div>
            <DialogTitle className="text-center text-xl">Carta de Correção</DialogTitle>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Descreva a correção a ser registrada (mínimo 15 caracteres). Não pode alterar valores ou dados cadastrais.
            </p>
          </DialogHeader>
          <textarea
            value={correcaoText}
            onChange={(e) => setCorrecaoText(e.target.value)}
            placeholder="Texto da correção..."
            className="w-full h-28 p-3 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
            maxLength={1000}
          />
          <div className="text-right text-xs text-muted-foreground">
            {correcaoText.trim().length}/1000 (mín. 15)
          </div>
          <DialogFooter className="flex-row gap-3 mt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCorrectionModal(false)}>
              Voltar
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg shadow-orange-200 font-bold"
              onClick={handleCorrection}
              disabled={submitting || correcaoText.trim().length < 15}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Edit3 className="h-4 w-4 mr-2" />}
              Enviar CC-e
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Public helper for badges ───────────────────

export { FISCAL_STATUS_CONFIG }
export type { FiscalStatus }
