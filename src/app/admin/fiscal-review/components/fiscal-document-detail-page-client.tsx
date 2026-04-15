'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Ban,
  FileCode2,
  FileSearch,
  Files,
  ReceiptText,
  RefreshCcw,
  ScrollText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { FiscalDocumentDetail } from '../types'
import {
  cancelNFeAction,
  consultFiscalDocumentAction,
  getFiscalDocumentAssetUrlAction,
  getFiscalDocumentDetailAction,
  sendCartaCorrecaoAction,
} from '../actions'
import {
  ArtifactBadge,
  EventStatusBadge,
  eventTone,
  FiscalDocumentStatusBadge,
  formatCurrency,
  formatDateTime,
  formatOrderNumber,
  getSnapshotAdditionalInfo,
  getSnapshotItemCount,
  humanizeEnvironment,
  humanizeEventType,
  humanizeModel,
  humanizeOrderStatus,
  KpiCard,
  MetaRow,
  SectionShell,
  TimelineTone,
} from './fiscal-document-ui'

export function FiscalDocumentDetailPageClient({
  initialData,
}: {
  initialData: FiscalDocumentDetail
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [correctionText, setCorrectionText] = useState('')
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)

  const snapshotSummary = getSnapshotAdditionalInfo(data.document.snapshot)
  const snapshotItemCount = getSnapshotItemCount(data.document.snapshot)
  const canCancel = data.document.documentStatus === 'authorized'
  const canCorrect = ['authorized', 'correction'].includes(data.document.documentStatus)

  async function refreshDetail() {
    const result = await getFiscalDocumentDetailAction(data.document.id)
    if (result.success) {
      setData(result.data)
      return
    }

    toast.error(result.error.message || 'Nao foi possivel atualizar a nota fiscal.')
  }

  function runAsync(task: () => Promise<void>) {
    startTransition(() => {
      void task()
    })
  }

  function handleConsult() {
    runAsync(async () => {
      const result = await consultFiscalDocumentAction(data.document.id)
      if (result.success) {
        toast.success('Consulta fiscal concluida com sucesso.')
        await refreshDetail()
      } else {
        toast.error(result.error?.message || 'Falha na consulta da nota fiscal.')
      }
    })
  }

  function handleOpenDanfe() {
    window.open(`/api/fiscal/danfe/${data.document.id}`, '_blank', 'noopener,noreferrer')
  }

  function handleDownloadXml(assetType: 'xml_envio' | 'xml_retorno' | 'xml_processado') {
    runAsync(async () => {
      const result = await getFiscalDocumentAssetUrlAction(data.document.id, assetType)
      if (result.success && result.data) {
        window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
      } else {
        toast.error(result.error?.message || 'Nao foi possivel abrir o arquivo XML.')
      }
    })
  }

  function handleCancel() {
    if (cancelReason.trim().length < 15) {
      toast.error('A justificativa do cancelamento deve ter pelo menos 15 caracteres.')
      return
    }

    runAsync(async () => {
      const result = await cancelNFeAction(data.document.id, cancelReason.trim())
      if (result.success) {
        setShowCancelModal(false)
        setCancelReason('')
        toast.success('Cancelamento fiscal concluido com sucesso.')
        await refreshDetail()
      } else {
        toast.error(result.error?.message || 'Falha ao cancelar a nota fiscal.')
      }
    })
  }

  function handleCorrection() {
    if (correctionText.trim().length < 15) {
      toast.error('O texto da carta de correcao deve ter pelo menos 15 caracteres.')
      return
    }

    runAsync(async () => {
      const result = await sendCartaCorrecaoAction(data.document.id, correctionText.trim())
      if (result.success) {
        setShowCorrectionModal(false)
        setCorrectionText('')
        toast.success('Carta de correcao enviada com sucesso.')
        await refreshDetail()
      } else {
        toast.error(result.error?.message || 'Falha ao enviar a carta de correcao.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="glass-card rounded-[32px] border border-white/30 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <Button variant="ghost" className="w-fit rounded-2xl px-0 text-muted-foreground" onClick={() => router.push('/admin/fiscal-review')}>
              <ArrowLeft className="h-4 w-4" />
              Voltar para notas fiscais
            </Button>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bronze">Documento fiscal</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold text-gradient-navy">
                  {humanizeModel(data.document.documentModel)} {data.document.numeroNf}
                </h1>
                <FiscalDocumentStatusBadge status={data.document.documentStatus} className="text-xs" />
              </div>
              <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                Serie {data.document.serie} • {humanizeEnvironment(data.document.ambiente)} • Emitida em{' '}
                {formatDateTime(data.document.emittedAt || data.document.createdAt)}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data.order ? (
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-white/30 bg-background/70 shadow-sm"
              >
                <Link href={`/admin/fiscal-review/${data.order.id}`}>Abrir cockpit do pedido</Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="rounded-2xl border-white/30 bg-background/70 shadow-sm"
              onClick={handleConsult}
              disabled={isPending}
            >
              <RefreshCcw className="h-4 w-4" />
              Consultar
            </Button>
            <Button className="rounded-2xl gradient-bronze border-0 text-white shadow-sm" onClick={handleOpenDanfe}>
              <ReceiptText className="h-4 w-4" />
              Abrir DANFE
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Valor da nota"
          value={`R$ ${formatCurrency(data.document.valorTotalNota)}`}
          helper="Total consolidado no documento emitido."
        />
        <KpiCard
          label="Itens no snapshot"
          value={snapshotItemCount}
          helper="Quantidade de itens preservados no snapshot imutavel."
        />
        <KpiCard
          label="Eventos tecnicos"
          value={data.events.length}
          helper="Timeline registrada para esta nota fiscal."
        />
        <KpiCard
          label="Carta de correcao"
          value={data.document.correctionCount}
          helper="Quantidade de eventos de correcao vinculados a este documento."
        />
      </section>

      <SectionShell
        eyebrow="Resumo executivo"
        title="Identificacao e rastreabilidade"
        description="Dados centrais da nota, do pedido relacionado e do protocolo retornado pela SEFAZ."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetaRow label="Chave de acesso" value={data.document.chaveAcesso || '-'} mono />
          <MetaRow label="Protocolo" value={data.document.protocoloAutorizacao || '-'} />
          <MetaRow label="Digest value" value={data.document.digestValue || '-'} mono />
          <MetaRow label="Status SEFAZ" value={data.document.codigoStatus ? `${data.document.codigoStatus} - ${data.document.motivoStatus || '-'}` : data.document.motivoStatus || '-'} />
          <MetaRow label="Natureza da operacao" value={data.document.naturezaOperacao || '-'} />
          <MetaRow label="Operador da emissao" value={data.document.emittedByName || '-'} />
          <MetaRow label="Data de autorizacao" value={formatDateTime(data.document.dataAutorizacao)} />
          <MetaRow label="Motor fiscal" value={data.document.motorVersion || '-'} />
        </div>
      </SectionShell>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionShell
          eyebrow="Artefatos"
          title="Arquivos tecnicos da nota"
          description="Acesse XMLs, DANFE e os artefatos persistidos deste documento fiscal."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <ArtifactBadge label="Envio XML" available={Boolean(data.document.xmlEnvioPath)} />
              <ArtifactBadge label="Retorno XML" available={Boolean(data.document.xmlRetornoPath)} />
              <ArtifactBadge label="Processado XML" available={Boolean(data.document.xmlProcessadoPath)} />
              <ArtifactBadge label="DANFE" available={Boolean(data.document.danfePath)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => handleDownloadXml('xml_envio')} disabled={!data.document.xmlEnvioPath || isPending}>
                <FileCode2 className="h-4 w-4" />
                XML de envio
              </Button>
              <Button variant="outline" className="rounded-2xl" onClick={() => handleDownloadXml('xml_retorno')} disabled={!data.document.xmlRetornoPath || isPending}>
                <ScrollText className="h-4 w-4" />
                XML de retorno
              </Button>
              <Button variant="outline" className="rounded-2xl" onClick={() => handleDownloadXml('xml_processado')} disabled={!data.document.xmlProcessadoPath || isPending}>
                <Files className="h-4 w-4" />
                XML processado
              </Button>
              <Button variant="outline" className="rounded-2xl" onClick={handleOpenDanfe}>
                <ReceiptText className="h-4 w-4" />
                DANFE
              </Button>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Snapshot imutavel</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <MetaRow label="Emitente" value={snapshotSummary?.emitterName || '-'} />
                <MetaRow label="Destinatario" value={snapshotSummary?.recipientName || '-'} />
              </div>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          eyebrow="Acoes"
          title="Controle operacional"
          description="Acoes tecnicas e fiscais disponíveis para este documento."
        >
          <div className="space-y-3">
            <Button
              variant="outline"
              className="h-11 w-full justify-start rounded-2xl border-white/30 bg-background/70"
              onClick={handleConsult}
              disabled={isPending}
            >
              <FileSearch className="h-4 w-4" />
              Consultar situacao atual na SEFAZ
            </Button>

            <Button
              variant="outline"
              className="h-11 w-full justify-start rounded-2xl border-white/30 bg-background/70"
              onClick={() => setShowCancelModal(true)}
              disabled={!canCancel || isPending}
            >
              <Ban className="h-4 w-4" />
              Cancelar nota fiscal
            </Button>

            <Button
              variant="outline"
              className="h-11 w-full justify-start rounded-2xl border-white/30 bg-background/70"
              onClick={() => setShowCorrectionModal(true)}
              disabled={!canCorrect || isPending}
            >
              <ScrollText className="h-4 w-4" />
              Enviar carta de correcao
            </Button>

            {data.document.cancelledAt ? (
              <div className="rounded-[24px] border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200">
                <p className="font-semibold">Documento cancelado em {formatDateTime(data.document.cancelledAt)}</p>
                <p className="mt-2">{data.document.cancellationJustificativa || 'Sem justificativa registrada.'}</p>
              </div>
            ) : null}
          </div>
        </SectionShell>
      </div>

      <SectionShell
        eyebrow="Contexto do pedido"
        title="Pedido relacionado"
        description="Referencias operacionais do pedido que originou esta nota fiscal."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetaRow label="Pedido" value={data.order ? `#${formatOrderNumber(data.order.orderNumber)}` : '-'} />
          <MetaRow label="Status do pedido" value={humanizeOrderStatus(data.order?.status || null)} />
          <MetaRow label="Loja" value={data.order?.storeName || data.document.storeName} />
          <MetaRow label="Total do pedido" value={data.order ? `R$ ${formatCurrency(data.order.total)}` : '-'} />
        </div>
      </SectionShell>

      <SectionShell
        eyebrow="Timeline tecnica"
        title="Historico de eventos"
        description="Evolucao das operacoes tecnicas e fiscais vinculadas a esta nota fiscal."
      >
        <div className="space-y-3">
          {data.events.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border/80 bg-background/60 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum evento tecnico encontrado para esta nota fiscal.
            </div>
          ) : (
            data.events.map((event) => (
              <TimelineTone key={event.id} tone={eventTone(event.eventStatus)}>
                <div className="flex flex-wrap items-center gap-3">
                  <strong className="text-foreground">{humanizeEventType(event.eventType)}</strong>
                  <EventStatusBadge status={event.eventStatus} />
                  <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(event.executedAt)}</span>
                </div>
                {event.sefazMessage ? <p className="mt-3 text-sm text-foreground">{event.sefazMessage}</p> : null}
                {event.errorMessage ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{event.errorMessage}</p> : null}
                {event.durationMs ? <p className="mt-2 text-xs text-muted-foreground">{event.durationMs} ms</p> : null}
              </TimelineTone>
            ))
          )}
        </div>
      </SectionShell>

      {showCancelModal ? (
        <OverlayCard
          title="Cancelar nota fiscal"
          description={`Informe a justificativa do cancelamento para a nota ${data.document.numeroNf}.`}
          onClose={() => setShowCancelModal(false)}
        >
          <textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            className="min-h-[140px] w-full rounded-[24px] border border-border/70 bg-background/70 px-4 py-3 text-sm outline-none transition focus:border-ring"
            placeholder="Descreva o motivo do cancelamento."
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setShowCancelModal(false)}>
              Fechar
            </Button>
            <Button className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700" disabled={isPending} onClick={handleCancel}>
              Confirmar cancelamento
            </Button>
          </div>
        </OverlayCard>
      ) : null}

      {showCorrectionModal ? (
        <OverlayCard
          title="Carta de correcao"
          description={`Descreva a correcao que deve ser enviada para a nota ${data.document.numeroNf}.`}
          onClose={() => setShowCorrectionModal(false)}
        >
          <textarea
            value={correctionText}
            onChange={(event) => setCorrectionText(event.target.value)}
            className="min-h-[160px] w-full rounded-[24px] border border-border/70 bg-background/70 px-4 py-3 text-sm outline-none transition focus:border-ring"
            placeholder="Descreva a correcao fiscal."
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setShowCorrectionModal(false)}>
              Fechar
            </Button>
            <Button className="rounded-2xl gradient-bronze border-0 text-white" disabled={isPending} onClick={handleCorrection}>
              Enviar carta
            </Button>
          </div>
        </OverlayCard>
      ) : null}
    </div>
  )
}

function OverlayCard({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div
        className="glass-card w-full max-w-2xl rounded-[32px] border border-white/30 p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-2xl font-semibold text-gradient-navy">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
