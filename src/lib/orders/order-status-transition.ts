import type { OrderStatus } from '@/lib/types'

const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ['approved', 'cancelled'],
    approved: ['in_production', 'cancelled'],
    in_production: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
}

export function getAvailableOrderStatusTransitions(currentStatus: OrderStatus): OrderStatus[] {
    return orderStatusTransitions[currentStatus] || []
}

export function canTransitionOrderStatus(currentStatus: OrderStatus, nextStatus: OrderStatus): boolean {
    return getAvailableOrderStatusTransitions(currentStatus).includes(nextStatus)
}
