'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  calculateOrderFiscal,
  recalculateOrderFiscal,
  type FiscalDocumentPayload,
} from '@/lib/fiscal/motor'
import {
  listNaturezaOperacaoCatalog,
  resolveNaturezaOperacaoSuggestion,
} from '@/lib/fiscal/order-fiscal-workspace'
import type {
  OrderFiscalBuyerPresence,
  OrderFiscalDeliveryForm,
  OrderFiscalFreightMode,
  OrderFiscalOperationPurpose,
  OrderFiscalVolume,
  NaturezaOperacaoDirection,
} from '@/lib/types'

export interface OrderFiscalWorkspaceItemDraft {
  orderItemId: string
  productName: string
  quantity: number
  cfopOverrideCode: string | null
  effectiveCfopCode: string | null
  cfopSource: string | null
  taxProfileName: string | null
  ncm: string | null
  totalValue: number
}

export interface OrderFiscalWorkspaceCalculationItemSummary {
  orderItemId: string
  productName: string
  cfop: string
  cfopSource: string
  icms: number
  st: number
  fcp: number
  pis: number
  cofins: number
  ipi: number
  totalTributos: number
}

export interface OrderFiscalWorkspaceCalculationSummary {
  totals: FiscalDocumentPayload['totals']
  validation: FiscalDocumentPayload['validation']
  operation: FiscalDocumentPayload['context']['operation']
  transport: FiscalDocumentPayload['context']['transport']
  items: OrderFiscalWorkspaceCalculationItemSummary[]
  previewUrl: string
}

export interface OrderFiscalWorkspacePayload {
  settings: {
    cfopGlobalCode: string | null
    naturezaOperacaoId: string | null
    naturezaOperacaoSnapshot: Record<string, unknown> | null
    operationDirection: NaturezaOperacaoDirection
    finalidadeNfe: OrderFiscalOperationPurpose
    presencaComprador: OrderFiscalBuyerPresence
    consumidorFinal: boolean
    fiscalObservation: string | null
    freightMode: OrderFiscalFreightMode
    deliveryForm: OrderFiscalDeliveryForm
    transporterName: string | null
    transporterDocument: string | null
    transporterAddress: string | null
    transporterCity: string | null
    transporterState: string | null
    transporterIe: string | null
    vehiclePlate: string | null
    vehicleUf: string | null
    anttCode: string | null
    freightValue: number
    insuranceValue: number
    otherExpensesValue: number
    lastRecalculatedAt: string | null
  }
  volumes: OrderFiscalVolume[]
  items: OrderFiscalWorkspaceItemDraft[]
  naturezaCatalog: Awaited<ReturnType<typeof listNaturezaOperacaoCatalog>>
  calculation: OrderFiscalWorkspaceCalculationSummary | null
}

export interface SaveOrderFiscalWorkspaceInput {
  orderId: string
  cfopGlobalCode?: string | null
  naturezaOperacaoId?: string | null
  operationDirection?: NaturezaOperacaoDirection
  finalidadeNfe?: OrderFiscalOperationPurpose
  presencaComprador?: OrderFiscalBuyerPresence
  consumidorFinal?: boolean
  fiscalObservation?: string | null
  freightMode?: OrderFiscalFreightMode
  deliveryForm?: OrderFiscalDeliveryForm
  transporterName?: string | null
  transporterDocument?: string | null
  transporterAddress?: string | null
  transporterCity?: string | null
  transporterState?: string | null
  transporterIe?: string | null
  vehiclePlate?: string | null
  vehicleUf?: string | null
  anttCode?: string | null
  freightValue?: number | null
  insuranceValue?: number | null
  otherExpensesValue?: number | null
  volumes?: Array<{
    quantity: number
    species: string
    brand?: string | null
    numbering?: string | null
    grossWeight?: number | null
    netWeight?: number | null
    sortOrder?: number | null
  }>
  itemOverrides?: Array<{
    orderItemId: string
    cfopOverrideCode?: string | null
  }>
}

