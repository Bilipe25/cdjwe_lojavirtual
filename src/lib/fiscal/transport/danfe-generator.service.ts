// ============================================================
// Fiscal Transport — DANFE PDF Generator
// Generates DANFE (Documento Auxiliar da NF-e) using PDFKit
// Vercel-compatible (pure JS, no native deps)
// ============================================================

import 'server-only'

import PDFDocument from 'pdfkit'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getSnapshotAdditionalInfo,
  parseFiscalDocumentSnapshot,
  snapshotItemToDanfeItem,
} from './fiscal-document-snapshot'

interface DanfeData {
  // Emitter
  emitterName: string
  emitterFantasy: string | null
  emitterCnpj: string
  emitterIe: string | null
  emitterAddress: string
  emitterCityUf: string
  emitterPhone: string | null
  // Document
  chaveAcesso: string
  numeroNf: number
  serie: string
  naturezaOperacao: string
  dataEmissao: string
  protocolo: string | null
  dataAutorizacao: string | null
  ambiente: 'homologacao' | 'producao'
  // Destination
  destName: string
  destDocument: string
  destIe: string | null
  destAddress: string
  destCityUf: string
  destPhone: string | null
  // Items
  items: DanfeItem[]
  // Totals
  vProd: number
  vICMS: number
  vST: number
  vPIS: number
  vCOFINS: number
  vIPI: number
  vFrete: number
  vDesc: number
  vNF: number
  vTotTrib: number
  // Additional
  additionalInfo: string | null
}

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

/**
 * Generates a DANFE PDF from fiscal document data.
 *
 * Returns a Buffer containing the PDF bytes.
 */
