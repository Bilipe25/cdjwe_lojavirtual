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
  pis_unit_rate?: number | null
  cofins_unit_rate?: number | null
  approx_tax_rate_percent?: number | null
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
  commercial_code?: string | null
  manufacturer_name?: string | null
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

// ==================== REPRESENTATIVE READY DELIVERY STOCK ====================

export type RepresentativeStockMovementType =
  | 'TRANSFER_IN'
  | 'RESERVATION_CREATE'
  | 'RESERVATION_RELEASE'
  | 'RESERVATION_EXPIRE'
  | 'READY_DELIVERY_SALE'
  | 'SALE_CANCEL_REVERSAL'
  | 'RETURN_QUARANTINE'
  | 'ADJUSTMENT'
  | 'DAY_CLOSING'

export type RepresentativeStockTransferStatus = 'draft' | 'sent' | 'received' | 'cancelled'
export type RepresentativeStockReservationStatus = 'active' | 'released' | 'consumed' | 'expired'
export type RepresentativeDayClosingStatus = 'open' | 'submitted' | 'approved' | 'reopened' | 'cancelled'
export type RepresentativeReceiptStatus = 'issued' | 'cancelled' | 'reissued'

export interface RepresentativeStock {
  id: string
  representative_id: string
  product_variant_id: string
  size_option_id: string | null
  quantity_available: number
  quantity_reserved: number
  quantity_sold: number
  created_at: string
  updated_at: string
  representative?: Profile | null
  product_variant?: ProductVariant | null
  size_option?: ProductSizeOption | null
}

