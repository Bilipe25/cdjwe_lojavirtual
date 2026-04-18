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
  totalValue: number
  icmsBase: number
  icmsValue: number
  icmsRate: number
  ipiValue: number
  ipiRate: number
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

const ADDITIONAL_INFO_HEADER_HEIGHT = 14
const ADDITIONAL_INFO_BODY_HEIGHT = 86
const ADDITIONAL_INFO_TOTAL_HEIGHT = ADDITIONAL_INFO_HEADER_HEIGHT + ADDITIONAL_INFO_BODY_HEIGHT

const HEADER_LAYOUT = {
  leftWidth: 286,
  middleWidth: 92,
}

function getHeaderTopForPage(pageIndex: number) {
  return pageIndex === 0 ? PAGE.top + 54 : PAGE.top
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
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, payment_method_code, payment_method_name, payment_installments, notes, shipping_address, total')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: 'Pedido nao encontrado para preview da DANFE.' }
    }

    const environment = payload.context.environment
    const emittedAt = new Date().toISOString()
    const numero = modelo === '65' ? environment.proximo_numero_nfce : environment.proximo_numero_nfe
    const serie = modelo === '65' ? environment.serie_nfce : environment.serie_nfe

    const snapshot = buildFiscalDocumentSnapshot({
      payload,
      order: {
        orderId,
        orderNumber: order.order_number ?? null,
        paymentMethodCode: order.payment_method_code ?? null,
        paymentMethodName: order.payment_method_name ?? null,
        paymentInstallments: order.payment_installments ?? null,
        notes: order.notes ?? null,
        shippingAddress: order.shipping_address ?? null,
        total: order.total ?? payload.totals.vNF,
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
  const total = Number(snapshot.order.total || snapshot.totals.vNF || 0)
  const duplicates = buildDuplicatas(snapshot.order.paymentInstallments || null, total, snapshot.document.emittedAt)

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
    orderNumber: snapshot.order.orderNumber || null,
    paymentSummary: buildPaymentSummary(snapshot.order.paymentMethodName, snapshot.order.paymentInstallments),
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
    return await sharp(sourceBuffer)
      .resize({
        width: 86,
        height: 30,
        fit: 'inside',
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
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
      y = drawSectionHeader(doc, 'DADOS DOS PRODUTOS / SERVICOS', y)
      y = drawItemsTableHeader(doc, y)

      const reservedForBottom = ADDITIONAL_INFO_TOTAL_HEIGHT + 8
      for (const item of data.items) {
        const rowHeight = measureItemRow(doc, item)
        if (y + rowHeight > PAGE.bottom - reservedForBottom) {
          doc.addPage()
          y = drawContinuationPageTop(doc, data)
          y = drawSectionHeader(doc, 'DADOS DOS PRODUTOS / SERVICOS', y)
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
  const height = 44
  const leftWidth = 390
  const dateWidth = 70
  const signWidth = PAGE.width - leftWidth - dateWidth

  drawRect(doc, PAGE.left, y, leftWidth, height)
  drawRect(doc, PAGE.left + leftWidth, y, dateWidth, height)
  drawRect(doc, PAGE.left + leftWidth + dateWidth, y, signWidth, height)

  setFont(doc, 'regular', 7)
  doc.text(
    `RECEBEMOS DE ${data.emitterName} OS PRODUTOS / SERVICOS CONSTANTES DA NOTA FISCAL ELETRONICA INDICADA AO LADO. EMISSAO: ${data.dataEmissao}. VALOR TOTAL: ${formatMoney(data.vNF)}. DESTINATARIO: ${data.destName}.`,
    PAGE.left + 4,
    y + 7,
    { width: leftWidth - 8, height: height - 10 }
  )

  setFont(doc, 'regular', 6)
  doc.text('DATA DE RECEBIMENTO', PAGE.left + leftWidth + 4, y + 4, {
    width: dateWidth - 8,
    align: 'center',
  })
  doc.text('IDENTIFICACAO E ASSINATURA DO RECEBEDOR', PAGE.left + leftWidth + dateWidth + 4, y + 4, {
    width: signWidth - 8,
    align: 'center',
  })

  doc.save()
  doc.dash(5, { space: 3 })
  doc.moveTo(PAGE.left, y + height + 4).lineTo(PAGE.left + PAGE.width, y + height + 4).stroke(COLORS.border)
  doc.undash()
  doc.restore()

  return y + height + 10
}

function drawHeader(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const leftWidth = HEADER_LAYOUT.leftWidth
  const middleWidth = HEADER_LAYOUT.middleWidth
  const rightWidth = PAGE.width - leftWidth - middleWidth
  const height = 86
  const logoWidth = data.logoBuffer ? 86 : 0
  const textX = PAGE.left + 6 + (logoWidth > 0 ? logoWidth + 8 : 0)
  const textWidth = leftWidth - (textX - PAGE.left) - 6

  drawRect(doc, PAGE.left, y, leftWidth, height)
  drawRect(doc, PAGE.left + leftWidth, y, middleWidth, height)
  drawRect(doc, PAGE.left + leftWidth + middleWidth, y, rightWidth, height)

  if (data.logoBuffer) {
    try {
      doc.image(data.logoBuffer, PAGE.left + 6, y + 6, {
        fit: [logoWidth, 30],
      })
    } catch {
      // fallback silencioso para emissao sem logo
    }
  }

  setFont(doc, 'bold', 10)
  doc.text(data.emitterName, textX, y + 6, { width: textWidth })
  if (data.emitterFantasy) {
    setFont(doc, 'regular', 8)
    doc.text(data.emitterFantasy, textX, y + 20, { width: textWidth })
  }
  setFont(doc, 'regular', 7)
  doc.text(`CNPJ: ${data.emitterCnpj}`, textX, y + 34, { width: textWidth })
  doc.text(`IE: ${data.emitterIe || '-'}`, textX, y + 45, { width: textWidth })
  doc.text(data.emitterAddress, textX, y + 56, { width: textWidth })
  doc.text(data.emitterCityUf, textX, y + 68, { width: textWidth })

  setFont(doc, 'bold', 18)
  doc.text('DANFE', PAGE.left + leftWidth, y + 8, { width: middleWidth, align: 'center' })
  setFont(doc, 'regular', 6.5)
  doc.text('Documento Auxiliar da', PAGE.left + leftWidth + 8, y + 28, { width: middleWidth - 16, align: 'center' })
  doc.text('Nota Fiscal Eletronica', PAGE.left + leftWidth + 8, y + 37, { width: middleWidth - 16, align: 'center' })
  setFont(doc, 'bold', 8)
  doc.text(`0 - ENTRADA   1 - SAIDA: ${data.numeroNf > 0 ? '1' : '0'}`, PAGE.left + leftWidth + 8, y + 50, {
    width: middleWidth - 16,
    align: 'center',
  })
  doc.text(`N. ${String(data.numeroNf).padStart(9, '0')}`, PAGE.left + leftWidth + 8, y + 63, {
    width: middleWidth - 16,
    align: 'center',
  })
  doc.text(`SERIE ${data.serie}`, PAGE.left + leftWidth + 8, y + 72, {
    width: middleWidth - 16,
    align: 'center',
  })

  setFont(doc, 'bold', 6.5)
  doc.text('CHAVE DE ACESSO', PAGE.left + leftWidth + middleWidth + 4, y + 4, {
    width: rightWidth - 8,
    align: 'center',
  })
  drawCode128CBarcode(doc, data.chaveAcesso, PAGE.left + leftWidth + middleWidth + 10, y + 14, rightWidth - 20, 26)
  setFont(doc, 'mono', 6.5)
  doc.text(formatChaveAcesso(data.chaveAcesso), PAGE.left + leftWidth + middleWidth + 4, y + 42, {
    width: rightWidth - 8,
    align: 'center',
  })
  setFont(doc, 'regular', 6)
  doc.text(
    data.preview ? 'Preview sem autorizacao' : (data.protocolo || 'Pendente de autorizacao'),
    PAGE.left + leftWidth + middleWidth + 4,
    y + 60,
    { width: rightWidth - 8, align: 'center' }
  )
  if (data.dataAutorizacao) {
    doc.text(data.dataAutorizacao, PAGE.left + leftWidth + middleWidth + 4, y + 71, {
      width: rightWidth - 8,
      align: 'center',
    })
  }

  if (data.preview || data.ambiente === 'homologacao') {
    setFont(doc, 'bold', 8.5)
    doc.fillColor(COLORS.danger)
    doc.text('SEM VALOR FISCAL', PAGE.left, y - 15, {
      width: PAGE.width,
      align: 'center',
    })
    doc.fillColor(COLORS.text)
  }

  return y + height + 4
}

function drawNaturezaRow(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const naturezaWidth = 280
  const protocoloWidth = 185
  const dataWidth = PAGE.width - naturezaWidth - protocoloWidth
  const height = 24

  drawLabeledCell(doc, PAGE.left, y, naturezaWidth, height, 'NATUREZA DA OPERACAO', data.naturezaOperacao)
  drawLabeledCell(
    doc,
    PAGE.left + naturezaWidth,
    y,
    protocoloWidth,
    height,
    'PROTOCOLO DE AUTORIZACAO DE USO',
    data.preview ? 'PREVIEW SEM AUTORIZACAO' : (data.protocolo || '-')
  )
  drawLabeledCell(doc, PAGE.left + naturezaWidth + protocoloWidth, y, dataWidth, height, 'DATA DE EMISSAO', data.dataEmissao)
  return y + height + 4
}

function drawDestinatarioSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'DESTINATARIO / REMETENTE', y)

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
  y = drawSectionHeader(doc, 'FATURA / DUPLICATAS', y)
  const resumoAltura = 24
  const resumoLarguras = [150, 120, 120, 165]
  let x = PAGE.left
  const valorOriginal = Math.max(0, roundMoney(data.vProd + data.vFrete + data.vSeg + data.vOutro))
  const resumoCampos: Array<[string, string]> = [
    ['NUMERO FATURA', `${String(data.numeroNf).padStart(9, '0')} / ${data.serie}`],
    ['VALOR ORIGINAL', formatMoney(valorOriginal)],
    ['VALOR DESCONTO', formatMoney(data.vDesc)],
    ['VALOR LIQUIDO', formatMoney(data.vNF)],
  ]

  resumoCampos.forEach(([label, value], index) => {
    drawLabeledCell(doc, x, y, resumoLarguras[index], resumoAltura, label, value)
    x += resumoLarguras[index]
  })
  y += resumoAltura

  if (data.duplicatas.length === 0) {
    drawLabeledCell(doc, PAGE.left, y, PAGE.width, 24, 'CONDICAO / FORMA DE PAGAMENTO', data.paymentSummary || 'Nao informado')
    return y + 28
  }

  const columns = Math.min(5, data.duplicatas.length)
  const cellWidth = PAGE.width / columns

  for (let index = 0; index < data.duplicatas.length; index++) {
    const duplicate = data.duplicatas[index]
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = PAGE.left + col * cellWidth
    const yy = y + row * 26
    drawLabeledCell(
      doc,
      x,
      yy,
      cellWidth,
      26,
      `DUP ${duplicate.numero} / VENC ${duplicate.vencimento}`,
      formatMoney(duplicate.valor)
    )
  }

  return y + Math.ceil(data.duplicatas.length / columns) * 26 + 4
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
  y = drawSectionHeader(doc, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS', y)

  const row1 = [180, 60, 70, 65, 30, 150]
  let x = PAGE.left
  drawLabeledCell(doc, x, y, row1[0], 24, 'RAZAO SOCIAL', data.transporterName || '-')
  x += row1[0]
  drawLabeledCell(doc, x, y, row1[1], 24, 'FRETE POR CONTA', String(data.freightModeCode))
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
  const headers = ['CODIGO', 'DESCRICAO', 'NCM', 'CST', 'CFOP', 'UN', 'QTD', 'V.UNIT', 'V.TOTAL', 'BC.ICMS', 'V.ICMS', 'ALIQ.']
  const widths = [28, 176, 42, 24, 30, 20, 32, 44, 46, 44, 37, 32]
  drawTableHeader(doc, y, headers, widths)
  return y + 16
}

function measureItemRow(doc: PDFKit.PDFDocument, item: DanfeItem) {
  const descWidth = 172
  const infoWidth = PAGE.width - 8
  setFont(doc, 'regular', 6)
  const descriptionHeight = Math.max(12, doc.heightOfString(item.description, { width: descWidth, align: 'left', lineGap: 1 }))
  const infoHeight = item.additionalInfo
    ? Math.max(9, doc.heightOfString(item.additionalInfo, { width: infoWidth, align: 'left', lineGap: 1 }))
    : 0
  return 6 + descriptionHeight + 4 + (infoHeight > 0 ? infoHeight + 4 : 0)
}

function drawItemRow(doc: PDFKit.PDFDocument, item: DanfeItem, y: number) {
  const widths = [28, 176, 42, 24, 30, 20, 32, 44, 46, 44, 37, 32]
  const rowHeight = measureItemRow(doc, item)
  const descriptionHeight = Math.max(12, doc.heightOfString(item.description, { width: widths[1] - 4, lineGap: 1 }))
  const mainRowHeight = 6 + descriptionHeight + 4
  drawRect(doc, PAGE.left, y, PAGE.width, rowHeight)
  drawColumnDividers(doc, PAGE.left, y, widths, item.additionalInfo ? mainRowHeight : rowHeight)

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
    formatMoney(item.totalValue),
    formatMoney(item.icmsBase),
    formatMoney(item.icmsValue),
    `${item.icmsRate.toFixed(2)}%`,
  ]

  values.forEach((value, index) => {
    setFont(doc, index === 1 ? 'regular' : 'mono', index === 1 ? 5.9 : 5.8)
    doc.text(value, x + 2, y + 4, {
      width: widths[index] - 4,
      lineGap: index === 1 ? 1 : 0,
      align: index <= 1 ? 'left' : 'right',
    })
    x += widths[index]
  })

  if (item.additionalInfo) {
    drawHorizontalDivider(doc, PAGE.left, y + mainRowHeight, PAGE.width)
    setFont(doc, 'regular', 5.5)
    doc.text(item.additionalInfo, PAGE.left + 4, y + mainRowHeight + 3, {
      width: PAGE.width - 8,
      align: 'left',
    })
  }

  return y + rowHeight
}

function drawAdditionalInfoSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionHeader(doc, 'DADOS ADICIONAIS', y)
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
    data.vTotTrib > 0 ? `Total aproximado de tributos: ${formatMoney(data.vTotTrib)}` : null,
    data.orderNumber ? `Pedido vinculado: ${data.orderNumber}` : null,
    data.paymentSummary ? `Condicao de pagamento: ${data.paymentSummary}` : null,
    data.preview ? 'Preview da DANFE sem autorizacao SEFAZ e sem valor fiscal.' : null,
  ].filter(Boolean).join(' | ')

  setFont(doc, 'regular', 7)
  doc.text(complement || 'Sem informacoes complementares.', PAGE.left + 4, y + 14, {
    width: leftWidth - 8,
    height: height - 18,
  })
}

function finalizePageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange()

  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(index)
    const headerTop = getHeaderTopForPage(index)
    setFont(doc, 'bold', 7)
    doc.text(`FOLHA ${index + 1}/${range.count}`, PAGE.left + HEADER_LAYOUT.leftWidth + 8, headerTop + 78, {
      width: HEADER_LAYOUT.middleWidth - 16,
      align: 'center',
    })
  }
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number) {
  drawRect(doc, PAGE.left, y, PAGE.width, 14, true)
  setFont(doc, 'bold', 7.2)
  doc.text(title, PAGE.left + 4, y + 4, { width: PAGE.width - 8 })
  return y + 14
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
  doc.text(label, x + 3, y + 2, { width: width - 6, align: 'left' })
  setFont(doc, 'regular', 8.1)
  doc.text(value || '-', x + 3, y + 11, {
    width: width - 6,
    align,
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

function drawHorizontalDivider(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  doc.save()
  doc.lineWidth(LINE.thin)
  doc.moveTo(x, y).lineTo(x + width, y).stroke(COLORS.border)
  doc.restore()
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

function buildDuplicatas(installments: number | null, total: number, baseDate: string | null) {
  if (!installments || installments <= 1) return [] as DanfeDuplicata[]

  const base = Number(total || 0)
  const perInstallment = Math.floor((base * 100) / installments) / 100
  const duplicates: DanfeDuplicata[] = []
  let allocated = 0

  for (let index = 0; index < installments; index++) {
    const value = index === installments - 1 ? roundMoney(base - allocated) : roundMoney(perInstallment)
    allocated = roundMoney(allocated + value)
    duplicates.push({
      numero: String(index + 1).padStart(3, '0'),
      vencimento: estimateInstallmentDate(baseDate, index + 1),
      valor: value,
    })
  }

  return duplicates
}

function estimateInstallmentDate(baseDate: string | null, installment: number) {
  if (!baseDate) return '-'
  const date = new Date(baseDate)
  if (Number.isNaN(date.getTime())) return '-'
  date.setMonth(date.getMonth() + installment)
  return date.toLocaleDateString('pt-BR')
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
      return '0 - Emitente'
    case 'destinatario':
      return '1 - Destinatario'
    case 'terceiros':
      return '2 - Terceiros'
    case 'proprio_remetente':
      return '3 - Transporte proprio remetente'
    case 'proprio_destinatario':
      return '4 - Transporte proprio destinatario'
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

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100
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
