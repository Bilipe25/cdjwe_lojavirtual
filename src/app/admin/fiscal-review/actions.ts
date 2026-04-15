'use server'

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  calculateOrderFiscal,
  recalculateOrderFiscal,
  validateOrderForEmission,
  persistOrderFiscalSnapshot,
} from '@/lib/fiscal/motor'
import {
  emitNFe,
  cancelNFe,
  sendCartaCorrecao,
  consultNFeStatus,
  inutilizeNFeRange,
  getSefazEndpoint,
  sendSoapRequest,
  generateDanfePdf,
} from '@/lib/fiscal/transport'
import type { FiscalDocumentPayload } from '@/lib/fiscal/motor'
import type {
  FiscalDocumentDetail,
  FiscalDocumentEventItem,
  FiscalDocumentListItem,
  FiscalDocumentsIndexQuery,
  FiscalDocumentsIndexResult,
} from './types'

export async function calculateOrderFiscalAction(orderId: string) {
  const result = await calculateOrderFiscal(orderId)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    data: serializePayload(result.data),
  }
}

export async function recalculateOrderFiscalAction(orderId: string) {
  const result = await recalculateOrderFiscal(orderId)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    data: serializePayload(result.data),
  }
}

export async function validateOrderFiscalAction(orderId: string) {
  const result = await validateOrderForEmission(orderId)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, data: result.data }
}

export async function emitNFeAction(orderId: string, modelo: '55' | '65' = '55') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuario nao autenticado.' } }
  }

  const validation = await validateOrderForEmission(orderId)
  if (!validation.success || !validation.data.is_valid) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Pedido nao passou na validacao fiscal.',
        details: validation.success ? validation.data : null,
      },
    }
  }

  const calcResult = await calculateOrderFiscal(orderId)
  if (!calcResult.success) {
    return { success: false, error: calcResult.error }
  }

  const persistResult = await persistOrderFiscalSnapshot(orderId, calcResult.data)
  if (!persistResult.success) {
    return { success: false, error: persistResult.error }
  }

  const emitResult = await emitNFe(orderId, calcResult.data, user.id, modelo)

  return {
    success: emitResult.success,
    data: emitResult.success ? emitResult : null,
    error: emitResult.success ? null : { code: 'EMISSION_FAILED', message: emitResult.error || 'Falha na emissao.' },
  }
}

export async function cancelNFeAction(fiscalDocumentId: string, justificativa: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuario nao autenticado.' } }
  }

  const result = await cancelNFe(fiscalDocumentId, justificativa, user.id)

  return {
    success: result.success,
    data: result.success ? result : null,
    error: result.success ? null : { code: 'CANCEL_FAILED', message: result.error || 'Falha no cancelamento.' },
  }
}

export async function sendCartaCorrecaoAction(fiscalDocumentId: string, correcao: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuario nao autenticado.' } }
  }

  const result = await sendCartaCorrecao(fiscalDocumentId, correcao, user.id)

  return {
    success: result.success,
    data: result.success ? result : null,
    error: result.success ? null : { code: 'CORRECTION_FAILED', message: result.error || 'Falha na carta de correcao.' },
  }
}

export async function consultFiscalDocumentAction(fiscalDocumentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuario nao autenticado.' } }
  }

  const result = await consultNFeStatus(fiscalDocumentId, user.id)

  return {
    success: result.success,
    data: result.success ? result : null,
    error: result.success ? null : { code: 'CONSULT_FAILED', message: result.error || 'Falha na consulta da NF-e.' },
  }
}

export async function inutilizeFiscalRangeAction(params: {
  modelo: '55' | '65'
  serie: string
  numeroInicial: number
  numeroFinal: number
  justificativa: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuario nao autenticado.' } }
  }

  const result = await inutilizeNFeRange({
    ...params,
    userId: user.id,
  })

  return {
    success: result.success,
    data: result.success ? result : null,
    error: result.success ? null : { code: 'INUTILIZATION_FAILED', message: result.error || 'Falha na inutilizacao da faixa fiscal.' },
  }
}

