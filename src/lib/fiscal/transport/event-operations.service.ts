// ============================================================
// Fiscal Transport — Event Operations Service
// Cancelamento NF-e (evento 110111) and
// Carta de Correção (evento 110110)
// ============================================================

import 'server-only'

import { XMLBuilder } from 'fast-xml-parser'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { loadCertificate, signEventXml } from './sign-xml.service'
import {
  getSefazEndpoint,
  sendSoapRequest,
  parseSefazEventoResponse,
} from './sefaz-client.service'
import { parseFiscalDocumentSnapshot } from './fiscal-document-snapshot'
import type { CancelResult } from './types'
import { UF_CODES } from './types'

const NF_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

// ─── Cancel NF-e ──────────────────────────────────

/**
 * Cancels an authorized NF-e.
 *
 * Requirements:
 * - Document must be in 'authorized' status
 * - Justification must have >= 15 characters
 * - Must be within cancellation deadline (varies by UF, usually 24h in production)
 *
 * @param fiscalDocumentId - ID of the fiscal_documents record
 * @param justificativa - Reason for cancellation (min 15 chars)
 * @param userId - ID of the user performing the cancellation
 */
export async function cancelNFe(
  fiscalDocumentId: string,
  justificativa: string,
  userId: string
): Promise<CancelResult> {
  const supabase = createServiceRoleClient()
  const startTime = Date.now()

  try {
    // Validate justificativa
    if (!justificativa || justificativa.trim().length < 15) {
      return createCancelError('JUSTIFICATIVA_CURTA', 'Justificativa deve ter no minimo 15 caracteres.')
    }

    // 1. Load fiscal document
    const { data: doc, error: docError } = await supabase
      .from('fiscal_documents')
      .select('*')
      .eq('id', fiscalDocumentId)
      .single()

    if (docError || !doc) {
      return createCancelError('DOC_NOT_FOUND', 'Documento fiscal nao encontrado.')
    }

    if (doc.document_status !== 'authorized') {
      return createCancelError('DOC_NOT_AUTHORIZED', `Documento com status "${doc.document_status}". Apenas documentos autorizados podem ser cancelados.`)
    }

    if (!doc.chave_acesso || !doc.protocolo_autorizacao) {
      return createCancelError('DOC_INCOMPLETE', 'Documento sem chave de acesso ou protocolo de autorizacao.')
    }

    const snapshot = parseFiscalDocumentSnapshot(doc.fiscal_payload_jsonb)
    if (!snapshot) {
      return createCancelError('DOC_NO_SNAPSHOT', 'Snapshot fiscal imutavel nao encontrado para este documento.')
    }

    const uf = snapshot.context.emitter.uf.toUpperCase()
    const cnpj = (snapshot.context.emitter.cnpj || '').replace(/\D/g, '')
    const ambiente = doc.ambiente === 'producao' ? 'producao' : 'homologacao'
    const tpAmb = ambiente === 'producao' ? 1 : 2

    // 3. Build cancellation event XML
    const sequenciaEvento = 1
    const eventId = `ID110111${doc.chave_acesso}${String(sequenciaEvento).padStart(2, '0')}`
    const dhEvento = formatSefazDateTime(new Date())

    const eventObj = {
      evento: {
        '@_xmlns': NF_NAMESPACE,
        '@_versao': '1.00',
        infEvento: {
          '@_Id': eventId,
          cOrgao: UF_CODES[uf] || 35,
          tpAmb,
          CNPJ: cnpj,
          chNFe: doc.chave_acesso,
          dhEvento,
          tpEvento: '110111',
          nSeqEvento: sequenciaEvento,
          verEvento: '1.00',
          detEvento: {
            '@_versao': '1.00',
            descEvento: 'Cancelamento',
            nProt: doc.protocolo_autorizacao,
            xJust: justificativa.trim().substring(0, 255),
          },
        },
      },
    }

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: false,
      suppressEmptyNode: true,
    })

    const eventXml = builder.build(eventObj)

    // 4. Sign event
    const certData = await loadCertificate()
    const signedEventXml = signEventXml(eventXml, eventId, certData)

    // 5. Wrap in envEvento envelope
    const envEventoXml = [
      `<envEvento xmlns="${NF_NAMESPACE}" versao="1.00">`,
      '<idLote>1</idLote>',
      signedEventXml,
      '</envEvento>',
    ].join('')

    // 6. Send to SEFAZ
    const endpoint = getSefazEndpoint(uf, ambiente, 'NfeRecepcaoEvento')
    const response = await sendSoapRequest(endpoint, envEventoXml, 'NFeRecepcaoEvento4')

    // 7. Parse response
    const sefazResult = parseSefazEventoResponse(response.parsed)
    const duration = Date.now() - startTime

    // Statuses 135 = evento registrado, 155 = cancelamento ok
    const isSuccess = [135, 155].includes(sefazResult.cStat)

    // 8. Update fiscal_documents
    if (isSuccess) {
      await supabase
        .from('fiscal_documents')
        .update({
          document_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: userId,
          cancellation_protocol: sefazResult.nProt,
          cancellation_justificativa: justificativa.trim(),
        })
        .eq('id', fiscalDocumentId)
    }

    // 9. Store response XML
    const xmlPath = `${doc.order_id}/${fiscalDocumentId}/cancelamento_retorno.xml`
    await supabase.storage
      .from('fiscal-xml')
      .upload(xmlPath, response.body, { contentType: 'application/xml', upsert: true })

    // 10. Log event
    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: fiscalDocumentId,
        order_id: doc.order_id,
        event_type: 'cancellation',
        event_status: isSuccess ? 'success' : 'failure',
        request_summary_jsonb: {
          chave_acesso: doc.chave_acesso,
          justificativa: justificativa.trim(),
        },
        response_summary_jsonb: sefazResult,
        sefaz_status_code: sefazResult.cStat,
        sefaz_message: sefazResult.xMotivo,
        error_message: isSuccess ? null : sefazResult.xMotivo,
        duration_ms: duration,
        executed_by: userId,
      })

    return {
      success: isSuccess,
      protocolo: sefazResult.nProt,
      dataEvento: sefazResult.dhRegEvento,
      codigoStatus: sefazResult.cStat,
      motivoStatus: sefazResult.xMotivo,
      error: isSuccess ? undefined : sefazResult.xMotivo,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    return createCancelError('CANCEL_ERROR', error.message)
  }
}

