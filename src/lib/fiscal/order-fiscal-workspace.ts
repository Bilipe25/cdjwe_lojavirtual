import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  NaturezaOperacao,
  NaturezaOperacaoDirection,
  OrderFiscalBuyerPresence,
  OrderFiscalDeliveryForm,
  OrderFiscalFreightMode,
  OrderFiscalNaturezaSnapshot,
  OrderFiscalOperationPurpose,
} from '@/lib/types'

export const ORDER_FISCAL_PURPOSE_OPTIONS: Array<{
  value: OrderFiscalOperationPurpose
  label: string
}> = [
  { value: 'normal', label: 'Normal' },
  { value: 'complementar', label: 'Complementar' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'devolucao', label: 'Devolucao' },
]

export const ORDER_FISCAL_BUYER_PRESENCE_OPTIONS: Array<{
  value: OrderFiscalBuyerPresence
  label: string
}> = [
  { value: 'nao_se_aplica', label: 'Nao se aplica' },
  { value: 'presencial', label: 'Operacao presencial' },
  { value: 'internet', label: 'Internet' },
  { value: 'teleatendimento', label: 'Teleatendimento' },
  { value: 'entrega_domicilio', label: 'Entrega em domicilio' },
  { value: 'presencial_fora_estabelecimento', label: 'Presencial fora do estabelecimento' },
  { value: 'outros', label: 'Outros' },
]

export const ORDER_FISCAL_FREIGHT_MODE_OPTIONS: Array<{
  value: OrderFiscalFreightMode
  label: string
  sefazCode: number
}> = [
  { value: 'emitente', label: 'Por conta do emitente', sefazCode: 0 },
  { value: 'destinatario', label: 'Por conta do destinatario', sefazCode: 1 },
  { value: 'terceiros', label: 'Por conta de terceiros', sefazCode: 2 },
  { value: 'proprio_remetente', label: 'Transporte proprio por conta do remetente', sefazCode: 3 },
  { value: 'proprio_destinatario', label: 'Transporte proprio por conta do destinatario', sefazCode: 4 },
  { value: 'sem_frete', label: 'Sem frete', sefazCode: 9 },
]

export const ORDER_FISCAL_DELIVERY_FORM_OPTIONS: Array<{
  value: OrderFiscalDeliveryForm
  label: string
}> = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'transportadora', label: 'Transportadora' },
  { value: 'frota_propria', label: 'Frota propria' },
  { value: 'correios', label: 'Correios' },
  { value: 'entrega_expressa', label: 'Entrega expressa' },
  { value: 'balcao', label: 'Balcao' },
]

export function inferOperationDirectionFromCfop(cfopCode?: string | null): NaturezaOperacaoDirection {
  const digits = String(cfopCode || '').replace(/\D/g, '').slice(0, 4)
  if (!digits) return 'outbound'
  return ['1', '2', '3'].includes(digits.charAt(0)) ? 'inbound' : 'outbound'
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function sanitizeCfopCode(value?: string | null): string | null {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4)
  return /^\d{4}$/.test(digits) ? digits : null
}

function sanitizeNaturezaRow(row: Record<string, unknown>, cfopCodes: string[]): NaturezaOperacao {
  return {
    id: String(row.id),
    descricao: String(row.descricao || '').trim(),
    tipo_operacao: row.tipo_operacao === 'inbound' ? 'inbound' : 'outbound',
    aplica_st: row.aplica_st === true,
    aplica_difal: row.aplica_difal === true,
    aplica_devolucao: row.aplica_devolucao === true,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order || 0),
    cfop_codes: cfopCodes,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  }
}

