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
import { emitNFe, cancelNFe, sendCartaCorrecao, getSefazEndpoint, sendSoapRequest, generateDanfePdf } from '@/lib/fiscal/transport'
import type { FiscalDocumentPayload, ValidationResult } from '@/lib/fiscal/motor'

// ─── Calculate (dry-run) ─────────────────────────

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

// ─── Recalculate + Persist ──────────────────────

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

// ─── Validate ───────────────────────────────────

export async function validateOrderFiscalAction(orderId: string) {
  const result = await validateOrderForEmission(orderId)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, data: result.data }
}

// ─── Emit NF-e ──────────────────────────────────

export async function emitNFeAction(orderId: string, modelo: '55' | '65' = '55') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuário não autenticado.' } }
  }

  // Validate first
  const validation = await validateOrderForEmission(orderId)
  if (!validation.success || !validation.data.is_valid) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Pedido não passou na validação fiscal.',
        details: validation.success ? validation.data : null,
      },
    }
  }

  // Calculate
  const calcResult = await calculateOrderFiscal(orderId)
  if (!calcResult.success) {
    return { success: false, error: calcResult.error }
  }

  // Persist snapshot
  await persistOrderFiscalSnapshot(orderId, calcResult.data)

  // Emit
  const emitResult = await emitNFe(orderId, calcResult.data, user.id, modelo)

  return {
    success: emitResult.success,
    data: emitResult.success ? emitResult : null,
    error: emitResult.success ? null : { code: 'EMISSION_FAILED', message: emitResult.error || 'Falha na emissão.' },
  }
}

// ─── Cancel NF-e ────────────────────────────────

export async function cancelNFeAction(fiscalDocumentId: string, justificativa: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuário não autenticado.' } }
  }

  const result = await cancelNFe(fiscalDocumentId, justificativa, user.id)

  return {
    success: result.success,
    data: result.success ? result : null,
    error: result.success ? null : { code: 'CANCEL_FAILED', message: result.error || 'Falha no cancelamento.' },
  }
}

// ─── Carta de Correção ──────────────────────────

export async function sendCartaCorrecaoAction(fiscalDocumentId: string, correcao: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: { code: 'AUTH', message: 'Usuário não autenticado.' } }
  }

  const result = await sendCartaCorrecao(fiscalDocumentId, correcao, user.id)

  return {
    success: result.success,
    data: result.success ? result : null,
    error: result.success ? null : { code: 'CORRECTION_FAILED', message: result.error || 'Falha na carta de correção.' },
  }
}

// ─── Check SEFAZ Status ─────────────────────────

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

// ─── Generate DANFE ─────────────────────────────

export async function generateDanfeAction(fiscalDocumentId: string) {
  try {
    const result = await generateDanfePdf(fiscalDocumentId)

    if (!result.success) {
      return { success: false, error: { code: 'DANFE_FAILED', message: result.error || 'Falha na geração do DANFE.' } }
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

// ─── Get Order Fiscal Details ───────────────────

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
    return { success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' } }
  }

  // Get order items with fiscal data
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

  // Get fiscal documents
  const { data: documents } = await supabase
    .from('fiscal_documents')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  // Get events log
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

// ─── Get Fiscal Documents for Order ─────────────

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

// ─── Helpers ─────────────────────────────────────

function serializePayload(payload: FiscalDocumentPayload) {
  // Ensure all values are serializable (no class instances)
  return JSON.parse(JSON.stringify(payload))
}
