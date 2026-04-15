// ============================================================
// Fiscal Transport — nfewizard-io Replacement Types
// Pure JS transport layer for NF-e (Vercel-compatible)
// Uses: fast-xml-parser + node-forge + native https
// ============================================================

// --------------- UF Codes (IBGE) ---------------

export const UF_CODES: Record<string, number> = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32,
  GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41,
  PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14,
  SC: 42, SP: 35, SE: 28, TO: 17,
}

// --------------- Freight Modality Codes ---------------

export const FRETE_CODES: Record<string, number> = {
  emitente: 0,
  destinatario: 1,
  terceiros: 2,
  proprio_remetente: 3,
  proprio_destinatario: 4,
  sem_frete: 9,
}

// --------------- Emission Result ---------------

export interface EmissionResult {
  success: boolean
  chaveAcesso: string | null
  protocolo: string | null
  dataAutorizacao: string | null
  codigoStatus: number | null
  motivoStatus: string | null
  xmlProcessado: string | null
  error?: string
}

export interface ConsultResult {
  success: boolean
  status: string
  protocolo: string | null
  dataRecebimento: string | null
  codigoStatus: number | null
  motivoStatus: string | null
  error?: string
}

export interface CancelResult {
  success: boolean
  protocolo: string | null
  dataEvento: string | null
  codigoStatus: number | null
  motivoStatus: string | null
  error?: string
}

export interface InutilizationResult {
  success: boolean
  protocolo: string | null
  dataRecebimento: string | null
  codigoStatus: number | null
  motivoStatus: string | null
  faixaInicial: number
  faixaFinal: number
  serie: string
  justificativa: string
  error?: string
}

export interface SefazStatusResult {
  success: boolean
  status: string
  tpAmb: number
  verAplic: string | null
  cStat: number | null
  xMotivo: string | null
  error?: string
}

// --------------- Fiscal Document (DB record) ---------------

export interface FiscalDocument {
  id: string
  order_id: string
  document_model: '55' | '65'
  document_status: 'pending' | 'processing' | 'authorized' | 'denied' | 'cancelled' | 'correction' | 'inutilized' | 'error'
  chave_acesso: string | null
  numero_nf: number
  serie: string
  natureza_operacao: string
  protocolo_autorizacao: string | null
  data_autorizacao: string | null
  codigo_status: number | null
  motivo_status: string | null
  digest_value: string | null
  xml_envio_path: string | null
  xml_retorno_path: string | null
  xml_processado_path: string | null
  danfe_path: string | null
  motor_version: string | null
  fiscal_payload_jsonb: Record<string, unknown> | null
  valor_produtos: number | null
  valor_total_nota: number | null
  valor_icms: number | null
  valor_st: number | null
  valor_pis: number | null
  valor_cofins: number | null
  valor_ipi: number | null
  valor_frete: number | null
  valor_desconto: number | null
  ambiente: 'homologacao' | 'producao'
  emitted_by: string | null
  emitted_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_protocol: string | null
  cancellation_justificativa: string | null
  correction_count: number
  last_correction_at: string | null
  created_at: string
  updated_at: string
}

export interface FiscalEventLog {
  id: string
  fiscal_document_id: string | null
  order_id: string | null
  event_type: string
  event_status: 'pending' | 'success' | 'failure' | 'warning'
  request_summary_jsonb: Record<string, unknown> | null
  response_summary_jsonb: Record<string, unknown> | null
  sefaz_status_code: number | null
  sefaz_message: string | null
  error_message: string | null
  error_stack: string | null
  duration_ms: number | null
  executed_by: string | null
  executed_at: string
}
