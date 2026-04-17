// ============================================================
// Motor Fiscal — Resolve Fiscal Context Service
// Loads and assembles the complete FiscalContext from an order
// ============================================================

import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  EmitterContext,
  StoreContext,
  EnvironmentContext,
  FiscalItemContext,
  FiscalContext,
  ResolvedTaxProfile,
  ResolvedTaxRule,
  IcmsResolvedRule,
  IcmsInterstateRule,
  IcmsStRule,
  FiscalCalculationResult,
} from './types'
import { safeNumber } from './types'

function digitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

function hasMeaningfulText(value: string | null | undefined, minLength: number = 1): boolean {
  return (value || '').trim().length >= minLength
}

// --------------- Load Emitter ---------------

async function loadEmitterContext(): Promise<FiscalCalculationResult<EmitterContext>> {
  const supabase = createServiceRoleClient()

  const { data: profile, error: profileError } = await supabase
    .from('company_fiscal_profile')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (profileError) {
    return { success: false, error: { code: 'EMITTER_LOAD_FAILED', message: profileError.message } }
  }

  if (!profile) {
    return { success: false, error: { code: 'EMITTER_NOT_FOUND', message: 'Perfil fiscal do emitente nao encontrado.' } }
  }

  const { data: federalConfig } = await supabase
    .from('emitter_federal_tax_config')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const cnpj = digitsOnly(profile.cnpj)
  if (cnpj.length !== 14) {
    return { success: false, error: { code: 'EMITTER_INVALID_CNPJ', message: 'CNPJ do emitente invalido.' } }
  }

  const missingEmitterAddressFields: string[] = []
  if (!profile.fiscal_state) missingEmitterAddressFields.push('UF')
  if (!profile.fiscal_municipality_code_ibge) missingEmitterAddressFields.push('codigo IBGE')
  if (!hasMeaningfulText(profile.fiscal_address, 2)) missingEmitterAddressFields.push('logradouro')
  if (!hasMeaningfulText(profile.fiscal_neighborhood, 2)) missingEmitterAddressFields.push('bairro')
  if (!hasMeaningfulText(profile.fiscal_city, 2)) missingEmitterAddressFields.push('cidade')

  if (missingEmitterAddressFields.length > 0) {
    return {
      success: false,
      error: {
        code: 'EMITTER_INCOMPLETE_ADDRESS',
        message: `Endereco fiscal do emitente incompleto: ${missingEmitterAddressFields.join(', ')}.`,
      },
    }
  }

  if (!profile.crt || !['1', '2', '3'].includes(profile.crt)) {
    return { success: false, error: { code: 'EMITTER_INVALID_CRT', message: 'CRT do emitente invalido.' } }
  }

  const regimeMap: Record<string, EmitterContext['regime']> = {
    simples_nacional: 'simples_nacional',
    simples_excesso: 'simples_excesso',
    lucro_presumido: 'lucro_presumido',
    lucro_real: 'lucro_real',
  }

  return {
    success: true,
    data: {
      cnpj,
      ie: profile.inscricao_estadual || null,
      im: profile.inscricao_municipal || null,
      crt: profile.crt as '1' | '2' | '3',
      regime: regimeMap[profile.regime_tributario] || 'lucro_presumido',
      cnae: profile.cnae_principal || null,
      uf: profile.fiscal_state.toUpperCase(),
      ibge: profile.fiscal_municipality_code_ibge,
      country_code: profile.fiscal_country_code || '1058',
      razao_social: profile.razao_social || '',
      nome_fantasia: profile.nome_fantasia || null,
      logradouro: profile.fiscal_address || '',
      numero: profile.fiscal_number || 'S/N',
      complemento: profile.fiscal_complement || null,
      bairro: profile.fiscal_neighborhood || '',
      cidade: profile.fiscal_city || '',
      cep: profile.fiscal_zip_code || null,
      telefone: profile.fiscal_phone || profile.phone || null,
      aliquota_pis: safeNumber(federalConfig?.aliquota_pis, 0.65),
      aliquota_cofins: safeNumber(federalConfig?.aliquota_cofins, 3.0),
      credito_presumido_icms: federalConfig?.credito_presumido_icms === true,
      ultrapassou_sublimite: federalConfig?.ultrapassou_sublimite === true,
      exibir_total_tributos: federalConfig?.exibir_total_tributos !== false,
      artigo_sc_mva: federalConfig?.artigo_sc_mva || 'nenhum',
    },
  }
}

// --------------- Load Store ---------------

