// ============================================================
// Fiscal Transport — Map FiscalDocumentPayload → NFe XML
// Converts Motor Fiscal output to SEFAZ XML structure
// using fast-xml-parser (pure JS, Vercel-compatible)
// ============================================================

import 'server-only'

import { XMLBuilder } from 'fast-xml-parser'
import type {
  FiscalDocumentPayload,
  ItemTaxBreakdown,
  DocumentTotals,
  EmitterContext,
  StoreContext,
  EnvironmentContext,
} from '../motor/types'
import { UF_CODES } from './types'

const NF_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

/**
 * Maps a FiscalDocumentPayload from the Motor Fiscal to the
 * XML structure expected by SEFAZ NFeAutorizacao web service.
 *
 * Returns the unsigned infNFe XML string (signing happens later).
 */
export function mapFiscalPayloadToNFeXml(
  payload: FiscalDocumentPayload,
  documentNumber: number,
  serie: string,
  modelo: '55' | '65' = '55'
): { xml: string; chaveAcesso: string; infNFeId: string } {
  const { context: ctx, items, totals } = payload
  const cUF = UF_CODES[ctx.emitter.uf] || 35
  const cNF = generateCNF()
  const nNF = documentNumber
  const dhEmi = new Date().toISOString().replace('Z', '-03:00') // BRT
  const tpAmb = ctx.environment.ambiente === 'producao' ? 1 : 2

  // Generate chave de acesso (44 digits)
  const chaveBase = buildChaveBase(cUF, dhEmi, ctx.emitter.cnpj, Number(modelo), Number(serie), nNF, 1, cNF)
  const cDV = calculateMod11(chaveBase)
  const chaveAcesso = `${chaveBase}${cDV}`
  const infNFeId = `NFe${chaveAcesso}`

  // Build IDE
  const ide = {
    cUF,
    cNF,
    natOp: ctx.environment.natureza_operacao || 'VENDA DE MERCADORIA',
    mod: Number(modelo),
    serie: Number(serie),
    nNF,
    dhEmi,
    ...(modelo === '55' ? { dhSaiEnt: dhEmi } : {}),
    tpNF: 1, // 1 = saída
    idDest: ctx.emitter.uf === ctx.store.uf ? 1 : 2, // 1=intra, 2=inter
    cMunFG: Number(ctx.emitter.ibge),
    tpImp: modelo === '55' ? 1 : 4, // 1=DANFE retrato (55), 4=DANFE NFC-e
    tpEmis: 1, // 1=normal
    cDV: Number(cDV),
    tpAmb,
    finNFe: 1, // 1=normal
    indFinal: ctx.store.is_consumer_final ? 1 : 0,
    indPres: modelo === '65' ? 1 : 9, // 1=presencial(65), 9=outros(55)
    indIntermed: 0,
    procEmi: 0,
    verProc: payload.motor_version,
  }

  // Build EMIT
  const emit = {
    CNPJ: ctx.emitter.cnpj,
    xNome: tpAmb === 2
      ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : ctx.emitter.razao_social,
    ...(ctx.emitter.nome_fantasia ? { xFant: ctx.emitter.nome_fantasia } : {}),
    enderEmit: {
      xLgr: ctx.emitter.logradouro,
      nro: ctx.emitter.numero,
      ...(ctx.emitter.complemento ? { xCpl: ctx.emitter.complemento } : {}),
      xBairro: ctx.emitter.bairro,
      cMun: Number(ctx.emitter.ibge),
      xMun: ctx.emitter.cidade,
      UF: ctx.emitter.uf,
      CEP: ctx.emitter.cep?.replace(/\D/g, ''),
      cPais: 1058,
      xPais: 'BRASIL',
      ...(ctx.emitter.telefone ? { fone: ctx.emitter.telefone.replace(/\D/g, '') } : {}),
    },
    IE: ctx.emitter.ie,
    CRT: Number(ctx.emitter.crt),
  }

  // Build DEST
  const isHomolog = tpAmb === 2
  const dest = {
    ...(ctx.store.document_number.length === 14
      ? { CNPJ: ctx.store.document_number }
      : { CPF: ctx.store.document_number }),
    xNome: isHomolog
      ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : ctx.store.nome,
    enderDest: {
      xLgr: ctx.store.logradouro,
      nro: ctx.store.numero,
      ...(ctx.store.complemento ? { xCpl: ctx.store.complemento } : {}),
      xBairro: ctx.store.bairro,
      cMun: Number(ctx.store.ibge),
      xMun: ctx.store.cidade,
      UF: ctx.store.uf,
      CEP: ctx.store.cep?.replace(/\D/g, ''),
      cPais: 1058,
      xPais: 'BRASIL',
      ...(ctx.store.telefone ? { fone: ctx.store.telefone.replace(/\D/g, '') } : {}),
    },
    indIEDest: mapIndIEDest(ctx.store),
    ...(ctx.store.ie ? { IE: ctx.store.ie } : {}),
  }

  // Build DET (items)
  const det = items.map((item, index) => ({
    '@_nItem': index + 1,
    prod: buildProd(item),
    imposto: buildImposto(item),
  }))

  // Build TOTAL
  const total = { ICMSTot: buildICMSTot(totals) }

  // Build TRANSP
  const transp = { modFrete: 9 } // 9 = sem frete

  // Build PAG
  const pag = {
    detPag: {
      indPag: 0, // 0 = à vista
      tPag: '99', // 99 = Outros
      vPag: formatDecimal(totals.vNF),
    },
  }

  // Build infNFe
  const infNFe = {
    '@_versao': '4.00',
    '@_Id': infNFeId,
    ide,
    emit,
    dest,
    det,
    total,
    transp,
    pag,
  }

  // Build XML
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,
    suppressEmptyNode: true,
    tagValueProcessor: (tagName: string, tagValue: unknown) => {
      if (tagValue === null || tagValue === undefined) return ''
      return String(tagValue)
    },
  })

  const infNFeXml = builder.build({ infNFe })

  return { xml: infNFeXml, chaveAcesso, infNFeId }
}

