// ============================================================
// Fiscal Transport - NF-e Emission Service
// Complete flow: XML generation -> signing -> SEFAZ submission
// ============================================================

import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  mapFiscalPayloadToNFeXml,
  buildNFeAuthorizationEnvelope,
  buildNFeProcessedXml,
} from './map-fiscal-to-nfe.service'
import { buildFiscalDocumentSnapshot } from './fiscal-document-snapshot'
import { loadCertificate, signNFeXml } from './sign-xml.service'
import {
  buildConsultaProtocoloRequestXml,
  buildRetAutorizacaoRequestXml,
  getSefazEndpoint,
  type ParsedAuthorizationResponse,
  parseSefazAutorizacaoResponse,
  parseSefazConsultaProtocoloResponse,
  parseSefazRetAutorizacaoResponse,
  sendSoapRequest,
} from './sefaz-client.service'
import type { FiscalDocumentPayload } from '../motor/types'
import type { EmissionResult } from './types'

const NF_NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'
const AUTHORIZED_STATUS_CODES = new Set([100, 150])
const PROCESSING_STATUS_CODES = new Set([103, 105])
const RET_AUTORIZATION_ATTEMPTS = 5
const RET_AUTORIZATION_DELAY_MS = 1500

interface EmissionReservationRow {
  reserved: boolean
  environment_id: string | null
  ambiente: 'homologacao' | 'producao' | null
  serie: string | null
  numero: number | null
  existing_document_id: string | null
  existing_document_status: string | null
  existing_chave_acesso: string | null
  existing_protocolo: string | null
  existing_data_autorizacao: string | null
  existing_codigo_status: number | null
  existing_motivo_status: string | null
  existing_xml_processado_path: string | null
}

interface OrderFiscalEmissionData {
  order_number: string | null
  payment_method_code: string | null
  payment_method_name: string | null
  payment_installments: number | null
  notes: string | null
  shipping_address: string | null
}

interface EmissionReservationResponse {
  row: EmissionReservationRow | null
  errorMessage: string | null
}

