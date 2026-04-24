import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { FiscalDocumentPayload } from '../motor/types'
import {
  buildFiscalDocumentSnapshot,
  getSnapshotAdditionalInfo,
  parseFiscalDocumentSnapshot,
  snapshotItemToDanfeItem,
} from './fiscal-document-snapshot'
import { buildResolvedAdditionalInfo, buildResolvedFiscalAuthorityInfo } from '@/lib/fiscal/additional-info'
import type { CompanyFiscalEnvironmentParams } from '@/lib/types'
import { resolveBillingFromInvoices, type FiscalInvoiceSnapshot } from '@/lib/fiscal/billing'

function resolveExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }

  throw new Error('Nao foi possivel localizar uma fonte valida para gerar a DANFE.')
}

const DANFE_FONT_REGULAR_PATH = resolveExistingPath([
  path.join(process.cwd(), 'assets', 'fonts', 'times.ttf'),
  'C:\\Windows\\Fonts\\times.ttf',
  path.join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto', 'Roboto-Regular.ttf'),
])

const DANFE_FONT_BOLD_PATH = resolveExistingPath([
  path.join(process.cwd(), 'assets', 'fonts', 'timesbd.ttf'),
  'C:\\Windows\\Fonts\\timesbd.ttf',
  DANFE_FONT_REGULAR_PATH,
])

const DANFE_FONT_MONO_PATH = resolveExistingPath([
  path.join(process.cwd(), 'assets', 'fonts', 'cour.ttf'),
  'C:\\Windows\\Fonts\\cour.ttf',
  DANFE_FONT_REGULAR_PATH,
])

interface DanfeItem {
  code: string
  description: string
  ncm: string
  cst: string
  cfop: string
  unit: string
  quantity: number
  unitPrice: number
  discountValue: number
  totalValue: number
  icmsBase: number
  icmsValue: number
  icmsRate: number
  ipiValue: number
  ipiRate: number
  totalTributos: number
  additionalInfo: string | null
}

interface DanfeTransportVolume {
  quantity: number
  species: string
  brand: string | null
  numbering: string | null
  grossWeight: number | null
  netWeight: number | null
}

interface DanfeDuplicata {
  numero: string
  vencimento: string
  valor: number
}

interface DanfeData {
  logoBuffer: Buffer | null
  emitterName: string
  emitterFantasy: string | null
  emitterCnpj: string
  emitterIe: string | null
  emitterAddress: string
  emitterCityUf: string
  emitterPhone: string | null
  chaveAcesso: string
  numeroNf: number
  serie: string
  naturezaOperacao: string
  dataEmissao: string
  protocolo: string | null
  dataAutorizacao: string | null
  ambiente: 'homologacao' | 'producao'
  destName: string
  destDocument: string
  destIe: string | null
  destAddress: string
  destCityUf: string
  destPhone: string | null
  items: DanfeItem[]
  volumes: DanfeTransportVolume[]
  duplicatas: DanfeDuplicata[]
  billingInvoiceNumber: string | null
  billingOriginalValue: number
  billingDiscountValue: number
  billingNetValue: number
  orderNumber: string | null
  paymentSummary: string | null
  freightModeLabel: string
  freightModeCode: number
  deliveryFormLabel: string
  transporterName: string | null
  transporterDocument: string | null
  transporterAddress: string | null
  transporterCity: string | null
  transporterState: string | null
  transporterIe: string | null
  vehiclePlate: string | null
  vehicleUf: string | null
  anttCode: string | null
  vProd: number
  vBC: number
  vICMS: number
  vST: number
  vFCP: number
  vPIS: number
  vCOFINS: number
  vIPI: number
  vFrete: number
  vSeg: number
  vOutro: number
  vDesc: number
  vNF: number
  vTotTrib: number
  additionalInfo: string | null
  preview: boolean
}

const PAGE = {
  left: 20,
  top: 20,
  width: 555,
  height: 812,
  bottom: 792,
}

const CANHOTO_HEIGHT = 52
const CANHOTO_GAP = 10
const HEADER_HEIGHT = 108
const SECTION_TITLE_HEIGHT = 11

const LINE = {
  thin: 0.6,
  normal: 0.8,
  thick: 1.2,
}

const COLORS = {
  border: '#111111',
  text: '#000000',
  subtle: '#5b5b5b',
  fill: '#f2f2f2',
  danger: '#b91c1c',
}

const ADDITIONAL_INFO_HEADER_HEIGHT = SECTION_TITLE_HEIGHT
const ADDITIONAL_INFO_BODY_HEIGHT = 86
const ADDITIONAL_INFO_TOTAL_HEIGHT = ADDITIONAL_INFO_HEADER_HEIGHT + ADDITIONAL_INFO_BODY_HEIGHT
const ITEM_TABLE_HEADERS = [
  'CODIGO\nPRODUTO',
  'DESCRICAO DO PRODUTO',
  'NCM',
  'CST',
  'CFOP',
  'UNID',
  'QTDE',
  'VALOR\nUNIT.',
  'VALOR\nDESC.',
  'VALOR\nTOTAL',
  'BASE\nICMS',
  'VALOR\nICMS',
  'VALOR\nIPI',
  'ALIQ.\nICMS',
  'ALIQ.\nIPI',
  'TOTAL\nTRIBUTOS',
] as const
const ITEM_TABLE_WIDTHS = [34, 142, 30, 18, 20, 18, 22, 32, 32, 35, 35, 32, 28, 22, 22, 33] as const

const HEADER_LAYOUT = {
  leftWidth: 235,
  middleWidth: 82,
  folhaOffset: 99,
}

function getHeaderTopForPage(pageIndex: number) {
  return pageIndex === 0 ? PAGE.top + CANHOTO_HEIGHT + CANHOTO_GAP : PAGE.top
}

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

