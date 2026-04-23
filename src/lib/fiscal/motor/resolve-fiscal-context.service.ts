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
  FiscalOperationContext,
  FiscalTransportContext,
  FiscalVolumeContext,
  ResolvedTaxProfile,
  ResolvedTaxRule,
  IcmsResolvedRule,
  IcmsInterstateRule,
  IcmsStRule,
  FiscalCalculationResult,
} from './types'
import { safeNumber } from './types'
import { inferOperationDirectionFromCfop } from '@/lib/fiscal/order-fiscal-workspace'
import { normalizeFiscalEmissionMode } from '@/lib/fiscal/emission-mode'
import { parseFiscalEnvironmentParams } from '@/lib/fiscal/additional-info'
import { resolveIbsCbsContext } from './resolve-ibscbs-context.service'

function digitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

function hasMeaningfulText(value: string | null | undefined, minLength: number = 1): boolean {
  return (value || '').trim().length >= minLength
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim()
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)
  return normalized || null
}

function sanitizeCfopCode(value: string | null | undefined): string | null {
  const digits = digitsOnly(value).slice(0, 4)
  return /^\d{4}$/.test(digits) ? digits : null
}

function normalizeStateRegistration(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (normalized.toUpperCase() === 'ISENTO') return 'ISENTO'
  const digits = digitsOnly(normalized)
  return digits || null
}

function isValidIbgeCode(value: string | null | undefined): boolean {
  const digits = digitsOnly(value)
  return /^\d{7}$/.test(digits) && digits !== '0000000'
}

// --------------- Load Emitter ---------------

async function loadEmitterContext(): Promise<FiscalCalculationResult<EmitterContext>> {
  const supabase = createServiceRoleClient()

  const { data: profile, error: profileError } = await supabase
    .from('company_fiscal_profile')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
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
  if (!isValidIbgeCode(profile.fiscal_municipality_code_ibge)) missingEmitterAddressFields.push('codigo IBGE')
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
      ie: normalizeStateRegistration(profile.inscricao_estadual),
      im: normalizeOptionalText(profile.inscricao_municipal),
      crt: profile.crt as '1' | '2' | '3',
      regime: regimeMap[profile.regime_tributario] || 'lucro_presumido',
      cnae: normalizeOptionalText(profile.cnae_principal),
      uf: normalizeText(profile.fiscal_state).toUpperCase(),
      ibge: digitsOnly(profile.fiscal_municipality_code_ibge),
      country_code: profile.fiscal_country_code || '1058',
      razao_social: normalizeText(profile.razao_social),
      nome_fantasia: normalizeOptionalText(profile.nome_fantasia),
      logradouro: normalizeText(profile.fiscal_address),
      numero: normalizeText(profile.fiscal_number) || 'S/N',
      complemento: normalizeOptionalText(profile.fiscal_complement),
      bairro: normalizeText(profile.fiscal_neighborhood),
      cidade: normalizeText(profile.fiscal_city),
      cep: normalizeOptionalText(profile.fiscal_zip_code),
      telefone: normalizeOptionalText(profile.fiscal_phone || profile.phone),
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

  const resolvedStreet = normalizeText(
    (address?.street as string | undefined)
    || (address?.address as string | undefined)
  )
  const resolvedNeighborhood = normalizeText(address?.neighborhood as string | undefined)
  const resolvedCity = normalizeText(address?.city as string | undefined)
  const uf = normalizeText((address?.state as string | undefined) || (store.state as string | undefined)).toUpperCase()
  const ibge = digitsOnly(address?.municipality_code as string | undefined)
  const missingStoreAddressFields: string[] = []

  if (!uf || uf.length !== 2) {
    missingStoreAddressFields.push('UF')
  }

  if (!isValidIbgeCode(ibge)) {
    missingStoreAddressFields.push('codigo IBGE')
  }

  if (!hasMeaningfulText(resolvedStreet, 2)) {
    missingStoreAddressFields.push('logradouro')
  }

  if (!hasMeaningfulText(resolvedNeighborhood, 2)) {
    missingStoreAddressFields.push('bairro')
  }

  if (!hasMeaningfulText(resolvedCity, 2)) {
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
      ie: normalizeStateRegistration((fiscalData?.state_registration as string | undefined) || (store.state_registration as string | undefined)),
      im: normalizeOptionalText(fiscalData?.municipal_registration as string | undefined),
      uf,
      ibge,
      country_code: (address?.country_code || '1058').replace(/\D/g, ''),
      is_consumer_final: isConsumerFinal,
      fiscal_email: fiscalData?.fiscal_email || store.email || null,
      nome: normalizeText((store.name as string | undefined) || (store.company_name as string | undefined)),
      logradouro: resolvedStreet,
      numero: normalizeText(address?.number as string | undefined) || 'S/N',
      complemento: normalizeOptionalText(address?.complement as string | undefined),
      bairro: resolvedNeighborhood,
      cidade: resolvedCity,
      cep: normalizeOptionalText(address?.zip_code as string | undefined),
      telefone: normalizeOptionalText(store.phone),
    },
  }
}