export async function generateDanfePdf(
  fiscalDocumentId: string
): Promise<{ success: boolean; pdfBuffer?: Buffer; storagePath?: string; error?: string }> {
  const supabase = createServiceRoleClient()

  try {
    // 1. Load fiscal document
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

    const emitter = snapshot.context.emitter
    const store = snapshot.context.store

    const danfeData: DanfeData = {
      emitterName: emitter.razao_social || 'EMPRESA',
      emitterFantasy: emitter.nome_fantasia || null,
      emitterCnpj: formatCnpj(emitter.cnpj || ''),
      emitterIe: emitter.ie || null,
      emitterAddress: [emitter.logradouro, emitter.numero].filter(Boolean).join(', '),
      emitterCityUf: [emitter.cidade, emitter.uf?.toUpperCase()].filter(Boolean).join(' / '),
      emitterPhone: emitter.telefone || null,
      chaveAcesso: doc.chave_acesso || '',
      numeroNf: doc.numero_nf,
      serie: doc.serie,
      naturezaOperacao: doc.natureza_operacao || 'VENDA DE MERCADORIA',
      dataEmissao: formatDateBr(snapshot.document.emittedAt || doc.emitted_at),
      protocolo: doc.protocolo_autorizacao || null,
      dataAutorizacao: doc.data_autorizacao ? formatDateBr(doc.data_autorizacao) : null,
      ambiente: doc.ambiente === 'producao' ? 'producao' : 'homologacao',
      destName: store.nome || 'DESTINATARIO',
      destDocument: formatDocument(store.document_number || ''),
      destIe: store.ie || null,
      destAddress: [store.logradouro, store.numero].filter(Boolean).join(', '),
      destCityUf: [store.cidade, store.uf?.toUpperCase()].filter(Boolean).join(' / '),
      destPhone: store.telefone || null,
      items: snapshot.items.map(snapshotItemToDanfeItem),
      vProd: Number(snapshot.totals.vProd || 0),
      vICMS: Number(snapshot.totals.vICMS || 0),
      vST: Number(snapshot.totals.vST || 0),
      vPIS: Number(snapshot.totals.vPIS || 0),
      vCOFINS: Number(snapshot.totals.vCOFINS || 0),
      vIPI: Number(snapshot.totals.vIPI || 0),
      vFrete: Number(snapshot.totals.vFrete || 0),
      vDesc: Number(snapshot.totals.vDesc || 0),
      vNF: Number(snapshot.totals.vNF || 0),
      vTotTrib: Number(snapshot.totals.vTotTrib || 0),
      additionalInfo: getSnapshotAdditionalInfo(snapshot),
    }

    // 5. Generate PDF
    const pdfBuffer = await buildDanfePdf(danfeData)

    // 6. Store in Supabase Storage
    const storagePath = `${doc.order_id}/${fiscalDocumentId}/danfe.pdf`
    await supabase.storage
      .from('fiscal-xml')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    // Update document with DANFE path
    await supabase
      .from('fiscal_documents')
      .update({ danfe_path: storagePath })
      .eq('id', fiscalDocumentId)

    // Log event
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

// ─── PDF Builder ──────────────────────────────────

function buildDanfePdf(data: DanfeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
        info: {
          Title: `DANFE - NF-e ${data.numeroNf}`,
          Subject: `Nota Fiscal Eletronica ${data.numeroNf}`,
          Author: data.emitterName,
          Creator: 'CDJWE Sistema Fiscal',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pw = 555 // page width minus margins
      const x0 = 20  // left margin
      let y = 20      // current y position

      // ─── Homologação Banner ───
      if (data.ambiente === 'homologacao') {
        doc.save()
        doc.fontSize(10).fillColor('#cc0000')
           .text('SEM VALOR FISCAL - EMITIDO EM AMBIENTE DE HOMOLOGACAO',
           x0, y, { width: pw, align: 'center' })
        doc.restore()
        y += 18
      }

      // ─── Header Box ───
      const headerH = 80
      doc.rect(x0, y, pw, headerH).stroke()

      // Emitter info (left section)
      doc.fontSize(12).fillColor('#000000')
         .text(data.emitterName, x0 + 8, y + 8, { width: 280 })
      if (data.emitterFantasy) {
        doc.fontSize(8).text(data.emitterFantasy, x0 + 8, y + 24, { width: 280 })
      }
      doc.fontSize(7)
         .text(`CNPJ: ${data.emitterCnpj}`, x0 + 8, y + 38)
         .text(`IE: ${data.emitterIe || ''}`, x0 + 8, y + 48)
         .text(data.emitterAddress, x0 + 8, y + 58)
         .text(data.emitterCityUf, x0 + 8, y + 68)

      // DANFE label (center)
      doc.rect(x0 + 300, y, 100, headerH).stroke()
      doc.fontSize(14).text('DANFE', x0 + 300, y + 8, { width: 100, align: 'center' })
      doc.fontSize(6)
         .text('Documento Auxiliar da', x0 + 300, y + 28, { width: 100, align: 'center' })
         .text('Nota Fiscal Eletrônica', x0 + 300, y + 36, { width: 100, align: 'center' })
      doc.fontSize(7)
         .text(`ENTRADA/SAÍDA: 1`, x0 + 310, y + 50)
         .text(`Nº: ${String(data.numeroNf).padStart(9, '0')}`, x0 + 310, y + 60)
         .text(`SÉRIE: ${data.serie}`, x0 + 310, y + 70)

      // Chave de acesso (right)
      doc.rect(x0 + 400, y, pw - 400, headerH).stroke()
      doc.fontSize(6)
         .text('CHAVE DE ACESSO', x0 + 405, y + 4, { width: 150, align: 'center' })
      doc.fontSize(7)
         .text(formatChaveAcesso(data.chaveAcesso), x0 + 405, y + 16, { width: 150, align: 'center' })
      doc.fontSize(6)
         .text('PROTOCOLO DE AUTORIZAÇÃO', x0 + 405, y + 46, { width: 150, align: 'center' })
      doc.fontSize(7)
         .text(data.protocolo || 'Pendente', x0 + 405, y + 58, { width: 150, align: 'center' })
      if (data.dataAutorizacao) {
        doc.fontSize(6).text(data.dataAutorizacao, x0 + 405, y + 68, { width: 150, align: 'center' })
      }

      y += headerH + 4

      // ─── Natureza + Data ───
      doc.rect(x0, y, pw * 0.7, 20).stroke()
      doc.rect(x0 + pw * 0.7, y, pw * 0.3, 20).stroke()
      doc.fontSize(5).text('NATUREZA DA OPERAÇÃO', x0 + 4, y + 2)
      doc.fontSize(8).text(data.naturezaOperacao, x0 + 4, y + 9)
      doc.fontSize(5).text('DATA DE EMISSÃO', x0 + pw * 0.7 + 4, y + 2)
      doc.fontSize(8).text(data.dataEmissao, x0 + pw * 0.7 + 4, y + 9)
      y += 24

      // ─── Destinatário ───
      doc.fontSize(7).fillColor('#333333').text('DESTINATÁRIO / REMETENTE', x0 + 4, y)
      y += 12
      doc.fillColor('#000000')

      // Row 1: Name + CNPJ + Date
      doc.rect(x0, y, pw * 0.6, 20).stroke()
      doc.rect(x0 + pw * 0.6, y, pw * 0.25, 20).stroke()
      doc.rect(x0 + pw * 0.85, y, pw * 0.15, 20).stroke()
      doc.fontSize(5).text('NOME / RAZÃO SOCIAL', x0 + 4, y + 2)
      doc.fontSize(7).text(data.destName, x0 + 4, y + 9)
      doc.fontSize(5).text('CNPJ / CPF', x0 + pw * 0.6 + 4, y + 2)
      doc.fontSize(7).text(data.destDocument, x0 + pw * 0.6 + 4, y + 9)
      doc.fontSize(5).text('DATA EMISSÃO', x0 + pw * 0.85 + 4, y + 2)
      doc.fontSize(7).text(data.dataEmissao, x0 + pw * 0.85 + 4, y + 9)
      y += 24

      // Row 2: Address + City/UF + Phone
      doc.rect(x0, y, pw * 0.5, 20).stroke()
      doc.rect(x0 + pw * 0.5, y, pw * 0.3, 20).stroke()
      doc.rect(x0 + pw * 0.8, y, pw * 0.2, 20).stroke()
      doc.fontSize(5).text('ENDEREÇO', x0 + 4, y + 2)
      doc.fontSize(7).text(data.destAddress, x0 + 4, y + 9)
      doc.fontSize(5).text('MUNICÍPIO / UF', x0 + pw * 0.5 + 4, y + 2)
      doc.fontSize(7).text(data.destCityUf, x0 + pw * 0.5 + 4, y + 9)
      doc.fontSize(5).text('TELEFONE', x0 + pw * 0.8 + 4, y + 2)
      doc.fontSize(7).text(data.destPhone || '', x0 + pw * 0.8 + 4, y + 9)
      y += 28

      // ─── Items Header ───
      doc.fontSize(7).fillColor('#333333').text('DADOS DOS PRODUTOS / SERVIÇOS', x0 + 4, y)
      y += 12
      doc.fillColor('#000000')

      const colWidths = [50, 160, 50, 35, 25, 35, 50, 50, 50, 50]
      const colHeaders = ['CÓDIGO', 'DESCRIÇÃO', 'NCM', 'CFOP', 'UN', 'QTD', 'VL UNIT', 'VL TOTAL', 'BC ICMS', 'VL ICMS']

      // Table header
      let cx = x0
      doc.rect(x0, y, pw, 14).fill('#f0f0f0').stroke()
      doc.fillColor('#000000').fontSize(5)
      for (let i = 0; i < colHeaders.length; i++) {
        doc.text(colHeaders[i], cx + 2, y + 4, { width: colWidths[i], align: 'center' })
        cx += colWidths[i]
      }
      y += 14

      // Table body
      for (const item of data.items) {
        if (y > 700) {
          doc.addPage()
          y = 20
        }

        cx = x0
        doc.rect(x0, y, pw, 12).stroke()
        doc.fontSize(5)

        const values = [
          item.code.substring(0, 10),
          item.description.substring(0, 40),
          item.ncm,
          item.cfop,
          item.unit,
          item.quantity.toFixed(2),
          item.unitPrice.toFixed(2),
          item.totalValue.toFixed(2),
          item.icmsBase.toFixed(2),
          item.icmsValue.toFixed(2),
        ]

        for (let i = 0; i < values.length; i++) {
          doc.text(values[i], cx + 2, y + 3, { width: colWidths[i], align: i <= 1 ? 'left' : 'right' })
          cx += colWidths[i]
        }
        y += 12
      }

      y += 8

      // ─── Totals ───
      if (y > 720) { doc.addPage(); y = 20 }

      doc.fontSize(7).fillColor('#333333').text('CÁLCULO DO IMPOSTO', x0 + 4, y)
      y += 12
      doc.fillColor('#000000')

      const totals = [
        ['BC ICMS', data.vProd.toFixed(2)],
        ['VL ICMS', data.vICMS.toFixed(2)],
        ['VL ST', data.vST.toFixed(2)],
        ['VL FRETE', data.vFrete.toFixed(2)],
        ['VL DESC', data.vDesc.toFixed(2)],
        ['VL IPI', data.vIPI.toFixed(2)],
        ['VL PIS', data.vPIS.toFixed(2)],
        ['VL COFINS', data.vCOFINS.toFixed(2)],
        ['VL TOTAL', data.vNF.toFixed(2)],
      ]

      const totalW = pw / totals.length
      for (let i = 0; i < totals.length; i++) {
        const tx = x0 + i * totalW
        doc.rect(tx, y, totalW, 24).stroke()
        doc.fontSize(5).text(totals[i][0], tx + 4, y + 2, { width: totalW - 8 })
        doc.fontSize(8).text(totals[i][1], tx + 4, y + 11, { width: totalW - 8, align: 'right' })
      }

      y += 30

      // ─── Additional Info ───
      if (data.additionalInfo) {
        doc.rect(x0, y, pw, 40).stroke()
        doc.fontSize(5).text('INFORMAÇÕES COMPLEMENTARES', x0 + 4, y + 2)
        doc.fontSize(6).text(data.additionalInfo, x0 + 4, y + 10, { width: pw - 8 })
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

// ─── Utilities ────────────────────────────────────

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

function formatChaveAcesso(chave: string): string {
  return chave.replace(/(.{4})/g, '$1 ').trim()
}

function formatDateBr(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR')
  } catch {
    return dateStr
  }
}