// ─── Helper: Build prod node ───────────────────

function buildProd(item: ItemTaxBreakdown) {
  return {
    cProd: item.product_variant_id.substring(0, 60),
    cEAN: 'SEM GTIN',
    xProd: item.product_name.substring(0, 120),
    NCM: item.ncm,
    ...(item.cest ? { CEST: item.cest } : {}),
    CFOP: Number(item.cfop),
    uCom: 'UN',
    qCom: formatDecimal(item.quantity, 4),
    vUnCom: formatDecimal(item.fiscal_unit_value, 10),
    vProd: formatDecimal(item.fiscal_total_value),
    cEANTrib: 'SEM GTIN',
    uTrib: 'UN',
    qTrib: formatDecimal(item.quantity, 4),
    vUnTrib: formatDecimal(item.fiscal_unit_value, 10),
    ...(item.fiscal_discount_value > 0 ? { vDesc: formatDecimal(item.fiscal_discount_value) } : {}),
    ...(item.fiscal_freight_value > 0 ? { vFrete: formatDecimal(item.fiscal_freight_value) } : {}),
    indTot: 1,
  }
}

// ─── Helper: Build imposto node ─────────────────

function buildImposto(item: ItemTaxBreakdown) {
  const imposto: Record<string, unknown> = {}

  // vTotTrib (Lei 12.741/2012)
  if (item.total_tributos > 0) {
    imposto.vTotTrib = formatDecimal(item.total_tributos)
  }

  // ICMS
  imposto.ICMS = buildIcmsTag(item)

  // PIS
  imposto.PIS = buildPisTag(item)

  // COFINS
  imposto.COFINS = buildCofinsTag(item)

  // IPI (only if applicable)
  if (item.ipi.value > 0 || (item.ipi.cst && item.ipi.cst !== '53')) {
    imposto.IPI = buildIpiTag(item)
  }

  return imposto
}

// ─── Helper: ICMS tag by CST ──────────────────

function buildIcmsTag(item: ItemTaxBreakdown): Record<string, unknown> {
  const cst = item.icms.cst || '00'
  const orig = Number(item.origin_code) || 0

  switch (cst) {
    case '00':
      return {
        ICMS00: {
          orig, CST: cst, modBC: 3,
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
        },
      }
    case '10':
      return {
        ICMS10: {
          orig, CST: cst, modBC: 3,
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          modBCST: 4,
          ...(item.st.mva > 0 ? { pMVAST: formatDecimal(item.st.mva) } : {}),
          vBCST: formatDecimal(item.st.base),
          pICMSST: formatDecimal(item.st.rate),
          vICMSST: formatDecimal(item.st.value),
        },
      }
    case '20':
      return {
        ICMS20: {
          orig, CST: cst, modBC: 3,
          pRedBC: formatDecimal(item.icms.base_reduction_percent),
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
        },
      }
    case '40':
    case '41':
    case '50':
      return { ICMS40: { orig, CST: cst } }
    case '60':
      return { ICMS60: { orig, CST: cst } }
    case '70':
      return {
        ICMS70: {
          orig, CST: cst, modBC: 3,
          pRedBC: formatDecimal(item.icms.base_reduction_percent),
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          modBCST: 4,
          vBCST: formatDecimal(item.st.base),
          pICMSST: formatDecimal(item.st.rate),
          vICMSST: formatDecimal(item.st.value),
        },
      }
    case '90':
    default:
      return {
        ICMS90: {
          orig, CST: cst, modBC: 3,
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
        },
      }
  }
}

// ─── Helper: PIS tag by CST ──────────────────

function buildPisTag(item: ItemTaxBreakdown): Record<string, unknown> {
  const cst = item.pis.cst || '01'
  const zeroRatedCsts = ['04', '05', '06', '07', '08', '09']

  if (zeroRatedCsts.includes(cst)) {
    return { PISNT: { CST: cst } }
  }

  if (cst === '01' || cst === '02') {
    return {
      PISAliq: {
        CST: cst,
        vBC: formatDecimal(item.pis.base),
        pPIS: formatDecimal(item.pis.rate, 4),
        vPIS: formatDecimal(item.pis.value),
      },
    }
  }

  return {
    PISOutr: {
      CST: cst,
      vBC: formatDecimal(item.pis.base),
      pPIS: formatDecimal(item.pis.rate, 4),
      vPIS: formatDecimal(item.pis.value),
    },
  }
}