// --------------- Load Environment ---------------

async function loadEnvironmentContext(): Promise<FiscalCalculationResult<EnvironmentContext>> {
  const supabase = createServiceRoleClient()

  const { data: env, error: envError } = await supabase
    .from('company_fiscal_environment')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (envError) {
    return { success: false, error: { code: 'ENV_LOAD_FAILED', message: envError.message } }
  }

  if (!env) {
    return { success: false, error: { code: 'ENV_NOT_FOUND', message: 'Ambiente de emissao nao configurado.' } }
  }

  const params = parseFiscalEnvironmentParams(
    (env.parametros_jsonb || {}) as Record<string, unknown>
  )

  return {
    success: true,
    data: {
      ambiente: env.ambiente === 'producao' ? 'producao' : 'homologacao',
      serie_nfe: env.serie_padrao_nfe || '1',
      proximo_numero_nfe: safeNumber(env.proximo_numero_nfe, 1),
      tipo_emissao: normalizeFiscalEmissionMode(env.tipo_emissao),
      emissao_ativa: env.emissao_ativa === true,
      modalidade_frete_padrao: env.modalidade_frete_padrao || 'destinatario',
      natureza_operacao: env.natureza_operacao || 'VENDA DE MERCADORIA',
      desconto_impostos_prazo: env.desconto_impostos_prazo !== false,
      icms_base_pis_cofins: env.icms_base_pis_cofins === true,
      frete_base_icms: env.frete_base_icms === true,
      max_itens_por_nota: safeNumber(env.max_itens_por_nota, 100),
      codigo_referencia_nota: env.codigo_referencia_nota || 'codigo_interno',
      item_additional_info_flags: params.itemAdditionalInfoFlags,
      serie_nfce: env.serie_nfce || '0',
      proximo_numero_nfce: safeNumber(env.proximo_numero_nfce, 1),
    },
  }
}

// --------------- Load Order Items with Tax Profiles ---------------

