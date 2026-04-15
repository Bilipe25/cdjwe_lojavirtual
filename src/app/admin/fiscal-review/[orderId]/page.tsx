'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  calculateOrderFiscalAction,
  recalculateOrderFiscalAction,
  validateOrderFiscalAction,
  emitNFeAction,
  getOrderFiscalDetailsAction,
} from '../actions'

type StatusMessage = { type: 'success' | 'error' | 'info'; text: string }
type ValidationIssue = { code?: string; message?: string }
type ValidationSummary = { is_valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }
type StoreSummary = { id: string; name: string }

type FiscalOrderRecord = {
  id: string
  order_number: number | string | null
  status: string | null
  total: number | null
  created_at: string | null
  fiscal_total_produtos: number | null
  fiscal_total_icms: number | null
  fiscal_total_st: number | null
  fiscal_total_fcp: number | null
  fiscal_total_pis: number | null
  fiscal_total_cofins: number | null
  fiscal_total_ipi: number | null
  fiscal_total_tributos: number | null
  fiscal_total_desconto: number | null
  fiscal_total_frete: number | null
  fiscal_calculated_at: string | null
  fiscal_snapshot: unknown
  fiscal_ready: boolean | null
  store: StoreSummary | null
}

type FiscalOrderItem = {
  id: string
  product_name: string | null
  quantity: number | null
  fiscal_ncm: string | null
  fiscal_cfop: string | null
  icms_cst: string | null
  icms_value: number | null
  pis_cst: string | null
  pis_value: number | null
  cofins_value: number | null
  ipi_value: number | null
  total_tributos: number | null
}

type FiscalDocumentRecord = {
  id: string
  document_model: string | null
  document_status: string | null
  numero_nf: number | null
  serie: string | number | null
  chave_acesso: string | null
  protocolo_autorizacao: string | null
  ambiente: string | null
  valor_total_nota: number | null
  emitted_at: string | null
  created_at: string | null
  xml_envio_path: string | null
  xml_retorno_path: string | null
  xml_processado_path: string | null
  danfe_path: string | null
  fiscal_payload_jsonb?: unknown
}

type FiscalEventRecord = {
  id: string
  event_type: string | null
  event_status: string | null
  sefaz_message: string | null
  error_message: string | null
  duration_ms: number | null
  executed_at: string | null
}

type OrderFiscalData = {
  order: FiscalOrderRecord
  items: FiscalOrderItem[]
  documents: FiscalDocumentRecord[]
  events: FiscalEventRecord[]
}

type CalculationResult = {
  totals: Record<string, number>
  items: Array<Record<string, unknown>>
  validation: ValidationSummary
  motor_version: string
  calculated_at: string
}

const ACTIVE_DOCUMENT_STATUSES = new Set(['pending', 'processing', 'authorized'])