// ─── Carta de Correção ────────────────────────────

/**
 * Sends a Carta de Correção (CC-e) for an authorized NF-e.
 *
 * Requirements:
 * - Document must be in 'authorized' or 'correction' status
 * - Correction text must have >= 15 characters
 * - Max 20 CC-e events per document
 *
 * @param fiscalDocumentId - ID of the fiscal_documents record
 * @param correcao - Correction text (min 15 chars)
 * @param userId - ID of the user
 */
export async function sendCartaCorrecao(
  fiscalDocumentId: string,
  correcao: string,
  userId: string
): Promise<CancelResult> {
  const supabase = createServiceRoleClient()
  const startTime = Date.now()

  try {
    if (!correcao || correcao.trim().length < 15) {
      return createCancelError('CORRECAO_CURTA', 'Texto da correcao deve ter no minimo 15 caracteres.')
    }

    // 1. Load document
    const { data: doc, error: docError } = await supabase
      .from('fiscal_documents')
      .select('*')
      .eq('id', fiscalDocumentId)
      .single()

    if (docError || !doc) {
      return createCancelError('DOC_NOT_FOUND', 'Documento fiscal nao encontrado.')
    }

    if (!['authorized', 'correction'].includes(doc.document_status)) {
      return createCancelError('DOC_INVALID_STATUS', `Status "${doc.document_status}" nao permite carta de correcao.`)
    }

    if (doc.correction_count >= 20) {
      return createCancelError('CORRECTION_LIMIT', 'Limite de 20 cartas de correcao atingido para este documento.')
    }

    if (!doc.chave_acesso) {
      return createCancelError('DOC_NO_CHAVE', 'Documento sem chave de acesso.')
    }

    const snapshot = parseFiscalDocumentSnapshot(doc.fiscal_payload_jsonb)
    if (!snapshot) {
      return createCancelError('DOC_NO_SNAPSHOT', 'Snapshot fiscal imutavel nao encontrado para este documento.')
    }

    const uf = snapshot.context.emitter.uf.toUpperCase()
    const cnpj = (snapshot.context.emitter.cnpj || '').replace(/\D/g, '')
    const ambiente = doc.ambiente === 'producao' ? 'producao' : 'homologacao'
    const tpAmb = ambiente === 'producao' ? 1 : 2

    // 3. Build CC-e event
    const nSeqEvento = doc.correction_count + 1
    const eventId = `ID110110${doc.chave_acesso}${String(nSeqEvento).padStart(2, '0')}`
    const dhEvento = formatSefazDateTime(new Date())

    const condUso = 'A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.'

    const eventObj = {
      evento: {
        '@_xmlns': NF_NAMESPACE,
        '@_versao': '1.00',
        infEvento: {
          '@_Id': eventId,
          cOrgao: UF_CODES[uf] || 35,
          tpAmb,
          CNPJ: cnpj,
          chNFe: doc.chave_acesso,
          dhEvento,
          tpEvento: '110110',
          nSeqEvento,
          verEvento: '1.00',
          detEvento: {
            '@_versao': '1.00',
            descEvento: 'Carta de Correcao',
            xCorrecao: correcao.trim().substring(0, 1000),
            xCondUso: condUso,
          },
        },
      },
    }

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: false,
      suppressEmptyNode: true,
    })

    const eventXml = builder.build(eventObj)

    // 4. Sign
    const certData = await loadCertificate()
    const signedEventXml = signEventXml(eventXml, eventId, certData)

    // 5. Envelope
    const envEventoXml = [
      `<envEvento xmlns="${NF_NAMESPACE}" versao="1.00">`,
      '<idLote>1</idLote>',
      signedEventXml,
      '</envEvento>',
    ].join('')

    // 6. Send to SEFAZ
    const endpoint = getSefazEndpoint(uf, ambiente, 'NfeRecepcaoEvento')
    const response = await sendSoapRequest(endpoint, envEventoXml, 'NFeRecepcaoEvento4')

    // 7. Parse
    const sefazResult = parseSefazEventoResponse(response.parsed)
    const duration = Date.now() - startTime
    const isSuccess = [135, 155].includes(sefazResult.cStat)

    // 8. Update document
    if (isSuccess) {
      await supabase
        .from('fiscal_documents')
        .update({
          document_status: 'correction',
          correction_count: nSeqEvento,
          last_correction_at: new Date().toISOString(),
        })
        .eq('id', fiscalDocumentId)
    }

    // 9. Store XML
    const xmlPath = `${doc.order_id}/${fiscalDocumentId}/cce_${nSeqEvento}_retorno.xml`
    await supabase.storage
      .from('fiscal-xml')
      .upload(xmlPath, response.body, { contentType: 'application/xml', upsert: true })

    // 10. Log
    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: fiscalDocumentId,
        order_id: doc.order_id,
        event_type: 'correction',
        event_status: isSuccess ? 'success' : 'failure',
        request_summary_jsonb: {
          chave_acesso: doc.chave_acesso,
          correcao: correcao.trim(),
          nSeqEvento,
        },
        response_summary_jsonb: sefazResult,
        sefaz_status_code: sefazResult.cStat,
        sefaz_message: sefazResult.xMotivo,
        error_message: isSuccess ? null : sefazResult.xMotivo,
        duration_ms: duration,
        executed_by: userId,
      })

    return {
      success: isSuccess,
      protocolo: sefazResult.nProt,
      dataEvento: sefazResult.dhRegEvento,
      codigoStatus: sefazResult.cStat,
      motivoStatus: sefazResult.xMotivo,
      error: isSuccess ? undefined : sefazResult.xMotivo,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    return createCancelError('CORRECTION_ERROR', error.message)
  }
}

function createCancelError(code: string, message: string): CancelResult {
  return {
    success: false,
    protocolo: null,
    dataEvento: null,
    codigoStatus: null,
    motivoStatus: `[${code}] ${message}`,
    error: message,
  }
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
