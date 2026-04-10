// ============================================================
// Fiscal Transport — SEFAZ SOAP Client
// mTLS communication with SEFAZ web services
// Uses native Node.js https module (Vercel-compatible)
// ============================================================

import 'server-only'

import https from 'node:https'
import { XMLParser } from 'fast-xml-parser'
import { loadCertificate } from './sign-xml.service'
import { buildSoapEnvelope } from './map-fiscal-to-nfe.service'
import { UF_CODES } from './types'

// ─── SEFAZ Endpoint Configuration ─────────────────

type SefazService =
  | 'NfeAutorizacao'
  | 'NfeRetAutorizacao'
  | 'NfeConsultaProtocolo'
  | 'NfeStatusServico'
  | 'NfeRecepcaoEvento'
  | 'NfeInutilizacao'

/**
 * SEFAZ autorizadores mapeados por UF.
 * Cada UF pode usar sua própria SEFAZ ou uma SEFAZ Virtual.
 *
 * Referência oficial:
 * https://www.nfe.fazenda.gov.br/portal/webServices.aspx
 */
const UF_AUTORIZADOR: Record<string, string> = {
  // SEFAZ própria
  AM: 'AM', BA: 'BA', GO: 'GO', MG: 'MG', MS: 'MS',
  MT: 'MT', PE: 'PE', PR: 'PR', RS: 'RS', SP: 'SP',
  // SEFAZ Virtual Rio Grande do Sul (SVRS)
  AC: 'SVRS', AL: 'SVRS', AP: 'SVRS', CE: 'SVRS', DF: 'SVRS',
  ES: 'SVRS', MA: 'SVRS', PA: 'SVRS', PB: 'SVRS', PI: 'SVRS',
  RJ: 'SVRS', RN: 'SVRS', RO: 'SVRS', RR: 'SVRS', SC: 'SVRS',
  SE: 'SVRS', TO: 'SVRS',
}

interface SefazEndpoints {
  producao: Record<SefazService, string>
  homologacao: Record<SefazService, string>
}

/**
 * Endpoints dos autorizadores por ambiente.
 * Cobrindo SVRS + SP (os mais comuns).
 */
const ENDPOINTS: Record<string, SefazEndpoints> = {
  SVRS: {
    producao: {
      NfeAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/nfeautorizacao/nfeautorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/nferetautorizacao/nferetautorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
      NfeStatusServico: 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
    },
    homologacao: {
      NfeAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/nfeautorizacao/nfeautorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/nferetautorizacao/nferetautorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
      NfeStatusServico: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
    },
  },
  SP: {
    producao: {
      NfeAutorizacao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
      NfeStatusServico: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      NfeRecepcaoEvento: 'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
    },
    homologacao: {
      NfeAutorizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
      NfeRetAutorizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
      NfeConsultaProtocolo: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
      NfeStatusServico: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      NfeRecepcaoEvento: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
      NfeInutilizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
    },
  },
  MG: {
    producao: {
      NfeAutorizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
      NfeRetAutorizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
      NfeStatusServico: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
      NfeRecepcaoEvento: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
      NfeInutilizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
    },
    homologacao: {
      NfeAutorizacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
      NfeRetAutorizacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
      NfeStatusServico: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
      NfeRecepcaoEvento: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
      NfeInutilizacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
    },
  },
}

/**
 * Gets the SEFAZ web service URL for a given UF, ambiente, and service.
 */
export function getSefazEndpoint(
  uf: string,
  ambiente: 'producao' | 'homologacao',
  service: SefazService
): string {
  const autorizador = UF_AUTORIZADOR[uf]
  if (!autorizador) {
    throw new Error(`UF "${uf}" nao possui autorizador mapeado. Contate o suporte.`)
  }

  const endpoints = ENDPOINTS[autorizador]
  if (!endpoints) {
    // Fallback to SVRS for unmapped autorizadores
    const svrs = ENDPOINTS['SVRS']
    return svrs[ambiente][service]
  }

  return endpoints[ambiente][service]
}

// ─── SOAP Client ──────────────────────────────────

interface SoapResponse {
  statusCode: number
  body: string
  parsed: Record<string, unknown>
}

