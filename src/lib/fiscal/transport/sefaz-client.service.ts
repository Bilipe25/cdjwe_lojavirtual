// ============================================================
// Fiscal Transport - SEFAZ SOAP Client
// mTLS communication with SEFAZ web services
// Uses native Node.js https module (Vercel-compatible)
// ============================================================

import 'server-only'

import https from 'node:https'
import fs from 'node:fs'
import { XMLParser } from 'fast-xml-parser'
import { loadCertificate } from './sign-xml.service'
import { buildSoapEnvelope } from './map-fiscal-to-nfe.service'

type SefazService =
  | 'NfeAutorizacao'
  | 'NfeRetAutorizacao'
  | 'NfeConsultaProtocolo'
  | 'NfeStatusServico'
  | 'NfeRecepcaoEvento'
  | 'NfeInutilizacao'

type SefazEnvironment = 'producao' | 'homologacao'

interface SefazEndpoints {
  producao: Record<SefazService, string>
  homologacao: Record<SefazService, string>
}

export interface ParsedAuthorizationResponse {
  cStat: number
  xMotivo: string
  nRec: string | null
  nProt: string | null
  dhRecbto: string | null
  chNFe: string | null
  digVal: string | null
  protNFe: Record<string, unknown> | null
}

export interface ParsedInutilizacaoResponse {
  cStat: number
  xMotivo: string
  nProt: string | null
  dhRecbto: string | null
}

/**
 * Referência oficial:
 * https://www.nfe.fazenda.gov.br/portal/WebServices.aspx
 * https://hom.nfe.fazenda.gov.br/portal/webServices.aspx
 */
const UF_AUTORIZADOR: Record<string, string> = {
  AM: 'AM',
  BA: 'BA',
  GO: 'GO',
  MG: 'MG',
  MS: 'MS',
  MT: 'MT',
  PE: 'PE',
  PR: 'PR',
  RS: 'RS',
  SP: 'SP',
  MA: 'SVAN',
  AC: 'SVRS',
  AL: 'SVRS',
  AP: 'SVRS',
  CE: 'SVRS',
  DF: 'SVRS',
  ES: 'SVRS',
  PA: 'SVRS',
  PB: 'SVRS',
  PI: 'SVRS',
  RJ: 'SVRS',
  RN: 'SVRS',
  RO: 'SVRS',
  RR: 'SVRS',
  SC: 'SVRS',
  SE: 'SVRS',
  TO: 'SVRS',
}