async function loadStoreContext(storeId: string): Promise<FiscalCalculationResult<StoreContext>> {
  const supabase = createServiceRoleClient()

  const { data: fiscalData, error: fiscalError } = await supabase
    .from('store_fiscal_data')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (fiscalError) {
    return { success: false, error: { code: 'STORE_FISCAL_LOAD_FAILED', message: fiscalError.message } }
  }

  // Fallback to store table if no fiscal data
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('*, store_addresses(*)')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError || !store) {
    return { success: false, error: { code: 'STORE_NOT_FOUND', message: `Loja ${storeId} nao encontrada.` } }
  }

  // Resolve fiscal address
  const addresses = Array.isArray(store.store_addresses) ? store.store_addresses : []
  const fiscalAddress = fiscalData?.fiscal_address_id
    ? addresses.find((a: Record<string, unknown>) => a.id === fiscalData.fiscal_address_id)
    : null
  const mainAddress = addresses.find((a: Record<string, unknown>) => a.is_main === true) || addresses[0] || null
  const address = fiscalAddress || mainAddress

  const uf = (address?.state || store.state || '').toUpperCase()
  const ibge = (address?.municipality_code || '').replace(/\D/g, '')
  const missingStoreAddressFields: string[] = []

  if (!uf || uf.length !== 2) {
    missingStoreAddressFields.push('UF')
  }

  if (!ibge) {
    missingStoreAddressFields.push('codigo IBGE')
  }

  if (!hasMeaningfulText(address?.street as string | undefined, 2)) {
    missingStoreAddressFields.push('logradouro')
  }

  if (!hasMeaningfulText(address?.neighborhood as string | undefined, 2)) {
    missingStoreAddressFields.push('bairro')
  }

  if (!hasMeaningfulText(address?.city as string | undefined, 2)) {
    missingStoreAddressFields.push('cidade')
  }

  if (missingStoreAddressFields.length > 0) {
    return {
      success: false,
      error: {
        code: 'STORE_INCOMPLETE_ADDRESS',
        message: `Endereco fiscal do destinatario incompleto: ${missingStoreAddressFields.join(', ')}.`,
      },
    }
  }

  const documentType = fiscalData?.document_type || store.document_type || 'CNPJ'
  const personType = fiscalData?.person_type || store.person_type || 'legal_entity'
  const taxpayerIndicator = fiscalData?.taxpayer_indicator || 'contributor'

  // Consumer final = PF ou PJ não contribuinte
  const isConsumerFinal = personType === 'individual' || taxpayerIndicator === 'non_contributor'

  return {
    success: true,
    data: {
      store_id: storeId,
      document_type: documentType as 'CPF' | 'CNPJ',
      document_number: digitsOnly(fiscalData?.document_number || store.document_number || store.cnpj),
      person_type: personType as 'individual' | 'legal_entity',
      taxpayer_indicator: taxpayerIndicator as 'contributor' | 'non_contributor' | 'exempt',
      ie: fiscalData?.state_registration || store.state_registration || null,
      im: fiscalData?.municipal_registration || null,
      uf,
      ibge: ibge || '0000000',
      country_code: (address?.country_code || '1058').replace(/\D/g, ''),
      is_consumer_final: isConsumerFinal,
      fiscal_email: fiscalData?.fiscal_email || store.email || null,
      nome: store.name || store.company_name || '',
      logradouro: (address?.street as string) || '',
      numero: (address?.number as string) || 'S/N',
      complemento: (address?.complement as string) || null,
      bairro: (address?.neighborhood as string) || '',
      cidade: (address?.city as string) || '',
      cep: (address?.zip_code as string) || null,
      telefone: store.phone || null,
    },
  }
}

// --------------- Load Environment ---------------

async function loadEnvironmentContext(): Promise<FiscalCalculationResult<EnvironmentContext>> {
  const supabase = createServiceRoleClient()

  const { data: env, error: envError } = await supabase
    .from('company_fiscal_environment')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (envError) {
    return { success: false, error: { code: 'ENV_LOAD_FAILED', message: envError.message } }
  }

  if (!env) {
    return { success: false, error: { code: 'ENV_NOT_FOUND', message: 'Ambiente de emissao nao configurado.' } }
  }

    return {
    success: true,
    data: {
      ambiente: env.ambiente === 'producao' ? 'producao' : 'homologacao',
      serie_nfe: env.serie_padrao_nfe || '1',
      proximo_numero_nfe: safeNumber(env.proximo_numero_nfe, 1),
      tipo_emissao: env.tipo_emissao || '1',
      modalidade_frete_padrao: env.modalidade_frete_padrao || 'destinatario',
      natureza_operacao: env.natureza_operacao || 'VENDA DE MERCADORIA',
      desconto_impostos_prazo: env.desconto_impostos_prazo !== false,
      icms_base_pis_cofins: env.icms_base_pis_cofins === true,
      frete_base_icms: env.frete_base_icms === true,
      max_itens_por_nota: safeNumber(env.max_itens_por_nota, 100),
      codigo_referencia_nota: env.codigo_referencia_nota || 'codigo_interno',
      serie_nfce: env.serie_nfce || '0',
      proximo_numero_nfce: safeNumber(env.proximo_numero_nfce, 1),
    },
  }
}