async function loadOrderItemsContext(
  orderId: string,
  storeUf: string,
  operationDirection: 'outbound' | 'inbound'
): Promise<FiscalCalculationResult<FiscalItemContext[]>> {
  const supabase = createServiceRoleClient()

  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      id,
      product_variant_id,
      product_name,
      fabric_name,
      color_name,
      size,
      size_name,
      quantity,
      unit_price,
      subtotal,
      cfop_override_code,
      tax_profile_id,
      product_variant:product_variants(
        sku,
        product_id,
        product:products(
          id,
          commercial_code,
          manufacturer_name,
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
      .eq('operation_direction', operationDirection)
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
      default_output_cfop_config_id: (taxProfile.default_output_cfop_config_id as string) || null,
      default_input_cfop_config_id: (taxProfile.default_input_cfop_config_id as string) || null,
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
      sku: normalizeOptionalText((variant?.sku as string | undefined) || null),
      commercial_code: normalizeOptionalText(product?.commercial_code as string | undefined),
      manufacturer_name: normalizeOptionalText(product?.manufacturer_name as string | undefined),
      product_name: (item.product_name as string) || '',
      fabric_name: normalizeOptionalText(item.fabric_name as string | undefined),
      color_name: normalizeOptionalText(item.color_name as string | undefined),
      size: normalizeOptionalText(item.size as string | undefined),
      size_name: normalizeOptionalText(item.size_name as string | undefined),
      quantity: safeNumber(item.quantity, 1),
      unit_price: safeNumber(item.unit_price),
      subtotal: safeNumber(item.subtotal),
      cfop_override_code: sanitizeCfopCode(item.cfop_override_code as string | undefined),
      tax_profile: resolvedProfile,
      applied_rule: appliedRule,
      icms_rule: icmsRule,
      icms_interstate_rule: icmsInterstateRule,
      icms_st_rule: icmsStRule,
      ibscbs_context: null,
    })
  }

  const cfopConfigIds = Array.from(new Set(
    items
      .map((resolvedItem) => (
        resolvedItem.applied_rule?.cfop_config_id
        || (operationDirection === 'inbound'
          ? resolvedItem.tax_profile.default_input_cfop_config_id
          : resolvedItem.tax_profile.default_output_cfop_config_id)
      ))
      .filter((value): value is string => Boolean(value))
  ))
  const emitterLinkResult = await supabase
    .from('emitter_ibscbs_state_links')
    .select('target_uf, ibscbs_base_id, ibscbs_version_id')
    .eq('is_active', true)
    .or(`target_uf.eq.${storeUf},target_uf.is.null`)

  if (emitterLinkResult.error) {
    return {
      success: false,
      error: {
        code: 'EMITTER_IBSCBS_LINKS_LOAD_FAILED',
        message: emitterLinkResult.error.message,
      },
    }
  }

  const emitterLinks = (emitterLinkResult.data || []) as Array<Record<string, unknown>>
  const ibscbsBaseIds = Array.from(new Set([
    ...items.map((resolvedItem) => resolvedItem.tax_profile.ibscbs_base_id).filter((value): value is string => Boolean(value)),
    ...emitterLinks.map((row) => normalizeOptionalText(row.ibscbs_base_id as string | undefined)).filter((value): value is string => Boolean(value)),
  ]))
  const ibscbsVersionIds = Array.from(new Set([
    ...items.map((resolvedItem) => resolvedItem.tax_profile.ibscbs_version_id).filter((value): value is string => Boolean(value)),
    ...emitterLinks.map((row) => normalizeOptionalText(row.ibscbs_version_id as string | undefined)).filter((value): value is string => Boolean(value)),
  ]))

  const [
    cfopConfigsResult,
    cfopIbscbsConfigsResult,
    ibscbsBasesResult,
    ibscbsVersionsResult,
    activeIbscbsVersionsResult,
  ] = await Promise.all([
    cfopConfigIds.length > 0
      ? supabase
        .from('fiscal_cfop_configs')
        .select('id, impacts_ibscbs, configuration_status, future_tax_payload')
        .in('id', cfopConfigIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    cfopConfigIds.length > 0
      ? supabase
        .from('fiscal_cfop_ibscbs_configs')
        .select('cfop_config_id, cst_catalog_version_id, cst_code, classification_version_id, classification_code, regular_cst_code, regular_classification_code, presumed_credit_catalog_version_id, presumed_credit_code, presumed_credit_rate, future_tax_payload')
        .in('cfop_config_id', cfopConfigIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ibscbsBaseIds.length > 0
      ? supabase
        .from('fiscal_ibscbs_bases')
        .select('id, code, name, future_tax_payload')
        .in('id', ibscbsBaseIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ibscbsVersionIds.length > 0
      ? supabase
        .from('fiscal_ibscbs_base_versions')
        .select('id, ibscbs_base_id, version_label, future_tax_payload')
        .in('id', ibscbsVersionIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ibscbsBaseIds.length > 0
      ? supabase
        .from('fiscal_ibscbs_base_versions')
        .select('id, ibscbs_base_id, version_label, future_tax_payload')
        .in('ibscbs_base_id', ibscbsBaseIds)
        .eq('status', 'active')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ])

  if (cfopConfigsResult.error) {
    return {
      success: false,
      error: {
        code: 'CFOP_CONFIGS_LOAD_FAILED',
        message: cfopConfigsResult.error.message,
      },
    }
  }

  if (cfopIbscbsConfigsResult.error) {
    return {
      success: false,
      error: {
        code: 'CFOP_IBSCBS_CONFIGS_LOAD_FAILED',
        message: cfopIbscbsConfigsResult.error.message,
      },
    }
  }

  if (ibscbsBasesResult.error) {
    return {
      success: false,
      error: {
        code: 'IBSCBS_BASES_LOAD_FAILED',
        message: ibscbsBasesResult.error.message,
      },
    }
  }

  if (ibscbsVersionsResult.error) {
    return {
      success: false,
      error: {
        code: 'IBSCBS_VERSIONS_LOAD_FAILED',
        message: ibscbsVersionsResult.error.message,
      },
    }
  }

  if (activeIbscbsVersionsResult.error) {
    return {
      success: false,
      error: {
        code: 'IBSCBS_ACTIVE_VERSIONS_LOAD_FAILED',
        message: activeIbscbsVersionsResult.error.message,
      },
    }
  }

  const cfopConfigsById = new Map(
    ((cfopConfigsResult.data || []) as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        impacts_ibscbs: row.impacts_ibscbs === true,
        configuration_status: normalizeOptionalText(row.configuration_status as string | undefined),
        future_tax_payload: (row.future_tax_payload as Record<string, unknown>) || {},
      },
    ])
  )
  const cfopIbscbsByCfopConfigId = new Map(
    ((cfopIbscbsConfigsResult.data || []) as Array<Record<string, unknown>>).map((row) => [
      String(row.cfop_config_id),
      {
        cfop_config_id: String(row.cfop_config_id),
        cst_catalog_version_id: normalizeOptionalText(row.cst_catalog_version_id as string | undefined),
        cst_code: normalizeOptionalText(row.cst_code as string | undefined),
        classification_version_id: normalizeOptionalText(row.classification_version_id as string | undefined),
        classification_code: normalizeOptionalText(row.classification_code as string | undefined),
        regular_cst_code: normalizeOptionalText(row.regular_cst_code as string | undefined),
        regular_classification_code: normalizeOptionalText(row.regular_classification_code as string | undefined),
        presumed_credit_catalog_version_id: normalizeOptionalText(row.presumed_credit_catalog_version_id as string | undefined),
        presumed_credit_code: normalizeOptionalText(row.presumed_credit_code as string | undefined),
        presumed_credit_rate: row.presumed_credit_rate === null || row.presumed_credit_rate === undefined
          ? null
          : safeNumber(row.presumed_credit_rate),
        future_tax_payload: (row.future_tax_payload as Record<string, unknown>) || {},
      },
    ])
  )
  const basesById = new Map(
    ((ibscbsBasesResult.data || []) as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        code: normalizeOptionalText(row.code as string | undefined),
        name: normalizeOptionalText(row.name as string | undefined),
        future_tax_payload: (row.future_tax_payload as Record<string, unknown>) || {},
      },
    ])
  )
  const versionRows = [
    ...((ibscbsVersionsResult.data || []) as Array<Record<string, unknown>>),
    ...((activeIbscbsVersionsResult.data || []) as Array<Record<string, unknown>>),
  ]
  const versionsById = new Map(
    versionRows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        ibscbs_base_id: String(row.ibscbs_base_id),
        version_label: normalizeOptionalText(row.version_label as string | undefined),
        future_tax_payload: (row.future_tax_payload as Record<string, unknown>) || {},
      },
    ])
  )
  const activeVersionsByBaseId = new Map<string, {
    id: string
    ibscbs_base_id: string
    version_label: string | null
    future_tax_payload: Record<string, unknown>
  }>()

  for (const row of ((activeIbscbsVersionsResult.data || []) as Array<Record<string, unknown>>)) {
    const baseId = String(row.ibscbs_base_id)
    if (!activeVersionsByBaseId.has(baseId)) {
      activeVersionsByBaseId.set(baseId, {
        id: String(row.id),
        ibscbs_base_id: baseId,
        version_label: normalizeOptionalText(row.version_label as string | undefined),
        future_tax_payload: (row.future_tax_payload as Record<string, unknown>) || {},
      })
    }
  }

  const ibscbsRuleVersionIds = Array.from(new Set(
    versionRows
      .map((row) => normalizeOptionalText(row.id as string | undefined))
      .filter((value): value is string => Boolean(value))
  ))
  const ibscbsRulesResult = ibscbsRuleVersionIds.length > 0
    ? await supabase
      .from('fiscal_ibscbs_rules')
      .select('ibscbs_version_id, target_uf, cst_code, classification_code, future_tax_payload')
      .in('ibscbs_version_id', ibscbsRuleVersionIds)
      .or(`target_uf.eq.${storeUf},target_uf.is.null`)
    : { data: [] as Record<string, unknown>[], error: null }

  if (ibscbsRulesResult.error) {
    return {
      success: false,
      error: {
        code: 'IBSCBS_RULES_LOAD_FAILED',
        message: ibscbsRulesResult.error.message,
      },
    }
  }

  const rulesByVersionId = new Map<string, Array<{
    ibscbs_version_id: string
    target_uf: string | null
    cst_code: string | null
    classification_code: string | null
    future_tax_payload: Record<string, unknown>
  }>>()

  for (const row of ((ibscbsRulesResult.data || []) as Array<Record<string, unknown>>)) {
    const versionId = String(row.ibscbs_version_id)
    const bucket = rulesByVersionId.get(versionId) || []
    bucket.push({
      ibscbs_version_id: versionId,
      target_uf: normalizeOptionalText(row.target_uf as string | undefined),
      cst_code: normalizeOptionalText(row.cst_code as string | undefined),
      classification_code: normalizeOptionalText(row.classification_code as string | undefined),
      future_tax_payload: (row.future_tax_payload as Record<string, unknown>) || {},
    })
    rulesByVersionId.set(versionId, bucket)
  }

  const resolvedItems = items.map((resolvedItem) => ({
    ...resolvedItem,
    ibscbs_context: resolveIbsCbsContext(
      resolvedItem,
      storeUf,
      operationDirection,
      {
        emitterLinks: emitterLinks.map((row) => ({
          target_uf: normalizeOptionalText(row.target_uf as string | undefined),
          ibscbs_base_id: String(row.ibscbs_base_id),
          ibscbs_version_id: normalizeOptionalText(row.ibscbs_version_id as string | undefined),
        })),
        cfopConfigsById,
        cfopIbscbsByCfopConfigId,
        basesById,
        versionsById,
        activeVersionsByBaseId,
        rulesByVersionId,
      }
    ),
  }))

  return { success: true, data: resolvedItems }
}