const ENDPOINTS: Record<string, SefazEndpoints> = {
  AM: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
      NfeRetAutorizacao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://nfe.sefaz.am.gov.br/services2/services/NfeConsulta4',
      NfeStatusServico: 'https://nfe.sefaz.am.gov.br/services2/services/NfeStatusServico4',
      NfeRecepcaoEvento: 'https://nfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
      NfeInutilizacao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4',
    },
    homologacao: {
      NfeAutorizacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
      NfeRetAutorizacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeConsulta4',
      NfeStatusServico: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeStatusServico4',
      NfeRecepcaoEvento: 'https://homnfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
      NfeInutilizacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4',
    },
  },
  BA: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
      NfeStatusServico: 'https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      NfeInutilizacao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
    },
    homologacao: {
      NfeAutorizacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
      NfeStatusServico: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      NfeInutilizacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
    },
  },
  GO: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4?wsdl',
      NfeStatusServico: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeInutilizacao4?wsdl',
    },
    homologacao: {
      NfeAutorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4?wsdl',
      NfeStatusServico: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeInutilizacao4?wsdl',
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
  MS: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
      NfeRetAutorizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
      NfeStatusServico: 'https://nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
      NfeRecepcaoEvento: 'https://nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
      NfeInutilizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4',
    },
    homologacao: {
      NfeAutorizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
      NfeRetAutorizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
      NfeStatusServico: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
      NfeRecepcaoEvento: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
      NfeInutilizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4',
    },
  },
  MT: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4?wsdl',
      NfeStatusServico: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4?wsdl',
    },
    homologacao: {
      NfeAutorizacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4?wsdl',
      NfeStatusServico: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4?wsdl',
    },
  },
  PE: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
      NfeRetAutorizacao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4',
      NfeConsultaProtocolo: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
      NfeStatusServico: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
      NfeRecepcaoEvento: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
      NfeInutilizacao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4',
    },
    homologacao: {
      NfeAutorizacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4?wsdl',
      NfeStatusServico: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4?wsdl',
    },
  },
  PR: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4?wsdl',
      NfeStatusServico: 'https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4?wsdl',
    },
    homologacao: {
      NfeAutorizacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl',
      NfeRetAutorizacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4?wsdl',
      NfeConsultaProtocolo: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4?wsdl',
      NfeStatusServico: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4?wsdl',
      NfeRecepcaoEvento: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4?wsdl',
      NfeInutilizacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4?wsdl',
    },
  },
  RS: {
    producao: {
      NfeAutorizacao: 'https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
      NfeStatusServico: 'https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
    },
    homologacao: {
      NfeAutorizacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
      NfeStatusServico: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
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
  SVAN: {
    producao: {
      NfeAutorizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
      NfeStatusServico: 'https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://www.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      NfeInutilizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
    },
    homologacao: {
      NfeAutorizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
      NfeStatusServico: 'https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      NfeInutilizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
    },
  },
  SVRS: {
    producao: {
      NfeAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/nfeautorizacao/nfeautorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/nferetautorizacao/nferetautorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
      NfeStatusServico: 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
    },
    homologacao: {
      NfeAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
      NfeRetAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
      NfeConsultaProtocolo: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NFeConsulta4.asmx',
      NfeStatusServico: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx',
      NfeRecepcaoEvento: 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
      NfeInutilizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
    },
  },
}

export function getSefazEndpoint(
  uf: string,
  ambiente: SefazEnvironment,
  service: SefazService
): string {
  const normalizedUf = (uf || '').trim().toUpperCase()
  const autorizador = UF_AUTORIZADOR[normalizedUf]
  if (!autorizador) {
    throw new Error(`UF "${normalizedUf}" nao possui autorizador mapeado.`)
  }

  const endpoints = ENDPOINTS[autorizador]
  if (!endpoints) {
    throw new Error(`Autorizador "${autorizador}" nao possui endpoints configurados.`)
  }

  const endpoint = endpoints[ambiente]?.[service]
  if (!endpoint) {
    throw new Error(`Servico "${service}" nao configurado para autorizador "${autorizador}" em ${ambiente}.`)
  }

  return endpoint
}

interface SoapResponse {
  statusCode: number
  body: string
  parsed: Record<string, unknown>
}

function loadSefazCaBundle(): Buffer[] | undefined {
  const certificates: Buffer[] = []

  const inlinePem = process.env.FISCAL_SEFAZ_CA_BUNDLE_PEM?.trim()
  if (inlinePem) {
    certificates.push(Buffer.from(inlinePem.replace(/\\n/g, '\n'), 'utf-8'))
  }

  const filePath = process.env.FISCAL_SEFAZ_CA_BUNDLE_PATH?.trim()
  if (filePath) {
    certificates.push(fs.readFileSync(filePath))
  }

  return certificates.length > 0 ? certificates : undefined
}

function shouldAllowInsecureTls(url: URL): boolean {
  const allowInsecure = process.env.FISCAL_SEFAZ_TLS_ALLOW_INSECURE_HOMOLOGATION?.trim().toLowerCase() === 'true'
  if (!allowInsecure) return false

  return /homolog|hom\./i.test(url.hostname)
}

function formatSefazTlsError(message: string): string {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('unable to get local issuer certificate') ||
    normalized.includes('self signed certificate') ||
    normalized.includes('self-signed certificate in certificate chain') ||
    normalized.includes('unable to verify the first certificate')
  ) {
    return 'SEFAZ SOAP TLS error: nao foi possivel validar a cadeia do certificado do endpoint da SEFAZ. Configure FISCAL_SEFAZ_CA_BUNDLE_PATH ou FISCAL_SEFAZ_CA_BUNDLE_PEM. Em homologacao apenas, voce tambem pode usar FISCAL_SEFAZ_TLS_ALLOW_INSECURE_HOMOLOGATION=true para diagnostico local.'
  }

  return `SEFAZ SOAP error: ${message}`
}