function sanitizeDigits(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '')
}

function sanitizeCfopCode(value: string | null | undefined) {
  const digits = sanitizeDigits(value).slice(0, 4)
  return /^\d{4}$/.test(digits) ? digits : null
}

function sanitizeText(value: string | null | undefined) {
  const normalized = (value || '').trim()
  return normalized.length > 0 ? normalized : null
}

function sanitizeUpperText(value: string | null | undefined) {
  const normalized = sanitizeText(value)
  return normalized ? normalized.toUpperCase() : null
}

function normalizeNumber(value: unknown, fallback: number = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toWorkspaceVolume(row: Record<string, unknown>): OrderFiscalVolume {
  return {
    id: String(row.id),
    order_fiscal_settings_id: String(row.order_fiscal_settings_id),
    quantity: Math.max(1, normalizeNumber(row.quantity, 1)),
    species: String(row.species || ''),
    brand: sanitizeText(String(row.brand || '')),
    numbering: sanitizeText(String(row.numbering || '')),
    gross_weight: row.gross_weight === null || row.gross_weight === undefined ? null : normalizeNumber(row.gross_weight),
    net_weight: row.net_weight === null || row.net_weight === undefined ? null : normalizeNumber(row.net_weight),
    sort_order: normalizeNumber(row.sort_order, 0),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

async function ensureAdminAccess() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Nao autenticado.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile || !['admin', 'manager'].includes(String(profile.role || ''))) {
    throw new Error('Acesso negado.')
  }

  return user.id
}

function serializeCalculation(payload: FiscalDocumentPayload, orderId: string): OrderFiscalWorkspaceCalculationSummary {
  return {
    totals: payload.totals,
    validation: payload.validation,
    operation: payload.context.operation,
    transport: payload.context.transport,
    items: payload.items.map((item) => ({
      orderItemId: item.order_item_id,
      productName: item.product_name,
      cfop: item.cfop,
      cfopSource: item.cfop_source,
      icms: item.icms.value,
      st: item.st.value,
      fcp: item.fcp.value + item.st.fcp_value,
      pis: item.pis.value,
      cofins: item.cofins.value,
      ipi: item.ipi.value,
      totalTributos: item.total_tributos,
    })),
    previewUrl: `/api/fiscal/danfe-preview/order/${orderId}?modelo=55`,
  }
}

async function buildWorkspacePayload(orderId: string): Promise<OrderFiscalWorkspacePayload> {
  const adminSupabase = createServiceRoleClient()
  const naturezaCatalog = await listNaturezaOperacaoCatalog()

  const [{ data: settings }, { data: items }, calculationResult] = await Promise.all([
    adminSupabase
      .from('order_fiscal_settings')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle(),
    adminSupabase
      .from('order_items')
      .select(`
        id,
        product_name,
        quantity,
        subtotal,
        cfop_override_code,
        effective_cfop_code,
        cfop_source,
        product_variant:product_variants(
          product:products(
            tax_profile:product_tax_profiles(name, ncm)
          )
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    calculateOrderFiscal(orderId),
  ])

  const settingsRecord = settings as Record<string, unknown> | null
  const settingsId = settingsRecord?.id ? String(settingsRecord.id) : null

  const { data: volumeRows } = settingsId
    ? await adminSupabase
      .from('order_fiscal_volumes')
      .select('*')
      .eq('order_fiscal_settings_id', settingsId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    : { data: [] as Record<string, unknown>[] }

  return {
    settings: {
      cfopGlobalCode: sanitizeCfopCode(settingsRecord?.cfop_global_code as string | undefined),
      naturezaOperacaoId: sanitizeText(settingsRecord?.natureza_operacao_id as string | undefined),
      naturezaOperacaoSnapshot:
        settingsRecord?.natureza_operacao_snapshot && typeof settingsRecord.natureza_operacao_snapshot === 'object'
          ? (settingsRecord.natureza_operacao_snapshot as Record<string, unknown>)
          : null,
      operationDirection:
        settingsRecord?.operation_direction === 'inbound'
          ? 'inbound'
          : settingsRecord?.operation_direction === 'outbound'
            ? 'outbound'
            : 'outbound',
      finalidadeNfe:
        settingsRecord?.finalidade_nfe === 'complementar'
          ? 'complementar'
          : settingsRecord?.finalidade_nfe === 'ajuste'
            ? 'ajuste'
            : settingsRecord?.finalidade_nfe === 'devolucao'
              ? 'devolucao'
              : 'normal',
      presencaComprador:
        settingsRecord?.presenca_comprador === 'nao_se_aplica'
          ? 'nao_se_aplica'
          : settingsRecord?.presenca_comprador === 'presencial'
            ? 'presencial'
            : settingsRecord?.presenca_comprador === 'teleatendimento'
              ? 'teleatendimento'
              : settingsRecord?.presenca_comprador === 'entrega_domicilio'
                ? 'entrega_domicilio'
                : settingsRecord?.presenca_comprador === 'presencial_fora_estabelecimento'
                  ? 'presencial_fora_estabelecimento'
                  : settingsRecord?.presenca_comprador === 'outros'
                    ? 'outros'
                    : 'internet',
      consumidorFinal: settingsRecord?.consumidor_final === true,
      fiscalObservation: sanitizeText(settingsRecord?.fiscal_observation as string | undefined),
      freightMode:
        settingsRecord?.freight_mode === 'emitente' ||
        settingsRecord?.freight_mode === 'destinatario' ||
        settingsRecord?.freight_mode === 'terceiros' ||
        settingsRecord?.freight_mode === 'proprio_remetente' ||
        settingsRecord?.freight_mode === 'proprio_destinatario'
          ? settingsRecord.freight_mode
          : 'sem_frete',
      deliveryForm:
        settingsRecord?.delivery_form === 'retirada' ||
        settingsRecord?.delivery_form === 'transportadora' ||
        settingsRecord?.delivery_form === 'frota_propria' ||
        settingsRecord?.delivery_form === 'correios' ||
        settingsRecord?.delivery_form === 'entrega_expressa' ||
        settingsRecord?.delivery_form === 'balcao'
          ? settingsRecord.delivery_form
          : 'nao_informado',
      transporterName: sanitizeText(settingsRecord?.transporter_name as string | undefined),
      transporterDocument: sanitizeText(settingsRecord?.transporter_document as string | undefined),
      transporterAddress: sanitizeText(settingsRecord?.transporter_address as string | undefined),
      transporterCity: sanitizeText(settingsRecord?.transporter_city as string | undefined),
      transporterState: sanitizeUpperText(settingsRecord?.transporter_state as string | undefined),
      transporterIe: sanitizeText(settingsRecord?.transporter_ie as string | undefined),
      vehiclePlate: sanitizeUpperText(settingsRecord?.vehicle_plate as string | undefined),
      vehicleUf: sanitizeUpperText(settingsRecord?.vehicle_uf as string | undefined),
      anttCode: sanitizeText(settingsRecord?.antt_code as string | undefined),
      freightValue: normalizeNumber(settingsRecord?.freight_value),
      insuranceValue: normalizeNumber(settingsRecord?.insurance_value),
      otherExpensesValue: normalizeNumber(settingsRecord?.other_expenses_value),
      lastRecalculatedAt: sanitizeText(settingsRecord?.last_recalculated_at as string | undefined),
    },
    volumes: ((volumeRows || []) as Record<string, unknown>[]).map(toWorkspaceVolume),
    items: ((items || []) as Record<string, unknown>[]).map((row) => {
      const variant = row.product_variant as Record<string, unknown> | null
      const product = variant?.product as Record<string, unknown> | null
      const taxProfile = product?.tax_profile as Record<string, unknown> | null

      return {
        orderItemId: String(row.id),
        productName: String(row.product_name || 'Produto'),
        quantity: normalizeNumber(row.quantity, 1),
        cfopOverrideCode: sanitizeCfopCode(row.cfop_override_code as string | undefined),
        effectiveCfopCode: sanitizeCfopCode(row.effective_cfop_code as string | undefined),
        cfopSource: sanitizeText(row.cfop_source as string | undefined),
        taxProfileName: sanitizeText(taxProfile?.name as string | undefined),
        ncm: sanitizeText(taxProfile?.ncm as string | undefined),
        totalValue: normalizeNumber(row.subtotal),
      }
    }),
    naturezaCatalog,
    calculation: calculationResult.success ? serializeCalculation(calculationResult.data, orderId) : null,
  }
}

export async function getOrderFiscalWorkspaceAction(orderId: string) {
  try {
    await ensureAdminAccess()
    const payload = await buildWorkspacePayload(orderId)
    return { success: true, data: payload }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar o workspace fiscal do pedido.',
    }
  }
}

export async function saveOrderFiscalWorkspaceAction(input: SaveOrderFiscalWorkspaceInput) {
  try {
    await ensureAdminAccess()
    const adminSupabase = createServiceRoleClient()
    const cfopGlobalCode = sanitizeCfopCode(input.cfopGlobalCode)
    const operationDirection: NaturezaOperacaoDirection =
      input.operationDirection === 'inbound'
        ? 'inbound'
        : input.operationDirection === 'outbound'
          ? 'outbound'
          : 'outbound'

    const naturezaSuggestion = await resolveNaturezaOperacaoSuggestion({
      cfopCode: cfopGlobalCode,
      requestedNaturezaId: sanitizeText(input.naturezaOperacaoId),
      operationDirection,
    })
    const naturezaSnapshot = naturezaSuggestion

    const upsertPayload = {
      order_id: input.orderId,
      cfop_global_code: cfopGlobalCode,
      natureza_operacao_id: naturezaSnapshot.id,
      natureza_operacao_snapshot: naturezaSnapshot,
      operation_direction: operationDirection,
      finalidade_nfe: input.finalidadeNfe || 'normal',
      presenca_comprador: input.presencaComprador || 'internet',
      consumidor_final: input.consumidorFinal === true,
      fiscal_observation: sanitizeText(input.fiscalObservation),
      freight_mode: input.freightMode || 'sem_frete',
      delivery_form: input.deliveryForm || 'nao_informado',
      transporter_name: sanitizeText(input.transporterName),
      transporter_document: sanitizeDigits(input.transporterDocument),
      transporter_address: sanitizeText(input.transporterAddress),
      transporter_city: sanitizeText(input.transporterCity),
      transporter_state: sanitizeUpperText(input.transporterState),
      transporter_ie: sanitizeText(input.transporterIe),
      vehicle_plate: sanitizeUpperText(input.vehiclePlate),
      vehicle_uf: sanitizeUpperText(input.vehicleUf),
      antt_code: sanitizeText(input.anttCode),
      freight_value: normalizeNumber(input.freightValue),
      insurance_value: normalizeNumber(input.insuranceValue),
      other_expenses_value: normalizeNumber(input.otherExpensesValue),
      last_recalculated_at: new Date().toISOString(),
    }

    const { data: settingsRow, error: upsertError } = await adminSupabase
      .from('order_fiscal_settings')
      .upsert(upsertPayload, { onConflict: 'order_id' })
      .select('id')
      .single()

    if (upsertError || !settingsRow) {
      throw new Error(upsertError?.message || 'Falha ao salvar o rascunho fiscal do pedido.')
    }

    const settingsId = String(settingsRow.id)

    const { error: deleteVolumesError } = await adminSupabase
      .from('order_fiscal_volumes')
      .delete()
      .eq('order_fiscal_settings_id', settingsId)

    if (deleteVolumesError) {
      throw new Error(deleteVolumesError.message)
    }

    const sanitizedVolumes = (input.volumes || [])
      .map((volume, index) => ({
        order_fiscal_settings_id: settingsId,
        quantity: Math.max(1, normalizeNumber(volume.quantity, 1)),
        species: sanitizeText(volume.species),
        brand: sanitizeText(volume.brand),
        numbering: sanitizeText(volume.numbering),
        gross_weight: volume.grossWeight === null || volume.grossWeight === undefined ? null : normalizeNumber(volume.grossWeight),
        net_weight: volume.netWeight === null || volume.netWeight === undefined ? null : normalizeNumber(volume.netWeight),
        sort_order: volume.sortOrder === null || volume.sortOrder === undefined ? index : normalizeNumber(volume.sortOrder, index),
      }))
      .filter((volume) => volume.species)

    if (sanitizedVolumes.length > 0) {
      const { error: insertVolumesError } = await adminSupabase
        .from('order_fiscal_volumes')
        .insert(sanitizedVolumes)

      if (insertVolumesError) {
        throw new Error(insertVolumesError.message)
      }
    }

    const { data: orderItems, error: orderItemsError } = await adminSupabase
      .from('order_items')
      .select('id')
      .eq('order_id', input.orderId)

    if (orderItemsError) {
      throw new Error(orderItemsError.message)
    }

    const overridesByItemId = new Map(
      (input.itemOverrides || []).map((override) => [
        override.orderItemId,
        sanitizeCfopCode(override.cfopOverrideCode),
      ])
    )

    for (const item of (orderItems || []) as Array<{ id: string }>) {
      const { error: updateOrderItemError } = await adminSupabase
        .from('order_items')
        .update({
          cfop_override_code: overridesByItemId.get(item.id) || null,
        })
        .eq('id', item.id)

      if (updateOrderItemError) {
        throw new Error(updateOrderItemError.message)
      }
    }

    const recalculateResult = await recalculateOrderFiscal(input.orderId)
    if (!recalculateResult.success) {
      return {
        success: false,
        error: recalculateResult.error.message,
      }
    }

    revalidatePath(`/admin/orders/${input.orderId}`)
    revalidatePath('/admin/orders')

    return {
      success: true,
      data: await buildWorkspacePayload(input.orderId),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao salvar o workspace fiscal do pedido.',
    }
  }
}

export async function recalculateOrderFiscalWorkspaceAction(orderId: string) {
  try {
    await ensureAdminAccess()
    const result = await recalculateOrderFiscal(orderId)
    if (!result.success) {
      return { success: false, error: result.error.message }
    }

    revalidatePath(`/admin/orders/${orderId}`)
    revalidatePath('/admin/orders')

    return {
      success: true,
      data: await buildWorkspacePayload(orderId),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao recalcular o fiscal do pedido.',
    }
  }
}

export async function suggestOrderFiscalNaturezaAction(params: {
  cfopCode?: string | null
  naturezaOperacaoId?: string | null
  operationDirection?: NaturezaOperacaoDirection
}) {
  try {
    await ensureAdminAccess()
    const suggestion = await resolveNaturezaOperacaoSuggestion({
      cfopCode: sanitizeCfopCode(params.cfopCode),
      requestedNaturezaId: sanitizeText(params.naturezaOperacaoId),
      operationDirection: params.operationDirection === 'inbound' ? 'inbound' : 'outbound',
    })

    return {
      success: true,
      data: {
        id: suggestion.id,
        descricao: suggestion.descricao,
        tipoOperacao: suggestion.tipo_operacao,
        aplicaSt: suggestion.aplica_st,
        aplicaDifal: suggestion.aplica_difal,
        aplicaDevolucao: suggestion.aplica_devolucao,
        source: suggestion.source,
        snapshot: suggestion,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao sugerir natureza da operacao.',
    }
  }
}
