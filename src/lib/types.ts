import type { FiscalBaseType, FiscalCatalogType, FiscalImportSourceType } from '@/lib/fiscal/constants'

// Database & Application Types for CDJWE B2B System

// ==================== AUTH & USERS ====================

export type UserRole = 'admin' | 'client' | 'representative' | 'driver'

export type ApprovalStatus = 'pending' | 'approved' | 'blocked' | 'imported'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  status: ApprovalStatus
  avatar_url: string | null
  created_at: string
  updated_at: string
}

// ==================== CUSTOMER TYPES ====================

export interface CustomerType {
  id: string
  name: string
  slug: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ==================== CUSTOMER TAGS ====================

export interface CustomerTag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface StoreTag {
  store_id: string
  tag_id: string
  created_at: string
  // Relations
  customer_tags?: CustomerTag
}

export interface StoreAddress {
  id: string
  store_id: string
  title: string
  is_main: boolean
  zip_code: string
  address: string
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string
  state: string
  municipality_code?: string | null
  country_code?: string | null
  created_at: string
  updated_at: string
}

export type PersonType = 'individual' | 'legal_entity'
export type FiscalDocumentType = 'CPF' | 'CNPJ'
export type TaxpayerIndicator = 'contributor' | 'non_contributor' | 'exempt'

export interface FiscalDocument {
  person_type: PersonType
  document_type: FiscalDocumentType
  document_number: string
}

export interface StoreCommercialSettings {
  id: string
  store_id: string
  override_price_table_id: string | null
  override_payment_method_id: string | null
  override_payment_condition_id: string | null
  financial_profile: 'no_restriction' | 'cash_only' | 'block_sales'
  max_discount_percentage: number | null
  credit_limit: number | null
  commercial_notes: string | null
  created_at: string
  updated_at: string
}

export interface StoreFiscalData {
  id: string
  store_id: string
  person_type: PersonType
  document_type: FiscalDocumentType
  document_number: string
  state_registration: string | null
  municipal_registration: string | null
  taxpayer_indicator: TaxpayerIndicator
  fiscal_email: string | null
  fiscal_notes: string | null
  fiscal_address_id: string | null
  future_tax_payload?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ==================== STORES (Clientes) ====================

export interface Store {
  id: string
  profile_id: string
  customer_code?: string | null
  company_name: string
  trade_name: string | null
  cnpj: string
  person_type?: PersonType | null
  document_type?: FiscalDocumentType | null
  document_number?: string | null
  state_registration: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  region: string | null
  phone: string | null
  email: string | null
  notes: string | null
  customer_type_id: string | null
  representative_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Relations
  customer_type?: CustomerType
  representative?: Profile | null
  store_tags?: StoreTag[]
  store_addresses?: StoreAddress[]
  commercial_settings?: StoreCommercialSettings | null
  fiscal_data?: StoreFiscalData | null
}

// ==================== PRODUCT CATALOG ====================

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  parent_id: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at?: string
}

export interface ProductTaxProfile {
  id: string
  name: string
  code: string
  description: string | null
  ncm: string | null
  cest: string | null
  origin_code: string
  commercial_unit: string | null
  tax_unit: string | null
  ean_gtin: string | null
  tax_ean_gtin: string | null
  fiscal_type: string
  item_type: string
  has_substitution_tax: boolean
  requires_cest: boolean
  has_ipi: boolean
  ipi_cst_out: string | null
  ipi_enquadramento_codigo: string | null
  pis_cst: string | null
  cofins_cst: string | null
  pis_aliquota: number | null
  cofins_aliquota: number | null
  default_output_cfop: string | null
  default_input_cfop: string | null
  internal_fiscal_code: string | null
  default_fiscal_notes: string | null
  is_active: boolean
  requires_tax_configuration: boolean
  future_tax_payload?: Record<string, unknown> | null
  metadata_jsonb?: Record<string, unknown> | null
  ncm_reference_id?: string | null
  ncm_version_id?: string | null
  tipi_reference_id?: string | null
  tipi_version_id?: string | null
  cest_reference_id?: string | null
  cest_version_id?: string | null
  default_output_cfop_reference_id?: string | null
  default_output_cfop_version_id?: string | null
  default_input_cfop_reference_id?: string | null
  default_input_cfop_version_id?: string | null
  default_output_cfop_config_id?: string | null
  default_input_cfop_config_id?: string | null
  icms_base_id?: string | null
  ibscbs_base_id?: string | null
  ibscbs_version_id?: string | null
  fiscal_reference_snapshot_jsonb?: Record<string, unknown> | null
  version: number
  created_at: string
  updated_at: string
}

export interface ProductTaxProfileRule {
  id: string
  tax_profile_id: string
  rule_name: string
  operation_direction: 'outbound' | 'inbound'
  origin_uf: string | null
  destination_uf: string | null
  customer_type_id: string | null
  person_type: PersonType | null
  taxpayer_indicator: TaxpayerIndicator | null
  cfop_override: string | null
  cfop_config_id?: string | null
  cfop_reference_id?: string | null
  cfop_version_id?: string | null
  priority: number
  is_active: boolean
  effective_from: string | null
  effective_to: string | null
  rule_payload_jsonb?: Record<string, unknown> | null
  future_tax_payload?: Record<string, unknown> | null
  version: number
  created_at: string
  updated_at: string
}

export interface FiscalReferenceVersion {
  id: string
  table_type: FiscalBaseType
  version_label: string
  import_batch_id: string | null
  imported_at: string
  imported_by: string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
  source_file_name: string | null
  source_type: string
  row_count: number
  activated_at: string | null
  activated_by: string | null
  metadata_jsonb?: Record<string, unknown> | null
  future_tax_payload?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface FiscalImportBatch {
  id: string
  table_type: FiscalBaseType
  status: 'draft' | 'imported' | 'failed' | 'cancelled'
  source_file_name: string | null
  source_type: FiscalImportSourceType
  imported_by: string | null
  started_at: string
  finished_at: string | null
  total_rows: number
  valid_rows: number
  invalid_rows: number
  error_summary_jsonb?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface FiscalImportBatchItem {
  id: string
  batch_id: string
  row_number: number
  validation_status: 'valid' | 'invalid'
  raw_payload_jsonb?: Record<string, unknown> | null
  normalized_payload_jsonb?: Record<string, unknown> | null
  validation_errors_jsonb?: string[] | null
  validation_warnings_jsonb?: string[] | null
  created_at: string
}

export interface FiscalNcmEntry {
  id: string
  version_id: string
  code: string
  description: string
  full_description: string | null
  metadata_jsonb?: Record<string, unknown> | null
  future_tax_payload?: Record<string, unknown> | null
  created_at: string
}

export interface FiscalTipiEntry {
  id: string
  version_id: string
  ncm_code: string
  ex_tipi: string | null
  description: string
  ipi_rate: number
  metadata_jsonb?: Record<string, unknown> | null
  future_tax_payload?: Record<string, unknown> | null
  created_at: string
}

export interface FiscalCestEntry {
  id: string
  version_id: string
  code: string
  description: string
  segment: string | null
  metadata_jsonb?: Record<string, unknown> | null
  future_tax_payload?: Record<string, unknown> | null
  created_at: string
}

export interface FiscalCfopEntry {
  id: string
  version_id: string
  code: string
  description: string
  operation_direction: 'outbound' | 'inbound' | 'both'
  metadata_jsonb?: Record<string, unknown> | null
  future_tax_payload?: Record<string, unknown> | null
  created_at: string
}

export interface FiscalCatalogItem {
  id: string
  catalog_type: FiscalCatalogType
  code: string
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
  metadata_jsonb?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  category_id: string
  tax_profile_id?: string | null
  size: string | null // ex: "3x2 lugares"
  has_size_variants?: boolean
  base_price: number
  is_active: boolean
  is_featured: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Relations
  category?: Category
  tax_profile?: ProductTaxProfile | null
  images?: ProductImage[]
  variants?: ProductVariant[]
  size_options?: ProductSizeOption[]
}

export interface ProductSizeOption {
  id: string
  product_id: string
  name: string
  slug: string
  price_mode: 'absolute' | 'delta'
  price_value: number
  is_active: boolean
  sort_order: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  url: string
  alt_text: string | null
  sort_order: number
  is_primary: boolean
  created_at: string
}

export interface Fabric {
  id: string
  name: string
  slug: string
  description: string | null
  price_modifier: number // adicional no preço base
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at?: string
  variant_count?: number
}

export interface FabricColor {
  id: string
  fabric_id: string
  name: string
  hex_code: string | null
  image_url: string | null // swatch ou amostra
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at?: string
  variant_count?: number
  // Relations
  fabric?: Fabric
}

export interface ProductVariant {
  id: string
  product_id: string
  fabric_id: string
  fabric_color_id: string
  sku: string | null
  price_override: number | null // se null, usa base_price + fabric.price_modifier
  image_url: string | null // imagem da combinação
  stock_quantity: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Relations
  product?: Product
  fabric?: Fabric
  fabric_color?: FabricColor
}

// ==================== PRICING ====================

export interface PriceTable {
  id: string
  name: string
  description: string | null
  discount_percentage: number // desconto sobre preço base
  is_default: boolean
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  customer_type_id: string | null
  created_at: string
  // Relations
  customer_type?: CustomerType | null
}

export interface PriceTableItem {
  id: string
  price_table_id: string
  product_variant_id: string
  custom_price: number
  created_at: string
}

export interface StorePriceTable {
  id: string
  store_id: string
  price_table_id: string
  created_at: string
}

export interface PriceTablePaymentRule {
  id: string
  price_table_id: string
  payment_method_condition_id?: string | null
  min_order_value: number
  max_order_value: number | null
  number_of_installments: number
  installment_days: string | null // Ex: "30, 60, 90"
  discount_percentage: number
  surcharge_percentage?: number
  is_active?: boolean
  created_at: string
  updated_at: string
  payment_method_condition?: PaymentMethodCondition | null
}

export interface PaymentMethod {
  id: string
  code: string
  name: string
  description: string | null
  icon: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  conditions?: PaymentMethodCondition[]
}

export interface PaymentMethodCondition {
  id: string
  payment_method_id: string
  payment_condition_id: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  payment_method?: PaymentMethod | null
  payment_condition?: PaymentCondition | null
}

// ==================== ORDERS ====================

export type OrderStatus = 
  | 'pending'       // Em análise
  | 'approved'      // Aprovado
  | 'in_production' // Em produção
  | 'shipped'       // Enviado
  | 'delivered'     // Entregue
  | 'cancelled'     // Cancelado

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'

export interface Order {
  id: string
  order_number: string
  store_id: string
  profile_id: string
  created_by_profile_id?: string | null
  sales_channel?: 'customer_portal' | 'representative'
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method_id?: string | null
  payment_condition_id: string | null
  payment_rule_id: string | null
  payment_method_condition_id?: string | null
  payment_method_code?: string | null
  payment_method_name?: string | null
  payment_condition_name?: string | null
  payment_condition_description?: string | null
  payment_installments?: number | null
  payment_discount_percentage?: number | null
  payment_surcharge_percentage?: number | null
  negotiation_discount_percentage?: number | null
  negotiation_discount_amount?: number | null
  negotiation_surcharge_amount?: number | null
  negotiation_reason?: string | null
  subtotal: number
  discount_amount: number
  coupon_id?: string | null
  coupon_code?: string | null
  coupon_discount_type?: 'percentage' | 'fixed' | null
  coupon_discount_value?: number | null
  coupon_discount_amount?: number | null
  total: number
  notes: string | null
  shipping_address: string | null
  estimated_delivery: string | null
  fiscal_snapshot?: Record<string, unknown> | null
  fiscal_ready?: boolean
  created_at: string
  updated_at: string
  // Relations
  store?: Store
  profile?: Profile
  created_by_profile?: Profile | null
  items?: OrderItem[]
  status_history?: OrderStatusHistory[]
  payment_method?: PaymentMethod
  payment_condition?: PaymentCondition
  payment_method_condition?: PaymentMethodCondition
  payment_rule?: PriceTablePaymentRule
}

export interface OrderItem {
  id: string
  order_id: string
  product_variant_id: string
  size_option_id?: string | null
  product_name: string // snapshot do nome no momento da compra
  fabric_name: string
  color_name: string
  size: string | null
  size_name?: string | null
  quantity: number
  unit_price: number
  product_price?: number | null
  size_price?: number | null
  variation_price?: number | null
  final_price?: number | null
  tax_profile_id?: string | null
  tax_profile_version?: number | null
  fiscal_ncm?: string | null
  fiscal_cest?: string | null
  fiscal_origin_code?: string | null
  fiscal_cfop?: string | null
  fiscal_context?: Record<string, unknown> | null
  fiscal_payload?: Record<string, unknown> | null
  subtotal: number
  created_at: string
  // Relations
  product_variant?: ProductVariant
}

export interface OrderItemFiscalSnapshot {
  tax_profile_id: string | null
  tax_profile_version: number | null
  fiscal_ncm: string | null
  fiscal_cest: string | null
  fiscal_origin_code: string | null
  fiscal_cfop: string | null
  fiscal_context: Record<string, unknown> | null
  fiscal_payload: Record<string, unknown> | null
  ncm_version_id?: string | null
  tipi_version_id?: string | null
  cest_version_id?: string | null
  default_output_cfop_version_id?: string | null
  default_input_cfop_version_id?: string | null
  fiscal_reference_snapshot?: Record<string, unknown> | null
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  status: OrderStatus
  notes: string | null
  changed_by: string
  created_at: string
}


// ==================== FINANCIAL / ACCOUNTS RECEIVABLE ====================

export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'renegotiated'

export type InstallmentStatus = 'open' | 'paid' | 'overdue' | 'cancelled'

export interface Invoice {
  id: string
  invoice_number: string
  order_id: string
  store_id: string
  profile_id: string
  status: InvoiceStatus
  issue_date: string
  total_amount: number
  paid_amount: number
  open_amount: number
  installment_count: number
  payment_method_id: string | null
  payment_method_name: string | null
  payment_condition_id: string | null
  payment_condition_name: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  // Relations
  order?: Order
  store?: Store
  profile?: Profile
  installments?: InvoiceInstallment[]
  events?: InvoiceEvent[]
}

export interface InvoiceInstallment {
  id: string
  invoice_id: string
  installment_number: number
  due_date: string
  amount: number
  paid_amount: number
  status: InstallmentStatus
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations
  invoice?: Invoice
}

export type InvoiceEventType =
  | 'created'
  | 'payment_received'
  | 'partial_payment'
  | 'cancelled'
  | 'overdue_marked'
  | 'renegotiated'
  | 'note_added'

export interface InvoiceEvent {
  id: string
  invoice_id: string
  event_type: InvoiceEventType
  description: string
  amount: number | null
  metadata: Record<string, unknown> | null
  created_by: string
  created_at: string
  // Relations
  invoice?: Invoice
  profile?: Profile
}

// ==================== PAYMENT & CONFIG ====================

export interface PaymentCondition {
  id: string
  name: string // ex: "À vista", "30/60/90 dias"
  description: string | null
  installments: number
  discount_percentage: number // desconto extra por condição
  min_installment_value: number
  min_order_value: number
  max_order_value: number | null
  surcharge_percentage: number // acrescimo extra por condicao, ex: 3% para longo prazo
  icon?: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DiscountCoupon {
  id: string
  code: string
  name?: string | null
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number | null
  max_discount_amount?: number | null
  max_uses: number | null
  current_uses: number
  max_uses_per_customer?: number | null
  is_cumulative?: boolean
  valid_from: string
  valid_until: string | null
  is_active: boolean
  created_at: string
  updated_at?: string
  customer_type_scope_ids?: string[]
  price_table_scope_ids?: string[]
  product_scope_ids?: string[]
  category_scope_ids?: string[]
}

export interface SystemSettings {
  id: string
  system_name: string
  logo_url: string | null
  cnpj: string | null
  razao_social: string | null
  nome_fantasia: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  phone: string | null
  phone_secondary: string | null
  email: string | null
  min_order_amount: number
  default_delivery_days: number
  show_prices_to_unapproved: boolean
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
  about_title: string | null
  about_text: string | null
  about_image_url: string | null
  catalog_notice: string | null
  catalog_notice_html: string | null
  catalog_notice_type: 'info' | 'promotion' | 'attention' | 'message' | null
  created_at: string
  updated_at: string
}

// ==================== COMPANY FISCAL (Emitente) ====================

export type RegimeTributario = 'simples_nacional' | 'simples_excesso' | 'lucro_presumido' | 'lucro_real'
export type CRT = '1' | '2' | '3'
export type CertificateStatus = 'active' | 'expired' | 'revoked' | 'pending'
export type AmbienteFiscal = 'homologacao' | 'producao'

export interface CompanyFiscalProfile {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string
  inscricao_estadual: string | null
  inscricao_municipal: string | null
  regime_tributario: RegimeTributario | null
  crt: CRT | null
  cnae_principal: string | null
  indicador_contribuinte: TaxpayerIndicator
  fiscal_email: string | null
  fiscal_phone: string | null
  fiscal_address: string | null
  fiscal_number: string | null
  fiscal_complement: string | null
  fiscal_neighborhood: string | null
  fiscal_city: string | null
  fiscal_state: string | null
  fiscal_zip_code: string | null
  fiscal_municipality_code_ibge: string | null
  fiscal_country_code: string | null
  created_at: string
  updated_at: string
}

export interface CompanyFiscalEnvironment {
  id: string
  ambiente: AmbienteFiscal
  serie_padrao_nfe: string
  proximo_numero_nfe: number
  tipo_emissao: string
  emissao_ativa: boolean
  parametros_jsonb: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface CompanyCertificateConfig {
  id: string
  certificate_name: string | null
  certificate_status: CertificateStatus
  valid_from: string | null
  valid_to: string | null
  certificate_serial: string | null
  certificate_issuer: string | null
  certificate_storage_path: string | null
  is_active: boolean
  alert_days_before_expiry: number
  created_at: string
  updated_at: string
}

// ==================== EMITTER TAX CONFIGURATION ====================

export type ArtigoScMva = 'nenhum' | 'artigo_8' | 'artigo_9' | 'artigo_10'

export interface EmitterFederalTaxConfig {
  id: string
  aliquota_pis: number | null
  aliquota_cofins: number | null
  artigo_sc_mva: ArtigoScMva | null
  exibir_total_tributos: boolean
  credito_presumido_icms: boolean
  ultrapassou_sublimite: boolean
  created_at: string
  updated_at: string
}

export interface EmitterIcmsStateLink {
  id: string
  target_uf: string | null
  icms_base_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  // JOIN fields
  icms_base_name?: string
  icms_base_code?: string
  icms_national_cst?: string
}

export interface EmitterIbscbsStateLink {
  id: string
  target_uf: string | null
  ibscbs_base_id: string
  ibscbs_version_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // JOIN fields
  ibscbs_base_name?: string
  ibscbs_base_code?: string
  ibscbs_national_cst?: string
  ibscbs_classification_code?: string
}

// ==================== CART (Client-side) ====================

export interface CartItem {
  cartKey?: string
  variantId: string
  productId: string
  productName: string
  fabricName: string
  colorName: string
  size: string | null
  sizeOptionId?: string | null
  sizePrice?: number | null
  imageUrl: string | null
  quantity: number
  unitPrice: number
}

// ==================== REPRESENTATIVE SALES MODE ====================

export type SalesQuoteStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'converted'
  | 'cancelled'

export interface SalesQuote {
  id: string
  quote_number: string
  store_id: string
  customer_profile_id: string
  representative_id: string
  price_table_id: string | null
  status: SalesQuoteStatus
  payment_method_id: string | null
  payment_condition_id: string | null
  payment_rule_id: string | null
  payment_method_condition_id: string | null
  payment_method_code: string | null
  payment_method_name: string | null
  payment_condition_name: string | null
  payment_condition_description: string | null
  payment_installments: number | null
  payment_discount_percentage: number | null
  payment_surcharge_percentage: number | null
  subtotal: number
  payment_discount_amount?: number | null
  negotiation_discount_percentage?: number | null
  negotiation_discount_amount?: number | null
  negotiation_surcharge_amount?: number | null
  total: number
  notes: string | null
  shipping_address: string | null
  negotiation_reason: string | null
  converted_order_id: string | null
  customer_name_snapshot?: string | null
  customer_code_snapshot?: string | null
  company_name_snapshot?: string | null
  price_table_name_snapshot?: string | null
  created_at: string
  updated_at: string
  store?: Store
  customer_profile?: Profile
  representative?: Profile
  items?: SalesQuoteItem[]
}

export interface SalesQuoteItem {
  id: string
  quote_id: string
  product_variant_id: string
  size_option_id?: string | null
  product_name: string
  fabric_name: string
  color_name: string
  size: string | null
  size_name?: string | null
  quantity: number
  unit_price: number
  product_price?: number | null
  size_price?: number | null
  variation_price?: number | null
  final_price?: number | null
  subtotal: number
  created_at: string
  product_variant?: ProductVariant
}

export type RepresentativeVisitOutcome =
  | 'planned'
  | 'completed'
  | 'follow_up'
  | 'converted_quote'
  | 'converted_order'

export interface RepresentativeVisit {
  id: string
  representative_id: string
  store_id: string
  customer_profile_id: string
  visited_at: string
  notes: string | null
  result_summary: string | null
  next_step: string | null
  outcome: RepresentativeVisitOutcome
  generated_quote_id: string | null
  generated_order_id: string | null
  created_at: string
  updated_at: string
  store?: Store
  customer_profile?: Profile
  representative?: Profile
  generated_quote?: SalesQuote | null
  generated_order?: Order | null
}

export interface RepresentativeDraftItem {
  line_id: string
  product_id: string
  product_name: string
  variant_id: string
  fabric_id: string
  fabric_name: string
  color_id: string
  color_name: string
  size_option_id: string | null
  size_name: string | null
  image_url: string | null
  quantity: number
  unit_price: number
}

// ==================== CUSTOMER LOGIN AUDIT ====================

export interface CustomerLoginAudit {
  id: string
  profile_id: string
  ip_address: string | null
  user_agent: string | null
  device_info: string | null
  created_at: string
}

// ==================== API Response helpers ====================

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}
