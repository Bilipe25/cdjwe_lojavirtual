import type { OrderType } from '@/lib/types'

export type OrderTypeInput = OrderType | string | null | undefined

export const PRE_SALE_ORDER_TYPE: OrderType = 'PRE_VENDA'
export const READY_DELIVERY_ORDER_TYPE: OrderType = 'PRONTA_ENTREGA'

export function normalizeOrderType(value?: OrderTypeInput): OrderType {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized === READY_DELIVERY_ORDER_TYPE ? READY_DELIVERY_ORDER_TYPE : PRE_SALE_ORDER_TYPE
}

export function isReadyDeliveryOrderType(value?: OrderTypeInput) {
  return normalizeOrderType(value) === READY_DELIVERY_ORDER_TYPE
}

export function getOrderTypeLabel(value?: OrderTypeInput) {
  return isReadyDeliveryOrderType(value) ? 'Pronta entrega' : 'Pre-venda'
}

export function getOrderTypeFullLabel(value?: OrderTypeInput) {
  return isReadyDeliveryOrderType(value) ? 'Pedido Pronta Entrega' : 'Pedido Pre-venda'
}

export function getOrderTypeDescription(value?: OrderTypeInput) {
  return isReadyDeliveryOrderType(value)
    ? 'Pedido entregue diretamente pelo representante. Nao requer endereco de entrega.'
    : 'Pedido com entrega futura. Requer endereco de entrega.'
}

export function getOrderDeliverySummary(value?: OrderTypeInput, shippingAddress?: string | null) {
  if (isReadyDeliveryOrderType(value)) {
    return 'Pronta entrega pelo representante, sem endereco de entrega.'
  }

  const address = String(shippingAddress || '').trim()
  return address || 'Endereco de entrega nao informado.'
}