export async function emitNFe(
  orderId: string,
  payload: FiscalDocumentPayload,
  userId: string,
  modelo: '55' | '65' = '55'
): Promise<EmissionResult> {
  const supabase = createServiceRoleClient()
  const startTime = Date.now()

  try {
    const certData = await loadCertificate()
    const orderData = await loadOrderFiscalEmissionData(supabase, orderId)
    if (!orderData) {
      return createErrorResult('ORDER_NOT_FOUND', 'Pedido nao encontrado para emissao fiscal.')
    }

    const reservationResult = await reserveEmission(supabase, orderId, modelo)
    if (!reservationResult.row) {
      return createErrorResult(
        'SEQUENCE_ERROR',
        reservationResult.errorMessage || 'Falha ao reservar numero fiscal para o pedido.'
      )
    }
    const reservation = reservationResult.row

    if (!reservation.reserved) {
      return buildExistingEmissionResult(reservation)
    }

    if (!reservation.serie || !reservation.numero || !reservation.ambiente) {
      return createErrorResult('SEQUENCE_ERROR', 'Serie/numero fiscal nao retornados pela reserva de emissao.')
    }

    const { xml: infNFeXml, chaveAcesso, infNFeId } = mapFiscalPayloadToNFeXml(
      payload,
      reservation.numero,
      reservation.serie,
      modelo,
      {
        payment: {
          methodCode: orderData.payment_method_code,
          methodName: orderData.payment_method_name,
          installments: orderData.payment_installments,
          paidAmount: payload.totals.vNF,
        },
        freightMode: payload.context.transport.freight_mode,
        additionalInfo: buildAdditionalInfo(orderData, payload),
        orderNumber: orderData.order_number,
      }
    )

    const nfeXmlUnsigned = `<NFe xmlns="${NF_NAMESPACE}">${infNFeXml}</NFe>`

    let signedNFeXml: string
    try {
      signedNFeXml = signNFeXml(nfeXmlUnsigned, infNFeId, certData)
    } catch (signErr) {
      return createErrorResult(
        'SIGNATURE_REQUIRED',
        `Falha ao assinar o XML da NF-e: ${signErr instanceof Error ? signErr.message : String(signErr)}`
      )
    }

    const envelopeXml = buildNFeAuthorizationEnvelope(signedNFeXml)
    const ambiente = reservation.ambiente

    const emittedAt = new Date().toISOString()
    const snapshot = buildFiscalDocumentSnapshot({
      payload,
      order: {
        orderId,
        orderNumber: orderData.order_number,
        paymentMethodCode: orderData.payment_method_code,
        paymentMethodName: orderData.payment_method_name,
        paymentInstallments: orderData.payment_installments,
        notes: orderData.notes,
        shippingAddress: orderData.shipping_address,
        total: payload.totals.vNF,
      },
      document: {
        modelo,
        numero: reservation.numero,
        serie: reservation.serie,
        chaveAcesso,
        naturezaOperacao: payload.context.operation.natureza_operacao_descricao
          || payload.context.environment.natureza_operacao
          || 'VENDA DE MERCADORIA',
        ambiente,
        emittedAt,
        emittedBy: userId,
        protocolo: null,
        dataAutorizacao: null,
        codigoStatus: null,
        motivoStatus: null,
        digestValue: null,
      },
    })

    const { data: fiscalDoc, error: docError } = await supabase
      .from('fiscal_documents')
      .insert({
        order_id: orderId,
        document_model: modelo,
        document_status: 'processing',
        chave_acesso: chaveAcesso,
        numero_nf: reservation.numero,
        serie: reservation.serie,
        natureza_operacao: payload.context.operation.natureza_operacao_descricao
          || payload.context.environment.natureza_operacao
          || 'VENDA DE MERCADORIA',
        motor_version: payload.motor_version,
        fiscal_payload_jsonb: snapshot,
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
        emitted_at: emittedAt,
      })
      .select('id')
      .single()

    if (docError || !fiscalDoc) {
      if (isUniqueActiveEmissionViolation(docError?.message)) {
        const existing = await loadExistingActiveEmission(supabase, orderId, modelo)
        if (existing) return buildExistingEmissionResult(existing)
      }
      return createErrorResult('DOC_INSERT_FAILED', `Erro ao criar documento fiscal: ${docError?.message}`)
    }

    const xmlEnvioPath = `${orderId}/${fiscalDoc.id}/envio.xml`
    await supabase.storage
      .from('fiscal-xml')
      .upload(xmlEnvioPath, envelopeXml, { contentType: 'application/xml', upsert: true })

    await supabase
      .from('fiscal_documents')
      .update({ xml_envio_path: xmlEnvioPath })
      .eq('id', fiscalDoc.id)

    let finalResponseXml = ''
    let finalResult = null as ReturnType<typeof parseSefazAutorizacaoResponse> | null

    try {
      const tpAmb = ambiente === 'producao' ? 1 : 2
      const emitterUf = payload.context.emitter.uf
      const responseXmlParts: string[] = []

      const authorizationEndpoint = getSefazEndpoint(emitterUf, ambiente, 'NfeAutorizacao')
      const authorizationSoapResponse = await sendSoapRequest(authorizationEndpoint, envelopeXml, 'NFeAutorizacao4')
      responseXmlParts.push(`<!-- autorizacao -->\n${authorizationSoapResponse.body}`)

      finalResult = hydrateAuthorizationResult(
        parseSefazAutorizacaoResponse(authorizationSoapResponse.parsed),
        authorizationSoapResponse.body,
        authorizationSoapResponse.statusCode
      )

      if (PROCESSING_STATUS_CODES.has(finalResult.cStat) && finalResult.nRec) {
        const retEndpoint = getSefazEndpoint(emitterUf, ambiente, 'NfeRetAutorizacao')
        const receiptNumber = finalResult.nRec
        for (let attempt = 0; attempt < RET_AUTORIZATION_ATTEMPTS; attempt++) {
          await wait(RET_AUTORIZATION_DELAY_MS)
          const retXml = buildRetAutorizacaoRequestXml(tpAmb, receiptNumber)
          const retResponse = await sendSoapRequest(retEndpoint, retXml, 'NFeRetAutorizacao4')
          responseXmlParts.push(`<!-- ret-autorizacao tentativa ${attempt + 1} -->\n${retResponse.body}`)
          finalResult = hydrateAuthorizationResult(
            parseSefazRetAutorizacaoResponse(retResponse.parsed),
            retResponse.body,
            retResponse.statusCode
          )

          if (!PROCESSING_STATUS_CODES.has(finalResult.cStat) || finalResult.protNFe) {
            break
          }
        }
      }

      if ((!AUTHORIZED_STATUS_CODES.has(finalResult.cStat) || !finalResult.protNFe) && chaveAcesso) {
        const consultEndpoint = getSefazEndpoint(emitterUf, ambiente, 'NfeConsultaProtocolo')
        const consultXml = buildConsultaProtocoloRequestXml(tpAmb, chaveAcesso)
        const consultResponse = await sendSoapRequest(consultEndpoint, consultXml, 'NFeConsultaProtocolo4')
        responseXmlParts.push(`<!-- consulta-protocolo -->\n${consultResponse.body}`)

        const consultResult = hydrateAuthorizationResult(
          parseSefazConsultaProtocoloResponse(consultResponse.parsed),
          consultResponse.body,
          consultResponse.statusCode
        )
        if (consultResult.protNFe || AUTHORIZED_STATUS_CODES.has(consultResult.cStat)) {
          finalResult = consultResult
        }
      }

      finalResponseXml = responseXmlParts.join('\n\n')
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

      await logFiscalEvent(supabase, {
        fiscalDocumentId: fiscalDoc.id,
        orderId,
        chaveAcesso,
        numero: reservation.numero,
        serie: reservation.serie,
        modelo,
        ambiente,
        motorVersion: payload.motor_version,
        eventStatus: 'failure',
        responseSummary: { error: soapError },
        sefazStatusCode: null,
        sefazMessage: soapError,
        durationMs: Date.now() - startTime,
        executedBy: userId,
      })

      return createErrorResult('SEFAZ_TRANSPORT_ERROR', soapError)
    }

    const xmlRetornoPath = `${orderId}/${fiscalDoc.id}/retorno.xml`
    await supabase.storage
      .from('fiscal-xml')
      .upload(xmlRetornoPath, finalResponseXml, { contentType: 'application/xml', upsert: true })

    const isAuthorized = finalResult ? AUTHORIZED_STATUS_CODES.has(finalResult.cStat) : false
    const isStillProcessing = finalResult ? PROCESSING_STATUS_CODES.has(finalResult.cStat) : false

    let xmlProcessadoPath: string | null = null
    let xmlProcessado: string | null = null

    if (isAuthorized && finalResult?.protNFe) {
      xmlProcessado = buildNFeProcessedXml(signedNFeXml, finalResult.protNFe)
      xmlProcessadoPath = `${orderId}/${fiscalDoc.id}/processado.xml`

      await supabase.storage
        .from('fiscal-xml')
        .upload(xmlProcessadoPath, xmlProcessado, { contentType: 'application/xml', upsert: true })
    }

    snapshot.document.protocolo = finalResult?.nProt || null
    snapshot.document.dataAutorizacao = finalResult?.dhRecbto || null
    snapshot.document.codigoStatus = finalResult?.cStat || null
    snapshot.document.motivoStatus = finalResult?.xMotivo || null
    snapshot.document.digestValue = finalResult?.digVal || null

    await supabase
      .from('fiscal_documents')
      .update({
        document_status: isAuthorized ? 'authorized' : (isStillProcessing ? 'processing' : 'denied'),
        protocolo_autorizacao: finalResult?.nProt || null,
        data_autorizacao: finalResult?.dhRecbto || null,
        codigo_status: finalResult?.cStat || null,
        motivo_status: finalResult?.xMotivo || null,
        digest_value: finalResult?.digVal || null,
        fiscal_payload_jsonb: snapshot,
        xml_retorno_path: xmlRetornoPath,
        xml_processado_path: xmlProcessadoPath,
      })
      .eq('id', fiscalDoc.id)

    const eventStatus = isAuthorized ? 'success' : (isStillProcessing ? 'warning' : 'failure')
    await logFiscalEvent(supabase, {
      fiscalDocumentId: fiscalDoc.id,
      orderId,
      chaveAcesso,
      numero: reservation.numero,
      serie: reservation.serie,
      modelo,
      ambiente,
      motorVersion: payload.motor_version,
      eventStatus,
      responseSummary: finalResult,
      sefazStatusCode: finalResult?.cStat || null,
      sefazMessage: finalResult?.xMotivo || (isStillProcessing ? 'Lote recebido e ainda em processamento.' : 'Falha na autorizacao.'),
      durationMs: Date.now() - startTime,
      executedBy: userId,
    })

    await supabase
      .from('orders')
      .update({
        fiscal_ready: isAuthorized || payload.validation.is_valid,
        fiscal_snapshot: {
          last_document_id: fiscalDoc.id,
          last_chave_acesso: chaveAcesso,
          last_emitted_at: new Date().toISOString(),
          last_status: isAuthorized ? 'authorized' : (isStillProcessing ? 'processing' : 'denied'),
          last_codigo_status: finalResult?.cStat || null,
          last_motivo_status: finalResult?.xMotivo || null,
        },
      })
      .eq('id', orderId)

    return {
      success: isAuthorized,
      chaveAcesso,
      protocolo: finalResult?.nProt || null,
      dataAutorizacao: finalResult?.dhRecbto || null,
      codigoStatus: finalResult?.cStat || null,
      motivoStatus: finalResult?.xMotivo || (isStillProcessing ? 'Lote recebido pela SEFAZ e ainda em processamento.' : 'Falha na autorizacao.'),
      xmlProcessado,
      error: isAuthorized ? undefined : (isStillProcessing ? 'Emissao ainda em processamento na SEFAZ.' : finalResult?.xMotivo || 'Falha na emissao.'),
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    return createErrorResult('EMISSION_ERROR', error.message)
  }
}

async function loadOrderFiscalEmissionData(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orderId: string
): Promise<OrderFiscalEmissionData | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number, payment_method_code, payment_method_name, payment_installments, notes, shipping_address')
    .eq('id', orderId)
    .maybeSingle()

  if (error || !data) return null

  return {
    order_number: data.order_number ?? null,
    payment_method_code: data.payment_method_code ?? null,
    payment_method_name: data.payment_method_name ?? null,
    payment_installments: data.payment_installments ?? null,
    notes: data.notes ?? null,
    shipping_address: data.shipping_address ?? null,
  }
}

