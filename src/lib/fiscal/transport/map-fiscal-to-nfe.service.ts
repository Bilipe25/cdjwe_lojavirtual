// ============================================================
// Fiscal Transport - Map FiscalDocumentPayload -> NFe XML
// Converts Motor Fiscal output to SEFAZ XML structure
// using fast-xml-parser (pure JS, Vercel-compatible)
// ============================================================

import 'server-only'

import { XMLBuilder } from 'fast-xml-parser'
import type {
  DocumentTotals,
  FiscalDocumentPayload,
  FiscalOperationContext,
  FiscalTransportContext,
  FiscalVolumeContext,
  ItemTaxBreakdown,
  StoreContext,
} from '../motor/types'
import { FRETE_CODES, UF_CODES } from './types'
import { mapFiscalEmissionModeToTpEmis } from '@/lib/fiscal/emission-mode'
import type { CompanyFiscalEnvironmentParams } from '@/lib/types'
import { buildTechnicalResponsibleTag } from '@/lib/fiscal/technical-responsible'
import type { ResolvedBillingData } from '@/lib/fiscal/billing'

const NF_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

export interface NFePaymentSnapshot {
  methodCode?: string | null
  methodName?: string | null
  installments?: number | null
  paidAmount?: number | null
}

export interface NFeBuildOptions {
  payment?: NFePaymentSnapshot | null
  freightMode?: string | null
  additionalInfo?: string | null
  fiscalAuthorityInfo?: string | null
  billing?: ResolvedBillingData | null
  environmentParams?: CompanyFiscalEnvironmentParams | Record<string, unknown> | null
  orderNumber?: string | null
}