export default function FiscalReviewPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string
  const [data, setData] = useState<OrderFiscalData | null>(null)
  const [calculation, setCalculation] = useState<CalculationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [emitConfirm, setEmitConfirm] = useState(false)
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getOrderFiscalDetailsAction(orderId)
    if (result.success && result.data) {
      setData(normalizeOrderFiscalData(result.data))
    } else {
      setStatusMessage({ type: 'error', text: getActionErrorMessage(result.error, 'Nao foi possivel carregar a revisao fiscal.') })
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [loadData])

  const order = data?.order ?? null
  const items = data?.items ?? []
  const documents = data?.documents ?? []
  const events = data?.events ?? []
  const latestDocument = documents[0] ?? null
  const activeDocument = documents.find((document) => ACTIVE_DOCUMENT_STATUSES.has(document.document_status || '')) ?? null
  const latestEvent = events[0] ?? null
  const persistedValidation = useMemo(() => extractPersistedValidation(order?.fiscal_snapshot), [order?.fiscal_snapshot])
  const effectiveValidation = calculation?.validation ?? persistedValidation
  const isCalculated = Boolean(calculation || order?.fiscal_calculated_at)
  const canEmit = Boolean(order) && isCalculated && !activeDocument && !isPending

  async function runAction(action: () => Promise<void>) {
    startTransition(() => {
      void action()
    })
  }

  async function handleCalculate() {
    await runAction(async () => {
      setStatusMessage({ type: 'info', text: 'Calculando tributos e contexto fiscal...' })
      const result = await calculateOrderFiscalAction(orderId)
      if (result.success && result.data) {
        setCalculation(result.data as CalculationResult)
        setStatusMessage({ type: 'success', text: 'Calculo fiscal concluido com sucesso.' })
      } else {
        setStatusMessage({ type: 'error', text: getActionErrorMessage(result.error, 'Erro no calculo fiscal.') })
      }
    })
  }

  async function handleRecalculate() {
    await runAction(async () => {
      setStatusMessage({ type: 'info', text: 'Recalculando e persistindo o snapshot fiscal...' })
      const result = await recalculateOrderFiscalAction(orderId)
      if (result.success && result.data) {
        setCalculation(result.data as CalculationResult)
        await loadData()
        setStatusMessage({ type: 'success', text: 'Snapshot fiscal atualizado.' })
      } else {
        setStatusMessage({ type: 'error', text: getActionErrorMessage(result.error, 'Erro ao atualizar o snapshot fiscal.') })
      }
    })
  }

  async function handleValidate() {
    await runAction(async () => {
      setStatusMessage({ type: 'info', text: 'Validando pedido para emissao...' })
      const result = await validateOrderFiscalAction(orderId)
      if (result.success && result.data) {
        const validation = result.data as ValidationSummary
        setCalculation((current) => current ? { ...current, validation } : { totals: {}, items: [], validation, motor_version: '', calculated_at: '' })
        setStatusMessage({
          type: validation.is_valid ? 'success' : 'error',
          text: validation.is_valid ? `Documento valido para emissao. ${validation.warnings.length} aviso(s).` : `Foram encontrados ${validation.errors.length} erro(s) bloqueante(s).`,
        })
      } else {
        setStatusMessage({ type: 'error', text: getActionErrorMessage(result.error, 'Erro na validacao fiscal.') })
      }
    })
  }

  async function handleEmit() {
    await runAction(async () => {
      setEmitConfirm(false)
      setStatusMessage({ type: 'info', text: 'Emitindo NF-e e aguardando retorno tecnico...' })
      const result = await emitNFeAction(orderId, '55')
      if (result.success) {
        await loadData()
        setStatusMessage({ type: 'success', text: 'NF-e emitida com sucesso.' })
      } else {
        setStatusMessage({ type: 'error', text: getActionErrorMessage(result.error, 'Falha na emissao da NF-e.') })
      }
    })
  }

  if (loading) {
    return <CenteredState text="Carregando revisao fiscal..." />
  }

  if (!data || !order) {
    return <CenteredState text="Pedido nao encontrado." actionLabel="Voltar" onAction={() => router.back()} />
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-100">
      <section className="glass-card rounded-[28px] border border-slate-700/50 p-6">
        <button className="mb-4 text-sm text-slate-400 transition hover:text-slate-200" onClick={() => router.back()}>
          Voltar
        </button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.24em] text-sky-300/80">Operacao fiscal</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-white">Revisao fiscal do pedido #{formatOrderNumber(order.order_number)}</h1>
              <StatusPill label={getFiscalLabel(order, documents)} tone={getFiscalTone(order, documents)} />
            </div>
            <p className="text-sm text-slate-400">Loja {order.store?.name || 'Nao informada'} • Criado em {formatDate(order.created_at)}</p>
          </div>
          <div className="flex flex-col gap-2">
            <StatusPill label={activeDocument ? 'Documento fiscal ativo' : 'Sem documento ativo'} tone={activeDocument ? 'warning' : 'neutral'} />
            <StatusPill label={order.fiscal_ready ? 'Pronto para emissao' : 'Requer revisao'} tone={order.fiscal_ready ? 'success' : 'neutral'} />
          </div>
        </div>
      </section>

      {statusMessage ? (
        <section className={`rounded-2xl border px-4 py-3 text-sm font-medium ${statusClasses(statusMessage.type)}`}>
          <div className="flex items-start justify-between gap-4">
            <span>{statusMessage.text}</span>
            <button className="text-base leading-none" onClick={() => setStatusMessage(null)} aria-label="Fechar aviso">x</button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Snapshot fiscal" value={order.fiscal_calculated_at ? 'Persistido' : 'Pendente'} detail={order.fiscal_calculated_at ? `Ultima atualizacao em ${formatDate(order.fiscal_calculated_at)}` : 'Recalcule antes de emitir'} tone={order.fiscal_calculated_at ? 'success' : 'warning'} />
        <SummaryCard label="Documento principal" value={latestDocument ? getDocumentLabel(latestDocument) : 'Nenhum documento'} detail={latestDocument ? `Status ${humanizeStatus(latestDocument.document_status)}` : 'Sem tentativa de emissao registrada'} tone={latestDocument ? documentTone(latestDocument.document_status) : 'neutral'} />
        <SummaryCard label="Ultimo retorno tecnico" value={latestEvent ? humanizeEventType(latestEvent.event_type) : 'Sem eventos'} detail={latestEvent ? `${humanizeStatus(latestEvent.event_status)} em ${formatDate(latestEvent.executed_at)}` : 'Nenhuma comunicacao com SEFAZ registrada'} tone={latestEvent ? eventTone(latestEvent.event_status) : 'neutral'} />
        <SummaryCard label="Artefatos" value={latestDocument ? summarizeArtifacts(latestDocument) : 'Sem arquivos'} detail={latestDocument ? (hasDocumentSnapshot(latestDocument) ? 'Snapshot imutavel salvo no documento' : 'Documento sem snapshot fiscal') : 'Envio, retorno, processado e DANFE'} tone={latestDocument && hasDocumentSnapshot(latestDocument) ? 'success' : 'warning'} />
      </section>

      <Section title="Controles operacionais" description="Calcule, persista o snapshot, valide e emita com bloqueios claros quando o pedido ja tiver documento ativo.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <ActionButton label="Calcular" tone="secondary" disabled={isPending} onClick={handleCalculate} />
            <ActionButton label="Recalcular e salvar" tone="primary" disabled={isPending} onClick={handleRecalculate} />
            <ActionButton label="Validar" tone="secondary" disabled={isPending} onClick={handleValidate} />
            <ActionButton label="Emitir NF-e" tone="emit" disabled={!canEmit} onClick={() => setEmitConfirm(true)} />
          </div>
          <p className="text-sm text-slate-400">
            {activeDocument
              ? 'A emissao esta bloqueada porque ja existe um documento ativo para este pedido.'
              : !isCalculated
                ? 'Recalcule o pedido antes de emitir para garantir snapshot e validacao atualizados.'
                : 'Fluxo pronto para emissao, sujeito a certificado e retorno tecnico da SEFAZ.'}
          </p>
        </div>
      </Section>

      <Section title="Totais fiscais" description="Panorama consolidado do pedido para conferencia rapida.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <TotalCard label="Produtos" value={order.fiscal_total_produtos} />
          <TotalCard label="ICMS" value={order.fiscal_total_icms} tone="blue" />
          <TotalCard label="ST" value={order.fiscal_total_st} tone="orange" />
          <TotalCard label="FCP" value={order.fiscal_total_fcp} tone="orange" />
          <TotalCard label="PIS" value={order.fiscal_total_pis} tone="teal" />
          <TotalCard label="COFINS" value={order.fiscal_total_cofins} tone="teal" />
          <TotalCard label="IPI" value={order.fiscal_total_ipi} tone="purple" />
          <TotalCard label="Frete" value={order.fiscal_total_frete} />
          <TotalCard label="Desconto" value={order.fiscal_total_desconto} tone="red" />
          <TotalCard label="Total tributos" value={order.fiscal_total_tributos} tone="amber" highlight />
        </div>
      </Section>

      <Section title="Validacao pre-emissao" description="Ultimo resultado conhecido entre o snapshot persistido e a validacao mais recente.">
        <div className="space-y-3">
          <StatusPill label={effectiveValidation ? (effectiveValidation.is_valid ? 'Valido para emissao' : 'Com bloqueios') : 'Nao validado'} tone={effectiveValidation ? (effectiveValidation.is_valid ? 'success' : 'error') : 'neutral'} />
          {effectiveValidation ? (
            <>
              {effectiveValidation.errors.length === 0 && effectiveValidation.warnings.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum erro ou aviso encontrado na ultima validacao.</p>
              ) : null}
              {effectiveValidation.errors.map((issue, index) => <ValidationItem key={`error-${index}`} issue={issue} tone="error" />)}
              {effectiveValidation.warnings.map((issue, index) => <ValidationItem key={`warning-${index}`} issue={issue} tone="warning" />)}
            </>
          ) : (
            <p className="text-sm text-slate-400">Execute a validacao para verificar bloqueios e avisos antes da emissao.</p>
          )}
        </div>
      </Section>

      <Section title="Itens e breakdown fiscal" description={`${items.length} item(ns) com NCM, CFOP e tributos calculados.`}>
        <div className="overflow-x-auto">
          <table className="min-w-[940px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3">Qtd</th>
                <th className="px-3 py-3">NCM</th>
                <th className="px-3 py-3">CFOP</th>
                <th className="px-3 py-3">ICMS CST</th>
                <th className="px-3 py-3">ICMS</th>
                <th className="px-3 py-3">PIS CST</th>
                <th className="px-3 py-3">PIS</th>
                <th className="px-3 py-3">COFINS</th>
                <th className="px-3 py-3">IPI</th>
                <th className="px-3 py-3">Total tributos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-800/80">
                  <td className="max-w-[260px] overflow-hidden px-3 py-3 text-ellipsis whitespace-nowrap">{item.product_name || '-'}</td>
                  <td className="px-3 py-3">{item.quantity ?? 0}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{item.fiscal_ncm || '-'}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{item.fiscal_cfop || '-'}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{item.icms_cst || '-'}</td>
                  <td className="px-3 py-3">R$ {formatCurrency(item.icms_value)}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{item.pis_cst || '-'}</td>
                  <td className="px-3 py-3">R$ {formatCurrency(item.pis_value)}</td>
                  <td className="px-3 py-3">R$ {formatCurrency(item.cofins_value)}</td>
                  <td className="px-3 py-3">R$ {formatCurrency(item.ipi_value)}</td>
                  <td className="px-3 py-3 font-semibold text-amber-300">R$ {formatCurrency(item.total_tributos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Documentos fiscais" description={`${documents.length} documento(s) registrado(s) para este pedido.`}>
        <div className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum documento fiscal registrado para este pedido.</p>
          ) : (
            documents.map((document) => (
              <article key={document.id} className="rounded-3xl border border-slate-700/50 bg-slate-950/60 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{document.document_model === '55' ? 'NF-e' : 'NFC-e'}</p>
                    <h3 className="text-xl font-semibold text-white">{getDocumentLabel(document)}</h3>
                  </div>
                  <StatusPill label={humanizeStatus(document.document_status)} tone={documentTone(document.document_status)} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Meta label="Chave de acesso" value={document.chave_acesso || '-'} mono />
                  <Meta label="Protocolo" value={document.protocolo_autorizacao || 'Pendente'} />
                  <Meta label="Ambiente" value={document.ambiente === 'producao' ? 'Producao' : 'Homologacao'} />
                  <Meta label="Valor NF" value={`R$ ${formatCurrency(document.valor_total_nota)}`} />
                  <Meta label="Emitido em" value={formatDate(document.emitted_at || document.created_at)} />
                  <Meta label="Snapshot fiscal" value={hasDocumentSnapshot(document) ? 'Imutavel salvo' : 'Ausente'} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusPill label="Envio XML" tone={document.xml_envio_path ? 'success' : 'neutral'} compact />
                  <StatusPill label="Retorno XML" tone={document.xml_retorno_path ? 'success' : 'neutral'} compact />
                  <StatusPill label="Processado XML" tone={document.xml_processado_path ? 'success' : 'neutral'} compact />
                  <StatusPill label="DANFE" tone={document.danfe_path ? 'success' : 'neutral'} compact />
                </div>
              </article>
            ))
          )}
        </div>
      </Section>

      <Section title="Timeline tecnica" description={`${events.length} evento(s) de emissao, cancelamento ou retorno tecnico.`}>
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum evento tecnico registrado para este pedido.</p>
          ) : (
            events.map((event) => (
              <article key={event.id} className={`rounded-3xl border-l-4 bg-slate-950/60 p-5 ${timelineBorderClasses(eventTone(event.event_status))}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <strong className="text-white">{humanizeEventType(event.event_type)}</strong>
                  <StatusPill label={humanizeStatus(event.event_status)} tone={eventTone(event.event_status)} compact />
                  <span className="ml-auto text-xs text-slate-400">{formatDate(event.executed_at)}</span>
                </div>
                {event.sefaz_message ? <p className="mt-3 text-sm text-slate-200">{event.sefaz_message}</p> : null}
                {event.error_message ? <p className="mt-2 text-sm text-rose-300">{event.error_message}</p> : null}
                {event.duration_ms ? <p className="mt-2 text-xs text-slate-400">{event.duration_ms} ms</p> : null}
              </article>
            ))
          )}
        </div>
      </Section>

      {emitConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4" onClick={() => setEmitConfirm(false)}>
          <div className="glass-card w-full max-w-lg rounded-[28px] border border-slate-700/50 p-6" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-2xl font-semibold text-white">Confirmar emissao</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">Esta acao vai usar o snapshot fiscal persistido, assinar o XML e transmitir a NF-e para a SEFAZ.</p>
            <div className="mt-6 flex justify-end gap-3">
              <ActionButton label="Cancelar" tone="secondary" onClick={() => setEmitConfirm(false)} />
              <ActionButton label="Confirmar emissao" tone="emit" disabled={!canEmit} onClick={handleEmit} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CenteredState({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-slate-400">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
      <p>{text}</p>
      {actionLabel && onAction ? <ActionButton label={actionLabel} tone="secondary" onClick={onAction} /> : null}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-[28px] border border-slate-700/50 p-5">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone }) {
  return (
    <article className="rounded-[24px] border border-slate-700/50 bg-slate-950/60 p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <strong className="text-xl text-white">{value}</strong>
        <StatusPill label={toneLabel(tone)} tone={tone} compact />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
    </article>
  )
}

type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'primary' | 'secondary' | 'emit'

function StatusPill({ label, tone, compact = false }: { label: string; tone: Tone; compact?: boolean }) {
  const size = compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
  return <span className={`inline-flex rounded-full border font-semibold ${size} ${toneClasses(tone)}`}>{label}</span>
}

function ActionButton({ label, tone, onClick, disabled }: { label: string; tone: Tone; onClick: () => void; disabled?: boolean }) {
  return <button className={`rounded-2xl px-4 py-3 text-sm font-semibold transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses(tone)}`} onClick={onClick} disabled={disabled}>{label}</button>
}

function TotalCard({ label, value, tone, highlight = false }: { label: string; value: number | null; tone?: 'blue' | 'orange' | 'teal' | 'purple' | 'red' | 'amber'; highlight?: boolean }) {
  return (
    <article className={`rounded-3xl border border-slate-700/40 bg-slate-950/60 p-4 ${highlight ? 'border-amber-400/40 bg-amber-500/5' : ''}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${totalToneClasses(tone)}`}>R$ {formatCurrency(value)}</p>
    </article>
  )
}

function ValidationItem({ issue, tone }: { issue: ValidationIssue; tone: 'error' | 'warning' }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-rose-400/20 bg-rose-500/10 text-rose-100' : 'border-amber-400/20 bg-amber-500/10 text-amber-100'}`}>
      <span className="rounded-lg bg-white/10 px-2 py-1 font-mono text-xs">{issue.code || 'INFO'}</span>
      <span>{issue.message || 'Sem detalhes adicionais.'}</span>
    </div>
  )
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-900/60 px-4 py-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`${mono ? 'font-mono text-xs' : ''} max-w-[18rem] truncate text-right text-slate-100`}>{value}</span>
    </div>
  )
}