async function reserveEmission(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orderId: string,
  modelo: '55' | '65'
): Promise<EmissionReservationResponse> {
  const { data, error } = await supabase.rpc('reserve_fiscal_document_emission', {
    p_order_id: orderId,
    p_document_model: modelo,
  })

  if (error) {
    return {
      row: null,
      errorMessage: formatEmissionReservationError(error.message),
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    return {
      row: null,
      errorMessage: 'A reserva fiscal nao retornou serie e numero. Verifique o ambiente de emissao.',
    }
  }

  return {
    row: data[0] as EmissionReservationRow,
    errorMessage: null,
  }
}

async function loadExistingActiveEmission(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orderId: string,
  modelo: '55' | '65'
): Promise<EmissionReservationRow | null> {
  const { data, error } = await supabase
    .from('fiscal_documents')
    .select('id, document_status, chave_acesso, protocolo_autorizacao, data_autorizacao, codigo_status, motivo_status, xml_processado_path, ambiente, serie, numero_nf')
    .eq('order_id', orderId)
    .eq('document_model', modelo)
    .in('document_status', ['pending', 'processing', 'authorized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    reserved: false,
    environment_id: null,
    ambiente: data.ambiente,
    serie: data.serie,
    numero: data.numero_nf,
    existing_document_id: data.id,
    existing_document_status: data.document_status,
    existing_chave_acesso: data.chave_acesso,
    existing_protocolo: data.protocolo_autorizacao,
    existing_data_autorizacao: data.data_autorizacao,
    existing_codigo_status: data.codigo_status,
    existing_motivo_status: data.motivo_status,
    existing_xml_processado_path: data.xml_processado_path,
  }
}

async function logFiscalEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    fiscalDocumentId: string
    orderId: string
    chaveAcesso: string
    numero: number
    serie: string
    modelo: '55' | '65'
    ambiente: 'homologacao' | 'producao'
    motorVersion: string
    eventStatus: 'success' | 'failure' | 'warning'
    responseSummary: unknown
    sefazStatusCode: number | null
    sefazMessage: string | null
    durationMs: number
    executedBy: string
  }
) {
  await supabase
    .from('fiscal_events_log')
    .insert({
      fiscal_document_id: params.fiscalDocumentId,
      order_id: params.orderId,
      event_type: 'authorization',
      event_status: params.eventStatus,
      request_summary_jsonb: {
        chave_acesso: params.chaveAcesso,
        numero_nf: params.numero,
        serie: params.serie,
        modelo: params.modelo,
        ambiente: params.ambiente,
        motor_version: params.motorVersion,
      },
      response_summary_jsonb: params.responseSummary as Record<string, unknown> | null,
      sefaz_status_code: params.sefazStatusCode,
      sefaz_message: params.sefazMessage,
      duration_ms: params.durationMs,
      executed_by: params.executedBy,
    })
}

