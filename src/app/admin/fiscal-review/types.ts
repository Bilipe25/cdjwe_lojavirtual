export type FiscalDocumentStatus =
  | 'pending'
  | 'processing'
  | 'authorized'
  | 'denied'
  | 'cancelled'
  | 'correction'
  | 'inutilized'
  | 'error'

export type FiscalEnvironmentFilter = 'all' | 'homologacao' | 'producao'
export type FiscalModelFilter = 'all' | '55' | '65'
export type FiscalStatusFilter = 'all' | 'authorized' | 'cancelled'
export type FiscalPeriodFilter = 'all' | '7d' | '30d' | '90d'
export type FiscalSortField = 'emitted_at' | 'created_at' | 'numero_nf' | 'valor_total_nota'
export type FiscalSortDirection = 'asc' | 'desc'

export interface FiscalDocumentsIndexQuery {
  search?: string
  status?: FiscalStatusFilter
  ambiente?: FiscalEnvironmentFilter
  model?: FiscalModelFilter
  period?: FiscalPeriodFilter
  page?: number
  pageSize?: number
  sortBy?: FiscalSortField
  sortDir?: FiscalSortDirection
}

export interface FiscalDocumentListItem {
  id: string
  orderId: string
  orderNumber: string | null
  orderStatus: string | null
  storeName: string
  documentModel: '55' | '65'
  documentStatus: FiscalDocumentStatus
  numeroNf: number
  serie: string
  chaveAcesso: string | null
  protocoloAutorizacao: string | null
  ambiente: 'homologacao' | 'producao'
  valorTotalNota: number | null
  emittedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  emittedByName: string | null
  xmlEnvioPath: string | null
  xmlRetornoPath: string | null
  xmlProcessadoPath: string | null
  danfePath: string | null
}

export interface FiscalDocumentsIndexResult {
  items: FiscalDocumentListItem[]
  total: number
  page: number
  pageSize: number
  summary: {
    totalDocuments: number
    authorizedCount: number
    cancelledCount: number
    productionCount: number
  }
}

export interface FiscalDocumentEventItem {
  id: string
  eventType: string | null
  eventStatus: string | null
  sefazMessage: string | null
  errorMessage: string | null
  durationMs: number | null
  executedAt: string | null
}

export interface FiscalDocumentDetail {
  document: FiscalDocumentListItem & {
    naturezaOperacao: string | null
    dataAutorizacao: string | null
    codigoStatus: number | null
    motivoStatus: string | null
    digestValue: string | null
    motorVersion: string | null
    correctionCount: number
    cancellationProtocol: string | null
    cancellationJustificativa: string | null
    cancelledByName: string | null
    snapshot: unknown
  }
  order: {
    id: string
    orderNumber: string | null
    status: string | null
    total: number | null
    createdAt: string | null
    fiscalCalculatedAt: string | null
    storeName: string
  } | null
  events: FiscalDocumentEventItem[]
}