interface OrderFiscalDraftContext {
  operation: FiscalOperationContext
  transport: FiscalTransportContext
  volumes: FiscalVolumeContext[]
  operationDirection: 'outbound' | 'inbound'
}

function sanitizeNaturezaSnapshot(
  value: unknown,
  fallbackDescription: string,
  fallbackDirection: 'outbound' | 'inbound'
): FiscalOperationContext['natureza_operacao_descricao'] extends string ? {
  id: string | null
  descricao: string
  tipo_operacao: 'outbound' | 'inbound'
  aplica_st: boolean
  aplica_difal: boolean
  aplica_devolucao: boolean
  source: 'catalog' | 'cfop_fallback' | 'environment_default' | 'manual'
} : never {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const descricao = normalizeOptionalText(candidate.descricao as string | undefined) || fallbackDescription
  const tipo_operacao = candidate.tipo_operacao === 'inbound' ? 'inbound' : fallbackDirection
  const source =
    candidate.source === 'catalog'
      ? 'catalog'
      : candidate.source === 'cfop_fallback'
        ? 'cfop_fallback'
        : candidate.source === 'environment_default'
          ? 'environment_default'
          : 'manual'

  return {
    id: normalizeOptionalText(candidate.id as string | undefined),
    descricao,
    tipo_operacao,
    aplica_st: candidate.aplica_st === true,
    aplica_difal: candidate.aplica_difal === true,
    aplica_devolucao: candidate.aplica_devolucao === true,
    source,
  }
}