export interface RepresentativeStockReservation {
  id: string
  representative_id: string
  product_variant_id: string
  size_option_id: string | null
  order_draft_id: string
  cart_key: string | null
  quantity: number
  status: RepresentativeStockReservationStatus
  expires_at: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RepresentativeStockTransfer {
  id: string
  transfer_number: string
  representative_id: string
  status: RepresentativeStockTransferStatus
  notes: string | null
  created_by: string | null
  received_by: string | null
  sent_at: string
  received_at: string | null
  created_at: string
  updated_at: string
  representative?: Profile | null
  items?: RepresentativeStockTransferItem[]
}

export interface RepresentativeStockTransferItem {
  id: string
  transfer_id: string
  product_variant_id: string
  size_option_id: string | null
  quantity: number
  quantity_received: number
  created_at: string
  product_variant?: ProductVariant | null
  size_option?: ProductSizeOption | null
}

export interface RepresentativeStockMovement {
  id: string
  representative_id: string
  product_variant_id: string
  size_option_id: string | null
  movement_type: RepresentativeStockMovementType
  quantity_delta: number
  quantity_available_after: number
  quantity_reserved_after: number
  quantity_sold_after: number
  order_id: string | null
  order_item_id: string | null
  transfer_id: string | null
  transfer_item_id: string | null
  reservation_id: string | null
  closing_id: string | null
  idempotency_key: string
  notes: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  representative?: Profile | null
  product_variant?: ProductVariant | null
  size_option?: ProductSizeOption | null
  order?: Order | null
}

export interface RepresentativeDayClosing {
  id: string
  closing_number: string
  representative_id: string
  business_date: string
  route_label: string | null
  status: RepresentativeDayClosingStatus
  orders_count: number
  items_count: number
  gross_amount: number
  received_amount: number
  snapshot: Record<string, unknown>
  submitted_by: string | null
  approved_by: string | null
  submitted_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  representative?: Profile | null
}

export interface RepresentativeReceipt {
  id: string
  receipt_number: string
  order_id: string
  representative_id: string | null
  status: RepresentativeReceiptStatus
  pdf_url: string | null
  metadata: Record<string, unknown>
  issued_by: string | null
  issued_at: string
  created_at: string
  updated_at: string
  representative?: Profile | null
  order?: Order | null
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

export type NaturezaOperacaoDirection = 'outbound' | 'inbound'
export type OrderFiscalOperationPurpose = 'normal' | 'complementar' | 'ajuste' | 'devolucao'
export type OrderFiscalBuyerPresence =
  | 'nao_se_aplica'
  | 'presencial'
  | 'internet'
  | 'teleatendimento'
  | 'entrega_domicilio'
  | 'presencial_fora_estabelecimento'
  | 'outros'
export type OrderFiscalFreightMode =
  | 'emitente'
  | 'destinatario'
  | 'terceiros'
  | 'proprio_remetente'
  | 'proprio_destinatario'
  | 'sem_frete'
export type OrderFiscalDeliveryForm =
  | 'nao_informado'
  | 'retirada'
  | 'transportadora'
  | 'frota_propria'
  | 'correios'
  | 'entrega_expressa'
  | 'balcao'
export type OrderFiscalCfopSource =
  | 'item_override'
  | 'order_global'
  | 'rule_override'
  | 'profile_default'
  | 'geographic_inference'

export interface NaturezaOperacao {
  id: string
  descricao: string
  tipo_operacao: NaturezaOperacaoDirection
  aplica_st: boolean
  aplica_difal: boolean
  aplica_devolucao: boolean
  is_active: boolean
  sort_order: number
  cfop_codes?: string[]
  created_at?: string
  updated_at?: string
}

export interface OrderFiscalNaturezaSnapshot {
  id: string | null
  descricao: string
  tipo_operacao: NaturezaOperacaoDirection
  aplica_st: boolean
  aplica_difal: boolean
  aplica_devolucao: boolean
  source: 'catalog' | 'cfop_fallback' | 'environment_default' | 'manual'
}

export interface OrderFiscalSettings {
  id: string
  order_id: string
  cfop_global_code: string | null
  natureza_operacao_id: string | null
  natureza_operacao_snapshot: OrderFiscalNaturezaSnapshot | Record<string, unknown> | null
  operation_direction: NaturezaOperacaoDirection
  finalidade_nfe: OrderFiscalOperationPurpose
  presenca_comprador: OrderFiscalBuyerPresence
  consumidor_final: boolean
  fiscal_observation: string | null
  freight_mode: OrderFiscalFreightMode
  delivery_form: OrderFiscalDeliveryForm
  transporter_name: string | null
  transporter_document: string | null
  transporter_address: string | null
  transporter_city: string | null
  transporter_state: string | null
  transporter_ie: string | null
  vehicle_plate: string | null
  vehicle_uf: string | null
  antt_code: string | null
  freight_value: number
  insurance_value: number
  other_expenses_value: number
  last_recalculated_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderFiscalVolume {
  id: string
  order_fiscal_settings_id: string
  quantity: number
  species: string
  brand: string | null
  numbering: string | null
  gross_weight: number | null
  net_weight: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface OrderFiscalWorkspace {
  settings: OrderFiscalSettings | null
  volumes: OrderFiscalVolume[]
  naturezas: NaturezaOperacao[]
}

export type OrderType = 'PRE_VENDA' | 'PRONTA_ENTREGA'

export interface Order {
  id: string
  order_number: string
  store_id: string
  profile_id: string
  created_by_profile_id?: string | null
  sales_channel?: 'customer_portal' | 'representative'
  order_type?: OrderType
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
  representative_receipts?: RepresentativeReceipt[] | RepresentativeReceipt | null
  payment_method?: PaymentMethod
  payment_condition?: PaymentCondition
  payment_method_condition?: PaymentMethodCondition
  payment_rule?: PriceTablePaymentRule
  fiscal_settings?: OrderFiscalSettings | null
  fiscal_volumes?: OrderFiscalVolume[]
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
  cfop_override_code?: string | null
  effective_cfop_code?: string | null
  cfop_source?: OrderFiscalCfopSource | null
  fiscal_context?: Record<string, unknown> | null
  fiscal_payload?: Record<string, unknown> | null
  // Motor Fiscal — tax calculation columns (migration 097)
  fiscal_unit_value?: number | null
  fiscal_total_value?: number | null
  fiscal_discount_value?: number | null
  fiscal_freight_value?: number | null
  icms_cst?: string | null
  icms_base?: number | null
  icms_rate?: number | null
  icms_value?: number | null
  icms_st_base?: number | null
  icms_st_rate?: number | null
  icms_st_value?: number | null
  icms_st_mva?: number | null
  fcp_base?: number | null
  fcp_rate?: number | null
  fcp_value?: number | null
  pis_cst?: string | null
  pis_base?: number | null
  pis_rate?: number | null
  pis_value?: number | null
  cofins_cst?: string | null
  cofins_base?: number | null
  cofins_rate?: number | null
  cofins_value?: number | null
  ipi_cst?: string | null
  ipi_base?: number | null
  ipi_rate?: number | null
  ipi_value?: number | null
  total_tributos?: number | null
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
  // Motor Fiscal — tax breakdown snapshot
  icms_cst?: string | null
  icms_base?: number | null
  icms_rate?: number | null
  icms_value?: number | null
  icms_st_base?: number | null
  icms_st_value?: number | null
  fcp_value?: number | null
  pis_cst?: string | null
  pis_value?: number | null
  cofins_cst?: string | null
  cofins_value?: number | null
  ipi_cst?: string | null
  ipi_value?: number | null
  total_tributos?: number | null
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

export interface FiscalAdditionalInfoFlags {
  mostrar_numero_pedido: boolean
  mostrar_condicao_pagamento: boolean
  mostrar_natureza_operacao: boolean
  mostrar_forma_entrega: boolean
  mostrar_frete_seguro_outras_despesas: boolean
  mostrar_tributos_aproximados: boolean
  mostrar_endereco_entrega: boolean
  mostrar_observacao_fiscal_pedido: boolean
  mostrar_observacoes_padrao: boolean
}

export interface FiscalItemAdditionalInfoFlags {
  mostrar_fabricante_produto: boolean
  mostrar_descricao_fiscal_padrao: boolean
  mostrar_codigo_barras_gtin: boolean
}

export interface FiscalTechnicalResponsibleConfig {
  enabled: boolean
  cnpj?: string | null
  contato?: string | null
  email?: string | null
  fone?: string | null
  csrt_id?: string | null
  csrt_secret?: string | null
}

export interface CompanyFiscalEnvironmentParams {
  item_info_fields?: Record<string, unknown>[] | null
  observacoes_padrao?: string[] | null
  additional_info_flags?: Partial<FiscalAdditionalInfoFlags> | null
  item_additional_info_flags?: Partial<FiscalItemAdditionalInfoFlags> | null
  responsavel_tecnico?: FiscalTechnicalResponsibleConfig | null
  [key: string]: unknown
}

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
  // NF-e extended
  max_itens_por_nota: number
  ultima_nota_nfe: number
  // NFC-e
  serie_nfce: string
  nota_inicial_nfce: number
  ultima_nota_nfce: number
  csc_id_nfce: string | null
  csc_numero_nfce: string | null
  // Reference code
  codigo_referencia_nota: 'codigo_barras' | 'codigo_fabricante' | 'codigo_erp' | 'codigo_interno'
  // Taxes & freight
  desconto_impostos_prazo: boolean
  bloquear_retorno_parcial_remessa: boolean
  icms_base_pis_cofins: boolean
  frete_base_icms: boolean
  modalidade_frete_padrao: string
  // JSONB bag for item info toggles, default notes, etc.
  parametros_jsonb: CompanyFiscalEnvironmentParams | null
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
  certificate_subject?: string | null
  certificate_thumbprint?: string | null
  metadata_source?: 'manual' | 'parsed_a1' | null
  certificate_storage_path: string | null
  uploaded_file_name?: string | null
  certificate_fingerprint_sha256?: string | null
  certificate_password_encrypted?: string | null
  has_stored_password?: boolean
  validation_notes?: string | null
  last_validated_at?: string | null
  is_active: boolean
  alert_days_before_expiry: number
  created_at: string
  updated_at: string
}

// ==================== EMITTER TAX CONFIGURATION ====================

export type ArtigoScMva = 'nenhum' | 'artigo_8' | 'artigo_9' | 'artigo_10'

export interface EmitterTaxPreferencesConfig {
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

export type EmitterFederalTaxConfig = EmitterTaxPreferencesConfig

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
  ibscbs_version_label?: string
  ibscbs_valid_from?: string | null
  ibscbs_valid_to?: string | null
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
  updatedAt?: string | null
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
