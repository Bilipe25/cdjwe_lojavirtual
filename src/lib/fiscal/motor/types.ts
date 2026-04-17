// ============================================================
// Motor Fiscal — Core Types
// Camada 2: Business logic layer for tax calculation
// Regime: Lucro Presumido (CRT=3, CST, PIS/COFINS cumulativo)
// ============================================================

// --------------- Emitter Context ---------------

export interface EmitterContext {
  cnpj: string
  ie: string | null
  im: string | null
  crt: '1' | '2' | '3'
  regime: 'simples_nacional' | 'simples_excesso' | 'lucro_presumido' | 'lucro_real'
  cnae: string | null
  uf: string
  ibge: string
  country_code: string
  // Identity
  razao_social: string
  nome_fantasia: string | null
  // Address
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  cep: string | null
  telefone: string | null
  // Federal config
  aliquota_pis: number
  aliquota_cofins: number
  credito_presumido_icms: boolean
  ultrapassou_sublimite: boolean
  exibir_total_tributos: boolean
  artigo_sc_mva: string
}

// --------------- Store (Destinatário) Context ---------------

export interface StoreContext {
  store_id: string
  document_type: 'CPF' | 'CNPJ'
  document_number: string
  person_type: 'individual' | 'legal_entity'
  taxpayer_indicator: 'contributor' | 'non_contributor' | 'exempt'
  ie: string | null
  im: string | null
  uf: string
  ibge: string
  country_code: string
  is_consumer_final: boolean
  fiscal_email: string | null
  // Identity
  nome: string
  // Address
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  cep: string | null
  telefone: string | null
}

// --------------- Environment Context ---------------

export interface EnvironmentContext {
  ambiente: 'producao' | 'homologacao'
  serie_nfe: string
  proximo_numero_nfe: number
  tipo_emissao: string
  modalidade_frete_padrao: string
  natureza_operacao: string
  // Toggles
  desconto_impostos_prazo: boolean
  icms_base_pis_cofins: boolean
  frete_base_icms: boolean
  max_itens_por_nota: number
  codigo_referencia_nota: string
  // NFC-e
  serie_nfce: string
  proximo_numero_nfce: number
}

// --------------- Order Fiscal Operation / Transport / Volumes ---------------

export interface FiscalOperationContext {
  cfop_global_code: string | null
  natureza_operacao_id: string | null
  natureza_operacao_descricao: string
  natureza_operacao_source: 'catalog' | 'cfop_fallback' | 'environment_default' | 'manual'
  finalidade_nfe: 'normal' | 'complementar' | 'ajuste' | 'devolucao'
  presenca_comprador:
    | 'nao_se_aplica'
    | 'presencial'
    | 'internet'
    | 'teleatendimento'
    | 'entrega_domicilio'
    | 'presencial_fora_estabelecimento'
    | 'outros'
  consumidor_final: boolean
}

export interface FiscalTransportContext {
  freight_mode:
    | 'emitente'
    | 'destinatario'
    | 'terceiros'
    | 'proprio_remetente'
    | 'proprio_destinatario'
    | 'sem_frete'
  delivery_form:
    | 'nao_informado'
    | 'retirada'
    | 'transportadora'
    | 'frota_propria'
    | 'correios'
    | 'entrega_expressa'
    | 'balcao'
  transporter_name: string | null
  transporter_document: string | null
  vehicle_plate: string | null
  vehicle_uf: string | null
  antt_code: string | null
  freight_value: number
  insurance_value: number
  other_expenses_value: number
}

export interface FiscalVolumeContext {
  quantity: number
  species: string
  brand: string | null
  numbering: string | null
  gross_weight: number | null
  net_weight: number | null
  sort_order: number
}

// --------------- Resolved Tax Profile ---------------

export interface ResolvedTaxProfile {
  tax_profile_id: string
  tax_profile_version: number
  name: string
  code: string
  // Classification
  ncm: string
  cest: string | null
  origin_code: string
  fiscal_type: string
  item_type: string
  // Units
  commercial_unit: string | null
  tax_unit: string | null
  ean_gtin: string | null
  tax_ean_gtin: string | null
  // CFOP defaults
  default_output_cfop: string | null
  default_input_cfop: string | null
  default_fiscal_description: string | null
  // PIS/COFINS
  pis_cst: string | null
  cofins_cst: string | null
  pis_aliquota: number | null
  cofins_aliquota: number | null
  // IPI
  has_ipi: boolean
  ipi_cst_out: string | null
  ipi_enquadramento_codigo: string | null
  // ST
  has_substitution_tax: boolean
  requires_cest: boolean
  // ICMS base link
  icms_base_id: string | null
  // IBS/CBS base link
  ibscbs_base_id: string | null
  ibscbs_version_id: string | null
  // Override source
  is_override: boolean
}

// --------------- Resolved Tax Rule ---------------

export interface ResolvedTaxRule {
  rule_id: string
  rule_name: string
  operation_direction: 'outbound' | 'inbound'
  origin_uf: string | null
  destination_uf: string | null
  cfop_override: string | null
  cfop_config_id: string | null
  priority: number
  rule_payload: Record<string, unknown>
}

// --------------- ICMS Resolved Rule ---------------

