// ============================================================
// Fiscal Transport — Public API
// Entry point for NF-e/NFC-e transport operations
// ============================================================

import 'server-only'

export { emitNFe } from './emit-nfe.service'
export { mapFiscalPayloadToNFeXml, buildNFeAuthorizationEnvelope, buildSoapEnvelope } from './map-fiscal-to-nfe.service'
export type {
  EmissionResult,
  ConsultResult,
  CancelResult,
  SefazStatusResult,
  FiscalDocument,
  FiscalEventLog,
} from './types'
export { UF_CODES, FRETE_CODES } from './types'