// --------------- Load Order Items with Tax Profiles ---------------

async function loadOrderItemsContext(
  orderId: string,
  storeUf: string
): Promise<FiscalCalculationResult<FiscalItemContext[]>> {
  const supabase = createServiceRoleClient()

  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      id,
      product_variant_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      tax_profile_id,
      product_variant:product_variants(
        product_id,
        product:products(
          id,
          tax_profile_id,
          tax_profile:product_tax_profiles(*)
        )
      )
    `)
    .eq('order_id', orderId)

  if (itemsError) {
    return { success: false, error: { code: 'ITEMS_LOAD_FAILED', message: itemsError.message } }
  }

  if (!orderItems || orderItems.length === 0) {
    return { success: false, error: { code: 'NO_ITEMS', message: 'Pedido nao possui itens.' } }
  }

  const itemRecords = orderItems as Record<string, unknown>[]
  const productIds = Array.from(new Set(
    itemRecords
      .map((item) => ((item.product_variant as Record<string, unknown> | null)?.product as Record<string, unknown> | null)?.id as string | undefined)
      .filter((value): value is string => Boolean(value))
  ))
  const taxProfileIds = Array.from(new Set(
    itemRecords
      .map((item) => ((((item.product_variant as Record<string, unknown> | null)?.product as Record<string, unknown> | null)?.tax_profile as Record<string, unknown> | null)?.id as string | undefined))
      .filter((value): value is string => Boolean(value))
  ))

  const { data: overrides } = productIds.length > 0
    ? await supabase
      .from('product_fiscal_overrides')
      .select('*')
      .in('product_id', productIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    : { data: [] }

  const overrideMap = new Map<string, Record<string, unknown>>()
  for (const override of (overrides || []) as Record<string, unknown>[]) {
    const productId = override.product_id as string | undefined
    if (productId && !overrideMap.has(productId)) {
      overrideMap.set(productId, override)
    }
  }

  const { data: rules } = taxProfileIds.length > 0
    ? await supabase
      .from('product_tax_profile_rules')
      .select('*')
      .in('tax_profile_id', taxProfileIds)
      .eq('is_active', true)
      .eq('operation_direction', 'outbound')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
    : { data: [] }

  const rulesByProfileId = new Map<string, Record<string, unknown>[]>()
  for (const rule of (rules || []) as Record<string, unknown>[]) {
    const taxProfileId = rule.tax_profile_id as string | undefined
    if (!taxProfileId) continue
    const bucket = rulesByProfileId.get(taxProfileId) || []
    bucket.push(rule)
    rulesByProfileId.set(taxProfileId, bucket)
  }

  const icmsBaseIds = Array.from(new Set(
    itemRecords
      .map((item) => ((((item.product_variant as Record<string, unknown> | null)?.product as Record<string, unknown> | null)?.tax_profile as Record<string, unknown> | null)?.icms_base_id as string | undefined))
      .filter((value): value is string => Boolean(value))
  ))

  const [icmsRulesResult, interstateRulesResult, stRulesResult] = icmsBaseIds.length > 0
    ? await Promise.all([
      supabase
        .from('fiscal_icms_rules')
        .select('*')
        .in('icms_base_id', icmsBaseIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('fiscal_icms_interstate_rules')
        .select('*')
        .in('icms_base_id', icmsBaseIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('fiscal_icms_st_rules')
        .select('*')
        .in('icms_base_id', icmsBaseIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])
    : [
      { data: [] },
      { data: [] },
      { data: [] },
    ]

  const icmsRulesByBaseId = new Map<string, Record<string, unknown>[]>()
  for (const rule of (icmsRulesResult.data || []) as Record<string, unknown>[]) {
    const baseId = rule.icms_base_id as string | undefined
    if (!baseId) continue
    const bucket = icmsRulesByBaseId.get(baseId) || []
    bucket.push(rule)
    icmsRulesByBaseId.set(baseId, bucket)
  }

  const interstateRuleByBaseId = new Map<string, Record<string, unknown>>()
  for (const rule of (interstateRulesResult.data || []) as Record<string, unknown>[]) {
    const baseId = rule.icms_base_id as string | undefined
    if (baseId && !interstateRuleByBaseId.has(baseId)) {
      interstateRuleByBaseId.set(baseId, rule)
    }
  }

  const stRulesByBaseId = new Map<string, Record<string, unknown>[]>()
  for (const rule of (stRulesResult.data || []) as Record<string, unknown>[]) {
    const baseId = rule.icms_base_id as string | undefined
    if (!baseId) continue
    const bucket = stRulesByBaseId.get(baseId) || []
    bucket.push(rule)
    stRulesByBaseId.set(baseId, bucket)
  }

  const items: FiscalItemContext[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (let i = 0; i < itemRecords.length; i++) {
    const item = itemRecords[i]
    const variant = item.product_variant as Record<string, unknown> | null
    const product = variant?.product as Record<string, unknown> | null
    const taxProfile = product?.tax_profile as Record<string, unknown> | null

    if (!taxProfile || !taxProfile.id) {
      return {
        success: false,
        error: {
          code: 'ITEM_NO_TAX_PROFILE',
          message: `Item "${item.product_name}" nao possui perfil fiscal vinculado.`,
          item_index: i,
        },
      }
    }

    if (!taxProfile.ncm || !taxProfile.is_active) {
      return {
        success: false,
        error: {
          code: 'ITEM_INCOMPLETE_TAX_PROFILE',
          message: `Perfil fiscal "${taxProfile.name}" do item "${item.product_name}" esta incompleto ou inativo.`,
          item_index: i,
        },
      }
    }

    const productId = product?.id as string | undefined
    const override = productId ? overrideMap.get(productId) || null : null

    const resolvedProfile: ResolvedTaxProfile = {
      tax_profile_id: taxProfile.id as string,
      tax_profile_version: safeNumber(taxProfile.version, 1),
      name: (taxProfile.name as string) || '',
      code: (taxProfile.code as string) || '',
      ncm: (taxProfile.ncm as string) || '',
      cest: (taxProfile.cest as string) || null,
      origin_code: (taxProfile.origin_code as string) || '0',
      fiscal_type: (taxProfile.fiscal_type as string) || 'goods',
      item_type: (taxProfile.item_type as string) || 'goods',
      commercial_unit: (taxProfile.commercial_unit as string) || null,
      tax_unit: (taxProfile.tax_unit as string) || null,
      ean_gtin: (taxProfile.ean_gtin as string) || null,
      tax_ean_gtin: (taxProfile.tax_ean_gtin as string) || null,
      default_output_cfop: (taxProfile.default_output_cfop as string) || null,
      default_input_cfop: (taxProfile.default_input_cfop as string) || null,
      default_fiscal_description: (taxProfile.default_fiscal_description as string) || null,
      pis_cst: (taxProfile.pis_cst as string) || null,
      cofins_cst: (taxProfile.cofins_cst as string) || null,
      pis_aliquota: safeNumber(taxProfile.pis_aliquota) || null,
      cofins_aliquota: safeNumber(taxProfile.cofins_aliquota) || null,
      has_ipi: taxProfile.has_ipi === true,
      ipi_cst_out: (taxProfile.ipi_cst_out as string) || null,
      ipi_enquadramento_codigo: (taxProfile.ipi_enquadramento_codigo as string) || null,
      has_substitution_tax: taxProfile.has_substitution_tax === true,
      requires_cest: taxProfile.requires_cest === true,
      icms_base_id: (taxProfile.icms_base_id as string) || null,
      ibscbs_base_id: (taxProfile.ibscbs_base_id as string) || null,
      ibscbs_version_id: (taxProfile.ibscbs_version_id as string) || null,
      is_override: override !== null,
    }

    let appliedRule: ResolvedTaxRule | null = null
    const profileRules = rulesByProfileId.get(resolvedProfile.tax_profile_id) || []
    if (profileRules.length > 0) {
      const matched = profileRules.find((r: Record<string, unknown>) => {
        const destUf = r.destination_uf as string | null
        const effectiveFrom = r.effective_from as string | null
        const effectiveTo = r.effective_to as string | null
        if (destUf && destUf !== storeUf) return false
        if (effectiveFrom && effectiveFrom > today) return false
        if (effectiveTo && effectiveTo < today) return false
        return true
      })

      if (matched) {
        appliedRule = {
          rule_id: matched.id as string,
          rule_name: (matched.rule_name as string) || '',
          operation_direction: 'outbound',
          origin_uf: (matched.origin_uf as string) || null,
          destination_uf: (matched.destination_uf as string) || null,
          cfop_override: (matched.cfop_override as string) || null,
          cfop_config_id: (matched.cfop_config_id as string) || null,
          priority: safeNumber(matched.priority),
          rule_payload: (matched.rule_payload_jsonb as Record<string, unknown>) || {},
        }
      }
    }

    // Load ICMS rules from base
    let icmsRule: IcmsResolvedRule | null = null
    let icmsInterstateRule: IcmsInterstateRule | null = null
    let icmsStRule: IcmsStRule | null = null

    if (resolvedProfile.icms_base_id) {
      const icmsRules = icmsRulesByBaseId.get(resolvedProfile.icms_base_id) || []
      if (icmsRules.length > 0) {
        const stateRule = icmsRules.find((r: Record<string, unknown>) => r.target_uf === storeUf)
        const nationalRule = icmsRules.find((r: Record<string, unknown>) => !r.target_uf)
        const selectedRule = stateRule || nationalRule

        if (selectedRule) {
          icmsRule = {
            cst_code: (selectedRule.cst_code as string) || '00',
            icms_rate: safeNumber(selectedRule.icms_rate),
            fcp_rate: safeNumber(selectedRule.fcp_rate),
            base_calc_type: (selectedRule.base_calc_type as string) || 'operation_value',
            base_calc_percent: safeNumber(selectedRule.base_calc_percent) || null,
            base_reduction_percent: safeNumber(selectedRule.base_reduction_percent) || null,
            special_advance_destination: selectedRule.special_advance_destination === true,
            differentiate_consumer_final_rate: selectedRule.differentiate_consumer_final_rate === true,
          }
        }
      }

      const interstateRules = interstateRuleByBaseId.get(resolvedProfile.icms_base_id)
      if (interstateRules) {
        icmsInterstateRule = {
          icms_rate: safeNumber(interstateRules.icms_rate),
          fcp_rate: safeNumber(interstateRules.fcp_rate),
          consumer_final_mode: (interstateRules.consumer_final_mode as string) || 'standard',
        }
      }

      const stRules = stRulesByBaseId.get(resolvedProfile.icms_base_id) || []
      if (stRules.length > 0) {
        const stateStRule = stRules.find((r: Record<string, unknown>) => r.target_uf === storeUf)
        const nationalStRule = stRules.find((r: Record<string, unknown>) => !r.target_uf)
        const selectedSt = stateStRule || nationalStRule

        if (selectedSt) {
          icmsStRule = {
            st_enabled: selectedSt.st_enabled === true,
            st_base_calc_type: (selectedSt.st_base_calc_type as string) || null,
            st_rate: safeNumber(selectedSt.st_rate) || null,
            st_fcp_rate: safeNumber(selectedSt.st_fcp_rate) || null,
            mva_original: safeNumber(selectedSt.mva_original) || null,
            mva_adjusted: safeNumber(selectedSt.mva_adjusted) || null,
            st_base_reduction_percent: safeNumber(selectedSt.st_base_reduction_percent) || null,
          }
        }
      }
    }

    items.push({
      order_item_id: item.id as string,
      product_variant_id: item.product_variant_id as string,
      product_name: (item.product_name as string) || '',
      quantity: safeNumber(item.quantity, 1),
      unit_price: safeNumber(item.unit_price),
      subtotal: safeNumber(item.subtotal),
      tax_profile: resolvedProfile,
      applied_rule: appliedRule,
      icms_rule: icmsRule,
      icms_interstate_rule: icmsInterstateRule,
      icms_st_rule: icmsStRule,
    })
  }

  return { success: true, data: items }
}

// --------------- Public API ---------------

export async function resolveFiscalContext(
  orderId: string,
  storeId: string,
  operationDirection: 'outbound' | 'inbound' = 'outbound'
): Promise<FiscalCalculationResult<FiscalContext>> {
  const emitterResult = await loadEmitterContext()
  if (!emitterResult.success) return emitterResult

  const storeResult = await loadStoreContext(storeId)
  if (!storeResult.success) return storeResult

  const envResult = await loadEnvironmentContext()
  if (!envResult.success) return envResult

  const itemsResult = await loadOrderItemsContext(
    orderId,
    storeResult.data.uf
  )
  if (!itemsResult.success) return itemsResult

  return {
    success: true,
    data: {
      emitter: emitterResult.data,
      store: storeResult.data,
      environment: envResult.data,
      items: itemsResult.data,
      operation_date: new Date().toISOString().slice(0, 10),
      operation_direction: operationDirection,
    },
  }
}
