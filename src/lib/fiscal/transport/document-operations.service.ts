import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  buildConsultaProtocoloRequestXml,
  buildInutilizacaoRequestXml,
  getSefazEndpoint,
  parseSefazConsultaProtocoloResponse,
  parseSefazInutilizacaoResponse,
  sendSoapRequest,
} from './sefaz-client.service'
import { signInutilizacaoXml, loadCertificate } from './sign-xml.service'
import { parseFiscalDocumentSnapshot } from './fiscal-document-snapshot'
import type { ConsultResult, InutilizationResult } from './types'
import { UF_CODES } from './types'

type Ambiente = 'homologacao' | 'producao'

export async function consultNFeStatus(
  fiscalDocumentId: string,
  userId: string
): Promise<ConsultResult> {
  const supabase = createServiceRoleClient()
  const startTime = Date.now()

  try {
    const { data: doc, error } = await supabase
      .from('fiscal_documents')
      .select('*')
      .eq('id', fiscalDocumentId)
      .single()

    if (error || !doc) {
      return createConsultError('DOC_NOT_FOUND', 'Documento fiscal nao encontrado.')
    }

    if (!doc.chave_acesso) {
      return createConsultError('DOC_NO_CHAVE', 'Documento sem chave de acesso para consulta.')
    }

    const snapshot = parseFiscalDocumentSnapshot(doc.fiscal_payload_jsonb)
    const emitterUf = snapshot?.context.emitter.uf?.toUpperCase() || await loadEmitterUf()
    const ambiente = normalizeAmbiente(doc.ambiente)
    const tpAmb = ambiente === 'producao' ? 1 : 2

    const endpoint = getSefazEndpoint(
      emitterUf,
      ambiente,
      'NfeConsultaProtocolo',
      snapshot?.context.environment.tipo_emissao || 'normal'
    )
    const requestXml = buildConsultaProtocoloRequestXml(tpAmb, doc.chave_acesso)
    const response = await sendSoapRequest(endpoint, requestXml, 'NFeConsultaProtocolo4')
    const sefazResult = parseSefazConsultaProtocoloResponse(response.parsed)
    const duration = Date.now() - startTime

    const nextStatus = mapConsultDocumentStatus(sefazResult.cStat, doc.document_status)

    await supabase
      .from('fiscal_documents')
      .update({
        document_status: nextStatus,
        protocolo_autorizacao: sefazResult.nProt || doc.protocolo_autorizacao,
        data_autorizacao: sefazResult.dhRecbto || doc.data_autorizacao,
        codigo_status: sefazResult.cStat,
        motivo_status: sefazResult.xMotivo,
        digest_value: sefazResult.digVal || doc.digest_value,
      })
      .eq('id', fiscalDocumentId)

    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: fiscalDocumentId,
        order_id: doc.order_id,
        event_type: 'consultation',
        event_status: mapEventStatusFromCode(sefazResult.cStat),
        request_summary_jsonb: {
          chave_acesso: doc.chave_acesso,
          ambiente,
        },
        response_summary_jsonb: sefazResult,
        sefaz_status_code: sefazResult.cStat,
        sefaz_message: sefazResult.xMotivo,
        error_message: isSuccessfulConsultCode(sefazResult.cStat) ? null : sefazResult.xMotivo,
        duration_ms: duration,
        executed_by: userId,
      })

    return {
      success: isSuccessfulConsultCode(sefazResult.cStat),
      status: nextStatus,
      protocolo: sefazResult.nProt,
      dataRecebimento: sefazResult.dhRecbto,
      codigoStatus: sefazResult.cStat,
      motivoStatus: sefazResult.xMotivo,
      error: isSuccessfulConsultCode(sefazResult.cStat) ? undefined : sefazResult.xMotivo,
    }
  } catch (err) {
    return createConsultError('CONSULT_ERROR', err instanceof Error ? err.message : String(err))
  }
}

