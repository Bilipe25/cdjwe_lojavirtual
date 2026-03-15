import type { OrderStatus } from '@/lib/types'

export interface OrderCommunicationItem {
    productName: string
    fabricName: string
    colorName: string
    quantity: number
    unitPrice: number
    subtotal: number
    productPrice?: number | null
    variationPrice?: number | null
    finalPrice?: number | null
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
})

const statusLabels: Record<OrderStatus, string> = {
    pending: 'Em analise',
    approved: 'Aprovado',
    in_production: 'Em producao',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
}

function normalizeBaseUrl(appUrl: string) {
    return appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl
}

function hasPriceDifference(a: number, b: number) {
    return Math.abs(a - b) > 0.0001
}

export function formatOrderCurrency(value: number) {
    return currencyFormatter.format(Number(value || 0))
}

export function getCustomerOrderDetailsUrl(appUrl: string, orderId: string) {
    return `${normalizeBaseUrl(appUrl)}/orders/${orderId}`
}

export function getAdminOrdersUrl(appUrl: string) {
    return `${normalizeBaseUrl(appUrl)}/admin/orders`
}

export function getOrderItemCommunicationPricing(item: OrderCommunicationItem) {
    const basePrice =
        item.productPrice !== null && item.productPrice !== undefined
            ? Number(item.productPrice)
            : Number(item.unitPrice || 0)
    const variationPrice =
        item.variationPrice !== null && item.variationPrice !== undefined
            ? Number(item.variationPrice)
            : null
    const finalPrice =
        item.finalPrice !== null && item.finalPrice !== undefined
            ? Number(item.finalPrice)
            : Number(item.unitPrice || 0)
    const hasFrozenSnapshot =
        (item.productPrice !== null && item.productPrice !== undefined) ||
        (item.variationPrice !== null && item.variationPrice !== undefined) ||
        (item.finalPrice !== null && item.finalPrice !== undefined)
    const usesCommercialPolicy = variationPrice === null && hasPriceDifference(basePrice, finalPrice)

    let appliedLabel = 'Preco base do produto'
    if (variationPrice !== null) {
        appliedLabel = 'Preco da cor aplicado'
    } else if (usesCommercialPolicy) {
        appliedLabel = 'Politica comercial aplicada'
    }

    return {
        basePrice,
        variationPrice,
        finalPrice,
        hasFrozenSnapshot,
        usesCommercialPolicy,
        appliedLabel,
    }
}

export function buildOrderEmailItems(items: OrderCommunicationItem[]) {
    return items.map((item) => ({
        productName: item.productName,
        fabricName: item.fabricName,
        colorName: item.colorName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        productPrice:
            item.productPrice !== null && item.productPrice !== undefined
                ? Number(item.productPrice)
                : null,
        variationPrice:
            item.variationPrice !== null && item.variationPrice !== undefined
                ? Number(item.variationPrice)
                : null,
        finalPrice:
            item.finalPrice !== null && item.finalPrice !== undefined
                ? Number(item.finalPrice)
                : Number(item.unitPrice || 0),
    }))
}

export function buildOrderSnapshotSummary(items: OrderCommunicationItem[]) {
    if (items.length === 0) {
        return 'Os valores deste pedido permanecem registrados com snapshot financeiro.'
    }

    const snapshots = items.map(getOrderItemCommunicationPricing)
    const hasVariationOverride = snapshots.some((item) => item.variationPrice !== null)
    const hasCommercialPolicy = snapshots.some((item) => item.usesCommercialPolicy)

    if (hasVariationOverride && hasCommercialPolicy) {
        return 'Os valores deste pedido foram congelados no momento da compra, incluindo precos por cor e regras comerciais B2B.'
    }

    if (hasVariationOverride) {
        return 'Os valores deste pedido foram congelados no momento da compra, incluindo precos especificos por cor.'
    }

    if (hasCommercialPolicy) {
        return 'Os valores deste pedido foram congelados no momento da compra com a politica comercial valida naquele instante.'
    }

    return 'Os valores deste pedido foram congelados no momento da compra com base no preco vigente do catalogo.'
}

export function buildOrderCreatedAuditNote(itemCount: number, total: number) {
    return `Pedido criado via carrinho com snapshot financeiro congelado. ${itemCount} item(ns) e total inicial de ${formatOrderCurrency(total)}.`
}

export function buildOrderStatusAuditNote(status: OrderStatus) {
    return `Status atualizado para "${statusLabels[status]}". Snapshot financeiro original preservado para atendimento e auditoria.`
}

export function buildOrderCancelledAuditNote() {
    return 'Pedido cancelado pelo cliente. Snapshot financeiro original preservado para historico e auditoria.'
}