function buildExistingEmissionResult(existing: EmissionReservationRow): EmissionResult {
  const status = existing.existing_document_status || 'processing'
  const isAuthorized = status === 'authorized'

  return {
    success: isAuthorized,
    chaveAcesso: existing.existing_chave_acesso,
    protocolo: existing.existing_protocolo,
    dataAutorizacao: existing.existing_data_autorizacao,
    codigoStatus: existing.existing_codigo_status,
    motivoStatus: existing.existing_motivo_status || (
      isAuthorized
        ? 'Pedido ja possui documento fiscal autorizado.'
        : `Ja existe uma emissao fiscal em andamento para este pedido (${status}).`
    ),
    xmlProcessado: null,
    error: isAuthorized ? undefined : `Pedido ja possui uma emissao fiscal ativa com status "${status}".`,
  }
}

function buildAdditionalInfo(orderData: OrderFiscalEmissionData, payload: FiscalDocumentPayload): string | null {
  const paymentSummary = [
    orderData.payment_method_name,
    orderData.payment_installments && orderData.payment_installments > 1
      ? `${orderData.payment_installments} parcelas`
      : null,
  ].filter(Boolean).join(' - ')

  const parts = [
    orderData.order_number ? `Pedido: ${orderData.order_number}` : null,
    paymentSummary ? `Pagamento: ${paymentSummary}` : null,
    payload.totals.vTotTrib > 0 ? `Tributos aprox.: R$ ${payload.totals.vTotTrib.toFixed(2)}` : null,
    orderData.notes,
    orderData.shipping_address ? `Endereco de entrega: ${orderData.shipping_address}` : null,
  ]
    .map((value) => (value || '').trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.join(' | ') : null
}

function isUniqueActiveEmissionViolation(message: string | undefined): boolean {
  return (message || '').toLowerCase().includes('uq_fiscal_documents_active_order_model')
}

function formatEmissionReservationError(message: string | undefined): string {
  const normalized = (message || '').toLowerCase()

  if (
    normalized.includes('reserve_fiscal_document_emission') &&
    normalized.includes('does not exist')
  ) {
    return 'A funcao de reserva fiscal nao esta disponivel no banco. Aplique as migrations fiscais mais recentes, incluindo a correcao da reserva de numeracao.'
  }

  if (normalized.includes('serie/numero nf-e nao configurados')) {
    return 'Serie ou proximo numero da NF-e nao configurados no ambiente fiscal.'
  }

  if (normalized.includes('serie/numero nfc-e nao configurados')) {
    return 'Serie ou proximo numero da NFC-e nao configurados no ambiente fiscal.'
  }

  if (normalized.includes('ambiente fiscal nao configurado')) {
    return 'Ambiente fiscal da empresa nao foi configurado.'
  }

  if (
    normalized.includes('serie_nfe') ||
    normalized.includes('proximo_numero_nfce') ||
    normalized.includes('company_fiscal_environment')
  ) {
    return 'A estrutura de numeracao fiscal do banco esta desatualizada. Aplique a migration de correcao da reserva fiscal.'
  }

  return message || 'Falha ao reservar numero fiscal para o pedido.'
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hydrateAuthorizationResult(
  result: ParsedAuthorizationResponse,
  rawBody: string,
  statusCode: number
): ParsedAuthorizationResponse {
  if (result.xMotivo?.trim()) return result

  const fallbackMessage = extractSefazMessageFromBody(rawBody)
    || (statusCode >= 400 ? `Resposta SOAP HTTP ${statusCode} sem motivo legivel.` : null)
    || 'Resposta da SEFAZ sem motivo legivel.'

  return {
    ...result,
    xMotivo: fallbackMessage,
  }
}

function extractSefazMessageFromBody(rawBody: string): string | null {
  const patterns = [
    /<xMotivo>\s*([\s\S]*?)\s*<\/xMotivo>/i,
    /<faultstring>\s*([\s\S]*?)\s*<\/faultstring>/i,
    /<Text\b[^>]*>\s*([\s\S]*?)\s*<\/Text>/i,
    /<reason>\s*([\s\S]*?)\s*<\/reason>/i,
  ]

  for (const pattern of patterns) {
    const match = rawBody.match(pattern)
    const normalized = normalizeSoapMessage(match?.[1])
    if (normalized) return normalized
  }

  return null
}

function normalizeSoapMessage(value: string | undefined): string | null {
  if (!value) return null

  const normalized = value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized === '0') return null
  return normalized
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
