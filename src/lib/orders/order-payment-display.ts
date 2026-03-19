type LegacyPaymentRelation = {
    name?: string | null
    description?: string | null
    installments?: number | null
    discount_percentage?: number | null
    surcharge_percentage?: number | null
} | null

export type OrderPaymentDisplayLike = {
    payment_method_name?: string | null
    payment_method_code?: string | null
    payment_condition_name?: string | null
    payment_condition_description?: string | null
    payment_installments?: number | null
    payment_discount_percentage?: number | null
    payment_surcharge_percentage?: number | null
    payment_condition?: LegacyPaymentRelation
}

function normalizeText(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

export function getOrderPaymentDisplay(order: OrderPaymentDisplayLike) {
    const methodName = normalizeText(order.payment_method_name)
    const conditionName =
        normalizeText(order.payment_condition_name) ||
        normalizeText(order.payment_condition?.name)
    const description =
        normalizeText(order.payment_condition_description) ||
        normalizeText(order.payment_condition?.description)
    const installments =
        order.payment_installments ??
        order.payment_condition?.installments ??
        null
    const discountPercentage =
        order.payment_discount_percentage ??
        order.payment_condition?.discount_percentage ??
        0
    const surchargePercentage =
        order.payment_surcharge_percentage ??
        order.payment_condition?.surcharge_percentage ??
        0

    const hasSnapshot = Boolean(
        methodName ||
            conditionName ||
            description ||
            installments !== null ||
            discountPercentage > 0 ||
            surchargePercentage > 0
    )

    const combinedLabel =
        methodName && conditionName
            ? methodName === conditionName
                ? methodName
                : `${methodName} / ${conditionName}`
            : methodName || conditionName || 'A combinar'

    const adjustments = [
        discountPercentage > 0 ? `${discountPercentage}% de desconto` : null,
        surchargePercentage > 0 ? `${surchargePercentage}% de acrescimo` : null,
        installments && installments > 1 ? `${installments} parcelas` : null,
    ].filter(Boolean) as string[]

    return {
        hasSnapshot,
        methodName,
        conditionName,
        description,
        installments,
        discountPercentage,
        surchargePercentage,
        combinedLabel,
        adjustments,
        adjustmentsLabel: adjustments.length > 0 ? adjustments.join(' / ') : null,
    }
}