export function mapFiscalPayloadToNFeXml(
  payload: FiscalDocumentPayload,
  documentNumber: number,
  serie: string,
  modelo: '55' | '65' = '55',
  options: NFeBuildOptions = {}
): { xml: string; chaveAcesso: string; infNFeId: string } {
  const { context: ctx, items, totals } = payload
  const cUF = UF_CODES[ctx.emitter.uf] || 35
  const cNF = generateCNF()
  const nNF = documentNumber
  const dhEmi = formatSefazDateTime(new Date())
  const tpAmb = ctx.environment.ambiente === 'producao' ? 1 : 2
  const tpEmis = mapFiscalEmissionModeToTpEmis(ctx.environment.tipo_emissao)

  const chaveBase = buildChaveBase(cUF, dhEmi, ctx.emitter.cnpj, Number(modelo), Number(serie), nNF, tpEmis, cNF)
  const cDV = calculateMod11(chaveBase)
  const chaveAcesso = `${chaveBase}${cDV}`
  const infNFeId = `NFe${chaveAcesso}`

  const ide = {
    cUF,
    cNF,
    natOp: normalizeNFeText(
      ctx.operation.natureza_operacao_descricao || ctx.environment.natureza_operacao || 'VENDA DE MERCADORIA',
      60
    ),
    mod: Number(modelo),
    serie: Number(serie),
    nNF,
    dhEmi,
    ...(modelo === '55' ? { dhSaiEnt: dhEmi } : {}),
    tpNF: ctx.operation_direction === 'inbound' ? 0 : 1,
    idDest: resolveDestinationIndicator(ctx.store, ctx.emitter.uf),
    cMunFG: Number(ctx.emitter.ibge),
    tpImp: modelo === '55' ? 1 : 4,
    tpEmis,
    cDV: Number(cDV),
    tpAmb,
    finNFe: mapFinalidadeNFe(ctx.operation),
    indFinal: ctx.operation.consumidor_final ? 1 : 0,
    indPres: mapBuyerPresence(ctx.operation, modelo),
    indIntermed: 0,
    procEmi: 0,
    verProc: payload.motor_version,
  }

  const emit = {
    CNPJ: normalizeDigitsOnly(ctx.emitter.cnpj),
    xNome: tpAmb === 2
      ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : normalizeNFeText(ctx.emitter.razao_social, 60),
    ...(ctx.emitter.nome_fantasia ? { xFant: normalizeNFeText(ctx.emitter.nome_fantasia, 60) } : {}),
    enderEmit: {
      xLgr: normalizeNFeText(ctx.emitter.logradouro, 60),
      nro: normalizeNFeText(ctx.emitter.numero, 60),
      ...(ctx.emitter.complemento ? { xCpl: normalizeNFeText(ctx.emitter.complemento, 60) } : {}),
      xBairro: normalizeNFeText(ctx.emitter.bairro, 60),
      cMun: Number(ctx.emitter.ibge),
      xMun: normalizeNFeText(ctx.emitter.cidade, 60),
      UF: ctx.emitter.uf,
      ...(normalizeDigitsOnly(ctx.emitter.cep) ? { CEP: normalizeDigitsOnly(ctx.emitter.cep) } : {}),
      cPais: 1058,
      xPais: 'BRASIL',
      ...(normalizeDigitsOnly(ctx.emitter.telefone) ? { fone: normalizeDigitsOnly(ctx.emitter.telefone) } : {}),
    },
    IE: normalizeStateRegistration(ctx.emitter.ie),
    CRT: Number(ctx.emitter.crt),
  }

  const isHomolog = tpAmb === 2
  const dest = {
    ...(ctx.store.document_number.length === 14
      ? { CNPJ: ctx.store.document_number }
      : { CPF: ctx.store.document_number }),
    xNome: isHomolog
      ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : normalizeNFeText(ctx.store.nome, 60),
    enderDest: {
      xLgr: normalizeNFeText(ctx.store.logradouro, 60),
      nro: normalizeNFeText(ctx.store.numero, 60),
      ...(ctx.store.complemento ? { xCpl: normalizeNFeText(ctx.store.complemento, 60) } : {}),
      xBairro: normalizeNFeText(ctx.store.bairro, 60),
      cMun: Number(ctx.store.ibge),
      xMun: normalizeNFeText(ctx.store.cidade, 60),
      UF: ctx.store.uf,
      ...(normalizeDigitsOnly(ctx.store.cep) ? { CEP: normalizeDigitsOnly(ctx.store.cep) } : {}),
      cPais: 1058,
      xPais: 'BRASIL',
      ...(normalizeDigitsOnly(ctx.store.telefone) ? { fone: normalizeDigitsOnly(ctx.store.telefone) } : {}),
    },
    indIEDest: mapIndIEDest(ctx.store),
    ...(normalizeStateRegistration(ctx.store.ie) ? { IE: normalizeStateRegistration(ctx.store.ie) } : {}),
  }

  const det = items.map((item, index) => ({
    '@_nItem': index + 1,
    prod: buildProd(item),
    imposto: buildImposto(item),
    ...(item.inf_ad_prod ? { infAdProd: buildItemAdditionalInfoTag(item.inf_ad_prod) } : {}),
    ...(item.ibscbs.should_emit ? { vItem: formatDecimal(calculateItemFiscalValue(item)) } : {}),
  }))

  const ibsCbsTot = buildIbsCbsTot(items)
  const total = {
    ICMSTot: buildICMSTot(items, totals),
    ...(ibsCbsTot ? { IBSCBSTot: ibsCbsTot, vNFTot: formatDecimal(totals.vNF) } : {}),
  }
  const transp = buildTransportTag(ctx.transport, ctx.volumes, totals, options)
  const cobr = buildBillingTag(options.billing)
  const pag = {
    detPag: {
      indPag: resolvePaymentIndicator(options.payment?.installments),
      tPag: mapPaymentMethodToNFe(options.payment?.methodCode),
      ...(shouldIncludePaymentDescription(options.payment?.methodCode)
        ? { xPag: normalizeNFeText(options.payment?.methodName || 'Outros', 60) }
        : {}),
      vPag: formatDecimal(options.payment?.paidAmount ?? totals.vNF),
    },
  }

  const additionalInfo = buildAdditionalInfoTag(options.additionalInfo, 5000, '; ')
  const fiscalAuthorityInfo = buildAdditionalInfoTag(options.fiscalAuthorityInfo, 2000, '; ')
  const technicalResponsible = buildTechnicalResponsibleTag({
    environmentParams: options.environmentParams,
    chaveAcesso,
  })

  const infNFe = {
    '@_versao': '4.00',
    '@_Id': infNFeId,
    ide,
    emit,
    dest,
    det,
    total,
    transp,
    ...(cobr ? { cobr } : {}),
    pag,
    ...((additionalInfo || fiscalAuthorityInfo)
      ? {
        infAdic: {
          ...(fiscalAuthorityInfo ? { infAdFisco: fiscalAuthorityInfo } : {}),
          ...(additionalInfo ? { infCpl: additionalInfo } : {}),
        },
      }
      : {}),
    ...(technicalResponsible ? { infRespTec: technicalResponsible } : {}),
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,
    suppressEmptyNode: true,
    tagValueProcessor: (_tagName: string, tagValue: unknown) => {
      if (tagValue === null || tagValue === undefined) return ''
      return String(tagValue)
    },
  })

  const infNFeXml = builder.build({ infNFe })
  return { xml: infNFeXml, chaveAcesso, infNFeId }
}