// ─── Helper: COFINS tag by CST ──────────────────

function buildCofinsTag(item: ItemTaxBreakdown): Record<string, unknown> {
  const cst = item.cofins.cst || '01'
  const zeroRatedCsts = ['04', '05', '06', '07', '08', '09']

  if (zeroRatedCsts.includes(cst)) {
    return { COFINSNT: { CST: cst } }
  }

  if (cst === '01' || cst === '02') {
    return {
      COFINSAliq: {
        CST: cst,
        vBC: formatDecimal(item.cofins.base),
        pCOFINS: formatDecimal(item.cofins.rate, 4),
        vCOFINS: formatDecimal(item.cofins.value),
      },
    }
  }

  return {
    COFINSOutr: {
      CST: cst,
      vBC: formatDecimal(item.cofins.base),
      pCOFINS: formatDecimal(item.cofins.rate, 4),
      vCOFINS: formatDecimal(item.cofins.value),
    },
  }
}

// ─── Helper: IPI tag ──────────────────

function buildIpiTag(item: ItemTaxBreakdown): Record<string, unknown> {
  const cst = item.ipi.cst || '50'
  const nonTaxedCsts = ['01', '02', '03', '04', '05', '51', '52', '53', '54', '55']

  return {
    ...(item.ipi.enquadramento ? { cEnq: item.ipi.enquadramento } : { cEnq: '999' }),
    ...(nonTaxedCsts.includes(cst)
      ? { IPINT: { CST: cst } }
      : {
        IPITrib: {
          CST: cst,
          vBC: formatDecimal(item.ipi.base),
          pIPI: formatDecimal(item.ipi.rate),
          vIPI: formatDecimal(item.ipi.value),
        },
      }),
  }
}

// ─── Helper: ICMSTot ──────────────────

function buildICMSTot(totals: DocumentTotals) {
  return {
    vBC: formatDecimal(totals.vBC),
    vICMS: formatDecimal(totals.vICMS),
    vICMSDeson: '0.00',
    vFCP: formatDecimal(totals.vFCP),
    vBCST: formatDecimal(totals.vBCST),
    vST: formatDecimal(totals.vST),
    vFCPST: '0.00',
    vFCPSTRet: '0.00',
    vProd: formatDecimal(totals.vProd),
    vFrete: formatDecimal(totals.vFrete),
    vSeg: '0.00',
    vDesc: formatDecimal(totals.vDesc),
    vII: '0.00',
    vIPI: formatDecimal(totals.vIPI),
    vIPIDevol: '0.00',
    vPIS: formatDecimal(totals.vPIS),
    vCOFINS: formatDecimal(totals.vCOFINS),
    vOutro: '0.00',
    vNF: formatDecimal(totals.vNF),
    vTotTrib: formatDecimal(totals.vTotTrib),
  }
}

// ─── Utility Functions ──────────────────

function mapIndIEDest(store: StoreContext): number {
  if (store.taxpayer_indicator === 'contributor') return 1
  if (store.taxpayer_indicator === 'exempt') return 2
  return 9 // 9 = não contribuinte
}

function formatDecimal(value: number, decimals: number = 2): string {
  return (value || 0).toFixed(decimals)
}

function generateCNF(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
}

function buildChaveBase(
  cUF: number, dhEmi: string, cnpj: string, mod: number,
  serie: number, nNF: number, tpEmis: number, cNF: string
): string {
  const aamm = dhEmi.substring(2, 4) + dhEmi.substring(5, 7)
  return [
    String(cUF).padStart(2, '0'),
    aamm,
    cnpj.padStart(14, '0'),
    String(mod).padStart(2, '0'),
    String(serie).padStart(3, '0'),
    String(nNF).padStart(9, '0'),
    String(tpEmis),
    cNF.padStart(8, '0'),
  ].join('')
}

function calculateMod11(chave: string): string {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9]
  let sum = 0
  const digits = chave.split('').reverse()
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * weights[i % weights.length]
  }
  const remainder = sum % 11
  const digit = remainder < 2 ? 0 : 11 - remainder
  return String(digit)
}

// ─── Build full NFeAutorizacao envelope ──────

export function buildNFeAuthorizationEnvelope(signedXml: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<enviNFe xmlns="${NF_NAMESPACE}" versao="4.00">`,
    '<idLote>1</idLote>',
    '<indSinc>1</indSinc>',
    signedXml,
    '</enviNFe>',
  ].join('')
}

export function buildSoapEnvelope(content: string, service: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Header/>',
    '<soap12:Body>',
    `<nfeDadosMsg xmlns="${NF_NAMESPACE}/wsdl/${service}">`,
    content,
    '</nfeDadosMsg>',
    '</soap12:Body>',
    '</soap12:Envelope>',
  ].join('')
}