export interface IcmsResolvedRule {
  cst_code: string
  icms_rate: number
  fcp_rate: number
  base_calc_type: string
  base_calc_percent: number | null
  base_reduction_percent: number | null
  special_advance_destination: boolean
  differentiate_consumer_final_rate: boolean
}

export interface IcmsInterstateRule {
  icms_rate: number
  fcp_rate: number
  consumer_final_mode: string
}

export interface IcmsStRule {
  st_enabled: boolean
  st_base_calc_type: string | null
  st_rate: number | null
  st_fcp_rate: number | null
  mva_original: number | null
  mva_adjusted: number | null
  st_base_reduction_percent: number | null
}

// --------------- Fiscal Item Context ---------------

export interface FiscalItemContext {
  order_item_id: string
  product_variant_id: string
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  cfop_override_code: string | null
  // Resolved
  tax_profile: ResolvedTaxProfile
  applied_rule: ResolvedTaxRule | null
  // ICMS rules (loaded from bases)
  icms_rule: IcmsResolvedRule | null
  icms_interstate_rule: IcmsInterstateRule | null
  icms_st_rule: IcmsStRule | null
}

// --------------- Full Fiscal Context ---------------

export interface FiscalContext {
  emitter: EmitterContext
  store: StoreContext
  environment: EnvironmentContext
  operation: FiscalOperationContext
  transport: FiscalTransportContext
  volumes: FiscalVolumeContext[]
  items: FiscalItemContext[]
  operation_date: string
  operation_direction: 'outbound' | 'inbound'
}

// --------------- Tax Breakdowns ---------------

export interface IcmsBreakdown {
  cst: string
  base: number
  rate: number
  value: number
  base_reduction_percent: number
  // DIFAL (interestadual + consumidor final)
  difal_base: number
  difal_rate_origin: number
  difal_rate_destination: number
  difal_value_origin: number
  difal_value_destination: number
  has_difal: boolean
}

export interface FcpBreakdown {
  base: number
  rate: number
  value: number
}

export interface StBreakdown {
  enabled: boolean
  base: number
  rate: number
  value: number
  mva: number
  fcp_base: number
  fcp_rate: number
  fcp_value: number
}

export interface PisCofinsItemBreakdown {
  cst: string
  base: number
  rate: number
  value: number
}

export interface IpiBreakdown {
  cst: string
  enquadramento: string | null
  base: number
  rate: number
  value: number
}

export interface IbsCbsBreakdown {
  cst_code: string | null
  classification_code: string | null
  base: number
  rate: number
  value: number
}

// --------------- Item Tax Breakdown (per item) ---------------

export interface ItemTaxBreakdown {
  order_item_id: string
  product_variant_id: string
  product_name: string
  quantity: number
  cfop: string
  cfop_source: 'item_override' | 'order_global' | 'rule_override' | 'profile_default' | 'geographic_inference'
  // Fiscal values
  fiscal_unit_value: number
  fiscal_total_value: number
  fiscal_discount_value: number
  fiscal_freight_value: number
  fiscal_insurance_value: number
  fiscal_other_expenses_value: number
  // Tax breakdowns
  icms: IcmsBreakdown
  fcp: FcpBreakdown
  st: StBreakdown
  pis: PisCofinsItemBreakdown
  cofins: PisCofinsItemBreakdown
  ipi: IpiBreakdown
  ibscbs: IbsCbsBreakdown
  // Total tributos (Lei da Transparência)
  total_tributos: number
  // Metadata
  tax_profile_id: string
  tax_profile_version: number
  ncm: string
  cest: string | null
  origin_code: string
  commercial_unit: string | null
  tax_unit: string | null
  ean_gtin: string | null
  tax_ean_gtin: string | null
}

// --------------- Document Totals ---------------

export interface DocumentTotals {
  vProd: number
  vBC: number
  vICMS: number
  vBCST: number
  vST: number
  vFCP: number
  vPIS: number
  vCOFINS: number
  vIPI: number
  vDesc: number
  vFrete: number
  vSeg: number
  vOutro: number
  vTotTrib: number
  vNF: number
  item_count: number
  volume_count: number
  total_gross_weight: number
  total_net_weight: number
}

// --------------- Validation ---------------

export interface ValidationError {
  field: string
  code: string
  message: string
  severity: 'error' | 'warning'
  item_index?: number
}

export interface ValidationResult {
  is_valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  checked_at: string
}

// --------------- Fiscal Document Payload (motor output) ---------------

export interface FiscalDocumentPayload {
  context: FiscalContext
  items: ItemTaxBreakdown[]
  totals: DocumentTotals
  validation: ValidationResult
  calculated_at: string
  motor_version: string
}

// --------------- Utility types ---------------

export interface FiscalCalculationError {
  code: string
  message: string
  item_index?: number
  field?: string
}

export type FiscalCalculationResult<T> =
  | { success: true; data: T }
  | { success: false; error: FiscalCalculationError }

export const MOTOR_VERSION = '1.0.0'

// --------------- Helper: round to 2 decimal places (fiscal standard) ---------------

export function roundFiscal(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// --------------- Helper: round to 4 decimal places (rate precision) ---------------

export function roundRate(value: number): number {
  return roundFiscal(value, 4)
}

// --------------- Helper: safe numeric ---------------

export function safeNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}
