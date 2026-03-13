// Database & Application Types for CDJWE B2B System

// ==================== AUTH & USERS ====================

export type UserRole = 'admin' | 'client'

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

// ==================== STORES (Clientes) ====================

export interface Store {
  id: string
  profile_id: string
  company_name: string
  trade_name: string | null
  cnpj: string
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

export interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  category_id: string
  size: string | null // ex: "3x2 lugares"
  base_price: number
  is_active: boolean
  is_featured: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Relations
  category?: Category
  images?: ProductImage[]
  variants?: ProductVariant[]
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
  min_order_value: number
  max_order_value: number | null
  number_of_installments: number
  installment_days: string | null // Ex: "30, 60, 90"
  discount_percentage: number
  created_at: string
  updated_at: string
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
  status: OrderStatus
  payment_status: PaymentStatus
  payment_condition_id: string | null
  payment_rule_id: string | null
  subtotal: number
  discount_amount: number
  total: number
  notes: string | null
  shipping_address: string | null
  estimated_delivery: string | null
  created_at: string
  updated_at: string
  // Relations
  store?: Store
  profile?: Profile
  items?: OrderItem[]
  status_history?: OrderStatusHistory[]
  payment_condition?: PaymentCondition
  payment_rule?: PriceTablePaymentRule
}

export interface OrderItem {
  id: string
  order_id: string
  product_variant_id: string
  product_name: string // snapshot do nome no momento da compra
  fabric_name: string
  color_name: string
  size: string | null
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
  // Relations
  product_variant?: ProductVariant
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  status: OrderStatus
  notes: string | null
  changed_by: string
  created_at: string
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
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number | null
  max_uses: number | null
  current_uses: number
  valid_from: string
  valid_until: string | null
  is_active: boolean
  created_at: string
}

export interface SystemSettings {
  id: string
  system_name: string
  logo_url: string | null
  cnpj: string | null
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
  catalog_notice_type: 'info' | 'promotion' | 'attention' | 'message' | null
  created_at: string
  updated_at: string
}

// ==================== CART (Client-side) ====================

export interface CartItem {
  variantId: string
  productId: string
  productName: string
  fabricName: string
  colorName: string
  size: string | null
  imageUrl: string | null
  quantity: number
  unitPrice: number
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