async function loadOrderFiscalDraftContext(
  orderId: string,
  environment: EnvironmentContext,
  store: StoreContext,
  fallbackOperationDirection: 'outbound' | 'inbound'
): Promise<FiscalCalculationResult<OrderFiscalDraftContext>> {
  const supabase = createServiceRoleClient()

  const { data: settings, error: settingsError } = await supabase
    .from('order_fiscal_settings')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()

  if (settingsError) {
    return {
      success: false,
      error: {
        code: 'ORDER_FISCAL_SETTINGS_LOAD_FAILED',
        message: settingsError.message,
      },
    }
  }

  const settingsRecord = settings as Record<string, unknown> | null
  const settingsId = normalizeOptionalText(settingsRecord?.id as string | undefined)
  let volumeRows: Array<Record<string, unknown>> = []

  if (settingsId) {
    const { data: rawVolumeRows, error: volumesError } = await supabase
      .from('order_fiscal_volumes')
      .select('quantity, species, brand, numbering, gross_weight, net_weight, sort_order')
      .eq('order_fiscal_settings_id', settingsId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (volumesError) {
      return {
        success: false,
        error: {
          code: 'ORDER_FISCAL_VOLUMES_LOAD_FAILED',
          message: volumesError.message,
        },
      }
    }

    volumeRows = (rawVolumeRows || []) as Array<Record<string, unknown>>
  }

  const cfopGlobalCode = sanitizeCfopCode(settingsRecord?.cfop_global_code as string | undefined)
  const inferredDirection = cfopGlobalCode ? inferOperationDirectionFromCfop(cfopGlobalCode) : fallbackOperationDirection
  const operationDirection =
    settingsRecord?.operation_direction === 'inbound'
      ? 'inbound'
      : settingsRecord?.operation_direction === 'outbound'
        ? 'outbound'
        : inferredDirection

  const naturezaSnapshot = sanitizeNaturezaSnapshot(
    settingsRecord?.natureza_operacao_snapshot,
    environment.natureza_operacao || 'Venda de mercadoria',
    operationDirection
  )

  const operation: FiscalOperationContext = {
    cfop_global_code: cfopGlobalCode,
    natureza_operacao_id: normalizeOptionalText(settingsRecord?.natureza_operacao_id as string | undefined),
    natureza_operacao_descricao: naturezaSnapshot.descricao,
    natureza_operacao_source: naturezaSnapshot.source,
    finalidade_nfe:
      settingsRecord?.finalidade_nfe === 'complementar'
        ? 'complementar'
        : settingsRecord?.finalidade_nfe === 'ajuste'
          ? 'ajuste'
          : settingsRecord?.finalidade_nfe === 'devolucao'
            ? 'devolucao'
            : 'normal',
    presenca_comprador:
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
    consumidor_final: settingsRecord?.consumidor_final === true || (!settingsRecord && store.is_consumer_final),
  }

  const transport: FiscalTransportContext = {
    freight_mode: (
      ['emitente', 'destinatario', 'terceiros', 'proprio_remetente', 'proprio_destinatario', 'sem_frete'].includes(
        String(settingsRecord?.freight_mode || '')
      )
        ? String(settingsRecord?.freight_mode)
        : environment.modalidade_frete_padrao || 'sem_frete'
    ) as FiscalTransportContext['freight_mode'],
    delivery_form: (
      ['nao_informado', 'retirada', 'transportadora', 'frota_propria', 'correios', 'entrega_expressa', 'balcao'].includes(
        String(settingsRecord?.delivery_form || '')
      )
        ? String(settingsRecord?.delivery_form)
        : 'nao_informado'
    ) as FiscalTransportContext['delivery_form'],
    transporter_name: normalizeOptionalText(settingsRecord?.transporter_name as string | undefined),
    transporter_document: digitsOnly(settingsRecord?.transporter_document as string | undefined) || null,
    transporter_address: normalizeOptionalText(settingsRecord?.transporter_address as string | undefined),
    transporter_city: normalizeOptionalText(settingsRecord?.transporter_city as string | undefined),
    transporter_state: normalizeOptionalText(settingsRecord?.transporter_state as string | undefined)?.toUpperCase() || null,
    transporter_ie: normalizeOptionalText(settingsRecord?.transporter_ie as string | undefined),
    vehicle_plate: normalizeOptionalText(settingsRecord?.vehicle_plate as string | undefined)?.toUpperCase() || null,
    vehicle_uf: normalizeOptionalText(settingsRecord?.vehicle_uf as string | undefined)?.toUpperCase() || null,
    antt_code: normalizeOptionalText(settingsRecord?.antt_code as string | undefined),
    freight_value: safeNumber(settingsRecord?.freight_value),
    insurance_value: safeNumber(settingsRecord?.insurance_value),
    other_expenses_value: safeNumber(settingsRecord?.other_expenses_value),
  }

  const volumes: FiscalVolumeContext[] = ((volumeRows || []) as Array<Record<string, unknown>>)
    .map((row) => ({
      quantity: Math.max(1, safeNumber(row.quantity, 1)),
      species: normalizeText(row.species as string | undefined),
      brand: normalizeOptionalText(row.brand as string | undefined),
      numbering: normalizeOptionalText(row.numbering as string | undefined),
      gross_weight: row.gross_weight === null || row.gross_weight === undefined ? null : safeNumber(row.gross_weight),
      net_weight: row.net_weight === null || row.net_weight === undefined ? null : safeNumber(row.net_weight),
      sort_order: safeNumber(row.sort_order, 0),
    }))
    .filter((row) => row.species.length > 0)
    .sort((left, right) => left.sort_order - right.sort_order)

  return {
    success: true,
    data: {
      operation,
      transport,
      volumes,
      operationDirection,
    },
  }
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

  const draftResult = await loadOrderFiscalDraftContext(
    orderId,
    envResult.data,
    storeResult.data,
    operationDirection
  )
  if (!draftResult.success) return draftResult

  const itemsResult = await loadOrderItemsContext(
    orderId,
    storeResult.data.uf,
    draftResult.data.operationDirection
  )
  if (!itemsResult.success) return itemsResult

  return {
    success: true,
    data: {
      emitter: emitterResult.data,
      store: {
        ...storeResult.data,
        is_consumer_final: draftResult.data.operation.consumidor_final,
      },
      environment: envResult.data,
      operation: draftResult.data.operation,
      transport: draftResult.data.transport,
      volumes: draftResult.data.volumes,
      items: itemsResult.data,
      operation_date: new Date().toISOString().slice(0, 10),
      operation_direction: draftResult.data.operationDirection,
    },
  }
}