export async function sendSoapRequest(
  url: string,
  content: string,
  serviceName: string
): Promise<SoapResponse> {
  const certData = await loadCertificate()
  const soapBody = buildSoapEnvelope(content, serviceName)
  const parsedUrl = new URL(url)
  const caBundle = loadSefazCaBundle()
  const allowInsecureTls = shouldAllowInsecureTls(parsedUrl)

  const options: https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(soapBody, 'utf-8'),
    },
    key: certData.privateKeyPem,
    cert: certData.certificateChainPem,
    ca: caBundle,
    servername: parsedUrl.hostname,
    rejectUnauthorized: !allowInsecureTls,
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
          // Keep raw body even if parsing fails.
        }

        resolve({
          statusCode: res.statusCode || 0,
          body,
          parsed,
        })
      })
    })

    req.on('error', (err) => reject(new Error(formatSefazTlsError(err.message))))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('SEFAZ SOAP timeout (30s). Tente novamente.'))
    })

    req.write(soapBody)
    req.end()
  })
}

export function buildRetAutorizacaoRequestXml(tpAmb: 1 | 2, receiptNumber: string): string {
  return [
    '<consReciNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<nRec>${receiptNumber}</nRec>`,
    '</consReciNFe>',
  ].join('')
}

export function buildConsultaProtocoloRequestXml(tpAmb: 1 | 2, chaveAcesso: string): string {
  return [
    '<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    `<tpAmb>${tpAmb}</tpAmb>`,
    '<xServ>CONSULTAR</xServ>',
    `<chNFe>${chaveAcesso}</chNFe>`,
    '</consSitNFe>',
  ].join('')
}

export function buildInutilizacaoRequestXml(params: {
  tpAmb: 1 | 2
  cUF: number
  ano: string
  cnpj: string
  modelo: '55' | '65'
  serie: string
  numeroInicial: number
  numeroFinal: number
  justificativa: string
}): { xml: string; infInutId: string } {
  const numeroInicial = String(params.numeroInicial).padStart(9, '0')
  const numeroFinal = String(params.numeroFinal).padStart(9, '0')
  const infInutId = `ID${params.cUF}${params.ano}${params.cnpj}${params.modelo}${String(params.serie).padStart(3, '0')}${numeroInicial}${numeroFinal}`

  return {
    infInutId,
    xml: [
      '<inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      `<infInut Id="${infInutId}">`,
      `<tpAmb>${params.tpAmb}</tpAmb>`,
      `<xServ>INUTILIZAR</xServ>`,
      `<cUF>${params.cUF}</cUF>`,
      `<ano>${params.ano}</ano>`,
      `<CNPJ>${params.cnpj}</CNPJ>`,
      `<mod>${params.modelo}</mod>`,
      `<serie>${params.serie}</serie>`,
      `<nNFIni>${params.numeroInicial}</nNFIni>`,
      `<nNFFin>${params.numeroFinal}</nNFFin>`,
      `<xJust>${escapeXml(params.justificativa.substring(0, 255))}</xJust>`,
      '</infInut>',
      '</inutNFe>',
    ].join(''),
  }
}

export function parseSefazAutorizacaoResponse(parsed: Record<string, unknown>): ParsedAuthorizationResponse {
  const body = extractSoapBody(parsed)
  const fault = extractSoapFault(body)
  const detailResult = fault ? extractAuthorizationResultFromFault(fault) : undefined
  const retEnviNFe = (detailResult
    || extractNested(body, 'nfeAutorizacaoLoteResult', 'retEnviNFe')
    || extractNested(body, 'nfeAutorizacaoResult', 'retEnviNFe')
    || extractNested(body, 'nfeResultMsg', 'retEnviNFe')
    || extractNested(body, 'retEnviNFe')
    || extractNested(body, 'nfeAutorizacaoLoteResult')
    || extractNested(body, 'nfeAutorizacaoResult')
    || extractNested(body, 'nfeResultMsg')
    || body) as Record<string, unknown>

  return parseProtocolEnvelope(retEnviNFe, fault)
}