/**
 * Sends a SOAP request to a SEFAZ web service with mTLS.
 *
 * Uses the A1 certificate (PEM key + cert) for mutual TLS authentication.
 *
 * @param url - SEFAZ web service URL
 * @param content - XML content (already signed)
 * @param serviceName - SEFAZ service name (e.g., 'NfeAutorizacao4')
 */
export async function sendSoapRequest(
  url: string,
  content: string,
  serviceName: string
): Promise<SoapResponse> {
  const certData = await loadCertificate()

  const soapBody = buildSoapEnvelope(content, serviceName)

  const parsedUrl = new URL(url)

  const options: https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(soapBody, 'utf-8'),
    },
    // mTLS: client certificate authentication
    key: certData.privateKeyPem,
    cert: certData.certificatePem,
    rejectUnauthorized: true,
    timeout: 30000,
  }

  return new Promise<SoapResponse>((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          removeNSPrefix: true,
        })

        let parsed: Record<string, unknown> = {}
        try {
          parsed = parser.parse(body)
        } catch {
          // If XML parsing fails, return raw body
        }

        resolve({
          statusCode: res.statusCode || 0,
          body,
          parsed,
        })
      })
    })

    req.on('error', (err) => {
      reject(new Error(`SEFAZ SOAP error: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('SEFAZ SOAP timeout (30s). Tente novamente.'))
    })

    req.write(soapBody)
    req.end()
  })
}

// ─── Parse SEFAZ Response ─────────────────────────

export function parseSefazAutorizacaoResponse(parsed: Record<string, unknown>): {
  cStat: number
  xMotivo: string
  nProt: string | null
  dhRecbto: string | null
  chNFe: string | null
  digVal: string | null
} {
  // Response structure: Envelope > Body > nfeResultMsg > retEnviNFe > protNFe > infProt
  const body = extractNested(parsed, 'Envelope', 'Body') as Record<string, unknown>
  const result = extractNested(body, 'nfeAutorizacaoLoteResult', 'retEnviNFe')
    || extractNested(body, 'nfeResultMsg', 'retEnviNFe')
    || body

  const retEnviNFe = result as Record<string, unknown>
  const protNFe = retEnviNFe?.protNFe as Record<string, unknown>
  const infProt = (protNFe?.infProt || retEnviNFe?.infProt) as Record<string, unknown>

  if (!infProt) {
    // Try batch response
    const cStat = Number(retEnviNFe?.cStat || 0)
    return {
      cStat,
      xMotivo: String(retEnviNFe?.xMotivo || 'Resposta SEFAZ sem protNFe'),
      nProt: null,
      dhRecbto: null,
      chNFe: null,
      digVal: null,
    }
  }

  return {
    cStat: Number(infProt.cStat || 0),
    xMotivo: String(infProt.xMotivo || ''),
    nProt: String(infProt.nProt || '') || null,
    dhRecbto: String(infProt.dhRecbto || '') || null,
    chNFe: String(infProt.chNFe || '') || null,
    digVal: String(infProt.digVal || '') || null,
  }
}

export function parseSefazEventoResponse(parsed: Record<string, unknown>): {
  cStat: number
  xMotivo: string
  nProt: string | null
  dhRegEvento: string | null
} {
  const body = extractNested(parsed, 'Envelope', 'Body') as Record<string, unknown>
  const result = extractNested(body, 'nfeRecepcaoEventoResult', 'retEnvEvento')
    || extractNested(body, 'nfeResultMsg', 'retEnvEvento')
    || body

  const retEnvEvento = result as Record<string, unknown>
  const retEvento = retEnvEvento?.retEvento as Record<string, unknown>
  const infEvento = (retEvento?.infEvento || retEnvEvento?.infEvento) as Record<string, unknown>

  if (!infEvento) {
    return {
      cStat: Number(retEnvEvento?.cStat || 0),
      xMotivo: String(retEnvEvento?.xMotivo || 'Resposta SEFAZ sem infEvento'),
      nProt: null,
      dhRegEvento: null,
    }
  }

  return {
    cStat: Number(infEvento.cStat || 0),
    xMotivo: String(infEvento.xMotivo || ''),
    nProt: String(infEvento.nProt || '') || null,
    dhRegEvento: String(infEvento.dhRegEvento || '') || null,
  }
}

// ─── Utility ──────────────────────────────────────

function extractNested(obj: unknown, ...keys: string[]): unknown {
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}