export async function generateDanfePdf(
  fiscalDocumentId: string
): Promise<{ success: boolean; pdfBuffer?: Buffer; storagePath?: string; error?: string }> {
  const supabase = createServiceRoleClient()

  try {
    const { data: doc, error: docError } = await supabase
      .from('fiscal_documents')
      .select('*')
      .eq('id', fiscalDocumentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Documento fiscal nao encontrado.' }
    }

    const snapshot = parseFiscalDocumentSnapshot(doc.fiscal_payload_jsonb)
    if (!snapshot) {
      return { success: false, error: 'Snapshot fiscal imutavel nao encontrado no documento.' }
    }

    const logoBuffer = await loadSystemLogoBuffer()
    const danfeData = buildDanfeDataFromSnapshot(snapshot, {
      logoBuffer,
      chaveAcesso: doc.chave_acesso || ''.padEnd(44, '0'),
      numeroNf: doc.numero_nf,
      serie: doc.serie,
      naturezaOperacao: doc.natureza_operacao || snapshot.context.operation.natureza_operacao_descricao || 'VENDA DE MERCADORIA',
      dataEmissao: formatDateTimeBr(snapshot.document.emittedAt || doc.emitted_at),
      protocolo: doc.protocolo_autorizacao || null,
      dataAutorizacao: doc.data_autorizacao ? formatDateTimeBr(doc.data_autorizacao) : null,
      ambiente: doc.ambiente === 'producao' ? 'producao' : 'homologacao',
      preview: false,
    })

    const pdfBuffer = await buildDanfePdf(danfeData)
    const storagePath = `${doc.order_id}/${fiscalDocumentId}/danfe.pdf`

    await supabase.storage
      .from('fiscal-xml')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    await supabase
      .from('fiscal_documents')
      .update({ danfe_path: storagePath })
      .eq('id', fiscalDocumentId)

    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: fiscalDocumentId,
        order_id: doc.order_id,
        event_type: 'danfe_generation',
        event_status: 'success',
        request_summary_jsonb: { numero_nf: doc.numero_nf, serie: doc.serie },
        sefaz_message: 'DANFE gerado com sucesso.',
      })

    return { success: true, pdfBuffer, storagePath }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function generateDanfePreviewPdf(
  orderId: string,
  payload: FiscalDocumentPayload,
  modelo: '55' | '65' = '55'
): Promise<{ success: boolean; pdfBuffer?: Buffer; error?: string }> {
  const supabase = createServiceRoleClient()

  try {
    const [
      { data: order, error },
      { data: fiscalSettings, error: fiscalSettingsError },
      { data: environmentData, error: environmentError },
      { data: invoiceData, error: invoiceError },
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, payment_method_code, payment_method_name, payment_installments, notes, shipping_address, total')
        .eq('id', orderId)
        .maybeSingle(),
      supabase
        .from('order_fiscal_settings')
        .select('fiscal_observation')
        .eq('order_id', orderId)
        .maybeSingle(),
      supabase
        .from('company_fiscal_environment')
        .select('parametros_jsonb')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          status,
          issue_date,
          total_amount,
          installment_count,
          payment_method_name,
          payment_condition_name,
          created_at,
          installments:invoice_installments (
            id,
            installment_number,
            due_date,
            amount,
            paid_amount,
            status
          )
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
    ])

    if (error || !order || fiscalSettingsError || environmentError || invoiceError) {
      return { success: false, error: 'Pedido nao encontrado para preview da DANFE.' }
    }

    const environment = payload.context.environment
    const emittedAt = new Date().toISOString()
    const numero = modelo === '65' ? environment.proximo_numero_nfce : environment.proximo_numero_nfe
    const serie = modelo === '65' ? environment.serie_nfce : environment.serie_nfe
    const additionalInfoResolved = buildResolvedAdditionalInfo({
      payload,
      order: {
        orderNumber: order.order_number ?? null,
        paymentMethodName: order.payment_method_name ?? null,
        paymentInstallments: order.payment_installments ?? null,
        fiscalObservation: (fiscalSettings?.fiscal_observation || '').trim() || null,
        shippingAddress: order.shipping_address ?? null,
      },
      environmentParams: (environmentData?.parametros_jsonb || null) as CompanyFiscalEnvironmentParams | null,
    })
    const fiscalAuthorityInfoResolved = buildResolvedFiscalAuthorityInfo({ payload })
    const billing = resolveBillingFromInvoices({
      invoices: (invoiceData || []) as FiscalInvoiceSnapshot[],
      paymentMethodName: order.payment_method_name ?? null,
      paymentInstallments: order.payment_installments ?? null,
      documentNetValue: payload.totals.vNF,
      documentDiscountValue: payload.totals.vDesc,
    })

    const snapshot = buildFiscalDocumentSnapshot({
      payload,
      order: {
        orderId,
        orderNumber: order.order_number ?? null,
        paymentMethodCode: order.payment_method_code ?? null,
        paymentMethodName: order.payment_method_name ?? null,
        paymentInstallments: order.payment_installments ?? null,
        fiscalObservation: (fiscalSettings?.fiscal_observation || '').trim() || null,
        notes: order.notes ?? null,
        shippingAddress: order.shipping_address ?? null,
        total: order.total ?? payload.totals.vNF,
        billing,
      },
      document: {
        modelo,
        numero,
        serie,
        chaveAcesso: ''.padEnd(44, '0'),
        naturezaOperacao: payload.context.operation.natureza_operacao_descricao
          || environment.natureza_operacao
          || 'VENDA DE MERCADORIA',
        ambiente: environment.ambiente === 'producao' ? 'producao' : 'homologacao',
        emittedAt,
        emittedBy: null,
        protocolo: null,
        dataAutorizacao: null,
        codigoStatus: null,
        motivoStatus: 'Preview de DANFE sem valor fiscal.',
        digestValue: null,
        additionalInfoResolved,
        fiscalAuthorityInfoResolved,
      },
    })

    const logoBuffer = await loadSystemLogoBuffer()
    const danfeData = buildDanfeDataFromSnapshot(snapshot, {
      logoBuffer,
      chaveAcesso: ''.padEnd(44, '0'),
      numeroNf: numero,
      serie,
      naturezaOperacao: payload.context.operation.natureza_operacao_descricao
        || environment.natureza_operacao
        || 'VENDA DE MERCADORIA',
      dataEmissao: formatDateTimeBr(emittedAt),
      protocolo: null,
      dataAutorizacao: null,
      ambiente: environment.ambiente === 'producao' ? 'producao' : 'homologacao',
      preview: true,
    })

    const pdfBuffer = await buildDanfePdf(danfeData)
    return { success: true, pdfBuffer }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function buildDanfeDataFromSnapshot(
  snapshot: NonNullable<ReturnType<typeof parseFiscalDocumentSnapshot>>,
  overrides: {
    logoBuffer: Buffer | null
    chaveAcesso: string
    numeroNf: number
    serie: string
    naturezaOperacao: string
    dataEmissao: string
    protocolo: string | null
    dataAutorizacao: string | null
    ambiente: 'homologacao' | 'producao'
    preview: boolean
  }
): DanfeData {
  const emitter = snapshot.context.emitter
  const store = snapshot.context.store
  const transport = snapshot.context.transport
  const billing = snapshot.order.billing || null
  const duplicates = (billing?.duplicates || []).map((duplicate) => ({
    numero: duplicate.numero,
    vencimento: duplicate.vencimento,
    valor: Number(duplicate.valor || 0),
  }))

  return {
    logoBuffer: overrides.logoBuffer,
    emitterName: emitter.razao_social || 'EMPRESA',
    emitterFantasy: emitter.nome_fantasia || null,
    emitterCnpj: formatCnpj(emitter.cnpj || ''),
    emitterIe: emitter.ie || null,
    emitterAddress: formatAddress(emitter.logradouro, emitter.numero, emitter.complemento, emitter.bairro, emitter.cep),
    emitterCityUf: [emitter.cidade, emitter.uf?.toUpperCase()].filter(Boolean).join(' / '),
    emitterPhone: emitter.telefone || null,
    chaveAcesso: digitsOrZeros(overrides.chaveAcesso),
    numeroNf: overrides.numeroNf,
    serie: overrides.serie,
    naturezaOperacao: overrides.naturezaOperacao,
    dataEmissao: overrides.dataEmissao,
    protocolo: overrides.protocolo,
    dataAutorizacao: overrides.dataAutorizacao,
    ambiente: overrides.ambiente,
    destName: store.nome || 'DESTINATARIO',
    destDocument: formatDocument(store.document_number || ''),
    destIe: store.ie || null,
    destAddress: formatAddress(store.logradouro, store.numero, store.complemento, store.bairro, store.cep),
    destCityUf: [store.cidade, store.uf?.toUpperCase()].filter(Boolean).join(' / '),
    destPhone: store.telefone || null,
    items: snapshot.items.map((item, index) => snapshotItemToDanfeItem(item, index)),
    volumes: snapshot.context.volumes.map((volume) => ({
      quantity: volume.quantity,
      species: volume.species,
      brand: volume.brand,
      numbering: volume.numbering,
      grossWeight: volume.gross_weight,
      netWeight: volume.net_weight,
    })),
    duplicatas: duplicates,
    billingInvoiceNumber: billing?.invoiceNumber || null,
    billingOriginalValue: Number(billing?.valueOriginal || snapshot.totals.vNF || 0),
    billingDiscountValue: Number(billing?.valueDiscount || snapshot.totals.vDesc || 0),
    billingNetValue: Number(billing?.valueNet || snapshot.totals.vNF || 0),
    orderNumber: snapshot.order.orderNumber || null,
    paymentSummary: buildPaymentSummary(
      billing?.paymentConditionName || billing?.paymentMethodName || snapshot.order.paymentMethodName,
      billing?.installmentCount || snapshot.order.paymentInstallments
    ),
    freightModeLabel: mapFreightModeLabel(transport.freight_mode),
    freightModeCode: mapFreightModeCode(transport.freight_mode),
    deliveryFormLabel: mapDeliveryFormLabel(transport.delivery_form),
    transporterName: transport.transporter_name,
    transporterDocument: transport.transporter_document ? formatDocument(transport.transporter_document) : null,
    transporterAddress: transport.transporter_address,
    transporterCity: transport.transporter_city,
    transporterState: transport.transporter_state,
    transporterIe: transport.transporter_ie,
    vehiclePlate: transport.vehicle_plate,
    vehicleUf: transport.vehicle_uf,
    anttCode: transport.antt_code,
    vProd: Number(snapshot.totals.vProd || 0),
    vBC: Number(snapshot.totals.vBC || 0),
    vICMS: Number(snapshot.totals.vICMS || 0),
    vST: Number(snapshot.totals.vST || 0),
    vFCP: Number(snapshot.totals.vFCP || 0),
    vPIS: Number(snapshot.totals.vPIS || 0),
    vCOFINS: Number(snapshot.totals.vCOFINS || 0),
    vIPI: Number(snapshot.totals.vIPI || 0),
    vFrete: Number(snapshot.totals.vFrete || 0),
    vSeg: Number(snapshot.totals.vSeg || 0),
    vOutro: Number(snapshot.totals.vOutro || 0),
    vDesc: Number(snapshot.totals.vDesc || 0),
    vNF: Number(snapshot.totals.vNF || 0),
    vTotTrib: Number(snapshot.totals.vTotTrib || 0),
    additionalInfo: getSnapshotAdditionalInfo(snapshot),
    preview: overrides.preview,
  }
}

async function loadSystemLogoBuffer(): Promise<Buffer | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('system_settings')
    .select('logo_url')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const logoUrl = typeof data?.logo_url === 'string' ? data.logo_url.trim() : ''
  if (!logoUrl) return null

  try {
    const response = await fetch(logoUrl, { cache: 'no-store' })
    if (!response.ok) return null

    const sourceBuffer = Buffer.from(await response.arrayBuffer())
    const image = sharp(sourceBuffer, { density: 300 })
    const metadata = await image.metadata()

    if (metadata.format === 'png' || metadata.format === 'jpeg' || metadata.format === 'jpg') {
      return sourceBuffer
    }

    return await image
      .resize({
        width: 600,
        height: 220,
        fit: 'inside',
        withoutEnlargement: false,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .sharpen()
      .png({ compressionLevel: 3, quality: 100 })
      .toBuffer()
  } catch {
    return null
  }
}

function buildDanfePdf(data: DanfeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: PAGE.top, bottom: 20, left: PAGE.left, right: 20 },
        bufferPages: true,
        font: DANFE_FONT_REGULAR_PATH,
        info: {
          Title: data.preview ? `Preview DANFE - NF-e ${data.numeroNf}` : `DANFE - NF-e ${data.numeroNf}`,
          Subject: data.preview ? `Preview de DANFE ${data.numeroNf}` : `Nota Fiscal Eletronica ${data.numeroNf}`,
          Author: data.emitterName,
          Creator: 'CDJWE Sistema Fiscal',
        },
      })

      doc.registerFont('DanfeRegular', DANFE_FONT_REGULAR_PATH)
      doc.registerFont('DanfeBold', DANFE_FONT_BOLD_PATH)
      doc.registerFont('DanfeMono', DANFE_FONT_MONO_PATH)
      doc.font('DanfeRegular')

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      let y = drawFirstPageTop(doc, data)
      y = drawSectionHeader(doc, 'DADOS DOS PRODUTOS', y)
      y = drawItemsTableHeader(doc, y)

      const reservedForBottom = ADDITIONAL_INFO_TOTAL_HEIGHT + 8
      for (const item of data.items) {
        const rowHeight = measureItemRow(doc, item)
        if (y + rowHeight > PAGE.bottom - reservedForBottom) {
          doc.addPage()
          y = drawContinuationPageTop(doc, data)
          y = drawSectionHeader(doc, 'DADOS DOS PRODUTOS', y)
          y = drawItemsTableHeader(doc, y)
        }

        y = drawItemRow(doc, item, y)
      }

      if (y > PAGE.bottom - ADDITIONAL_INFO_TOTAL_HEIGHT - 6) {
        doc.addPage()
        y = drawContinuationPageTop(doc, data)
      }

      drawAdditionalInfoSection(doc, data, PAGE.bottom - ADDITIONAL_INFO_TOTAL_HEIGHT)
      finalizePageNumbers(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function drawFirstPageTop(doc: PDFKit.PDFDocument, data: DanfeData) {
  let y = PAGE.top
  y = drawCanhoto(doc, data, y)
  y = drawHeader(doc, data, y)
  y = drawNaturezaRow(doc, data, y)
  y = drawDestinatarioSection(doc, data, y)
  y = drawFaturaSection(doc, data, y)
  y = drawTaxTotalsSection(doc, data, y)
  y = drawTransportSection(doc, data, y)
  return y
}

function drawContinuationPageTop(doc: PDFKit.PDFDocument, data: DanfeData) {
  let y = PAGE.top
  y = drawHeader(doc, data, y)
  y = drawNaturezaRow(doc, data, y)
  return y + 4
}

function drawCanhoto(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const height = CANHOTO_HEIGHT
  const sideWidth = 76
  const leftWidth = PAGE.width - sideWidth
  const topHeight = 27
  const dateWidth = 115
  const signWidth = leftWidth - dateWidth

  drawRect(doc, PAGE.left, y, leftWidth, topHeight)
  drawRect(doc, PAGE.left, y + topHeight, dateWidth, height - topHeight)
  drawRect(doc, PAGE.left + dateWidth, y + topHeight, signWidth, height - topHeight)
  drawRect(doc, PAGE.left + leftWidth, y, sideWidth, height)

  setFont(doc, 'regular', 7)
  doc.text(
    `RECEBEMOS DE ${data.emitterName} OS PRODUTOS / SERVICOS CONSTANTES DA NOTA FISCAL ELETRONICA INDICADA AO LADO. EMISSAO: ${data.dataEmissao}. VALOR TOTAL: ${formatMoney(data.vNF)}. DESTINATARIO: ${data.destName}.`,
    PAGE.left + 4,
    y + 4,
    { width: leftWidth - 8, height: topHeight - 6, lineGap: 0 }
  )

  setFont(doc, 'regular', 6)
  doc.text('DATA DE RECEBIMENTO', PAGE.left + 4, y + topHeight + 4, {
    width: dateWidth - 8,
  })
  doc.text('IDENTIFICACAO E ASSINATURA DO RECEBEDOR', PAGE.left + dateWidth + 4, y + topHeight + 4, {
    width: signWidth - 8,
  })
  setFont(doc, 'regular', 10)
  doc.text('NF-e', PAGE.left + leftWidth + 4, y + 8, { width: sideWidth - 8, align: 'center' })
  setFont(doc, 'regular', 10.5)
  doc.text(`N. ${String(data.numeroNf).padStart(9, '0')}`, PAGE.left + leftWidth + 4, y + 25, {
    width: sideWidth - 8,
    align: 'center',
  })
  doc.text(`SERIE ${data.serie}`, PAGE.left + leftWidth + 4, y + 39, {
    width: sideWidth - 8,
    align: 'center',
  })

  doc.save()
  doc.dash(5, { space: 3 })
  doc.moveTo(PAGE.left, y + height + 4).lineTo(PAGE.left + PAGE.width, y + height + 4).stroke(COLORS.border)
  doc.undash()
  doc.restore()

  return y + height + CANHOTO_GAP
}

function drawHeader(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const leftWidth = HEADER_LAYOUT.leftWidth
  const middleWidth = HEADER_LAYOUT.middleWidth
  const rightWidth = PAGE.width - leftWidth - middleWidth
  const rightX = PAGE.left + leftWidth + middleWidth
  const height = HEADER_HEIGHT

  drawRect(doc, PAGE.left, y, leftWidth, height)
  drawRect(doc, PAGE.left + leftWidth, y, middleWidth, height)
  drawRect(doc, rightX, y, rightWidth, height)

  setFont(doc, 'regular', 13)
  doc.text(data.emitterName, PAGE.left + 4, y + 5, { width: leftWidth - 8, align: 'center' })
  if (data.logoBuffer) {
    try {
      doc.image(data.logoBuffer, PAGE.left + 6, y + 43, {
        fit: [70, 38],
      })
    } catch {
      // fallback silencioso para emissao sem logo
    }
  }

  const detailsX = data.logoBuffer ? PAGE.left + 82 : PAGE.left + 8
  const detailsWidth = leftWidth - (detailsX - PAGE.left) - 8
  setFont(doc, 'regular', 7.4)
  doc.text(data.emitterAddress, detailsX, y + 42, {
    width: detailsWidth,
    align: 'center',
    height: 31,
    lineGap: 0,
    ellipsis: true,
  })
  doc.text(data.emitterCityUf, detailsX, y + 75, { width: detailsWidth, align: 'center' })
  doc.text(`TELEFONE: ${data.emitterPhone || '-'}`, detailsX, y + 89, { width: detailsWidth, align: 'center' })

  setFont(doc, 'bold', 18)
  doc.text('DANFE', PAGE.left + leftWidth + 4, y + 4, { width: middleWidth - 8, align: 'center' })
  setFont(doc, 'regular', 6.5)
  doc.text('DOCUMENTO AUXILIAR', PAGE.left + leftWidth + 4, y + 25, { width: middleWidth - 8, align: 'center' })
  doc.text('DA NOTA FISCAL', PAGE.left + leftWidth + 4, y + 34, { width: middleWidth - 8, align: 'center' })
  doc.text('ELETRONICA', PAGE.left + leftWidth + 4, y + 43, { width: middleWidth - 8, align: 'center' })
  setFont(doc, 'regular', 7)
  doc.text('0 - ENTRADA', PAGE.left + leftWidth + 8, y + 58, {
    width: middleWidth - 34,
    align: 'center',
  })
  doc.text('1 - SAIDA', PAGE.left + leftWidth + 8, y + 69, {
    width: middleWidth - 34,
    align: 'center',
  })
  drawRect(doc, PAGE.left + leftWidth + middleWidth - 25, y + 56, 18, 18)
  setFont(doc, 'bold', 13)
  doc.text('1', PAGE.left + leftWidth + middleWidth - 25, y + 58, { width: 18, align: 'center' })
  setFont(doc, 'regular', 8)
  doc.text(`N. ${String(data.numeroNf).padStart(9, '0')}`, PAGE.left + leftWidth + 4, y + 80, {
    width: middleWidth - 8,
    align: 'center',
  })
  doc.text(`SERIE ${data.serie}`, PAGE.left + leftWidth + 4, y + 91, {
    width: middleWidth - 8,
    align: 'center',
  })

  drawCode128CBarcode(doc, data.chaveAcesso, rightX + 10, y + 8, rightWidth - 20, 44)
  doc.save()
  doc.lineWidth(LINE.normal)
  doc.moveTo(rightX, y + 61).lineTo(rightX + rightWidth, y + 61).stroke(COLORS.border)
  doc.moveTo(rightX, y + 83).lineTo(rightX + rightWidth, y + 83).stroke(COLORS.border)
  doc.restore()

  setFont(doc, 'regular', 6.2)
  doc.text('CHAVE DE ACESSO', rightX + 4, y + 64, {
    width: rightWidth - 8,
    align: 'center',
  })
  setFont(doc, 'mono', 7)
  doc.text(formatChaveAcesso(data.chaveAcesso), rightX + 4, y + 73, {
    width: rightWidth - 8,
    align: 'center',
  })
  setFont(doc, 'regular', 6.6)
  doc.text(
    'Consulta de autenticidade no portal nacional da NF-e\nhttp://www.nfe.fazenda.gov.br/portal\nou no site da SEFAZ Autorizadora',
    rightX + 4,
    y + 85,
    { width: rightWidth - 8, align: 'center', lineGap: 0 }
  )

  if (data.preview || data.ambiente === 'homologacao') {
    setFont(doc, 'bold', 8.5)
    doc.fillColor(COLORS.danger)
    doc.text('SEM VALOR FISCAL', PAGE.left, y - 15, {
      width: PAGE.width,
      align: 'center',
    })
    doc.fillColor(COLORS.text)
  }

  return y + height
}

function drawNaturezaRow(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const naturezaWidth = 315
  const protocoloWidth = PAGE.width - naturezaWidth
  const rowHeight = 22
  const protocolText = data.preview
    ? 'PREVIEW SEM AUTORIZACAO'
    : [data.protocolo, data.dataAutorizacao].filter(Boolean).join(' ') || '-'

  drawLabeledCell(doc, PAGE.left, y, naturezaWidth, rowHeight, 'NATUREZA DE OPERACAO', data.naturezaOperacao)
  drawLabeledCell(
    doc,
    PAGE.left + naturezaWidth,
    y,
    protocoloWidth,
    rowHeight,
    'PROTOCOLO DE AUTORIZACAO DE USO',
    protocolText,
    'center'
  )
  y += rowHeight

  const ieWidth = 165
  const ieSubstWidth = 220
  const cnpjWidth = PAGE.width - ieWidth - ieSubstWidth
  drawLabeledCell(doc, PAGE.left, y, ieWidth, rowHeight, 'INSCRICAO ESTADUAL', data.emitterIe || '-')
  drawLabeledCell(doc, PAGE.left + ieWidth, y, ieSubstWidth, rowHeight, 'INSCRICAO ESTADUAL DO SUBST. TRIBUT.', '-')
  drawLabeledCell(doc, PAGE.left + ieWidth + ieSubstWidth, y, cnpjWidth, rowHeight, 'CNPJ', data.emitterCnpj, 'center')
  return y + rowHeight + 4
}

function drawDestinatarioSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'DESTINATARIO/REMETENTE', y)

  const nameWidth = 270
  const docWidth = 140
  const ieWidth = PAGE.width - nameWidth - docWidth
  drawLabeledCell(doc, PAGE.left, y, nameWidth, 24, 'NOME / RAZAO SOCIAL', data.destName)
  drawLabeledCell(doc, PAGE.left + nameWidth, y, docWidth, 24, 'CNPJ / CPF', data.destDocument)
  drawLabeledCell(doc, PAGE.left + nameWidth + docWidth, y, ieWidth, 24, 'INSCRICAO ESTADUAL', data.destIe || '-')
  y += 24

  const addrWidth = 300
  const cityWidth = 165
  const phoneWidth = PAGE.width - addrWidth - cityWidth
  drawLabeledCell(doc, PAGE.left, y, addrWidth, 24, 'ENDERECO', data.destAddress)
  drawLabeledCell(doc, PAGE.left + addrWidth, y, cityWidth, 24, 'MUNICIPIO / UF', data.destCityUf)
  drawLabeledCell(doc, PAGE.left + addrWidth + cityWidth, y, phoneWidth, 24, 'FONE / FAX', data.destPhone || '-')
  return y + 28
}

function drawFaturaSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'FATURA/DUPLICATA', y)
  const rowHeight = 14

  if (data.duplicatas.length === 0) {
    const widths = [130, 300, 125]
    const values = [
      `FATURA: ${data.billingInvoiceNumber || `FAT${String(data.numeroNf).padStart(6, '0')}`}`,
      `PAGAMENTO: ${data.paymentSummary || 'Nao informado'}`,
      `VALOR: ${formatMoney(data.billingNetValue)}`,
    ]
    drawRect(doc, PAGE.left, y, PAGE.width, rowHeight)
    drawColumnDividers(doc, PAGE.left, y, widths, rowHeight)
    let x = PAGE.left
    values.forEach((value, index) => {
      setFont(doc, 'regular', 7.2)
      doc.text(value, x + 3, y + 3, {
        width: widths[index] - 6,
        align: index === 2 ? 'right' : 'left',
      })
      x += widths[index]
    })
    return y + rowHeight + 4
  }

  const columns = Math.min(4, data.duplicatas.length)
  const cellWidth = PAGE.width / columns
  const rows = Math.ceil(data.duplicatas.length / columns)
  const tableHeight = rows * rowHeight
  drawRect(doc, PAGE.left, y, PAGE.width, tableHeight)
  drawColumnDividers(doc, PAGE.left, y, Array(columns).fill(cellWidth), tableHeight)
  for (let row = 1; row < rows; row++) {
    doc.save()
    doc.lineWidth(LINE.thin)
    doc.moveTo(PAGE.left, y + row * rowHeight).lineTo(PAGE.left + PAGE.width, y + row * rowHeight).stroke(COLORS.border)
    doc.restore()
  }

  for (let index = 0; index < data.duplicatas.length; index++) {
    const duplicate = data.duplicatas[index]
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = PAGE.left + col * cellWidth
    const yy = y + row * rowHeight
    setFont(doc, 'regular', 7.2)
    doc.text(`${duplicate.numero} - ${formatDateBr(duplicate.vencimento)}    ${formatMoney(duplicate.valor)}`, x + 3, yy + 3, {
      width: cellWidth - 6,
      align: 'center',
    })
  }

  return y + tableHeight + 4
}

function drawTaxTotalsSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'CALCULO DO IMPOSTO', y)

  const labels = [
    ['BASE ICMS', data.vBC],
    ['VALOR ICMS', data.vICMS],
    ['VALOR FCP', data.vFCP],
    ['BASE ST', data.vST > 0 ? data.vST : 0],
    ['VALOR ST', data.vST],
    ['VALOR PROD.', data.vProd],
    ['FRETE', data.vFrete],
    ['SEGURO', data.vSeg],
    ['DESCONTO', data.vDesc],
    ['OUTRAS DESP.', data.vOutro],
    ['IPI', data.vIPI],
    ['VALOR TOTAL', data.vNF],
  ] as const

  const width = PAGE.width / 6
  const height = 24
  for (let index = 0; index < labels.length; index++) {
    const row = Math.floor(index / 6)
    const col = index % 6
    drawLabeledCell(doc, PAGE.left + col * width, y + row * height, width, height, labels[index][0], formatMoney(labels[index][1]))
  }

  return y + 48 + 4
}

function drawTransportSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'TRANSPORTADOR/VOLUMES TRANSPORTADOS', y)

  const row1 = [155, 92, 64, 60, 28, 156]
  let x = PAGE.left
  drawLabeledCell(doc, x, y, row1[0], 24, 'RAZAO SOCIAL', data.transporterName || '-')
  x += row1[0]
  drawLabeledCell(doc, x, y, row1[1], 24, 'FRETE POR CONTA', data.freightModeLabel || String(data.freightModeCode))
  x += row1[1]
  drawLabeledCell(doc, x, y, row1[2], 24, 'CODIGO ANTT', data.anttCode || '-')
  x += row1[2]
  drawLabeledCell(doc, x, y, row1[3], 24, 'PLACA VEICULO', data.vehiclePlate || '-')
  x += row1[3]
  drawLabeledCell(doc, x, y, row1[4], 24, 'UF', data.vehicleUf || '-')
  x += row1[4]
  drawLabeledCell(doc, x, y, row1[5], 24, 'CNPJ / CPF', data.transporterDocument || '-')
  y += 24

  const row2 = [240, 140, 35, 140]
  x = PAGE.left
  drawLabeledCell(doc, x, y, row2[0], 24, 'ENDERECO', data.transporterAddress || '-')
  x += row2[0]
  drawLabeledCell(doc, x, y, row2[1], 24, 'MUNICIPIO', data.transporterCity || '-')
  x += row2[1]
  drawLabeledCell(doc, x, y, row2[2], 24, 'UF', data.transporterState || '-')
  x += row2[2]
  drawLabeledCell(doc, x, y, row2[3], 24, 'INSCRICAO ESTADUAL', data.transporterIe || '-')
  y += 24

  const volumeHeader = ['QUANTIDADE', 'ESPECIE', 'MARCA', 'NUMERACAO', 'PESO BRUTO', 'PESO LIQUIDO']
  const volumeWidths = [72, 120, 115, 92, 78, 78]
  drawTableHeader(doc, y, volumeHeader, volumeWidths)
  y += 16

  if (data.volumes.length === 0) {
    drawLabeledCell(doc, PAGE.left, y, PAGE.width, 18, 'VOLUMES', 'Nenhum volume informado')
    return y + 22
  }

  for (const volume of data.volumes) {
    x = PAGE.left
    drawRect(doc, PAGE.left, y, PAGE.width, 16)
    drawColumnDividers(doc, PAGE.left, y, volumeWidths, 16)
    const values = [
      String(volume.quantity),
      volume.species || '-',
      volume.brand || '-',
      volume.numbering || '-',
      typeof volume.grossWeight === 'number' ? volume.grossWeight.toFixed(3) : '-',
      typeof volume.netWeight === 'number' ? volume.netWeight.toFixed(3) : '-',
    ]

    values.forEach((value, index) => {
      setFont(doc, 'regular', 6)
      doc.text(value, x + 2, y + 5, {
        width: volumeWidths[index] - 4,
        align: index < 4 ? 'left' : 'right',
      })
      x += volumeWidths[index]
    })

    y += 16
  }

  return y + 4
}

function drawItemsTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const headerHeight = 22
  drawRect(doc, PAGE.left, y, PAGE.width, headerHeight, true)
  drawColumnDividers(doc, PAGE.left, y, ITEM_TABLE_WIDTHS as unknown as number[], headerHeight)

  let x = PAGE.left
  ITEM_TABLE_HEADERS.forEach((header, index) => {
    setFont(doc, 'bold', 5.1)
    doc.text(header, x + 1, y + 3, {
      width: ITEM_TABLE_WIDTHS[index] - 2,
      align: index === 1 ? 'left' : 'center',
      lineGap: 0,
    })
    x += ITEM_TABLE_WIDTHS[index]
  })

  return y + headerHeight
}

function measureItemRow(doc: PDFKit.PDFDocument, item: DanfeItem) {
  const descWidth = ITEM_TABLE_WIDTHS[1] - 4
  setFont(doc, 'regular', 6)
  const descriptionHeight = Math.max(12, doc.heightOfString(item.description, { width: descWidth, align: 'left', lineGap: 1 }))
  return 4 + descriptionHeight + 4
}

function drawItemRow(doc: PDFKit.PDFDocument, item: DanfeItem, y: number) {
  const widths = ITEM_TABLE_WIDTHS as unknown as number[]
  const rowHeight = measureItemRow(doc, item)
  drawRect(doc, PAGE.left, y, PAGE.width, rowHeight)
  drawColumnDividers(doc, PAGE.left, y, widths, rowHeight)

  let x = PAGE.left
  const values = [
    item.code.substring(0, 10),
    item.description,
    item.ncm,
    item.cst,
    item.cfop,
    item.unit,
    item.quantity.toFixed(2),
    formatMoney(item.unitPrice),
    formatMoney(item.discountValue),
    formatMoney(item.totalValue),
    formatMoney(item.icmsBase),
    formatMoney(item.icmsValue),
    formatMoney(item.ipiValue),
    formatRate(item.icmsRate),
    formatRate(item.ipiRate),
    formatMoney(item.totalTributos),
  ]

  values.forEach((value, index) => {
    setFont(doc, index === 1 ? 'regular' : 'mono', index === 1 ? 5.6 : 5.6)
    doc.text(value, x + 2, y + 3, {
      width: widths[index] - 4,
      lineGap: index === 1 ? 1 : 0,
      align: index <= 1 ? 'left' : 'right',
    })
    x += widths[index]
  })

  return y + rowHeight
}

function drawAdditionalInfoSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'DADOS ADICIONAIS / INFORMACOES COMPLEMENTARES', y)
  const leftWidth = 390
  const rightWidth = PAGE.width - leftWidth
  const height = ADDITIONAL_INFO_BODY_HEIGHT
  drawRect(doc, PAGE.left, y, leftWidth, height)
  drawRect(doc, PAGE.left + leftWidth, y, rightWidth, height)

  setFont(doc, 'regular', 5.5)
  doc.text('INFORMACOES COMPLEMENTARES', PAGE.left + 4, y + 3, { width: leftWidth - 8 })
  doc.text('RESERVADO AO FISCO', PAGE.left + leftWidth + 4, y + 3, { width: rightWidth - 8 })

  const complement = [
    data.additionalInfo,
    data.preview ? 'Preview da DANFE sem autorizacao SEFAZ e sem valor fiscal.' : null,
  ].filter(Boolean).join('\n')

  setFont(doc, 'regular', 7)
  doc.text(complement || 'Sem informacoes complementares.', PAGE.left + 4, y + 14, {
    width: leftWidth - 8,
    height: height - 18,
    lineGap: 1,
  })
}

function finalizePageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange()

  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(index)
    const headerTop = getHeaderTopForPage(index)
    setFont(doc, 'bold', 7)
    doc.text(`FOLHA ${index + 1}/${range.count}`, PAGE.left + HEADER_LAYOUT.leftWidth + 4, headerTop + HEADER_LAYOUT.folhaOffset, {
      width: HEADER_LAYOUT.middleWidth - 16,
      align: 'center',
    })
  }
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number) {
  setFont(doc, 'bold', 7.2)
  doc.text(title, PAGE.left + 1, y + 2, { width: PAGE.width - 2 })
  return y + SECTION_TITLE_HEIGHT
}

function drawLabeledCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  align: 'left' | 'right' | 'center' = 'left'
) {
  drawRect(doc, x, y, width, height)
  setFont(doc, 'regular', 5.8)
  doc.text(label, x + 3, y + 1.5, { width: width - 6, align: 'left' })
  setFont(doc, 'regular', 7.8)
  doc.text(value || '-', x + 3, y + 9.3, {
    width: width - 6,
    height: Math.max(8, height - 10),
    align,
    lineGap: 0,
  })
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, headers: string[], widths: number[]) {
  drawRect(doc, PAGE.left, y, PAGE.width, 16, true)
  drawColumnDividers(doc, PAGE.left, y, widths, 16)
  let x = PAGE.left
  headers.forEach((header, index) => {
    setFont(doc, 'bold', 5.8)
    doc.text(header, x + 2, y + 5, {
      width: widths[index] - 4,
      align: index <= 1 ? 'left' : 'right',
    })
    x += widths[index]
  })
}

function drawColumnDividers(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  widths: number[],
  height: number
) {
  let cursor = x
  for (let index = 0; index < widths.length - 1; index++) {
    cursor += widths[index]
    doc.save()
    doc.lineWidth(LINE.thin)
    doc.moveTo(cursor, y).lineTo(cursor, y + height).stroke(COLORS.border)
    doc.restore()
  }
}