export function parseSefazRetAutorizacaoResponse(parsed: Record<string, unknown>): ParsedAuthorizationResponse {
  const body = extractSoapBody(parsed)
  const fault = extractSoapFault(body)
  const detailResult = fault ? extractRetAutorizacaoResultFromFault(fault) : undefined
  const retConsReciNFe = (detailResult
    || extractNested(body, 'nfeRetAutorizacaoLoteResult', 'retConsReciNFe')
    || extractNested(body, 'nfeRetAutorizacaoResult', 'retConsReciNFe')
    || extractNested(body, 'nfeResultMsg', 'retConsReciNFe')
    || extractNested(body, 'retConsReciNFe')
    || extractNested(body, 'nfeRetAutorizacaoLoteResult')
    || extractNested(body, 'nfeRetAutorizacaoResult')
    || extractNested(body, 'nfeResultMsg')
    || body) as Record<string, unknown>

  return parseProtocolEnvelope(retConsReciNFe, fault)
}

export function parseSefazConsultaProtocoloResponse(parsed: Record<string, unknown>): ParsedAuthorizationResponse {
  const body = extractSoapBody(parsed)
  const fault = extractSoapFault(body)
  const detailResult = fault ? extractConsultaResultFromFault(fault) : undefined
  const retConsSitNFe = (detailResult
    || extractNested(body, 'nfeConsultaNFResult', 'retConsSitNFe')
    || extractNested(body, 'nfeConsultaProtocoloResult', 'retConsSitNFe')
    || extractNested(body, 'nfeResultMsg', 'retConsSitNFe')
    || extractNested(body, 'retConsSitNFe')
    || extractNested(body, 'nfeConsultaNFResult')
    || extractNested(body, 'nfeConsultaProtocoloResult')
    || extractNested(body, 'nfeResultMsg')
    || body) as Record<string, unknown>

  return parseProtocolEnvelope(retConsSitNFe, fault)
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

export function parseSefazInutilizacaoResponse(parsed: Record<string, unknown>): ParsedInutilizacaoResponse {
  const body = extractNested(parsed, 'Envelope', 'Body') as Record<string, unknown>
  const retInutNFe = (extractNested(body, 'nfeInutilizacaoNFResult', 'retInutNFe')
    || extractNested(body, 'nfeInutilizacaoResult', 'retInutNFe')
    || extractNested(body, 'nfeResultMsg', 'retInutNFe')
    || body) as Record<string, unknown>
  const infInut = (retInutNFe.infInut || retInutNFe) as Record<string, unknown>

  return {
    cStat: Number(infInut.cStat || retInutNFe.cStat || 0),
    xMotivo: String(infInut.xMotivo || retInutNFe.xMotivo || ''),
    nProt: String(infInut.nProt || '') || null,
    dhRecbto: String(infInut.dhRecbto || '') || null,
  }
}

function parseProtocolEnvelope(
  result: Record<string, unknown>,
  fault?: SoapFault | null
): ParsedAuthorizationResponse {
  const protocolNode = extractProtocolNode(result)
  const infProt = extractInfProt(result)
  const cStat = coerceNumber(infProt?.cStat) ?? coerceNumber(result?.cStat) ?? coerceNumber(fault?.detailStatus) ?? 0
  const xMotivo = coerceString(infProt?.xMotivo)
    || coerceString(result?.xMotivo)
    || coerceString(fault?.detailMessage)
    || coerceString(fault?.message)
    || ''

  return {
    cStat,
    xMotivo,
    nRec: coerceString(result?.nRec),
    nProt: coerceString(infProt?.nProt),
    dhRecbto: coerceString(infProt?.dhRecbto),
    chNFe: coerceString(infProt?.chNFe),
    digVal: coerceString(infProt?.digVal),
    protNFe: protocolNode,
  }
}

interface SoapFault {
  code: string | null
  message: string | null
  detailStatus: number | null
  detailMessage: string | null
  detailNode: Record<string, unknown> | null
}

function extractSoapBody(parsed: Record<string, unknown>): Record<string, unknown> {
  return (extractNested(parsed, 'Envelope', 'Body') || parsed) as Record<string, unknown>
}

function extractSoapFault(body: Record<string, unknown>): SoapFault | null {
  const faultNode = (extractNested(body, 'Fault') || extractNested(body, 'fault')) as Record<string, unknown> | undefined
  if (!faultNode || typeof faultNode !== 'object') return null

  const detailNode = (extractNested(faultNode, 'Detail')
    || extractNested(faultNode, 'detail')) as Record<string, unknown> | undefined

  return {
    code: coerceString(extractNested(faultNode, 'Code', 'Value'))
      || coerceString(faultNode.faultcode),
    message: coerceString(extractNested(faultNode, 'Reason', 'Text'))
      || coerceString(faultNode.faultstring),
    detailStatus: coerceNumber(extractNested(detailNode, 'retEnviNFe', 'cStat'))
      ?? coerceNumber(extractNested(detailNode, 'retConsReciNFe', 'cStat'))
      ?? coerceNumber(extractNested(detailNode, 'retConsSitNFe', 'cStat'))
      ?? coerceNumber(extractNested(detailNode, 'cStat')),
    detailMessage: coerceString(extractNested(detailNode, 'retEnviNFe', 'xMotivo'))
      || coerceString(extractNested(detailNode, 'retConsReciNFe', 'xMotivo'))
      || coerceString(extractNested(detailNode, 'retConsSitNFe', 'xMotivo'))
      || coerceString(extractNested(detailNode, 'xMotivo'))
      || coerceString(extractNested(detailNode, 'faultstring'))
      || null,
    detailNode: detailNode && typeof detailNode === 'object' ? detailNode : null,
  }
}

function extractAuthorizationResultFromFault(fault: SoapFault): Record<string, unknown> | undefined {
  return (extractNested(fault.detailNode, 'nfeResultMsg', 'retEnviNFe')
    || extractNested(fault.detailNode, 'retEnviNFe')
    || extractNested(fault.detailNode, 'nfeAutorizacaoLoteResult', 'retEnviNFe')
    || extractNested(fault.detailNode, 'nfeAutorizacaoResult', 'retEnviNFe')
    || extractNested(fault.detailNode, 'nfeResultMsg')
    || fault.detailNode) as Record<string, unknown> | undefined
}

function extractRetAutorizacaoResultFromFault(fault: SoapFault): Record<string, unknown> | undefined {
  return (extractNested(fault.detailNode, 'nfeResultMsg', 'retConsReciNFe')
    || extractNested(fault.detailNode, 'retConsReciNFe')
    || extractNested(fault.detailNode, 'nfeRetAutorizacaoLoteResult', 'retConsReciNFe')
    || extractNested(fault.detailNode, 'nfeRetAutorizacaoResult', 'retConsReciNFe')
    || extractNested(fault.detailNode, 'nfeResultMsg')
    || fault.detailNode) as Record<string, unknown> | undefined
}

function extractConsultaResultFromFault(fault: SoapFault): Record<string, unknown> | undefined {
  return (extractNested(fault.detailNode, 'nfeResultMsg', 'retConsSitNFe')
    || extractNested(fault.detailNode, 'retConsSitNFe')
    || extractNested(fault.detailNode, 'nfeConsultaNFResult', 'retConsSitNFe')
    || extractNested(fault.detailNode, 'nfeConsultaProtocoloResult', 'retConsSitNFe')
    || extractNested(fault.detailNode, 'nfeResultMsg')
    || fault.detailNode) as Record<string, unknown> | undefined
}

function extractProtocolNode(result: Record<string, unknown>): Record<string, unknown> | null {
  const protNFe = result?.protNFe as Record<string, unknown> | undefined
  if (protNFe && typeof protNFe === 'object') return protNFe
  return null
}

function extractInfProt(result: Record<string, unknown>): Record<string, unknown> | null {
  const protNFe = extractProtocolNode(result)
  const infProt = (protNFe?.infProt || result?.infProt) as Record<string, unknown> | undefined
  if (infProt && typeof infProt === 'object') return infProt
  return null
}

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

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized && normalized !== '0' ? normalized : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = coerceString(item)
      if (normalized) return normalized
    }
  }

  if (value && typeof value === 'object') {
    const text = extractNested(value, '#text')
    return coerceString(text)
  }

  return null
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    const asNumber = Number(normalized)
    return Number.isFinite(asNumber) ? asNumber : null
  }
  return null
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
