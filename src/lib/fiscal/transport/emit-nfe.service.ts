// ============================================================
// Fiscal Transport — NF-e Emission Service
// Pure JS transport: fast-xml-parser + node-forge + https
// Vercel-compatible (no native deps)
// ============================================================

import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { mapFiscalPayloadToNFeXml, buildNFeAuthorizationEnvelope, buildSoapEnvelope } from './map-fiscal-to-nfe.service'
import type { FiscalDocumentPayload } from '../motor/types'
import type { EmissionResult, FiscalDocument } from './types'

/**
 * Emits an NF-e for the given order using the Motor Fiscal payload.
 *
 * Flow:
 * 1. Get next NF-e number from company_fiscal_environment
 * 2. Map FiscalDocumentPayload → XML
 * 3. Create fiscal_documents record (status: pending)
 * 4. Log event
 * 5. Store XML in Supabase Storage
 * 6. Update document status
 *
 * NOTE: Actual SEFAZ submission requires certificate-based mTLS
 * which is handled when the certificate infrastructure is fully
 * configured. This implementation prepares the full XML and
 * persists it. SEFAZ submission is a separate step.
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
      ? envConfig.serie_nfe
      : envConfig.serie_nfce
    const nextNumber = modelo === '55'
      ? envConfig.proximo_numero_nfe
      : envConfig.proximo_numero_nfce

    if (!serie || !nextNumber || nextNumber <= 0) {
      return createErrorResult('SEQUENCE_ERROR', `Serie/numero ${modelo === '55' ? 'NF-e' : 'NFC-e'} nao configurado.`)
    }

    // 2. Map to XML
    const { xml: infNFeXml, chaveAcesso, infNFeId } = mapFiscalPayloadToNFeXml(
      payload, nextNumber, serie, modelo
    )

    // Wrap in NFe + enviNFe envelope (unsigned for now)
    const nfeXml = `<NFe xmlns="${'http://www.portalfiscal.inf.br/nfe'}">${infNFeXml}</NFe>`
    const envelopeXml = buildNFeAuthorizationEnvelope(nfeXml)

    // 3. Create fiscal_documents record
    const ambiente = payload.context.environment.ambiente as 'homologacao' | 'producao'
    const { data: fiscalDoc, error: docError } = await supabase
      .from('fiscal_documents')
      .insert({
        order_id: orderId,
        document_model: modelo,
        document_status: 'pending',
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

    // 4. Store XML in Supabase Storage
    const xmlPath = `${orderId}/${fiscalDoc.id}/envio.xml`
    const { error: storageError } = await supabase.storage
      .from('fiscal-xml')
      .upload(xmlPath, envelopeXml, {
        contentType: 'application/xml',
        upsert: true,
      })

    if (storageError) {
      console.error('[fiscal:emit] Storage error:', storageError)
    }

    // Update document with XML path
    await supabase
      .from('fiscal_documents')
      .update({ xml_envio_path: xmlPath })
      .eq('id', fiscalDoc.id)

    // 5. Increment next number
    const numberField = modelo === '55' ? 'proximo_numero_nfe' : 'proximo_numero_nfce'
    await supabase
      .from('company_fiscal_environment')
      .update({ [numberField]: nextNumber + 1 })
      .eq('id', envConfig.id)

    // 6. Log event
    const duration = Date.now() - startTime
    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: fiscalDoc.id,
        order_id: orderId,
        event_type: 'authorization',
        event_status: 'success',
        request_summary_jsonb: {
          chave_acesso: chaveAcesso,
          numero_nf: nextNumber,
          serie,
          modelo,
          ambiente,
          motor_version: payload.motor_version,
        },
        response_summary_jsonb: {
          note: 'XML gerado e armazenado. Submissao SOAP pendente de configuracao mTLS.',
        },
        sefaz_status_code: null,
        sefaz_message: 'XML preparado para submissao',
        duration_ms: duration,
        executed_by: userId,
      })

    // 7. Update order with document reference
    await supabase
      .from('orders')
      .update({
        fiscal_ready: true,
        fiscal_snapshot: {
          ...((payload.context as unknown as Record<string, unknown>)?.fiscal_snapshot || {}),
          last_document_id: fiscalDoc.id,
          last_chave_acesso: chaveAcesso,
          last_emitted_at: new Date().toISOString(),
        },
      })
      .eq('id', orderId)

    return {
      success: true,
      chaveAcesso,
      protocolo: null, // Will be filled after SEFAZ submission
      dataAutorizacao: null,
      codigoStatus: null,
      motivoStatus: 'XML gerado e armazenado com sucesso. Pendente submissao SEFAZ.',
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
