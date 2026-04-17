// ============================================================
// Fiscal Transport - DANFE PDF Generator
// Generates DANFE (Documento Auxiliar da NF-e) using PDFKit
// Vercel-compatible (pure JS, no native deps)
// ============================================================

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { FiscalDocumentPayload } from '../motor/types'
import {
  buildFiscalDocumentSnapshot,
  getSnapshotAdditionalInfo,
  parseFiscalDocumentSnapshot,
  snapshotItemToDanfeItem,
} from './fiscal-document-snapshot'

const DANFE_FONT_REGULAR = fs.readFileSync(
  path.join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto', 'Roboto-Regular.ttf')
)

interface DanfeItem {
  code: string
  description: string
  ncm: string
  cfop: string
  unit: string
  quantity: number
  unitPrice: number
  totalValue: number
  icmsBase: number
  icmsValue: number
  icmsRate: number
  ipiValue: number
}

interface DanfeTransportVolume {
  quantity: number
  species: string
  brand: string | null
  numbering: string | null
  grossWeight: number | null
  netWeight: number | null
}

interface DanfeData {
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
  orderNumber: string | null
  paymentSummary: string | null
  freightModeLabel: string
  deliveryFormLabel: string
  transporterName: string | null
  transporterDocument: string | null
  vehiclePlate: string | null
  vehicleUf: string | null
  anttCode: string | null
  vProd: number
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
  bottom: 812 - 20,
}

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

    const danfeData = buildDanfeDataFromSnapshot(snapshot, {
      chaveAcesso: doc.chave_acesso || '',
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
      .select('id, order_number, payment_method_code, payment_method_name, payment_installments, notes, shipping_address')
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
        total: payload.totals.vNF,
      },
      document: {
        modelo,
        numero,
        serie,
        chaveAcesso: '0'.repeat(44),
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

    const danfeData = buildDanfeDataFromSnapshot(snapshot, {
      chaveAcesso: 'PREVIEW DANFE SEM VALOR FISCAL',
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

  return {
    emitterName: emitter.razao_social || 'EMPRESA',
    emitterFantasy: emitter.nome_fantasia || null,
    emitterCnpj: formatCnpj(emitter.cnpj || ''),
    emitterIe: emitter.ie || null,
    emitterAddress: formatAddress(emitter.logradouro, emitter.numero, emitter.complemento, emitter.bairro, emitter.cep),
    emitterCityUf: [emitter.cidade, emitter.uf?.toUpperCase()].filter(Boolean).join(' / '),
    emitterPhone: emitter.telefone || null,
    chaveAcesso: overrides.chaveAcesso,
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
    items: snapshot.items.map(snapshotItemToDanfeItem),
    volumes: snapshot.context.volumes.map((volume) => ({
      quantity: volume.quantity,
      species: volume.species,
      brand: volume.brand,
      numbering: volume.numbering,
      grossWeight: volume.gross_weight,
      netWeight: volume.net_weight,
    })),
    orderNumber: snapshot.order.orderNumber || null,
    paymentSummary: buildPaymentSummary(snapshot.order.paymentMethodName, snapshot.order.paymentInstallments),
    freightModeLabel: mapFreightModeLabel(transport.freight_mode),
    deliveryFormLabel: mapDeliveryFormLabel(transport.delivery_form),
    transporterName: transport.transporter_name,
    transporterDocument: transport.transporter_document,
    vehiclePlate: transport.vehicle_plate,
    vehicleUf: transport.vehicle_uf,
    anttCode: transport.antt_code,
    vProd: Number(snapshot.totals.vProd || 0),
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

function buildDanfePdf(data: DanfeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: PAGE.top, bottom: 20, left: PAGE.left, right: 20 },
        font: DANFE_FONT_REGULAR as unknown as string,
        info: {
          Title: data.preview ? `Preview DANFE - NF-e ${data.numeroNf}` : `DANFE - NF-e ${data.numeroNf}`,
          Subject: data.preview ? `Preview de DANFE ${data.numeroNf}` : `Nota Fiscal Eletronica ${data.numeroNf}`,
          Author: data.emitterName,
          Creator: 'CDJWE Sistema Fiscal',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      doc.font(DANFE_FONT_REGULAR as unknown as string)

      let y = PAGE.top

      const bannerText = data.preview
        ? 'PREVIEW DE DANFE - SEM VALOR FISCAL'
        : data.ambiente === 'homologacao'
          ? 'SEM VALOR FISCAL - EMITIDO EM AMBIENTE DE HOMOLOGACAO'
          : null

      if (bannerText) {
        y = drawBanner(doc, bannerText, y)
      }

      y = drawHeader(doc, data, y)
      y = drawOperationSummary(doc, data, y)
      y = drawRecipientSection(doc, data, y)
      y = drawTaxTotalsSection(doc, data, y)
      y = drawTransportSection(doc, data, y)
      y = drawVolumesSection(doc, data, y)
      y = drawItemsSection(doc, data, y)
      y = drawAdditionalInfoSection(doc, data, y)

      if (y < PAGE.bottom - 18) {
        doc.fontSize(7).fillColor('#6b7280')
        doc.text(
          data.preview
            ? 'Preview DANFE sem valor fiscal gerado a partir do draft fiscal do pedido.'
            : 'Documento gerado a partir do snapshot fiscal autorizado do pedido.',
          PAGE.left,
          PAGE.bottom - 12,
          { width: PAGE.width, align: 'center' }
        )
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function drawBanner(doc: PDFKit.PDFDocument, text: string, y: number) {
  doc.save()
  doc.fillColor('#b91c1c').fontSize(10).text(text, PAGE.left, y, {
    width: PAGE.width,
    align: 'center',
  })
  doc.restore()
  return y + 18
}

function drawHeader(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const leftW = 235
  const centerW = 108
  const rightW = PAGE.width - leftW - centerW
  const h = 92

  drawBox(doc, PAGE.left, y, leftW, h)
  drawBox(doc, PAGE.left + leftW, y, centerW, h)
  drawBox(doc, PAGE.left + leftW + centerW, y, rightW, h)

  doc.fontSize(12).fillColor('#111827').text(data.emitterName, PAGE.left + 8, y + 8, { width: leftW - 16 })
  if (data.emitterFantasy) {
    doc.fontSize(8).fillColor('#374151').text(data.emitterFantasy, PAGE.left + 8, y + 24, { width: leftW - 16 })
  }
  doc.fontSize(7).fillColor('#111827')
  doc.text(`CNPJ: ${data.emitterCnpj}`, PAGE.left + 8, y + 38)
  doc.text(`IE: ${data.emitterIe || '-'}`, PAGE.left + 8, y + 48)
  doc.text(data.emitterAddress, PAGE.left + 8, y + 58, { width: leftW - 16 })
  doc.text(data.emitterCityUf, PAGE.left + 8, y + 69)

  doc.fontSize(15).fillColor('#0f172a').text('DANFE', PAGE.left + leftW, y + 10, { width: centerW, align: 'center' })
  doc.fontSize(6).fillColor('#374151')
  doc.text('Documento Auxiliar da', PAGE.left + leftW, y + 32, { width: centerW, align: 'center' })
  doc.text('Nota Fiscal Eletronica', PAGE.left + leftW, y + 40, { width: centerW, align: 'center' })
  doc.text(`Entrada / Saida: ${data.numeroNf > 0 ? '1' : '0'}`, PAGE.left + leftW, y + 56, { width: centerW, align: 'center' })
  doc.fontSize(8).fillColor('#111827')
  doc.text(`N ${String(data.numeroNf).padStart(9, '0')}`, PAGE.left + leftW, y + 67, { width: centerW, align: 'center' })
  doc.text(`Serie ${data.serie}`, PAGE.left + leftW, y + 77, { width: centerW, align: 'center' })

  doc.fontSize(6).fillColor('#374151').text('CHAVE DE ACESSO', PAGE.left + leftW + centerW + 4, y + 6, {
    width: rightW - 8,
    align: 'center',
  })
  doc.fontSize(8).fillColor('#111827').text(formatChaveAcesso(data.chaveAcesso), PAGE.left + leftW + centerW + 6, y + 18, {
    width: rightW - 12,
    align: 'center',
  })
  doc.fontSize(6).fillColor('#374151').text('PROTOCOLO / AUTORIZACAO', PAGE.left + leftW + centerW + 4, y + 51, {
    width: rightW - 8,
    align: 'center',
  })
  doc.fontSize(7).fillColor('#111827').text(
    data.preview ? 'Preview sem autorizacao' : (data.protocolo || 'Pendente'),
    PAGE.left + leftW + centerW + 6,
    y + 63,
    { width: rightW - 12, align: 'center' }
  )
  if (data.dataAutorizacao) {
    doc.fontSize(6).fillColor('#374151').text(data.dataAutorizacao, PAGE.left + leftW + centerW + 6, y + 75, {
      width: rightW - 12,
      align: 'center',
    })
  }

  return y + h + 6
}

function drawOperationSummary(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  const col1 = 260
  const col2 = 95
  const col3 = 100
  const col4 = PAGE.width - col1 - col2 - col3
  const h = 24

  drawLabeledBox(doc, PAGE.left, y, col1, h, 'NATUREZA DA OPERACAO', data.naturezaOperacao)
  drawLabeledBox(doc, PAGE.left + col1, y, col2, h, 'EMISSAO', data.dataEmissao)
  drawLabeledBox(doc, PAGE.left + col1 + col2, y, col3, h, 'PEDIDO', data.orderNumber || '-')
  drawLabeledBox(doc, PAGE.left + col1 + col2 + col3, y, col4, h, 'PAGAMENTO', data.paymentSummary || 'Nao informado')

  return y + h + 6
}

function drawRecipientSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionTitle(doc, 'DESTINATARIO / REMETENTE', y)

  const row1Name = 275
  const row1Doc = 140
  const row1Phone = PAGE.width - row1Name - row1Doc

  drawLabeledBox(doc, PAGE.left, y, row1Name, 22, 'NOME / RAZAO SOCIAL', data.destName)
  drawLabeledBox(doc, PAGE.left + row1Name, y, row1Doc, 22, 'CNPJ / CPF', data.destDocument)
  drawLabeledBox(doc, PAGE.left + row1Name + row1Doc, y, row1Phone, 22, 'TELEFONE', data.destPhone || '-')
  y += 22

  const row2Address = 300
  const row2City = 150
  const row2Ie = PAGE.width - row2Address - row2City

  drawLabeledBox(doc, PAGE.left, y, row2Address, 22, 'ENDERECO', data.destAddress)
  drawLabeledBox(doc, PAGE.left + row2Address, y, row2City, 22, 'MUNICIPIO / UF', data.destCityUf)
  drawLabeledBox(doc, PAGE.left + row2Address + row2City, y, row2Ie, 22, 'IE', data.destIe || '-')

  return y + 28
}

function drawTaxTotalsSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionTitle(doc, 'CALCULO DO IMPOSTO', y)

  const entries = [
    ['V PROD', formatMoney(data.vProd)],
    ['V DESC', formatMoney(data.vDesc)],
    ['V FRETE', formatMoney(data.vFrete)],
    ['V SEGURO', formatMoney(data.vSeg)],
    ['V OUTRAS', formatMoney(data.vOutro)],
    ['V ICMS', formatMoney(data.vICMS)],
    ['V ST', formatMoney(data.vST)],
    ['V FCP', formatMoney(data.vFCP)],
    ['V IPI', formatMoney(data.vIPI)],
    ['V PIS', formatMoney(data.vPIS)],
    ['V COFINS', formatMoney(data.vCOFINS)],
    ['V NF', formatMoney(data.vNF)],
  ]

  const cols = 4
  const boxW = PAGE.width / cols
  const boxH = 22

  for (let index = 0; index < entries.length; index++) {
    const row = Math.floor(index / cols)
    const col = index % cols
    const x = PAGE.left + col * boxW
    const yy = y + row * boxH
    drawLabeledBox(doc, x, yy, boxW, boxH, entries[index][0], entries[index][1], 'right')
  }

  return y + boxH * Math.ceil(entries.length / cols) + 6
}

function drawTransportSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionTitle(doc, 'TRANSPORTE / FRETE', y)

  const row1A = 175
  const row1B = 145
  const row1C = 120
  const row1D = PAGE.width - row1A - row1B - row1C

  drawLabeledBox(doc, PAGE.left, y, row1A, 22, 'MODALIDADE FRETE', data.freightModeLabel)
  drawLabeledBox(doc, PAGE.left + row1A, y, row1B, 22, 'FORMA ENTREGA', data.deliveryFormLabel)
  drawLabeledBox(doc, PAGE.left + row1A + row1B, y, row1C, 22, 'TRANSPORTADOR', data.transporterName || '-')
  drawLabeledBox(doc, PAGE.left + row1A + row1B + row1C, y, row1D, 22, 'CPF/CNPJ', formatDocument(data.transporterDocument || '') || '-')
  y += 22

  const row2A = 100
  const row2B = 75
  const row2C = 90
  const row2D = 95
  const row2E = PAGE.width - row2A - row2B - row2C - row2D

  drawLabeledBox(doc, PAGE.left, y, row2A, 22, 'PLACA', data.vehiclePlate || '-')
  drawLabeledBox(doc, PAGE.left + row2A, y, row2B, 22, 'UF VEICULO', data.vehicleUf || '-')
  drawLabeledBox(doc, PAGE.left + row2A + row2B, y, row2C, 22, 'ANTT', data.anttCode || '-')
  drawLabeledBox(doc, PAGE.left + row2A + row2B + row2C, y, row2D, 22, 'FRETE', formatMoney(data.vFrete))
  drawLabeledBox(doc, PAGE.left + row2A + row2B + row2C + row2D, y, row2E, 22, 'SEGURO / OUTRAS', `${formatMoney(data.vSeg)} / ${formatMoney(data.vOutro)}`)

  return y + 28
}

function drawVolumesSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionTitle(doc, 'VOLUMES', y)

  if (data.volumes.length === 0) {
    drawLabeledBox(doc, PAGE.left, y, PAGE.width, 22, 'RESUMO', 'Nenhum volume cadastrado')
    return y + 28
  }

  const headers = ['QTD', 'ESPECIE', 'MARCA', 'NUMERACAO', 'PESO BRUTO', 'PESO LIQUIDO']
  const widths = [50, 120, 120, 100, 82, 83]

  let x = PAGE.left
  drawFilledRow(doc, y, 16)
  headers.forEach((header, index) => {
    doc.fontSize(6).fillColor('#111827')
    doc.text(header, x + 2, y + 5, { width: widths[index] - 4, align: index < 4 ? 'left' : 'right' })
    x += widths[index]
  })
  y += 16

  data.volumes.forEach((volume) => {
    x = PAGE.left
    drawBox(doc, PAGE.left, y, PAGE.width, 14)
    const values = [
      String(volume.quantity),
      volume.species || '-',
      volume.brand || '-',
      volume.numbering || '-',
      typeof volume.grossWeight === 'number' ? `${volume.grossWeight.toFixed(3)} kg` : '-',
      typeof volume.netWeight === 'number' ? `${volume.netWeight.toFixed(3)} kg` : '-',
    ]

    values.forEach((value, index) => {
      doc.fontSize(6).fillColor('#111827')
      doc.text(value, x + 2, y + 4, { width: widths[index] - 4, align: index < 4 ? 'left' : 'right' })
      x += widths[index]
    })
    y += 14
  })

  return y + 6
}

function drawItemsSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionTitle(doc, 'DADOS DOS PRODUTOS / SERVICOS', y)

  const widths = [44, 168, 50, 40, 34, 43, 52, 55, 47, 47]
  const headers = ['COD', 'DESCRICAO', 'NCM', 'CFOP', 'UN', 'QTD', 'VL UNIT', 'VL TOTAL', 'BC ICMS', 'VL ICMS']

  const drawItemHeader = (yy: number) => {
    let x = PAGE.left
    drawFilledRow(doc, yy, 16)
    headers.forEach((header, index) => {
      doc.fontSize(6).fillColor('#111827')
      doc.text(header, x + 2, yy + 5, { width: widths[index] - 4, align: index <= 1 ? 'left' : 'right' })
      x += widths[index]
    })
  }

  drawItemHeader(y)
  y += 16

  for (const item of data.items) {
    if (y > PAGE.bottom - 90) {
      doc.addPage()
      doc.font(DANFE_FONT_REGULAR as unknown as string)
      y = PAGE.top
      drawItemHeader(y)
      y += 16
    }

    const rowHeight = 22
    let x = PAGE.left
    drawBox(doc, PAGE.left, y, PAGE.width, rowHeight)

    const values = [
      item.code.substring(0, 12),
      item.description.substring(0, 54),
      item.ncm,
      item.cfop,
      item.unit,
      item.quantity.toFixed(2),
      formatMoney(item.unitPrice),
      formatMoney(item.totalValue),
      formatMoney(item.icmsBase),
      formatMoney(item.icmsValue),
    ]

    values.forEach((value, index) => {
      doc.fontSize(index === 1 ? 6.5 : 6).fillColor('#111827')
      doc.text(value, x + 2, y + 6, {
        width: widths[index] - 4,
        align: index <= 1 ? 'left' : 'right',
      })
      x += widths[index]
    })

    y += rowHeight
  }

  return y + 6
}

function drawAdditionalInfoSection(doc: PDFKit.PDFDocument, data: DanfeData, y: number) {
  y = drawSectionTitle(doc, 'DADOS ADICIONAIS', y)

  const lines = [
    data.additionalInfo,
    data.vTotTrib > 0 ? `Total aproximado de tributos: ${formatMoney(data.vTotTrib)}` : null,
    data.orderNumber ? `Pedido vinculado: ${data.orderNumber}` : null,
  ].filter(Boolean).join(' | ')

  const boxHeight = 54
  drawBox(doc, PAGE.left, y, PAGE.width, boxHeight)
  doc.fontSize(7).fillColor('#111827').text(lines || 'Sem informacoes complementares.', PAGE.left + 6, y + 10, {
    width: PAGE.width - 12,
    align: 'left',
  })

  return y + boxHeight + 8
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.fontSize(7).fillColor('#334155').text(title, PAGE.left + 2, y, { width: PAGE.width })
  return y + 10
}

function drawLabeledBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  align: 'left' | 'right' | 'center' = 'left'
) {
  drawBox(doc, x, y, width, height)
  doc.fontSize(5).fillColor('#64748b').text(label, x + 4, y + 2, { width: width - 8, align: 'left' })
  doc.fontSize(7).fillColor('#111827').text(value || '-', x + 4, y + 10, { width: width - 8, align })
}

function drawBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
  doc.save()
  doc.lineWidth(0.6).strokeColor('#d1d5db').rect(x, y, width, height).stroke()
  doc.restore()
}