function normalizeOrderFiscalData(raw: unknown): OrderFiscalData {
  const record = (raw || {}) as Record<string, unknown>
  const order = ((record.order || {}) as Record<string, unknown>)
  const rawStore = order.store
  const storeRecord = Array.isArray(rawStore) ? rawStore[0] : rawStore

  return {
    order: {
      ...order,
      store: storeRecord && typeof storeRecord === 'object'
        ? { id: String((storeRecord as Record<string, unknown>).id || ''), name: String((storeRecord as Record<string, unknown>).name || '') }
        : null,
    } as FiscalOrderRecord,
    items: Array.isArray(record.items) ? (record.items as FiscalOrderItem[]) : [],
    documents: Array.isArray(record.documents) ? (record.documents as FiscalDocumentRecord[]) : [],
    events: Array.isArray(record.events) ? (record.events as FiscalEventRecord[]) : [],
  }
}

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return fallback
}

function extractPersistedValidation(snapshot: unknown): ValidationSummary | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const validation = (snapshot as Record<string, unknown>).validation
  if (!validation || typeof validation !== 'object') return null
  const record = validation as Record<string, unknown>
  return {
    is_valid: Boolean(record.is_valid),
    errors: Array.isArray(record.errors) ? (record.errors as ValidationIssue[]) : [],
    warnings: Array.isArray(record.warnings) ? (record.warnings as ValidationIssue[]) : [],
  }
}

