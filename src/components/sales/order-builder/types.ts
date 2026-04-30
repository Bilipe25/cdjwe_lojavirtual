import type {
  Category,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentMethodCondition,
  PriceTable,
  PriceTablePaymentRule,
  Product,
  Store,
  StoreAddress,
  SystemSettings,
} from '@/lib/types'
import type { PriceSnapshot } from '@/lib/pricing/server-pricing'

export type BuilderCustomer = Store & {
  addresses?: StoreAddress[]
  assigned_price_tables?: PriceTable[]
}

export type BuilderProduct = Product & {
  images?: { url: string; is_primary: boolean }[]
  category?: Category | null
  representative_stock_available?: number
  representative_stock_reserved?: number
  representative_stock_sold?: number
}

export type RepresentativeStockPosition = {
  key: string
  product_variant_id: string
  product_id: string | null
  size_option_id: string | null
  quantity_available: number
  quantity_reserved: number
  quantity_sold: number
}

export type DraftItem = {
  cartKey: string
  productId: string
  productName: string
  variantId: string
  fabricName: string
  colorName: string
  sizeName: string | null
  sizeOptionId: string | null
  imageUrl: string | null
  quantity: number
  unitPrice: number
}

export type PaymentMethodGroup = {
  method: PaymentMethod
  conditions: PaymentMethodCondition[]
  rules: PriceTablePaymentRule[]
}

export type PaymentOption = {
  id: string
  label: string
  description: string | null
  discountPercentage: number
  surchargePercentage: number
  isTableRule: boolean
}

export type PricingValidationResult =
  | { prices: Record<string, PriceSnapshot>; missingKeys: string[]; missingVariantIds: string[] }
  | { error: string }

export type DiscountType = 'percent' | 'value' | 'none'

export type NegotiationSummary = {
  adjustedSubtotal: number
  discountAmount: number
  discountPercentage: number
  surchargeAmount: number
}

export type OrderBuilderMode = 'order' | 'quote'

export type OrderBuilderSection = 'customer' | 'products' | 'negotiation' | 'payment' | 'notes' | null

export type OrderBuilderCompletionData = {
  order: Order
  items: OrderItem[]
  settings: SystemSettings | null
}