function drawFilledRow(doc: PDFKit.PDFDocument, y: number, height: number) {
  doc.save()
  doc.fillColor('#f8fafc').rect(PAGE.left, y, PAGE.width, height).fill()
  doc.strokeColor('#d1d5db').rect(PAGE.left, y, PAGE.width, height).stroke()
  doc.restore()
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

function buildPaymentSummary(methodName: string | null | undefined, installments: number | null | undefined) {
  const parts = [
    methodName || null,
    installments && installments > 1 ? `${installments} parcelas` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' - ') : null
}

function mapFreightModeLabel(value: DanfeData['freightModeLabel'] | string) {
  const labels: Record<string, string> = {
    emitente: '0 - Emitente',
    destinatario: '1 - Destinatario',
    terceiros: '2 - Terceiros',
    proprio_remetente: '3 - Remetente',
    proprio_destinatario: '4 - Destinatario proprio',
    sem_frete: '9 - Sem frete',
  }

  return labels[value] || 'Nao informado'
}

function mapDeliveryFormLabel(value: DanfeData['deliveryFormLabel'] | string) {
  const labels: Record<string, string> = {
    nao_informado: 'Nao informado',
    retirada: 'Retirada',
    transportadora: 'Transportadora',
    frota_propria: 'Frota propria',
    correios: 'Correios',
    entrega_expressa: 'Entrega expressa',
    balcao: 'Balcao',
  }

  return labels[value] || 'Nao informado'
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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
  return chave.replace(/(.{4})/g, '$1 ').trim()
}

function formatDateTimeBr(dateStr: string | null) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('pt-BR')
  } catch {
    return dateStr
  }
}
