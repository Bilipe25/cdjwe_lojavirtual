// ============================================================
// Fiscal Transport — NF-e Emission Service
// Complete flow: XML generation → signing → SEFAZ submission
// Pure JS transport (Vercel-compatible)
// ============================================================

import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  mapFiscalPayloadToNFeXml,
  buildNFeAuthorizationEnvelope,
} from './map-fiscal-to-nfe.service'
import { loadCertificate, signNFeXml } from './sign-xml.service'
import {
  getSefazEndpoint,
  sendSoapRequest,
  parseSefazAutorizacaoResponse,
} from './sefaz-client.service'
import type { FiscalDocumentPayload } from '../motor/types'
import type { EmissionResult } from './types'

const NF_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

/**
 * Emits an NF-e for the given order:
 *
 * 1. Get next NF-e number
 * 2. Map FiscalDocumentPayload → XML (infNFe)
 * 3. Sign XML with A1 certificate (RSA-SHA1)
 * 4. Wrap in enviNFe envelope
 * 5. Submit to SEFAZ via SOAP/mTLS
 * 6. Parse SEFAZ response
 * 7. Persist result to fiscal_documents + fiscal_events_log
 * 8. Store XMLs in Supabase Storage
 */
export async function emitNFe(
  orderId: string,
  payload: FiscalDocumentPayload,
  userId: string,
  modelo: '55' | '65' = '55'
): Promise<EmissionResult> {
  const supabase = createServiceRoleClient()
  const startTime = Date.now()

  try {
    // 1. Get next NF-e number and serie
    const { data: envConfig, error: envError } = await supabase
      .from('company_fiscal_environment')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (envError || !envConfig) {
      return createErrorResult('ENV_NOT_CONFIGURED', 'Ambiente fiscal nao configurado.')
    }

    const serie = modelo === '55'
      ? envConfig.serie_nfe || envConfig.serie_padrao_nfe
      : envConfig.serie_nfce
    const nextNumber = modelo === '55'
      ? envConfig.proximo_numero_nfe
      : envConfig.proximo_numero_nfce

    if (!serie || !nextNumber || nextNumber <= 0) {
      return createErrorResult('SEQUENCE_ERROR', `Serie/numero ${modelo === '55' ? 'NF-e' : 'NFC-e'} nao configurado.`)
    }

    // 2. Map to XML (unsigned infNFe)
    const { xml: infNFeXml, chaveAcesso, infNFeId } = mapFiscalPayloadToNFeXml(
      payload, nextNumber, serie, modelo
    )

    // Wrap in <NFe> element
    const nfeXmlUnsigned = `<NFe xmlns="${NF_NAMESPACE}">${infNFeXml}</NFe>`

    // 3. Sign XML with A1 certificate
    let signedNFeXml: string
    let certLoaded = false
    try {
      const certData = await loadCertificate()
      signedNFeXml = signNFeXml(nfeXmlUnsigned, infNFeId, certData)
      certLoaded = true
    } catch (certErr) {
      // If certificate not available, store unsigned XML
      console.warn('[fiscal:emit] Certificate not available, storing unsigned XML:', certErr)
      signedNFeXml = nfeXmlUnsigned
    }

    // 4. Build enviNFe envelope
    const envelopeXml = buildNFeAuthorizationEnvelope(signedNFeXml)

    // 5. Create fiscal_documents record (status: processing)
    const ambiente = payload.context.environment.ambiente as 'homologacao' | 'producao'
    const { data: fiscalDoc, error: docError } = await supabase
      .from('fiscal_documents')
      .insert({
        order_id: orderId,
        document_model: modelo,
        document_status: certLoaded ? 'processing' : 'pending',
        chave_acesso: chaveAcesso,
        numero_nf: nextNumber,
        serie,
        natureza_operacao: payload.context.environment.natureza_operacao || 'VENDA DE MERCADORIA',
        motor_version: payload.motor_version,
        fiscal_payload_jsonb: {
          totals: payload.totals,
          item_count: payload.items.length,
          validation: payload.validation,
        },
        valor_produtos: payload.totals.vProd,
        valor_total_nota: payload.totals.vNF,
        valor_icms: payload.totals.vICMS,
        valor_st: payload.totals.vST,
        valor_pis: payload.totals.vPIS,
        valor_cofins: payload.totals.vCOFINS,
        valor_ipi: payload.totals.vIPI,
        valor_frete: payload.totals.vFrete,
        valor_desconto: payload.totals.vDesc,
        ambiente,
        emitted_by: userId,
        emitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (docError || !fiscalDoc) {
      return createErrorResult('DOC_INSERT_FAILED', `Erro ao criar documento fiscal: ${docError?.message}`)
    }

    // 6. Store envio XML in Supabase Storage
    const xmlEnvioPath = `${orderId}/${fiscalDoc.id}/envio.xml`
    await supabase.storage
      .from('fiscal-xml')
      .upload(xmlEnvioPath, envelopeXml, { contentType: 'application/xml', upsert: true })

    await supabase
      .from('fiscal_documents')
      .update({ xml_envio_path: xmlEnvioPath })
      .eq('id', fiscalDoc.id)

    // 7. Submit to SEFAZ (only if certificate was loaded)
    let sefazResult: ReturnType<typeof parseSefazAutorizacaoResponse> | null = null

    if (certLoaded) {
      try {
        const emitterUf = payload.context.emitter.uf
        const endpoint = getSefazEndpoint(emitterUf, ambiente, 'NfeAutorizacao')
        const soapResponse = await sendSoapRequest(endpoint, envelopeXml, 'NFeAutorizacao4')

        // Store retorno XML
        const xmlRetornoPath = `${orderId}/${fiscalDoc.id}/retorno.xml`
        await supabase.storage
          .from('fiscal-xml')
          .upload(xmlRetornoPath, soapResponse.body, { contentType: 'application/xml', upsert: true })

        await supabase
          .from('fiscal_documents')
          .update({ xml_retorno_path: xmlRetornoPath })
          .eq('id', fiscalDoc.id)

        sefazResult = parseSefazAutorizacaoResponse(soapResponse.parsed)

        // Status 100 = Autorizado uso da NF-e
        const isAuthorized = sefazResult.cStat === 100

        // Update fiscal_documents with SEFAZ result
        await supabase
          .from('fiscal_documents')
          .update({
            document_status: isAuthorized ? 'authorized' : 'denied',
            protocolo_autorizacao: sefazResult.nProt,
            data_autorizacao: sefazResult.dhRecbto,
            codigo_status: sefazResult.cStat,
            motivo_status: sefazResult.xMotivo,
            digest_value: sefazResult.digVal,
          })
          .eq('id', fiscalDoc.id)
      } catch (soapErr) {
        const soapError = soapErr instanceof Error ? soapErr.message : String(soapErr)
        console.error('[fiscal:emit] SEFAZ SOAP error:', soapError)

        await supabase
          .from('fiscal_documents')
          .update({
            document_status: 'error',
            motivo_status: `SOAP Error: ${soapError}`,
          })
          .eq('id', fiscalDoc.id)

        sefazResult = {
          cStat: 0,
          xMotivo: soapError,
          nProt: null,
          dhRecbto: null,
          chNFe: null,
          digVal: null,
        }
      }
    }

    // 8. Increment next number
    const numberField = modelo === '55' ? 'proximo_numero_nfe' : 'proximo_numero_nfce'
    await supabase
      .from('company_fiscal_environment')
      .update({ [numberField]: nextNumber + 1 })
      .eq('id', envConfig.id)

    // 9. Log event
    const duration = Date.now() - startTime
    const eventStatus = sefazResult
      ? (sefazResult.cStat === 100 ? 'success' : 'failure')
      : 'warning'

    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: fiscalDoc.id,
        order_id: orderId,
        event_type: 'authorization',
        event_status: eventStatus,
        request_summary_jsonb: {
          chave_acesso: chaveAcesso,
          numero_nf: nextNumber,
          serie,
          modelo,
          ambiente,
          motor_version: payload.motor_version,
          cert_loaded: certLoaded,
        },
        response_summary_jsonb: sefazResult || {
          note: 'Certificado nao disponivel. XML gerado e armazenado sem assinatura.',
        },
        sefaz_status_code: sefazResult?.cStat || null,
        sefaz_message: sefazResult?.xMotivo || 'XML pendente de submissao',
        duration_ms: duration,
        executed_by: userId,
      })

    // 10. Update order
    await supabase
      .from('orders')
      .update({
        fiscal_ready: true,
        fiscal_snapshot: {
          last_document_id: fiscalDoc.id,
          last_chave_acesso: chaveAcesso,
          last_emitted_at: new Date().toISOString(),
          last_status: sefazResult ? (sefazResult.cStat === 100 ? 'authorized' : 'denied') : 'pending',
        },
      })
      .eq('id', orderId)

    return {
      success: sefazResult ? sefazResult.cStat === 100 : true,
      chaveAcesso,
      protocolo: sefazResult?.nProt || null,
      dataAutorizacao: sefazResult?.dhRecbto || null,
      codigoStatus: sefazResult?.cStat || null,
      motivoStatus: sefazResult?.xMotivo || 'XML gerado. ' + (certLoaded ? 'Submetido ao SEFAZ.' : 'Pendente assinatura e submissao.'),
      xmlProcessado: null,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    return createErrorResult('EMISSION_ERROR', error.message)
  }
}

function createErrorResult(code: string, message: string): EmissionResult {
  return {
    success: false,
    chaveAcesso: null,
    protocolo: null,
    dataAutorizacao: null,
    codigoStatus: null,
    motivoStatus: `[${code}] ${message}`,
    xmlProcessado: null,
    error: message,
  }
}
