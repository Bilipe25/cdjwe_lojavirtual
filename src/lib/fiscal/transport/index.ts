// ============================================================
// Fiscal Transport — Public API
// Entry point for NF-e/NFC-e transport operations
// ============================================================

import 'server-only'

// Core emission
export { emitNFe } from './emit-nfe.service'

// XML mapping
export { mapFiscalPayloadToNFeXml, buildNFeAuthorizationEnvelope, buildSoapEnvelope } from './map-fiscal-to-nfe.service'

// XML signing
export { loadCertificate, signNFeXml, signEventXml } from './sign-xml.service'

// SEFAZ SOAP client
export { getSefazEndpoint, sendSoapRequest, parseSefazAutorizacaoResponse, parseSefazEventoResponse } from './sefaz-client.service'

// Event operations
export { cancelNFe, sendCartaCorrecao } from './event-operations.service'

// DANFE PDF
export { generateDanfePdf } from './danfe-generator.service'

// Types
export type {
  EmissionResult,
  ConsultResult,
  CancelResult,
  SefazStatusResult,
  FiscalDocument,
  FiscalEventLog,
} from './types'
export { UF_CODES, FRETE_CODES } from './types'