function drawRect(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, fill = false) {
  doc.save()
  doc.lineWidth(LINE.normal)
  if (fill) {
    doc.rect(x, y, width, height).fillAndStroke(COLORS.fill, COLORS.border)
  } else {
    doc.rect(x, y, width, height).stroke(COLORS.border)
  }
  doc.restore()
}

function drawCode128CBarcode(
  doc: PDFKit.PDFDocument,
  chave: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const digits = digitsOrZeros(chave)
  if (!digits || digits.length % 2 !== 0) return

  const values: number[] = []
  for (let index = 0; index < digits.length; index += 2) {
    values.push(Number(digits.slice(index, index + 2)))
  }

  let checksum = 105
  values.forEach((value, index) => {
    checksum += value * (index + 1)
  })
  checksum %= 103

  const sequences = [
    CODE128_PATTERNS[105],
    ...values.map((value) => CODE128_PATTERNS[value]),
    CODE128_PATTERNS[checksum],
    CODE128_PATTERNS[106],
  ]

  const moduleCount = sequences.reduce((sum, sequence) => (
    sum + sequence.split('').reduce((seqSum, digit) => seqSum + Number(digit), 0)
  ), 0)
  const quietModules = 8
  const moduleWidth = width / (moduleCount + quietModules * 2)
  let cursor = x + quietModules * moduleWidth

  doc.save()
  doc.fillColor(COLORS.text)
  for (const sequence of sequences) {
    let drawBar = true
    for (const digit of sequence.split('')) {
      const segmentWidth = Number(digit) * moduleWidth
      if (drawBar) {
        doc.rect(cursor, y, segmentWidth, height).fill()
      }
      cursor += segmentWidth
      drawBar = !drawBar
    }
  }
  doc.restore()
}

function setFont(doc: PDFKit.PDFDocument, variant: 'regular' | 'bold' | 'mono', size: number) {
  const fontName = variant === 'bold' ? 'DanfeBold' : variant === 'mono' ? 'DanfeMono' : 'DanfeRegular'
  doc.font(fontName).fontSize(size).fillColor(COLORS.text)
}

function digitsOrZeros(value: string) {
  const digits = (value || '').replace(/\D/g, '')
  return digits.length === 44 ? digits : ''.padEnd(44, '0')
}

function buildPaymentSummary(methodName: string | null | undefined, installments: number | null | undefined) {
  const parts = [
    methodName || null,
    installments && installments > 1 ? `${installments} parcelas` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' - ') : null
}

function mapFreightModeCode(value: string) {
  switch (value) {
    case 'emitente':
      return 0
    case 'destinatario':
      return 1
    case 'terceiros':
      return 2
    case 'proprio_remetente':
      return 3
    case 'proprio_destinatario':
      return 4
    case 'sem_frete':
    default:
      return 9
  }
}

function mapFreightModeLabel(value: string) {
  switch (value) {
    case 'emitente':
      return '0 - Remetente'
    case 'destinatario':
      return '1 - Destinat.'
    case 'terceiros':
      return '2 - Terceiros'
    case 'proprio_remetente':
      return '3 - Prop. remetente'
    case 'proprio_destinatario':
      return '4 - Prop. destinat.'
    case 'sem_frete':
    default:
      return '9 - Sem frete'
  }
}

function mapDeliveryFormLabel(value: string) {
  switch (value) {
    case 'retirada':
      return 'Retirada'
    case 'transportadora':
      return 'Transportadora'
    case 'frota_propria':
      return 'Frota propria'
    case 'correios':
      return 'Correios'
    case 'entrega_expressa':
      return 'Entrega expressa'
    case 'balcao':
      return 'Balcao'
    default:
      return 'Nao informado'
  }
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatRate(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatAddress(
  street: string,
  number: string,
  complement: string | null,
  neighborhood: string,
  cep: string | null
) {
  return [street, number, complement, neighborhood, cep ? `CEP ${formatCep(cep)}` : null]
    .filter(Boolean)
    .join(', ')
}

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return `${digits.substring(0, 2)}.${digits.substring(2, 5)}.${digits.substring(5, 8)}/${digits.substring(8, 12)}-${digits.substring(12, 14)}`
}

function formatDocument(doc: string): string {
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 14) return formatCnpj(digits)
  if (digits.length === 11) {
    return `${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9, 11)}`
  }
  return doc
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 8) return value
  return `${digits.substring(0, 5)}-${digits.substring(5, 8)}`
}

function formatChaveAcesso(chave: string): string {
  return digitsOrZeros(chave).replace(/(.{4})/g, '$1 ').trim()
}

function formatDateTimeBr(dateStr: string | null) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('pt-BR')
  } catch {
    return dateStr
  }
}

function formatDateBr(dateStr: string | null | undefined) {
  if (!dateStr) return '-'
  const value = String(dateStr).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value

  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`

  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('pt-BR')
  } catch {
    return value
  }
}