function getFiscalTone(order: FiscalOrderRecord, documents: FiscalDocumentRecord[]): Tone {
  if (documents.some((doc) => doc.document_status === 'cancelled')) return 'error'
  if (documents.some((doc) => doc.document_status === 'authorized')) return 'success'
  if (order.fiscal_ready) return 'success'
  if (order.fiscal_calculated_at) return 'warning'
  return 'neutral'
}

function getFiscalLabel(order: FiscalOrderRecord, documents: FiscalDocumentRecord[]): string {
  if (documents.some((doc) => doc.document_status === 'cancelled')) return 'Cancelado'
  if (documents.some((doc) => doc.document_status === 'authorized')) return 'Emitido'
  if (order.fiscal_ready) return 'Validado'
  if (order.fiscal_calculated_at) return 'Calculado'
  return 'Nao calculado'
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0,00'
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

function formatOrderNumber(orderNumber: number | string | null): string {
  if (orderNumber === null || orderNumber === undefined || orderNumber === '') return '----'
  return String(orderNumber).padStart(6, '0')
}

function getDocumentLabel(document: FiscalDocumentRecord): string {
  return `Serie ${document.serie ?? '-'} • Numero ${document.numero_nf ?? '-'}`
}

function hasDocumentSnapshot(document: FiscalDocumentRecord): boolean {
  return Boolean(document.fiscal_payload_jsonb && typeof document.fiscal_payload_jsonb === 'object')
}

function summarizeArtifacts(document: FiscalDocumentRecord): string {
  const count = [document.xml_envio_path, document.xml_retorno_path, document.xml_processado_path, document.danfe_path].filter(Boolean).length
  if (count === 0) return 'Nenhum arquivo salvo'
  if (count === 4) return 'Pacote completo'
  return `${count}/4 arquivos`
}

function humanizeStatus(status: string | null | undefined): string {
  const labels: Record<string, string> = { pending: 'Pendente', processing: 'Processando', authorized: 'Autorizado', denied: 'Negado', cancelled: 'Cancelado', error: 'Erro', success: 'Sucesso', failure: 'Falha', warning: 'Aviso' }
  if (!status) return 'Nao informado'
  return labels[status] || status
}

function humanizeEventType(eventType: string | null | undefined): string {
  const labels: Record<string, string> = { authorization: 'Autorizacao', cancel: 'Cancelamento', correction_letter: 'Carta de correcao', status_check: 'Consulta de status' }
  if (!eventType) return 'Evento tecnico'
  return labels[eventType] || eventType
}

function documentTone(status: string | null | undefined): Tone {
  if (status === 'authorized') return 'success'
  if (status === 'pending' || status === 'processing') return 'warning'
  if (status === 'cancelled' || status === 'denied' || status === 'error') return 'error'
  return 'neutral'
}

function eventTone(status: string | null | undefined): Tone {
  if (status === 'success') return 'success'
  if (status === 'warning' || status === 'pending') return 'warning'
  if (status === 'failure' || status === 'error') return 'error'
  return 'neutral'
}

function toneClasses(tone: Tone): string {
  const tones: Record<Tone, string> = {
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
    error: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    neutral: 'border-slate-600/50 bg-slate-800/70 text-slate-200',
    primary: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
    secondary: 'border-slate-600/50 bg-slate-800/70 text-slate-200',
    emit: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  }
  return tones[tone]
}

function buttonClasses(tone: Tone): string {
  const tones: Record<Tone, string> = {
    primary: 'bg-sky-700 text-white hover:bg-sky-600',
    secondary: 'border border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800',
    emit: 'bg-emerald-700 text-white hover:bg-emerald-600',
    success: 'bg-emerald-700 text-white hover:bg-emerald-600',
    warning: 'bg-amber-700 text-white hover:bg-amber-600',
    error: 'bg-rose-700 text-white hover:bg-rose-600',
    neutral: 'border border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800',
  }
  return tones[tone]
}

function totalToneClasses(tone?: 'blue' | 'orange' | 'teal' | 'purple' | 'red' | 'amber'): string {
  const tones: Record<string, string> = {
    blue: 'text-sky-300',
    orange: 'text-orange-300',
    teal: 'text-teal-300',
    purple: 'text-violet-300',
    red: 'text-rose-300',
    amber: 'text-amber-300',
  }
  return tone ? tones[tone] : 'text-white'
}

function timelineBorderClasses(tone: Tone): string {
  if (tone === 'success') return 'border-l-emerald-400'
  if (tone === 'warning') return 'border-l-amber-400'
  if (tone === 'error') return 'border-l-rose-400'
  return 'border-l-slate-600'
}

function statusClasses(type: StatusMessage['type']): string {
  if (type === 'success') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
  if (type === 'error') return 'border-rose-400/20 bg-rose-500/10 text-rose-100'
  return 'border-sky-400/20 bg-sky-500/10 text-sky-100'
}

function toneLabel(tone: Tone): string {
  if (tone === 'success') return 'Ok'
  if (tone === 'warning') return 'Atencao'
  if (tone === 'error') return 'Critico'
  return 'Info'
}