function buildProd(item: ItemTaxBreakdown) {
  const cEAN = normalizeGtin(item.ean_gtin)
  const cEANTrib = normalizeGtin(item.tax_ean_gtin || item.ean_gtin)
  const uCom = normalizeUnit(item.commercial_unit)
  const uTrib = normalizeUnit(item.tax_unit || item.commercial_unit)

  return {
    cProd: normalizeNFeText(item.resolved_product_code || item.sku || item.product_variant_id, 60),
    cEAN,
    xProd: normalizeNFeText(item.resolved_product_description || item.product_name, 120),
    NCM: item.ncm,
    ...(item.cest ? { CEST: item.cest } : {}),
    CFOP: Number(item.cfop),
    uCom,
    qCom: formatDecimal(item.quantity, 4),
    vUnCom: formatDecimal(item.fiscal_unit_value, 10),
    vProd: formatDecimal(item.fiscal_total_value),
    cEANTrib,
    uTrib,
    qTrib: formatDecimal(item.quantity, 4),
    vUnTrib: formatDecimal(item.fiscal_unit_value, 10),
    ...(item.fiscal_discount_value > 0 ? { vDesc: formatDecimal(item.fiscal_discount_value) } : {}),
    ...(item.fiscal_freight_value > 0 ? { vFrete: formatDecimal(item.fiscal_freight_value) } : {}),
    ...(item.fiscal_insurance_value > 0 ? { vSeg: formatDecimal(item.fiscal_insurance_value) } : {}),
    ...(item.fiscal_other_expenses_value > 0 ? { vOutro: formatDecimal(item.fiscal_other_expenses_value) } : {}),
    indTot: 1,
  }
}

function buildImposto(item: ItemTaxBreakdown) {
  const imposto: Record<string, unknown> = {}

  if (item.total_tributos > 0) {
    imposto.vTotTrib = formatDecimal(item.total_tributos)
  }

  imposto.ICMS = buildIcmsTag(item)

  if (item.icms.has_difal) {
    imposto.ICMSUFDest = buildIcmsUfDestTag(item)
  }

  if (item.ipi.value > 0 || (item.ipi.cst && item.ipi.cst !== '53')) {
    imposto.IPI = buildIpiTag(item)
  }

  imposto.PIS = buildPisTag(item)
  imposto.COFINS = buildCofinsTag(item)

  if (item.ibscbs.should_emit && item.ibscbs.cst_code && item.ibscbs.classification_code) {
    imposto.IBSCBS = buildIbsCbsTag(item)
  }

  return imposto
}