export async function listNaturezaOperacaoCatalog(): Promise<NaturezaOperacao[]> {
  const supabase = createServiceRoleClient()
  const [{ data: naturezas, error: naturezasError }, { data: links, error: linksError }] = await Promise.all([
    supabase
      .from('natureza_operacao')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('descricao', { ascending: true }),
    supabase
      .from('natureza_operacao_cfops')
      .select('natureza_operacao_id, cfop_code'),
  ])

  if (naturezasError) throw naturezasError
  if (linksError) throw linksError

  const cfopsByNatureza = new Map<string, string[]>()
  for (const row of (links || []) as Array<Record<string, unknown>>) {
    const naturezaId = String(row.natureza_operacao_id || '')
    if (!naturezaId) continue
    const bucket = cfopsByNatureza.get(naturezaId) || []
    const code = sanitizeCfopCode(row.cfop_code as string | null)
    if (code && !bucket.includes(code)) bucket.push(code)
    cfopsByNatureza.set(naturezaId, bucket)
  }

  return ((naturezas || []) as Array<Record<string, unknown>>).map((row) =>
    sanitizeNaturezaRow(row, cfopsByNatureza.get(String(row.id)) || [])
  )
}

export function toNaturezaSnapshot(
  natureza: NaturezaOperacao,
  source: OrderFiscalNaturezaSnapshot['source'] = 'catalog'
): OrderFiscalNaturezaSnapshot {
  return {
    id: natureza.id,
    descricao: natureza.descricao,
    tipo_operacao: natureza.tipo_operacao,
    aplica_st: natureza.aplica_st,
    aplica_difal: natureza.aplica_difal,
    aplica_devolucao: natureza.aplica_devolucao,
    source,
  }
}

export async function resolveNaturezaOperacaoSuggestion(input: {
  cfopCode?: string | null
  requestedNaturezaId?: string | null
  fallbackDescription?: string | null
  environmentNatureza?: string | null
  operationDirection?: NaturezaOperacaoDirection
}): Promise<OrderFiscalNaturezaSnapshot> {
  const cfopCode = sanitizeCfopCode(input.cfopCode)
  const fallbackDirection = input.operationDirection || inferOperationDirectionFromCfop(cfopCode)
  const catalog = await listNaturezaOperacaoCatalog()

  if (input.requestedNaturezaId) {
    const requested = catalog.find((natureza) => natureza.id === input.requestedNaturezaId)
    if (requested) {
      return toNaturezaSnapshot(requested, 'catalog')
    }
  }

  if (cfopCode) {
    const matched = catalog.find((natureza) => (natureza.cfop_codes || []).includes(cfopCode))
    if (matched) {
      return toNaturezaSnapshot(matched, 'catalog')
    }

    const supabase = createServiceRoleClient()
    const { data: activeVersion } = await supabase
      .from('fiscal_reference_versions')
      .select('id')
      .eq('table_type', 'cfop')
      .eq('is_active', true)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeVersion?.id) {
      const { data: cfopEntry } = await supabase
        .from('fiscal_cfop_entries')
        .select('description, operation_direction')
        .eq('version_id', activeVersion.id)
        .eq('code', cfopCode)
        .limit(1)
        .maybeSingle()

      if (cfopEntry?.description) {
        return {
          id: null,
          descricao: normalizeText(cfopEntry.description) || input.fallbackDescription || `CFOP ${cfopCode}`,
          tipo_operacao: cfopEntry.operation_direction === 'inbound' ? 'inbound' : 'outbound',
          aplica_st: /^5[4-7]|^6[4-7]/.test(cfopCode),
          aplica_difal: cfopCode.startsWith('6'),
          aplica_devolucao: cfopCode.startsWith('1') || cfopCode.startsWith('2'),
          source: 'cfop_fallback',
        }
      }
    }
  }

  const environmentNatureza = normalizeText(input.environmentNatureza)
  if (environmentNatureza) {
    return {
      id: null,
      descricao: environmentNatureza,
      tipo_operacao: fallbackDirection,
      aplica_st: false,
      aplica_difal: fallbackDirection === 'outbound' && !!cfopCode && cfopCode.startsWith('6'),
      aplica_devolucao: cfopCode ? ['1', '2'].includes(cfopCode.charAt(0)) : false,
      source: 'environment_default',
    }
  }

  return {
    id: null,
    descricao: input.fallbackDescription || 'Venda de mercadoria',
    tipo_operacao: fallbackDirection,
    aplica_st: false,
    aplica_difal: false,
    aplica_devolucao: false,
    source: 'manual',
  }
}