export async function checkSefazStatusAction() {
  try {
    const serviceRole = createServiceRoleClient()

    const { data: profile } = await serviceRole
      .from('company_fiscal_profile')
      .select('fiscal_state')
      .limit(1)
      .maybeSingle()

    const { data: envConfig } = await serviceRole
      .from('company_fiscal_environment')
      .select('ambiente')
      .limit(1)
      .maybeSingle()

    const uf = profile?.fiscal_state?.toUpperCase() || 'SP'
    const ambiente = envConfig?.ambiente === 'producao' ? 'producao' as const : 'homologacao' as const
    const tpAmb = ambiente === 'producao' ? 1 : 2

    const statusXml = [
      '<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
      `<tpAmb>${tpAmb}</tpAmb>`,
      '<cUF>35</cUF>',
      '<xServ>STATUS</xServ>',
      '</consStatServ>',
    ].join('')

    const endpoint = getSefazEndpoint(uf, ambiente, 'NfeStatusServico')
    const response = await sendSoapRequest(endpoint, statusXml, 'NFeStatusServico4')

    return {
      success: true,
      data: {
        statusCode: response.statusCode,
        parsed: response.parsed,
        ambiente,
        uf,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: { code: 'STATUS_CHECK_FAILED', message: err instanceof Error ? err.message : String(err) },
    }
  }
}

export async function generateDanfeAction(fiscalDocumentId: string) {
  try {
    const result = await generateDanfePdf(fiscalDocumentId)

    if (!result.success) {
      return { success: false, error: { code: 'DANFE_FAILED', message: result.error || 'Falha na geracao do DANFE.' } }
    }

    return {
      success: true,
      data: { storagePath: result.storagePath },
    }
  } catch (err) {
    return {
      success: false,
      error: { code: 'DANFE_ERROR', message: err instanceof Error ? err.message : String(err) },
    }
  }
}

export async function getOrderFiscalDetailsAction(orderId: string) {
  const supabase = createServiceRoleClient()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, total, subtotal, discount_amount,
      coupon_discount_amount, created_at,
      fiscal_total_produtos, fiscal_total_icms, fiscal_total_st,
      fiscal_total_fcp, fiscal_total_pis, fiscal_total_cofins,
      fiscal_total_ipi, fiscal_total_tributos, fiscal_total_desconto,
      fiscal_total_frete, fiscal_calculated_at, fiscal_snapshot,
      fiscal_ready,
      store:stores!orders_store_id_fkey(id, name)
    `)
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    return { success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Pedido nao encontrado.' } }
  }

  const { data: items } = await supabase
    .from('order_items')
    .select(`
      id, product_name, quantity, unit_price, subtotal,
      fiscal_cfop, fiscal_ncm, fiscal_cest, fiscal_origin_code,
      fiscal_unit_value, fiscal_total_value, fiscal_discount_value, fiscal_freight_value,
      icms_cst, icms_base, icms_rate, icms_value,
      icms_st_base, icms_st_rate, icms_st_value, icms_st_mva,
      fcp_base, fcp_rate, fcp_value,
      pis_cst, pis_base, pis_rate, pis_value,
      cofins_cst, cofins_base, cofins_rate, cofins_value,
      ipi_cst, ipi_base, ipi_rate, ipi_value,
      total_tributos, tax_profile_id
    `)
    .eq('order_id', orderId)
    .order('created_at')

  const { data: documents } = await supabase
    .from('fiscal_documents')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  const { data: events } = await supabase
    .from('fiscal_events_log')
    .select('*')
    .eq('order_id', orderId)
    .order('executed_at', { ascending: false })
    .limit(20)

  return {
    success: true,
    data: {
      order,
      items: items || [],
      documents: documents || [],
      events: events || [],
    },
  }
}

export async function getFiscalDocumentsAction(orderId: string) {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('fiscal_documents')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: { code: 'QUERY_ERROR', message: error.message } }
  }

  return { success: true, data: data || [] }
}

export async function getFiscalDocumentsIndexAction(
  query: FiscalDocumentsIndexQuery = {}
): Promise<{ success: true; data: FiscalDocumentsIndexResult } | { success: false; error: { code: string; message: string } }> {
  const supabase = createServiceRoleClient()

  const normalized = normalizeIndexQuery(query)

  const { data: rawDocuments, error } = await supabase
    .from('fiscal_documents')
    .select(`
      id,
      order_id,
      document_model,
      document_status,
      numero_nf,
      serie,
      chave_acesso,
      protocolo_autorizacao,
      ambiente,
      valor_total_nota,
      emitted_by,
      emitted_at,
      cancelled_at,
      created_at,
      updated_at,
      xml_envio_path,
      xml_retorno_path,
      xml_processado_path,
      danfe_path
    `)
    .in('document_status', ['authorized', 'cancelled'])

  if (error) {
    return { success: false, error: { code: 'QUERY_ERROR', message: error.message } }
  }

  const documents = (rawDocuments || []) as Array<Record<string, unknown>>
  const orderIds = Array.from(new Set(documents.map((item) => String(item.order_id || '')).filter(Boolean)))
  const emittedByIds = Array.from(new Set(documents.map((item) => String(item.emitted_by || '')).filter(Boolean)))

  const [{ data: ordersData }, { data: emittedProfiles }] = await Promise.all([
    orderIds.length > 0
      ? supabase
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          store:stores!orders_store_id_fkey(id, name)
        `)
        .in('id', orderIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    emittedByIds.length > 0
      ? supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', emittedByIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  const ordersById = new Map<string, Record<string, unknown>>()
  for (const order of ((ordersData || []) as Array<Record<string, unknown>>)) {
    ordersById.set(String(order.id), order)
  }

  const profilesById = new Map<string, string>()
  for (const profile of ((emittedProfiles || []) as Array<Record<string, unknown>>)) {
    profilesById.set(String(profile.id), String(profile.full_name || 'Nao informado'))
  }

  const allItems: FiscalDocumentListItem[] = documents.map((item) => {
    const order = ordersById.get(String(item.order_id))
    const rawStore = order?.store
    const store = Array.isArray(rawStore) ? rawStore[0] : rawStore

    return {
      id: String(item.id),
      orderId: String(item.order_id),
      orderNumber: order ? stringifyNullable(order.order_number) : null,
      orderStatus: order ? stringifyNullable(order.status) : null,
      storeName: store && typeof store === 'object' ? String((store as Record<string, unknown>).name || 'Loja nao informada') : 'Loja nao informada',
      documentModel: String(item.document_model || '55') as '55' | '65',
      documentStatus: String(item.document_status || 'authorized') as FiscalDocumentListItem['documentStatus'],
      numeroNf: Number(item.numero_nf || 0),
      serie: String(item.serie || '0'),
      chaveAcesso: stringifyNullable(item.chave_acesso),
      protocoloAutorizacao: stringifyNullable(item.protocolo_autorizacao),
      ambiente: item.ambiente === 'producao' ? 'producao' : 'homologacao',
      valorTotalNota: numberOrNull(item.valor_total_nota),
      emittedAt: stringifyNullable(item.emitted_at),
      cancelledAt: stringifyNullable(item.cancelled_at),
      createdAt: String(item.created_at || ''),
      updatedAt: String(item.updated_at || ''),
      emittedByName: stringifyNullable(item.emitted_by) ? profilesById.get(String(item.emitted_by)) || 'Nao informado' : null,
      xmlEnvioPath: stringifyNullable(item.xml_envio_path),
      xmlRetornoPath: stringifyNullable(item.xml_retorno_path),
      xmlProcessadoPath: stringifyNullable(item.xml_processado_path),
      danfePath: stringifyNullable(item.danfe_path),
    }
  })

  const summary = {
    totalDocuments: allItems.length,
    authorizedCount: allItems.filter((item) => item.documentStatus === 'authorized').length,
    cancelledCount: allItems.filter((item) => item.documentStatus === 'cancelled').length,
    productionCount: allItems.filter((item) => item.ambiente === 'producao').length,
  }

  const filteredItems = allItems
    .filter((item) => matchesStatus(item, normalized.status))
    .filter((item) => matchesEnvironment(item, normalized.ambiente))
    .filter((item) => matchesModel(item, normalized.model))
    .filter((item) => matchesPeriod(item, normalized.period))
    .filter((item) => matchesSearch(item, normalized.search))

  const sortedItems = [...filteredItems].sort((left, right) => compareDocuments(left, right, normalized.sortBy, normalized.sortDir))
  const total = sortedItems.length
  const pageStart = (normalized.page - 1) * normalized.pageSize
  const pagedItems = sortedItems.slice(pageStart, pageStart + normalized.pageSize)

  return {
    success: true,
    data: {
      items: pagedItems,
      total,
      page: normalized.page,
      pageSize: normalized.pageSize,
      summary,
    },
  }
}

export async function getFiscalDocumentDetailAction(
  documentId: string
): Promise<{ success: true; data: FiscalDocumentDetail } | { success: false; error: { code: string; message: string } }> {
  const supabase = createServiceRoleClient()

  const { data: document, error } = await supabase
    .from('fiscal_documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (error || !document) {
    return { success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: 'Nota fiscal nao encontrada.' } }
  }

  const [{ data: orderData }, { data: eventData }, { data: relatedProfiles }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total,
        created_at,
        fiscal_calculated_at,
        store:stores!orders_store_id_fkey(id, name)
      `)
      .eq('id', document.order_id)
      .maybeSingle(),
    supabase
      .from('fiscal_events_log')
      .select('id, event_type, event_status, sefaz_message, error_message, duration_ms, executed_at')
      .eq('fiscal_document_id', documentId)
      .order('executed_at', { ascending: false })
      .limit(50),
    supabase
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        [document.emitted_by, document.cancelled_by].filter(Boolean) as string[]
      ),
  ])

  const rawStore = orderData?.store
  const store = Array.isArray(rawStore) ? rawStore[0] : rawStore
  const profileNameById = new Map<string, string>()
  for (const profile of ((relatedProfiles || []) as Array<Record<string, unknown>>)) {
    profileNameById.set(String(profile.id), String(profile.full_name || 'Nao informado'))
  }

  const detail: FiscalDocumentDetail = {
    document: {
      id: String(document.id),
      orderId: String(document.order_id),
      orderNumber: orderData ? stringifyNullable(orderData.order_number) : null,
      orderStatus: orderData ? stringifyNullable(orderData.status) : null,
      storeName: store && typeof store === 'object' ? String((store as Record<string, unknown>).name || 'Loja nao informada') : 'Loja nao informada',
      documentModel: document.document_model === '65' ? '65' : '55',
      documentStatus: document.document_status as FiscalDocumentDetail['document']['documentStatus'],
      numeroNf: Number(document.numero_nf || 0),
      serie: String(document.serie || '0'),
      chaveAcesso: stringifyNullable(document.chave_acesso),
      protocoloAutorizacao: stringifyNullable(document.protocolo_autorizacao),
      ambiente: document.ambiente === 'producao' ? 'producao' : 'homologacao',
      valorTotalNota: numberOrNull(document.valor_total_nota),
      emittedAt: stringifyNullable(document.emitted_at),
      cancelledAt: stringifyNullable(document.cancelled_at),
      createdAt: String(document.created_at || ''),
      updatedAt: String(document.updated_at || ''),
      emittedByName: document.emitted_by ? profileNameById.get(String(document.emitted_by)) || 'Nao informado' : null,
      xmlEnvioPath: stringifyNullable(document.xml_envio_path),
      xmlRetornoPath: stringifyNullable(document.xml_retorno_path),
      xmlProcessadoPath: stringifyNullable(document.xml_processado_path),
      danfePath: stringifyNullable(document.danfe_path),
      naturezaOperacao: stringifyNullable(document.natureza_operacao),
      dataAutorizacao: stringifyNullable(document.data_autorizacao),
      codigoStatus: numberOrNull(document.codigo_status),
      motivoStatus: stringifyNullable(document.motivo_status),
      digestValue: stringifyNullable(document.digest_value),
      motorVersion: stringifyNullable(document.motor_version),
      correctionCount: Number(document.correction_count || 0),
      cancellationProtocol: stringifyNullable(document.cancellation_protocol),
      cancellationJustificativa: stringifyNullable(document.cancellation_justificativa),
      cancelledByName: document.cancelled_by ? profileNameById.get(String(document.cancelled_by)) || 'Nao informado' : null,
      snapshot: serializeUnknown(document.fiscal_payload_jsonb),
    },
    order: orderData ? {
      id: String(orderData.id),
      orderNumber: stringifyNullable(orderData.order_number),
      status: stringifyNullable(orderData.status),
      total: numberOrNull(orderData.total),
      createdAt: stringifyNullable(orderData.created_at),
      fiscalCalculatedAt: stringifyNullable(orderData.fiscal_calculated_at),
      storeName: store && typeof store === 'object' ? String((store as Record<string, unknown>).name || 'Loja nao informada') : 'Loja nao informada',
    } : null,
    events: ((eventData || []) as Array<Record<string, unknown>>).map((event): FiscalDocumentEventItem => ({
      id: String(event.id),
      eventType: stringifyNullable(event.event_type),
      eventStatus: stringifyNullable(event.event_status),
      sefazMessage: stringifyNullable(event.sefaz_message),
      errorMessage: stringifyNullable(event.error_message),
      durationMs: numberOrNull(event.duration_ms),
      executedAt: stringifyNullable(event.executed_at),
    })),
  }

  return { success: true, data: detail }
}

export async function getFiscalDocumentAssetUrlAction(
  fiscalDocumentId: string,
  assetType: 'xml_envio' | 'xml_retorno' | 'xml_processado'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuario nao autenticado.' } }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return { success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } }
  }

  const serviceRole = createServiceRoleClient()
  const { data: document, error } = await serviceRole
    .from('fiscal_documents')
    .select('xml_envio_path, xml_retorno_path, xml_processado_path')
    .eq('id', fiscalDocumentId)
    .single()

  if (error || !document) {
    return { success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: 'Documento fiscal nao encontrado.' } }
  }

  const pathByType = {
    xml_envio: document.xml_envio_path,
    xml_retorno: document.xml_retorno_path,
    xml_processado: document.xml_processado_path,
  } as const

  const targetPath = pathByType[assetType]
  if (!targetPath) {
    return { success: false, error: { code: 'ASSET_NOT_FOUND', message: 'Arquivo fiscal indisponivel.' } }
  }

  const { data: signedUrl, error: signedUrlError } = await serviceRole.storage
    .from('fiscal-xml')
    .createSignedUrl(targetPath, 60 * 5)

  if (signedUrlError || !signedUrl?.signedUrl) {
    return { success: false, error: { code: 'SIGNED_URL_ERROR', message: signedUrlError?.message || 'Nao foi possivel gerar o link do arquivo.' } }
  }

  return {
    success: true,
    data: {
      signedUrl: signedUrl.signedUrl,
    },
  }
}

function serializePayload(payload: FiscalDocumentPayload) {
  return JSON.parse(JSON.stringify(payload))
}

function serializeUnknown(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function stringifyNullable(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeIndexQuery(query: FiscalDocumentsIndexQuery) {
  return {
    search: (query.search || '').trim(),
    status: query.status || 'all',
    ambiente: query.ambiente || 'all',
    model: query.model || 'all',
    period: query.period || 'all',
    page: Math.max(1, Number(query.page || 1)),
    pageSize: Math.min(50, Math.max(10, Number(query.pageSize || 12))),
    sortBy: query.sortBy || 'emitted_at',
    sortDir: query.sortDir === 'asc' ? 'asc' : 'desc',
  } satisfies Required<FiscalDocumentsIndexQuery>
}

function matchesStatus(item: FiscalDocumentListItem, status: FiscalDocumentsIndexQuery['status']) {
  return status === 'all' ? true : item.documentStatus === status
}

function matchesEnvironment(item: FiscalDocumentListItem, ambiente: FiscalDocumentsIndexQuery['ambiente']) {
  return ambiente === 'all' ? true : item.ambiente === ambiente
}

function matchesModel(item: FiscalDocumentListItem, model: FiscalDocumentsIndexQuery['model']) {
  return model === 'all' ? true : item.documentModel === model
}

function matchesPeriod(item: FiscalDocumentListItem, period: FiscalDocumentsIndexQuery['period']) {
  if (!period || period === 'all') return true
  const baseDate = new Date(item.emittedAt || item.createdAt).getTime()
  if (!Number.isFinite(baseDate)) return false

  const now = Date.now()
  const diffDays = (now - baseDate) / (1000 * 60 * 60 * 24)
  if (period === '7d') return diffDays <= 7
  if (period === '30d') return diffDays <= 30
  if (period === '90d') return diffDays <= 90
  return true
}

function matchesSearch(item: FiscalDocumentListItem, search: string) {
  if (!search) return true
  const normalized = normalizeText(search)
  const haystack = normalizeText([
    item.numeroNf,
    item.serie,
    item.chaveAcesso,
    item.protocoloAutorizacao,
    item.orderNumber,
    item.orderStatus,
    item.storeName,
    item.emittedByName,
  ].filter(Boolean).join(' '))

  return haystack.includes(normalized)
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function compareDocuments(
  left: FiscalDocumentListItem,
  right: FiscalDocumentListItem,
  sortBy: FiscalDocumentsIndexQuery['sortBy'],
  sortDir: FiscalDocumentsIndexQuery['sortDir']
) {
  const direction = sortDir === 'asc' ? 1 : -1
  const leftValue = sortableValue(left, sortBy)
  const rightValue = sortableValue(right, sortBy)

  if (leftValue < rightValue) return -1 * direction
  if (leftValue > rightValue) return 1 * direction
  return 0
}

function sortableValue(item: FiscalDocumentListItem, sortBy: FiscalDocumentsIndexQuery['sortBy']) {
  if (sortBy === 'numero_nf') return item.numeroNf
  if (sortBy === 'valor_total_nota') return item.valorTotalNota || 0
  if (sortBy === 'created_at') return new Date(item.createdAt).getTime()
  return new Date(item.emittedAt || item.createdAt).getTime()
}