function buildIcmsTag(item: ItemTaxBreakdown): Record<string, unknown> {
  const cst = item.icms.cst || '00'
  const orig = Number(item.origin_code) || 0
  const ownFcp = buildOwnFcpFields(item)
  const fcpSt = buildFcpStFields(item)

  switch (cst) {
    case '00':
      return {
        ICMS00: {
          orig,
          CST: cst,
          modBC: 3,
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          ...ownFcp,
        },
      }
    case '10':
      return {
        ICMS10: {
          orig,
          CST: cst,
          modBC: 3,
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          modBCST: 4,
          ...(item.st.mva > 0 ? { pMVAST: formatDecimal(item.st.mva) } : {}),
          vBCST: formatDecimal(item.st.base),
          pICMSST: formatDecimal(item.st.rate),
          vICMSST: formatDecimal(item.st.value),
          ...ownFcp,
          ...fcpSt,
        },
      }
    case '20':
      return {
        ICMS20: {
          orig,
          CST: cst,
          modBC: 3,
          pRedBC: formatDecimal(item.icms.base_reduction_percent),
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          ...ownFcp,
        },
      }
    case '40':
    case '41':
    case '50':
      return { ICMS40: { orig, CST: cst } }
    case '60':
      return {
        ICMS60: {
          orig,
          CST: cst,
          ...(item.st.fcp_value > 0
            ? {
              vBCFCPSTRet: formatDecimal(item.st.fcp_base || item.st.base),
              pFCPSTRet: formatDecimal(item.st.fcp_rate),
              vFCPSTRet: formatDecimal(item.st.fcp_value),
            }
            : {}),
        },
      }
    case '70':
      return {
        ICMS70: {
          orig,
          CST: cst,
          modBC: 3,
          pRedBC: formatDecimal(item.icms.base_reduction_percent),
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          modBCST: 4,
          vBCST: formatDecimal(item.st.base),
          pICMSST: formatDecimal(item.st.rate),
          vICMSST: formatDecimal(item.st.value),
          ...ownFcp,
          ...fcpSt,
        },
      }
    case '90':
    default:
      return {
        ICMS90: {
          orig,
          CST: cst,
          modBC: 3,
          vBC: formatDecimal(item.icms.base),
          pICMS: formatDecimal(item.icms.rate),
          vICMS: formatDecimal(item.icms.value),
          ...ownFcp,
          ...(item.st.enabled
            ? {
              modBCST: 4,
              ...(item.st.mva > 0 ? { pMVAST: formatDecimal(item.st.mva) } : {}),
              vBCST: formatDecimal(item.st.base),
              pICMSST: formatDecimal(item.st.rate),
              vICMSST: formatDecimal(item.st.value),
              ...fcpSt,
            }
            : {}),
        },
      }
  }
}

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

  if (cst === '03') {
    return {
      PISQtde: {
        CST: cst,
        qBCProd: formatDecimal(item.pis.quantity_base || item.quantity, 4),
        vAliqProd: formatDecimal(item.pis.unit_rate, 4),
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

  if (cst === '03') {
    return {
      COFINSQtde: {
        CST: cst,
        qBCProd: formatDecimal(item.cofins.quantity_base || item.quantity, 4),
        vAliqProd: formatDecimal(item.cofins.unit_rate, 4),
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

function buildICMSTot(items: ItemTaxBreakdown[], totals: DocumentTotals) {
  const vFCPST = items.reduce((sum, item) => sum + (item.st.fcp_value || 0), 0)
  const vFCPUFDest = items.reduce((sum, item) => sum + (item.icms.has_difal ? item.fcp.value : 0), 0)
  const vICMSUFDest = items.reduce((sum, item) => sum + item.icms.difal_value_destination, 0)
  const vICMSUFRemet = items.reduce((sum, item) => sum + item.icms.difal_value_origin, 0)

  return {
    vBC: formatDecimal(totals.vBC),
    vICMS: formatDecimal(totals.vICMS),
    vICMSDeson: '0.00',
    vFCP: formatDecimal(totals.vFCP),
    vBCST: formatDecimal(totals.vBCST),
    vST: formatDecimal(totals.vST),
    vFCPST: formatDecimal(vFCPST),
    vFCPSTRet: '0.00',
    vProd: formatDecimal(totals.vProd),
    vFrete: formatDecimal(totals.vFrete),
    vSeg: formatDecimal(totals.vSeg),
    vDesc: formatDecimal(totals.vDesc),
    vII: '0.00',
    vIPI: formatDecimal(totals.vIPI),
    vIPIDevol: '0.00',
    vPIS: formatDecimal(totals.vPIS),
    vCOFINS: formatDecimal(totals.vCOFINS),
    vOutro: formatDecimal(totals.vOutro),
    vNF: formatDecimal(totals.vNF),
    vTotTrib: formatDecimal(totals.vTotTrib),
    ...(vFCPUFDest > 0 ? { vFCPUFDest: formatDecimal(vFCPUFDest) } : {}),
    ...(vICMSUFDest > 0 ? { vICMSUFDest: formatDecimal(vICMSUFDest) } : {}),
    ...(vICMSUFRemet > 0 ? { vICMSUFRemet: formatDecimal(vICMSUFRemet) } : {}),
  }
}

function buildIbsCbsTag(item: ItemTaxBreakdown): Record<string, unknown> {
  return {
    CST: item.ibscbs.cst_code,
    cClassTrib: item.ibscbs.classification_code,
    gIBSCBS: {
      vBC: formatDecimal(item.ibscbs.base),
      gIBSUF: {
        pIBSUF: formatDecimal(item.ibscbs.ibs_uf_rate),
        vIBSUF: formatDecimal(item.ibscbs.ibs_uf_value),
      },
      gIBSMun: {
        pIBSMun: formatDecimal(item.ibscbs.ibs_mun_rate),
        vIBSMun: formatDecimal(item.ibscbs.ibs_mun_value),
      },
      vIBS: formatDecimal(item.ibscbs.ibs_value),
      gCBS: {
        pCBS: formatDecimal(item.ibscbs.cbs_rate),
        vCBS: formatDecimal(item.ibscbs.cbs_value),
      },
    },
  }
}

function buildIbsCbsTot(items: ItemTaxBreakdown[]) {
  const readyItems = items.filter((item) => item.ibscbs.should_emit)
  if (readyItems.length === 0) return null

  const totals = readyItems.reduce(
    (acc, item) => {
      acc.base += item.ibscbs.base
      acc.ibsUf += item.ibscbs.ibs_uf_value
      acc.ibsMun += item.ibscbs.ibs_mun_value
      acc.ibs += item.ibscbs.ibs_value
      acc.cbs += item.ibscbs.cbs_value
      acc.credit += item.ibscbs.presumed_credit_value
      return acc
    },
    { base: 0, ibsUf: 0, ibsMun: 0, ibs: 0, cbs: 0, credit: 0 }
  )

  return {
    vBCIBSCBS: formatDecimal(totals.base),
    gIBS: {
      gIBSUF: {
        vDif: '0.00',
        vDevTrib: '0.00',
        vIBSUF: formatDecimal(totals.ibsUf),
      },
      gIBSMun: {
        vDif: '0.00',
        vDevTrib: '0.00',
        vIBSMun: formatDecimal(totals.ibsMun),
      },
      vIBS: formatDecimal(totals.ibs),
      vCredPres: formatDecimal(totals.credit),
      vCredPresCondSus: '0.00',
    },
    gCBS: {
      vDif: '0.00',
      vDevTrib: '0.00',
      vCBS: formatDecimal(totals.cbs),
      vCredPres: '0.00',
      vCredPresCondSus: '0.00',
    },
  }
}

function buildTransportTag(
  transport: FiscalTransportContext,
  volumes: FiscalVolumeContext[],
  totals: DocumentTotals,
  options: NFeBuildOptions
): Record<string, unknown> {
  return {
    modFrete: resolveFreightMode(totals.vFrete, options.freightMode || transport.freight_mode),
    ...(transport.transporter_name || transport.transporter_document
      ? {
        transporta: {
          ...(transport.transporter_name ? { xNome: normalizeNFeText(transport.transporter_name, 60) } : {}),
          ...buildTransporterDocumentTag(transport.transporter_document),
          ...(transport.transporter_address ? { xEnder: normalizeNFeText(transport.transporter_address, 60) } : {}),
          ...(transport.transporter_city ? { xMun: normalizeNFeText(transport.transporter_city, 60) } : {}),
          ...(transport.transporter_state ? { UF: transport.transporter_state.toUpperCase().substring(0, 2) } : {}),
          ...(normalizeStateRegistration(transport.transporter_ie) ? { IE: normalizeStateRegistration(transport.transporter_ie) } : {}),
        },
      }
      : {}),
    ...(transport.vehicle_plate || transport.vehicle_uf || transport.antt_code
      ? {
        veicTransp: {
          ...(transport.vehicle_plate ? { placa: normalizeNFeText(transport.vehicle_plate.toUpperCase(), 7) } : {}),
          ...(transport.vehicle_uf ? { UF: transport.vehicle_uf.toUpperCase().substring(0, 2) } : {}),
          ...(transport.antt_code ? { RNTC: normalizeDigitsOnly(transport.antt_code).substring(0, 20) } : {}),
        },
      }
      : {}),
    ...(volumes.length > 0
      ? {
        vol: volumes.map((volume) => ({
          qVol: String(volume.quantity || 0),
          ...(volume.species ? { esp: normalizeNFeText(volume.species, 60) } : {}),
          ...(volume.brand ? { marca: normalizeNFeText(volume.brand, 60) } : {}),
          ...(volume.numbering ? { nVol: normalizeNFeText(volume.numbering, 60) } : {}),
          ...(typeof volume.gross_weight === 'number' ? { pesoB: formatDecimal(volume.gross_weight, 3) } : {}),
          ...(typeof volume.net_weight === 'number' ? { pesoL: formatDecimal(volume.net_weight, 3) } : {}),
        })),
      }
      : {}),
  }
}

function buildTransporterDocumentTag(document: string | null | undefined): Record<string, unknown> {
  const digits = normalizeDigitsOnly(document)
  if (digits.length === 14) return { CNPJ: digits }
  if (digits.length === 11) return { CPF: digits }
  return {}
}

function buildFcpStFields(item: ItemTaxBreakdown): Record<string, unknown> {
  if (item.st.fcp_value <= 0) return {}

  return {
    vBCFCPST: formatDecimal(item.st.fcp_base || item.st.base),
    pFCPST: formatDecimal(item.st.fcp_rate),
    vFCPST: formatDecimal(item.st.fcp_value),
  }
}

function buildOwnFcpFields(item: ItemTaxBreakdown): Record<string, unknown> {
  if (item.fcp.value <= 0) return {}

  return {
    pFCP: formatDecimal(item.fcp.rate),
    vFCP: formatDecimal(item.fcp.value),
  }
}

function buildIcmsUfDestTag(item: ItemTaxBreakdown): Record<string, unknown> {
  const pIcmsInter = item.icms.difal_rate_origin
  const pIcmsUfDest = item.icms.difal_rate_origin + item.icms.difal_rate_destination

  return {
    vBCUFDest: formatDecimal(item.icms.difal_base),
    ...(item.fcp.value > 0
      ? {
        vBCFCPUFDest: formatDecimal(item.fcp.base),
        pFCPUFDest: formatDecimal(item.fcp.rate),
        vFCPUFDest: formatDecimal(item.fcp.value),
      }
      : {}),
    pICMSUFDest: formatDecimal(pIcmsUfDest),
    pICMSInter: formatDecimal(pIcmsInter),
    pICMSInterPart: '100.00',
    vICMSUFDest: formatDecimal(item.icms.difal_value_destination),
    vICMSUFRemet: formatDecimal(item.icms.difal_value_origin),
  }
}

function buildAdditionalInfoTag(
  additionalInfo: string | null | undefined,
  maxLength: number,
  separator: string
): string | null {
  const normalizedLines = (additionalInfo || '')
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeNFeText(line, maxLength))
    .filter(Boolean)

  if (normalizedLines.length === 0) return null
  return normalizedLines.join(separator).substring(0, maxLength)
}

function calculateItemFiscalValue(item: ItemTaxBreakdown): number {
  return Math.max(
    0,
    (item.fiscal_total_value || 0)
      + (item.fiscal_freight_value || 0)
      + (item.fiscal_insurance_value || 0)
      + (item.fiscal_other_expenses_value || 0)
      - (item.fiscal_discount_value || 0)
  )
}

function buildItemAdditionalInfoTag(additionalInfo: string | null | undefined): string | null {
  return buildAdditionalInfoTag(additionalInfo, 500, '; ')
}

function buildBillingTag(billing: ResolvedBillingData | null | undefined): Record<string, unknown> | null {
  if (!billing || billing.duplicatas.length === 0) return null

  const duplicates = billing.duplicatas
    .map((duplicate) => {
      const dueDate = formatXmlDate(duplicate.vencimentoIso)
      if (!dueDate) return null

      return {
        nDup: normalizeNFeText(duplicate.numero, 60),
        dVenc: dueDate,
        vDup: formatDecimal(duplicate.valor),
      }
    })
    .filter((duplicate): duplicate is NonNullable<typeof duplicate> => Boolean(duplicate))

  if (duplicates.length === 0) return null

  return {
    fat: {
      nFat: normalizeNFeText(billing.invoiceNumber || 'FATURA', 60),
      vOrig: formatDecimal(billing.valorOriginal),
      ...(billing.valorDesconto > 0 ? { vDesc: formatDecimal(billing.valorDesconto) } : {}),
      vLiq: formatDecimal(billing.valorLiquido),
    },
    dup: duplicates,
  }
}

function resolveDestinationIndicator(store: StoreContext, emitterUf: string): number {
  if (store.country_code && store.country_code !== '1058') return 3
  return emitterUf === store.uf ? 1 : 2
}

function mapIndIEDest(store: StoreContext): number {
  if (store.taxpayer_indicator === 'contributor') return 1
  if (store.taxpayer_indicator === 'exempt') return 2
  return 9
}

function formatDecimal(value: number, decimals: number = 2): string {
  return (value || 0).toFixed(decimals)
}

function normalizeUnit(value: string | null | undefined): string {
  const unit = (value || '').trim().toUpperCase()
  return unit ? unit.substring(0, 6) : 'UN'
}

function normalizeStateRegistration(value: string | null | undefined): string | null {
  const normalized = (value || '').trim()
  if (!normalized) return null
  if (normalized.toUpperCase() === 'ISENTO') return 'ISENTO'
  const digits = normalized.replace(/\D/g, '')
  return digits || null
}

function normalizeNFeText(value: string | null | undefined, maxLength: number): string {
  const normalized = (value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.substring(0, maxLength)
}

function normalizeGtin(value: string | null | undefined): string {
  const digits = normalizeDigitsOnly(value)
  return [8, 12, 13, 14].includes(digits.length) ? digits : 'SEM GTIN'
}

function normalizeDigitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

function formatXmlDate(value: string | null | undefined): string | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveFreightMode(totalFreight: number, configuredMode: string | null | undefined): number {
  if (totalFreight <= 0) return 9
  const key = (configuredMode || 'sem_frete').trim().toLowerCase()
  return FRETE_CODES[key] ?? 9
}

function resolvePaymentIndicator(installments: number | null | undefined): number {
  return (installments || 1) > 1 ? 1 : 0
}

function mapPaymentMethodToNFe(methodCode: string | null | undefined): string {
  const key = (methodCode || '').trim().toLowerCase()

  const mapping: Record<string, string> = {
    cash: '01',
    cheque: '02',
    credit_card: '03',
    debit_card: '04',
    store_credit: '05',
    food_voucher: '10',
    meal_voucher: '11',
    gift_voucher: '12',
    fuel_voucher: '13',
    boleto: '15',
    bank_transfer: '16',
    pix: '17',
    no_payment: '90',
  }

  return mapping[key] || '99'
}

function shouldIncludePaymentDescription(methodCode: string | null | undefined): boolean {
  return mapPaymentMethodToNFe(methodCode) === '99'
}

function mapFinalidadeNFe(operation: FiscalOperationContext): number {
  switch (operation.finalidade_nfe) {
    case 'complementar':
      return 2
    case 'ajuste':
      return 3
    case 'devolucao':
      return 4
    case 'normal':
    default:
      return 1
  }
}

function mapBuyerPresence(operation: FiscalOperationContext, modelo: '55' | '65'): number {
  if (modelo === '65' && operation.presenca_comprador === 'nao_se_aplica') {
    return 1
  }

  switch (operation.presenca_comprador) {
    case 'presencial':
      return 1
    case 'internet':
      return 2
    case 'teleatendimento':
      return 3
    case 'entrega_domicilio':
      return 4
    case 'presencial_fora_estabelecimento':
      return 5
    case 'outros':
      return 9
    case 'nao_se_aplica':
    default:
      return 0
  }
}

function generateCNF(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
}

function formatSefazDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0')
  const offsetRemainingMinutes = String(absoluteOffset % 60).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRemainingMinutes}`
}

function buildChaveBase(
  cUF: number,
  dhEmi: string,
  cnpj: string,
  mod: number,
  serie: number,
  nNF: number,
  tpEmis: number,
  cNF: string
): string {
  const aamm = dhEmi.substring(2, 4) + dhEmi.substring(5, 7)
  return [
    String(cUF).padStart(2, '0'),
    aamm,
    normalizeDigitsOnly(cnpj).padStart(14, '0'),
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

export function buildNFeAuthorizationEnvelope(signedXml: string): string {
  return [
    `<enviNFe xmlns="${NF_NAMESPACE}" versao="4.00">`,
    '<idLote>1</idLote>',
    '<indSinc>1</indSinc>',
    signedXml,
    '</enviNFe>',
  ].join('')
}

export function buildNFeProcessedXml(
  signedXml: string,
  protNFe: Record<string, unknown>,
  chaveAcesso?: string | null
): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,
    suppressEmptyNode: true,
  })
  const normalizedProtNFe = sanitizeProcessedProtocolNode(protNFe, chaveAcesso)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<nfeProc xmlns="${NF_NAMESPACE}" versao="4.00">`,
    signedXml,
    builder.build({ protNFe: normalizedProtNFe }),
    '</nfeProc>',
  ].join('')
}

function sanitizeProcessedProtocolNode(
  protNFe: Record<string, unknown>,
  chaveAcesso?: string | null
): Record<string, unknown> {
  const sanitized = deepCloneRecord(protNFe)
  const normalizedKey = normalizeDigitsOnly(chaveAcesso)

  if (normalizedKey.length !== 44) {
    return sanitized
  }

  const infProt = sanitized.infProt as Record<string, unknown> | undefined
  if (infProt && typeof infProt === 'object') {
    infProt.chNFe = normalizedKey
    return sanitized
  }

  sanitized.infProt = { chNFe: normalizedKey }
  return sanitized
}

function deepCloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, deepCloneValue(entryValue)])
  )
}

function deepCloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => deepCloneValue(entry))
  }

  if (value && typeof value === 'object') {
    return deepCloneRecord(value as Record<string, unknown>)
  }

  return value
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