export async function inutilizeNFeRange(params: {
  modelo: '55' | '65'
  serie: string
  numeroInicial: number
  numeroFinal: number
  justificativa: string
  userId: string
}): Promise<InutilizationResult> {
  const supabase = createServiceRoleClient()
  const startTime = Date.now()

  try {
    if (!params.justificativa || params.justificativa.trim().length < 15) {
      return createInutilizationError('JUSTIFICATIVA_CURTA', 'Justificativa deve ter no minimo 15 caracteres.', params)
    }

    if (params.numeroFinal < params.numeroInicial) {
      return createInutilizationError('FAIXA_INVALIDA', 'Numero final deve ser maior ou igual ao numero inicial.', params)
    }

    const [profile, environment] = await Promise.all([
      loadCompanyProfile(),
      loadCompanyEnvironment(),
    ])

    if (!profile) {
      return createInutilizationError('PROFILE_NOT_FOUND', 'Perfil fiscal da empresa nao encontrado.', params)
    }

    if (!environment) {
      return createInutilizationError('ENVIRONMENT_NOT_FOUND', 'Ambiente fiscal da empresa nao encontrado.', params)
    }

    const certData = await loadCertificate()

    const ambiente = normalizeAmbiente(environment.ambiente)
    const tpAmb = ambiente === 'producao' ? 1 : 2
    const cnpj = String(profile.cnpj || '').replace(/\D/g, '')
    const cUF = UF_CODES[String(profile.fiscal_state || '').toUpperCase()] || 35
    const ano = new Date().getFullYear().toString().slice(-2)

    const { xml, infInutId } = buildInutilizacaoRequestXml({
      tpAmb,
      cUF,
      ano,
      cnpj,
      modelo: params.modelo,
      serie: params.serie,
      numeroInicial: params.numeroInicial,
      numeroFinal: params.numeroFinal,
      justificativa: params.justificativa.trim(),
    })

    const signedXml = signInutilizacaoXml(xml, infInutId, certData)
    const endpoint = getSefazEndpoint(
      String(profile.fiscal_state || 'SP').toUpperCase(),
      ambiente,
      'NfeInutilizacao',
      environment.tipo_emissao || 'normal'
    )
    const response = await sendSoapRequest(endpoint, signedXml, 'NFeInutilizacao4')
    const sefazResult = parseSefazInutilizacaoResponse(response.parsed)
    const duration = Date.now() - startTime

    await supabase
      .from('fiscal_events_log')
      .insert({
        fiscal_document_id: null,
        order_id: null,
        event_type: 'inutilization',
        event_status: mapEventStatusFromCode(sefazResult.cStat),
        request_summary_jsonb: {
          modelo: params.modelo,
          serie: params.serie,
          numero_inicial: params.numeroInicial,
          numero_final: params.numeroFinal,
          justificativa: params.justificativa.trim(),
          ambiente,
        },
        response_summary_jsonb: sefazResult,
        sefaz_status_code: sefazResult.cStat,
        sefaz_message: sefazResult.xMotivo,
        error_message: sefazResult.cStat === 102 ? null : sefazResult.xMotivo,
        duration_ms: duration,
        executed_by: params.userId,
      })

    if (sefazResult.cStat === 102) {
      const nextNumberField = params.modelo === '55' ? 'proximo_numero_nfe' : 'proximo_numero_nfce'
      const currentValue = Number((environment as Record<string, unknown>)[nextNumberField] || 0)
      if (currentValue >= params.numeroInicial && currentValue <= params.numeroFinal) {
        await supabase
          .from('company_fiscal_environment')
          .update({ [nextNumberField]: params.numeroFinal + 1 })
          .eq('id', (environment as Record<string, unknown>).id)
      }
    }

    return {
      success: sefazResult.cStat === 102,
      protocolo: sefazResult.nProt,
      dataRecebimento: sefazResult.dhRecbto,
      codigoStatus: sefazResult.cStat,
      motivoStatus: sefazResult.xMotivo,
      faixaInicial: params.numeroInicial,
      faixaFinal: params.numeroFinal,
      serie: params.serie,
      justificativa: params.justificativa.trim(),
      error: sefazResult.cStat === 102 ? undefined : sefazResult.xMotivo,
    }
  } catch (err) {
    return createInutilizationError('INUTILIZATION_ERROR', err instanceof Error ? err.message : String(err), params)
  }
}

async function loadEmitterUf(): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('company_fiscal_profile')
    .select('fiscal_state')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return String(data?.fiscal_state || 'SP').toUpperCase()
}

async function loadCompanyProfile() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('company_fiscal_profile')
    .select('cnpj, fiscal_state')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

async function loadCompanyEnvironment() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('company_fiscal_environment')
    .select('id, ambiente, tipo_emissao, proximo_numero_nfe, proximo_numero_nfce')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

function normalizeAmbiente(value: unknown): Ambiente {
  return value === 'producao' ? 'producao' : 'homologacao'
}

function isSuccessfulConsultCode(code: number): boolean {
  return code === 100 || code === 101 || code === 135 || code === 155
}

function mapConsultDocumentStatus(code: number, currentStatus: string | null): string {
  if (code === 100) return 'authorized'
  if (code === 101 || code === 135 || code === 155) return 'cancelled'
  if (code === 204 || code === 217) return 'denied'
  return currentStatus || 'processing'
}

function mapEventStatusFromCode(code: number): 'success' | 'warning' | 'failure' {
  if ([100, 101, 102, 135, 155].includes(code)) return 'success'
  if ([103, 105].includes(code)) return 'warning'
  return 'failure'
}

function createConsultError(code: string, message: string): ConsultResult {
  return {
    success: false,
    status: 'error',
    protocolo: null,
    dataRecebimento: null,
    codigoStatus: null,
    motivoStatus: message,
    error: `${code}: ${message}`,
  }
}

function createInutilizationError(
  code: string,
  message: string,
  params: { numeroInicial: number; numeroFinal: number; serie: string; justificativa: string }
): InutilizationResult {
  return {
    success: false,
    protocolo: null,
    dataRecebimento: null,
    codigoStatus: null,
    motivoStatus: message,
    faixaInicial: params.numeroInicial,
    faixaFinal: params.numeroFinal,
    serie: params.serie,
    justificativa: params.justificativa,
    error: `${code}: ${message}`,
  }
}
