// ============================================================
// Fiscal Transport — Public API
// Entry point for NF-e/NFC-e transport operations
// ============================================================

import 'server-only'

// Core emission
export { emitNFe } from './emit-nfe.service'
export { consultNFeStatus, inutilizeNFeRange } from './document-operations.service'

// XML mapping
export {
  mapFiscalPayloadToNFeXml,
  buildNFeAuthorizationEnvelope,
  buildNFeProcessedXml,
  buildSoapEnvelope,
} from './map-fiscal-to-nfe.service'

// XML signing
export { loadCertificate, signNFeXml, signEventXml, signInutilizacaoXml } from './sign-xml.service'

// SEFAZ SOAP client
export {
  getSefazEndpoint,
  sendSoapRequest,
  buildRetAutorizacaoRequestXml,
  buildConsultaProtocoloRequestXml,
  buildInutilizacaoRequestXml,
  parseSefazAutorizacaoResponse,
  parseSefazRetAutorizacaoResponse,
  parseSefazConsultaProtocoloResponse,
  parseSefazInutilizacaoResponse,
  parseSefazEventoResponse,
} from './sefaz-client.service'

// Event operations
export { cancelNFe, sendCartaCorrecao } from './event-operations.service'

// DANFE PDF
export { generateDanfePdf } from './danfe-generator.service'

// Types
export type {
  EmissionResult,
  ConsultResult,
  CancelResult,
  InutilizationResult,
  SefazStatusResult,
  FiscalDocument,
  FiscalEventLog,
} from './types'
export { UF_CODES, FRETE_CODES } from './types'
