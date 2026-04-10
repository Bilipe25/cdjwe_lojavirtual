'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  calculateOrderFiscalAction,
  recalculateOrderFiscalAction,
  validateOrderFiscalAction,
  emitNFeAction,
  getOrderFiscalDetailsAction,
} from '../actions'

// ─── Types ───────────────────────────────────────

interface OrderFiscalData {
  order: Record<string, unknown>
  items: Record<string, unknown>[]
  documents: Record<string, unknown>[]
  events: Record<string, unknown>[]
}

interface CalculationResult {
  totals: Record<string, number>
  items: Record<string, unknown>[]
  validation: { is_valid: boolean; errors: unknown[]; warnings: unknown[] }
  motor_version: string
  calculated_at: string
}

// ─── Main Page Component ─────────────────────────

export default function FiscalReviewPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string

  const [data, setData] = useState<OrderFiscalData | null>(null)
  const [calculation, setCalculation] = useState<CalculationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [emitConfirm, setEmitConfirm] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function loadData() {
    setLoading(true)
    const result = await getOrderFiscalDetailsAction(orderId)
    if (result.success && result.data) {
      setData(result.data as OrderFiscalData)
    }
    setLoading(false)
  }

  async function handleCalculate() {
    startTransition(async () => {
      setStatusMessage({ type: 'info', text: 'Calculando tributos...' })
      const result = await calculateOrderFiscalAction(orderId)
      if (result.success && result.data) {
        setCalculation(result.data as CalculationResult)
        setStatusMessage({ type: 'success', text: 'Cálculo fiscal concluído.' })
      } else {
        setStatusMessage({ type: 'error', text: String((result.error as unknown as Record<string, string>)?.message || 'Erro no cálculo.') })
      }
    })
  }

  async function handleRecalculate() {
    startTransition(async () => {
      setStatusMessage({ type: 'info', text: 'Recalculando e persistindo...' })
      const result = await recalculateOrderFiscalAction(orderId)
      if (result.success && result.data) {
        setCalculation(result.data as CalculationResult)
        await loadData()
        setStatusMessage({ type: 'success', text: 'Snapshot fiscal atualizado.' })
      } else {
        setStatusMessage({ type: 'error', text: String((result.error as unknown as Record<string, string>)?.message || 'Erro ao recalcular.') })
      }
    })
  }

  async function handleValidate() {
    startTransition(async () => {
      setStatusMessage({ type: 'info', text: 'Validando para emissão...' })
      const result = await validateOrderFiscalAction(orderId)
      if (result.success && result.data) {
        const validation = result.data as { is_valid: boolean; errors: unknown[]; warnings: unknown[] }
        if (validation.is_valid) {
          setStatusMessage({ type: 'success', text: `✅ Documento válido para emissão. ${(validation.warnings || []).length} aviso(s).` })
        } else {
          setStatusMessage({ type: 'error', text: `❌ ${(validation.errors || []).length} erro(s) encontrado(s). Corrija antes de emitir.` })
        }
        if (calculation) {
          setCalculation({ ...calculation, validation })
        }
      } else {
        setStatusMessage({ type: 'error', text: String((result.error as unknown as Record<string, string>)?.message || 'Erro na validação.') })
      }
    })
  }

  async function handleEmit() {
    startTransition(async () => {
      setEmitConfirm(false)
      setStatusMessage({ type: 'info', text: 'Emitindo NF-e...' })
      const result = await emitNFeAction(orderId, '55')
      if (result.success) {
        setStatusMessage({ type: 'success', text: '🧾 NF-e gerada com sucesso!' })
        await loadData()
      } else {
        setStatusMessage({ type: 'error', text: String((result.error as unknown as Record<string, string>)?.message || 'Falha na emissão.') })
      }
    })
  }

  if (loading) {
    return (
      <div className="fiscal-review-loading">
        <div className="fiscal-spinner" />
        <p>Carregando dados fiscais...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="fiscal-review-error">
        <p>Pedido não encontrado.</p>
        <button onClick={() => router.back()}>Voltar</button>
      </div>
    )
  }

  const order = data.order
  const items = data.items
  const documents = data.documents
  const events = data.events
  const hasFiscalData = !!order.fiscal_calculated_at
  const isCalculated = !!calculation || hasFiscalData

  return (
    <div className="fiscal-review">
      <style>{styles}</style>

      {/* Header */}
      <header className="fiscal-review__header">
        <button className="fiscal-review__back" onClick={() => router.back()}>
          ← Voltar
        </button>
        <div className="fiscal-review__title-row">
          <h1>Revisão Fiscal — Pedido #{String(order.order_number || '').padStart(4, '0')}</h1>
          <FiscalBadge status={getFiscalStatus(order, documents)} />
        </div>
        <p className="fiscal-review__subtitle">
          Loja: {(order.store as Record<string, string>)?.name || '—'} ·{' '}
          Criado em: {formatDate(order.created_at as string)}
        </p>
      </header>

      {/* Status Message */}
      {statusMessage && (
        <div className={`fiscal-review__status fiscal-review__status--${statusMessage.type}`}>
          {statusMessage.text}
          <button onClick={() => setStatusMessage(null)}>×</button>
        </div>
      )}

      {/* Action Bar */}
      <section className="fiscal-review__actions">
        <button
          className="fiscal-btn fiscal-btn--secondary"
          onClick={handleCalculate}
          disabled={isPending}
        >
          {isPending ? '...' : '📊 Calcular'}
        </button>
        <button
          className="fiscal-btn fiscal-btn--primary"
          onClick={handleRecalculate}
          disabled={isPending}
        >
          {isPending ? '...' : '🔄 Recalcular & Salvar'}
        </button>
        <button
          className="fiscal-btn fiscal-btn--secondary"
          onClick={handleValidate}
          disabled={isPending}
        >
          {isPending ? '...' : '✅ Validar'}
        </button>
        <button
          className="fiscal-btn fiscal-btn--emit"
          onClick={() => setEmitConfirm(true)}
          disabled={isPending || !isCalculated}
        >
          {isPending ? '...' : '🧾 Emitir NF-e'}
        </button>
      </section>

      {/* Emit Confirmation Modal */}
      {emitConfirm && (
        <div className="fiscal-modal-overlay" onClick={() => setEmitConfirm(false)}>
          <div className="fiscal-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar Emissão</h3>
            <p>Deseja emitir a NF-e para este pedido? Esta ação gerará o XML fiscal e reservará o número da nota.</p>
            <div className="fiscal-modal__actions">
              <button className="fiscal-btn fiscal-btn--secondary" onClick={() => setEmitConfirm(false)}>
                Cancelar
              </button>
              <button className="fiscal-btn fiscal-btn--emit" onClick={handleEmit}>
                Confirmar Emissão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Totals Grid */}
      <section className="fiscal-review__section">
        <h2>Totais Fiscais</h2>
        <div className="fiscal-totals-grid">
          <TotalCard label="Produtos" value={order.fiscal_total_produtos as number} prefix="R$ " />
          <TotalCard label="ICMS" value={order.fiscal_total_icms as number} prefix="R$ " color="blue" />
          <TotalCard label="ST" value={order.fiscal_total_st as number} prefix="R$ " color="orange" />
          <TotalCard label="PIS" value={order.fiscal_total_pis as number} prefix="R$ " color="teal" />
          <TotalCard label="COFINS" value={order.fiscal_total_cofins as number} prefix="R$ " color="teal" />
          <TotalCard label="IPI" value={order.fiscal_total_ipi as number} prefix="R$ " color="purple" />
          <TotalCard label="Frete" value={order.fiscal_total_frete as number} prefix="R$ " />
          <TotalCard label="Desconto" value={order.fiscal_total_desconto as number} prefix="R$ " color="red" />
          <TotalCard label="Total Tributos" value={order.fiscal_total_tributos as number} prefix="R$ " color="amber" highlight />
          <TotalCard label="Valor Comercial" value={order.total as number} prefix="R$ " />
        </div>
        {order.fiscal_calculated_at ? (
          <p className="fiscal-review__calc-date">
            Último cálculo: {formatDate(order.fiscal_calculated_at as string)}
          </p>
        ) : null}
      </section>

      {/* Items Breakdown */}
      <section className="fiscal-review__section">
        <h2>Itens — Breakdown Fiscal ({items.length})</h2>
        <div className="fiscal-items-table-wrap">
          <table className="fiscal-items-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd</th>
                <th>NCM</th>
                <th>CFOP</th>
                <th>ICMS CST</th>
                <th>ICMS Val</th>
                <th>PIS CST</th>
                <th>PIS Val</th>
                <th>COFINS Val</th>
                <th>IPI Val</th>
                <th>Tot Trib</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id as string}>
                  <td className="fiscal-items-table__name">{item.product_name as string}</td>
                  <td>{item.quantity as number}</td>
                  <td className="fiscal-items-table__mono">{item.fiscal_ncm as string || '—'}</td>
                  <td className="fiscal-items-table__mono">{item.fiscal_cfop as string || '—'}</td>
                  <td className="fiscal-items-table__mono">{item.icms_cst as string || '—'}</td>
                  <td>{formatCurrency(item.icms_value as number)}</td>
                  <td className="fiscal-items-table__mono">{item.pis_cst as string || '—'}</td>
                  <td>{formatCurrency(item.pis_value as number)}</td>
                  <td>{formatCurrency(item.cofins_value as number)}</td>
                  <td>{formatCurrency(item.ipi_value as number)}</td>
                  <td className="fiscal-items-table__highlight">{formatCurrency(item.total_tributos as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Validation Results (from calculation) */}
      {calculation?.validation && (
        <section className="fiscal-review__section">
          <h2>Validação Pré-Emissão</h2>
          <div className="fiscal-validation">
            <div className={`fiscal-validation__badge fiscal-validation__badge--${calculation.validation.is_valid ? 'ok' : 'error'}`}>
              {calculation.validation.is_valid ? '✅ Válido para emissão' : '❌ Contém erros bloqueantes'}
            </div>
            {(calculation.validation.errors as Record<string, string>[])?.map((err, i) => (
              <div key={i} className="fiscal-validation__item fiscal-validation__item--error">
                <span className="fiscal-validation__code">{err.code}</span>
                <span>{err.message}</span>
              </div>
            ))}
            {(calculation.validation.warnings as Record<string, string>[])?.map((warn, i) => (
              <div key={i} className="fiscal-validation__item fiscal-validation__item--warning">
                <span className="fiscal-validation__code">{warn.code}</span>
                <span>{warn.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fiscal Documents */}
      <section className="fiscal-review__section">
        <h2>Documentos Fiscais ({documents.length})</h2>
        {documents.length === 0 ? (
          <p className="fiscal-review__empty">Nenhum documento fiscal emitido para este pedido.</p>
        ) : (
          <div className="fiscal-docs-list">
            {documents.map((doc) => (
              <div key={doc.id as string} className="fiscal-doc-card">
                <div className="fiscal-doc-card__header">
                  <span className="fiscal-doc-card__model">
                    {doc.document_model === '55' ? 'NF-e' : 'NFC-e'}
                  </span>
                  <DocumentStatusBadge status={doc.document_status as string} />
                </div>
                <div className="fiscal-doc-card__body">
                  <div className="fiscal-doc-card__row">
                    <span className="fiscal-doc-card__label">Série/Número</span>
                    <span>{doc.serie as string}/{doc.numero_nf as number}</span>
                  </div>
                  <div className="fiscal-doc-card__row">
                    <span className="fiscal-doc-card__label">Chave</span>
                    <span className="fiscal-doc-card__chave">{doc.chave_acesso as string || '—'}</span>
                  </div>
                  <div className="fiscal-doc-card__row">
                    <span className="fiscal-doc-card__label">Protocolo</span>
                    <span>{doc.protocolo_autorizacao as string || 'Pendente'}</span>
                  </div>
                  <div className="fiscal-doc-card__row">
                    <span className="fiscal-doc-card__label">Ambiente</span>
                    <span className={`fiscal-doc-card__ambiente fiscal-doc-card__ambiente--${doc.ambiente}`}>
                      {doc.ambiente === 'producao' ? '🟢 Produção' : '🟡 Homologação'}
                    </span>
                  </div>
                  <div className="fiscal-doc-card__row">
                    <span className="fiscal-doc-card__label">Valor NF</span>
                    <span>{formatCurrency(doc.valor_total_nota as number)}</span>
                  </div>
                  <div className="fiscal-doc-card__row">
                    <span className="fiscal-doc-card__label">Emitido em</span>
                    <span>{formatDate(doc.emitted_at as string)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Events Log */}
      <section className="fiscal-review__section">
        <h2>Log de Eventos ({events.length})</h2>
        {events.length === 0 ? (
          <p className="fiscal-review__empty">Nenhum evento fiscal registrado.</p>
        ) : (
          <div className="fiscal-events-list">
            {events.map((evt) => (
              <div key={evt.id as string} className={`fiscal-event fiscal-event--${evt.event_status}`}>
                <div className="fiscal-event__header">
                  <span className="fiscal-event__type">{evt.event_type as string}</span>
                  <span className="fiscal-event__status">{evt.event_status as string}</span>
                  <span className="fiscal-event__time">{formatDate(evt.executed_at as string)}</span>
                </div>
                {evt.sefaz_message ? (
                  <p className="fiscal-event__message">{String(evt.sefaz_message)}</p>
                ) : null}
                {evt.error_message ? (
                  <p className="fiscal-event__error">{String(evt.error_message)}</p>
                ) : null}
                {evt.duration_ms ? (
                  <span className="fiscal-event__duration">{Number(evt.duration_ms)}ms</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────

function FiscalBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    not_calculated: '⚪ Não Calculado',
    calculated: '🔵 Calculado',
    validated: '🟢 Validado',
    emitted: '🟣 Emitido',
    cancelled: '🔴 Cancelado',
  }
  return <span className={`fiscal-badge fiscal-badge--${status}`}>{labels[status] || status}</span>
}

function DocumentStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: '#f59e0b',
    processing: '#3b82f6',
    authorized: '#10b981',
    denied: '#ef4444',
    cancelled: '#6b7280',
    error: '#ef4444',
  }
  return (
    <span className="doc-status-badge" style={{ backgroundColor: colors[status] || '#6b7280' }}>
      {status}
    </span>
  )
}

function TotalCard({
  label, value, prefix = '', color, highlight,
}: {
  label: string; value: number | null; prefix?: string; color?: string; highlight?: boolean
}) {
  return (
    <div className={`fiscal-total-card ${highlight ? 'fiscal-total-card--highlight' : ''} ${color ? `fiscal-total-card--${color}` : ''}`}>
      <span className="fiscal-total-card__label">{label}</span>
      <span className="fiscal-total-card__value">
        {prefix}{formatCurrency(value)}
      </span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────

function getFiscalStatus(order: Record<string, unknown>, documents: Record<string, unknown>[]): string {
  const hasEmitted = documents.some((d) => d.document_status === 'authorized')
  const hasCancelled = documents.some((d) => d.document_status === 'cancelled')
  if (hasCancelled) return 'cancelled'
  if (hasEmitted) return 'emitted'
  if (documents.length > 0) return 'emitted'
  if (order.fiscal_calculated_at) return 'calculated'
  return 'not_calculated'
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0,00'
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ─── Styles ──────────────────────────────────────

const styles = `
  .fiscal-review {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 16px;
    font-family: 'Inter', -apple-system, sans-serif;
    color: #e2e8f0;
  }

  .fiscal-review-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: 16px;
    color: #94a3b8;
  }

  .fiscal-spinner {
    width: 40px; height: 40px;
    border: 3px solid #334155;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Header */
  .fiscal-review__header {
    margin-bottom: 24px;
  }

  .fiscal-review__back {
    background: none; border: none; color: #94a3b8; cursor: pointer;
    font-size: 14px; padding: 0; margin-bottom: 8px;
  }
  .fiscal-review__back:hover { color: #e2e8f0; }

  .fiscal-review__title-row {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }

  .fiscal-review__title-row h1 {
    font-size: 22px; font-weight: 700; margin: 0; color: #f1f5f9;
  }

  .fiscal-review__subtitle {
    font-size: 13px; color: #64748b; margin-top: 4px;
  }

  /* Badge */
  .fiscal-badge {
    display: inline-block; padding: 4px 12px;
    border-radius: 16px; font-size: 12px; font-weight: 600;
    background: #1e293b; border: 1px solid #334155;
  }

  /* Status Message */
  .fiscal-review__status {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;
    font-size: 14px; font-weight: 500;
  }
  .fiscal-review__status--success { background: #064e3b; color: #6ee7b7; border: 1px solid #065f46; }
  .fiscal-review__status--error { background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; }
  .fiscal-review__status--info { background: #1e1b4b; color: #a5b4fc; border: 1px solid #312e81; }
  .fiscal-review__status button {
    background: none; border: none; color: inherit; cursor: pointer;
    font-size: 18px; line-height: 1;
  }

  /* Action Bar */
  .fiscal-review__actions {
    display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px;
  }

  .fiscal-btn {
    padding: 10px 20px; border: none; border-radius: 8px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all 0.2s;
  }
  .fiscal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .fiscal-btn--secondary { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
  .fiscal-btn--secondary:hover:not(:disabled) { background: #334155; }
  .fiscal-btn--primary { background: #4f46e5; color: white; }
  .fiscal-btn--primary:hover:not(:disabled) { background: #4338ca; }
  .fiscal-btn--emit { background: #059669; color: white; }
  .fiscal-btn--emit:hover:not(:disabled) { background: #047857; }

  /* Modal */
  .fiscal-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .fiscal-modal {
    background: #1e293b; border: 1px solid #334155;
    border-radius: 16px; padding: 24px; max-width: 480px; width: 90%;
  }
  .fiscal-modal h3 { margin: 0 0 12px; color: #f1f5f9; }
  .fiscal-modal p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
  .fiscal-modal__actions { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }

  /* Section */
  .fiscal-review__section {
    background: #0f172a; border: 1px solid #1e293b;
    border-radius: 12px; padding: 20px; margin-bottom: 20px;
  }
  .fiscal-review__section h2 {
    font-size: 16px; font-weight: 700; margin: 0 0 16px;
    color: #f1f5f9; border-bottom: 1px solid #1e293b; padding-bottom: 8px;
  }

  .fiscal-review__calc-date {
    font-size: 12px; color: #64748b; margin-top: 12px; text-align: right;
  }

  .fiscal-review__empty {
    font-size: 14px; color: #64748b; text-align: center; padding: 24px 0;
  }

  /* Totals Grid */
  .fiscal-totals-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }

  .fiscal-total-card {
    background: #1e293b; border-radius: 10px; padding: 14px;
    border: 1px solid #334155;
  }
  .fiscal-total-card--highlight {
    border-color: #f59e0b; background: linear-gradient(135deg, #1e293b, #292524);
  }
  .fiscal-total-card__label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .fiscal-total-card__value { display: block; font-size: 18px; font-weight: 700; color: #f1f5f9; font-variant-numeric: tabular-nums; }
  .fiscal-total-card--blue .fiscal-total-card__value { color: #60a5fa; }
  .fiscal-total-card--orange .fiscal-total-card__value { color: #fb923c; }
  .fiscal-total-card--teal .fiscal-total-card__value { color: #2dd4bf; }
  .fiscal-total-card--purple .fiscal-total-card__value { color: #a78bfa; }
  .fiscal-total-card--red .fiscal-total-card__value { color: #f87171; }
  .fiscal-total-card--amber .fiscal-total-card__value { color: #fbbf24; }

  /* Items Table */
  .fiscal-items-table-wrap { overflow-x: auto; }

  .fiscal-items-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
  }
  .fiscal-items-table th {
    text-align: left; padding: 8px 10px; color: #64748b;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: 1px solid #1e293b; white-space: nowrap;
  }
  .fiscal-items-table td {
    padding: 10px; border-bottom: 1px solid #1e293b0a; color: #e2e8f0;
  }
  .fiscal-items-table__name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fiscal-items-table__mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #94a3b8; }
  .fiscal-items-table__highlight { font-weight: 700; color: #fbbf24; }

  /* Validation */
  .fiscal-validation { display: flex; flex-direction: column; gap: 8px; }
  .fiscal-validation__badge {
    display: inline-block; padding: 8px 16px; border-radius: 8px;
    font-size: 14px; font-weight: 600; margin-bottom: 8px;
  }
  .fiscal-validation__badge--ok { background: #064e3b; color: #6ee7b7; }
  .fiscal-validation__badge--error { background: #450a0a; color: #fca5a5; }
  .fiscal-validation__item {
    display: flex; gap: 12px; align-items: flex-start;
    padding: 8px 12px; border-radius: 6px; font-size: 13px;
  }
  .fiscal-validation__item--error { background: #1c0a0a; color: #fca5a5; }
  .fiscal-validation__item--warning { background: #1c1607; color: #fde68a; }
  .fiscal-validation__code {
    font-family: monospace; font-size: 11px; background: rgba(255,255,255,0.1);
    padding: 2px 6px; border-radius: 4px; white-space: nowrap;
  }

  /* Document Cards */
  .fiscal-docs-list { display: flex; flex-direction: column; gap: 12px; }
  .fiscal-doc-card {
    background: #1e293b; border: 1px solid #334155;
    border-radius: 10px; overflow: hidden;
  }
  .fiscal-doc-card__header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; background: #0f172a; border-bottom: 1px solid #1e293b;
  }
  .fiscal-doc-card__model { font-weight: 700; font-size: 14px; }
  .doc-status-badge {
    padding: 3px 10px; border-radius: 12px; font-size: 11px;
    font-weight: 600; color: white; text-transform: uppercase;
  }
  .fiscal-doc-card__body { padding: 12px 16px; }
  .fiscal-doc-card__row {
    display: flex; justify-content: space-between; padding: 4px 0;
    font-size: 13px;
  }
  .fiscal-doc-card__label { color: #64748b; }
  .fiscal-doc-card__chave {
    font-family: monospace; font-size: 11px; color: #94a3b8;
    max-width: 300px; overflow: hidden; text-overflow: ellipsis;
  }

  /* Events Log */
  .fiscal-events-list { display: flex; flex-direction: column; gap: 8px; }
  .fiscal-event {
    padding: 12px 16px; border-radius: 8px; border-left: 3px solid;
    background: #1e293b;
  }
  .fiscal-event--success { border-color: #10b981; }
  .fiscal-event--failure { border-color: #ef4444; }
  .fiscal-event--warning { border-color: #f59e0b; }
  .fiscal-event--pending { border-color: #6366f1; }
  .fiscal-event__header {
    display: flex; gap: 12px; align-items: center; font-size: 13px;
  }
  .fiscal-event__type {
    font-weight: 600; text-transform: capitalize; color: #e2e8f0;
  }
  .fiscal-event__status {
    font-size: 11px; text-transform: uppercase; color: #94a3b8;
    background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;
  }
  .fiscal-event__time { font-size: 12px; color: #64748b; margin-left: auto; }
  .fiscal-event__message { font-size: 13px; color: #94a3b8; margin: 6px 0 0; }
  .fiscal-event__error { font-size: 13px; color: #fca5a5; margin: 6px 0 0; }
  .fiscal-event__duration { font-size: 11px; color: #64748b; }

  /* Responsive */
  @media (max-width: 768px) {
    .fiscal-review { padding: 16px 12px; }
    .fiscal-review__title-row h1 { font-size: 18px; }
    .fiscal-totals-grid { grid-template-columns: repeat(2, 1fr); }
    .fiscal-review__actions { flex-direction: column; }
    .fiscal-btn { width: 100%; text-align: center; }
  }
`
