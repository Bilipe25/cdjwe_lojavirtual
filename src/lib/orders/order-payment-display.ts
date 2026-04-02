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
    subtotal?: number | null
    discount_amount?: number | null
    coupon_code?: string | null
    coupon_discount_type?: 'percentage' | 'fixed' | null
    coupon_discount_value?: number | null
    coupon_discount_amount?: number | null
}

function normalizeText(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

function normalizeNumber(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0
    return value
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
    const totalDiscountAmount = normalizeNumber(order.discount_amount)
    const couponDiscountAmount = normalizeNumber(order.coupon_discount_amount)
    const paymentDiscountAmount = Math.max(0, totalDiscountAmount - couponDiscountAmount)
    const couponCode = normalizeText(order.coupon_code)
    const couponDiscountType =
        order.coupon_discount_type === 'percentage' || order.coupon_discount_type === 'fixed'
            ? order.coupon_discount_type
            : null
    const couponDiscountValue =
        typeof order.coupon_discount_value === 'number' && Number.isFinite(order.coupon_discount_value)
            ? order.coupon_discount_value
            : null
    const couponConfiguredLabel =
        couponDiscountType && couponDiscountValue !== null
            ? couponDiscountType === 'percentage'
                ? `${couponDiscountValue}%`
                : `R$ ${couponDiscountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : null
    const hasCouponSnapshot = Boolean(
        couponCode ||
            couponDiscountType ||
            (couponDiscountValue !== null && couponDiscountValue > 0) ||
            couponDiscountAmount > 0
    )

    const hasSnapshot = Boolean(
        methodName ||
            conditionName ||
            description ||
        installments !== null ||
        discountPercentage > 0 ||
        surchargePercentage > 0 ||
        hasCouponSnapshot
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
        totalDiscountAmount,
        paymentDiscountAmount,
        hasCouponSnapshot,
        couponCode,
        couponDiscountType,
        couponDiscountValue,
        couponDiscountAmount,
        couponConfiguredLabel,
    }
}

