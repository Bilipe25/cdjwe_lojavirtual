import { createClient } from '@/lib/supabase/server'
import type {
    PaymentCondition,
    PaymentMethod,
    PaymentMethodCondition,
    PriceTablePaymentRule,
} from '@/lib/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type Relation<T> = T | T[] | null

type PaymentMethodRow = PaymentMethod

type PaymentConditionRow = PaymentCondition

type PaymentMethodConditionRow = {
    id: string
    payment_method_id: string
    payment_condition_id: string
    is_active: boolean
    sort_order: number
    created_at: string
    updated_at: string
    payment_method: Relation<PaymentMethodRow>
    payment_condition: Relation<PaymentConditionRow>
}

type PriceTablePaymentRuleRow = PriceTablePaymentRule & {
    payment_method_condition?: Relation<PaymentMethodConditionRow>
}

export type CheckoutPaymentMethodGroup = {
    method: PaymentMethod
    conditions: PaymentMethodCondition[]
    rules: PriceTablePaymentRule[]
}

export type CheckoutPaymentAvailability = {
    methodGroups: CheckoutPaymentMethodGroup[]
    globalConditions: PaymentCondition[]
    priceTableRules: PriceTablePaymentRule[]
}

export type ResolvedCheckoutPaymentSelection = {
    source: 'condition' | 'rule'
    paymentMethodId: string | null
    paymentMethodConditionId: string | null
    paymentMethodCode: string | null
    paymentMethodName: string
    paymentConditionId: string | null
    paymentConditionName: string
    paymentConditionDescription: string | null
    paymentInstallments: number | null
    paymentDiscountPercentage: number
    paymentSurchargePercentage: number
    paymentRuleId: string | null
}

function unwrapRelation<T>(value: Relation<T>): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

function isCartTotalWithinRange(cartTotal: number, minOrderValue: number, maxOrderValue: number | null | undefined) {
    return cartTotal >= minOrderValue && (!maxOrderValue || cartTotal <= maxOrderValue)
}

function normalizeMethodCondition(row: PaymentMethodConditionRow): PaymentMethodCondition | null {
    const method = unwrapRelation(row.payment_method)
    const condition = unwrapRelation(row.payment_condition)
    if (!method || !condition) return null

    return {
        id: row.id,
        payment_method_id: row.payment_method_id,
        payment_condition_id: row.payment_condition_id,
        is_active: row.is_active,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
        payment_method: method,
        payment_condition: condition,
    }
}

function sortMethodConditions(a: PaymentMethodCondition, b: PaymentMethodCondition) {
    const methodSortDelta = (a.payment_method?.sort_order || 0) - (b.payment_method?.sort_order || 0)
    if (methodSortDelta !== 0) return methodSortDelta

    const linkSortDelta = a.sort_order - b.sort_order
    if (linkSortDelta !== 0) return linkSortDelta

    return (a.payment_condition?.name || '').localeCompare(b.payment_condition?.name || '', 'pt-BR')
}

function buildRuleFallbackCondition(rule: PriceTablePaymentRule): Pick<ResolvedCheckoutPaymentSelection, 'paymentMethodId' | 'paymentMethodConditionId' | 'paymentMethodCode' | 'paymentMethodName' | 'paymentConditionId' | 'paymentConditionName' | 'paymentConditionDescription' | 'paymentInstallments'> {
    const installmentsLabel = rule.number_of_installments > 1
        ? `${rule.number_of_installments} parcelas`
        : 'A vista comercial'

    return {
        paymentMethodId: null,
        paymentMethodConditionId: null,
        paymentMethodCode: null,
        paymentMethodName: 'Regra comercial',
        paymentConditionId: null,
        paymentConditionName: installmentsLabel,
        paymentConditionDescription: rule.installment_days
            ? `Prazo comercial: ${rule.installment_days}`
            : 'Condicao comercial definida pela tabela do cliente.',
        paymentInstallments: rule.number_of_installments,
    }
}

export async function getAvailableCheckoutPayments(
    supabase: SupabaseServerClient,
    params: {
        cartTotal?: number | null
        priceTableId?: string | null
        applyCartTotalFilter?: boolean
    }
): Promise<CheckoutPaymentAvailability> {
    const {
        cartTotal = null,
        priceTableId,
        applyCartTotalFilter = true,
    } = params

    const [{ data: methodConditionRows }, { data: ruleRows }] = await Promise.all([
        supabase
            .from('payment_method_conditions')
            .select(`
                id,
                payment_method_id,
                payment_condition_id,
                is_active,
                sort_order,
                created_at,
                updated_at,
                payment_method:payment_methods(*),
                payment_condition:payment_conditions(*)
            `)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        priceTableId
            ? supabase
                  .from('price_table_payment_rules')
                  .select(`
                      *,
                      payment_method_condition:payment_method_conditions(
                          id,
                          payment_method_id,
                          payment_condition_id,
                          is_active,
                          sort_order,
                          created_at,
                          updated_at,
                          payment_method:payment_methods(*),
                          payment_condition:payment_conditions(*)
                      )
                  `)
                  .eq('price_table_id', priceTableId)
                  .eq('is_active', true)
                  .order('min_order_value', { ascending: true })
            : Promise.resolve({ data: [] as PriceTablePaymentRuleRow[] | null }),
    ])

    const methodConditions = ((methodConditionRows || []) as PaymentMethodConditionRow[])
        .map(normalizeMethodCondition)
        .filter((value): value is PaymentMethodCondition => Boolean(value))
        .filter((link) => {
            if (!link.payment_method?.is_active || !link.payment_condition?.is_active) return false
            if (!applyCartTotalFilter || cartTotal === null) return true
            return isCartTotalWithinRange(
                cartTotal,
                link.payment_condition?.min_order_value || 0,
                link.payment_condition?.max_order_value || null
            )
        })
        .sort(sortMethodConditions)

    const availableRules = ((ruleRows || []) as PriceTablePaymentRuleRow[])
        .filter((rule) => rule.is_active !== false)
        .filter((rule) =>
            !applyCartTotalFilter || cartTotal === null
                ? true
                : isCartTotalWithinRange(cartTotal, rule.min_order_value, rule.max_order_value)
        )
        .map((rule) => {
            const relation = rule.payment_method_condition
                ? (unwrapRelation(rule.payment_method_condition) as PaymentMethodConditionRow | null)
                : null

            const paymentMethodCondition = relation ? normalizeMethodCondition(relation) : null

            return {
                ...rule,
                payment_method_condition: paymentMethodCondition,
            }
        })

    const methodGroupsMap = new Map<string, CheckoutPaymentMethodGroup>()

    methodConditions.forEach((link) => {
        const method = link.payment_method
        if (!method) return

        const current = methodGroupsMap.get(method.id)
        if (current) {
            current.conditions.push(link)
            return
        }

        methodGroupsMap.set(method.id, {
            method,
            conditions: [link],
            rules: [],
        })
    })

    availableRules.forEach((rule) => {
        const method = rule.payment_method_condition?.payment_method
        if (!method) return

        const current = methodGroupsMap.get(method.id)
        if (current) {
            current.rules.push(rule)
            return
        }

        methodGroupsMap.set(method.id, {
            method,
            conditions: [],
            rules: [rule],
        })
    })

    const methodGroups = Array.from(methodGroupsMap.values()).sort((a, b) => a.method.sort_order - b.method.sort_order)

    return {
        methodGroups,
        globalConditions: methodConditions
            .map((link) => link.payment_condition)
            .filter((value): value is PaymentCondition => Boolean(value)),
        priceTableRules: availableRules,
    }
}

export async function resolveCheckoutPaymentSelection(
    supabase: SupabaseServerClient,
    params: {
        cartTotal: number
        selectedPaymentId: string
        isTableRule: boolean
        priceTableId?: string | null
    }
): Promise<{ data: ResolvedCheckoutPaymentSelection | null; error: string | null }> {
    const { cartTotal, selectedPaymentId, isTableRule, priceTableId } = params

    if (!selectedPaymentId) {
        return { data: null, error: 'Selecao de pagamento obrigatoria.' }
    }

    if (isTableRule) {
        const { data: ruleRow, error } = await supabase
            .from('price_table_payment_rules')
            .select(`
                *,
                payment_method_condition:payment_method_conditions(
                    id,
                    payment_method_id,
                    payment_condition_id,
                    is_active,
                    sort_order,
                    created_at,
                    updated_at,
                    payment_method:payment_methods(*),
                    payment_condition:payment_conditions(*)
                )
            `)
            .eq('id', selectedPaymentId)
            .single()

        if (error || !ruleRow) {
            return { data: null, error: 'Regra de pagamento nao encontrada.' }
        }

        const rule = ruleRow as PriceTablePaymentRuleRow
        if (rule.is_active === false) {
            return { data: null, error: 'A regra de pagamento selecionada esta inativa.' }
        }

        if (priceTableId && rule.price_table_id !== priceTableId) {
            return { data: null, error: 'A regra selecionada nao pertence a tabela ativa do cliente.' }
        }

        if (!isCartTotalWithinRange(cartTotal, rule.min_order_value, rule.max_order_value)) {
            return { data: null, error: 'O valor do pedido nao e mais valido para esta regra comercial.' }
        }

        const relation = rule.payment_method_condition
            ? (unwrapRelation(rule.payment_method_condition) as PaymentMethodConditionRow | null)
            : null
        const linkedCondition = relation ? normalizeMethodCondition(relation) : null
        const fallback = buildRuleFallbackCondition(rule)

        return {
            data: {
                source: 'rule',
                paymentMethodId: linkedCondition?.payment_method?.id || fallback.paymentMethodId,
                paymentMethodConditionId: linkedCondition?.id || fallback.paymentMethodConditionId,
                paymentMethodCode: linkedCondition?.payment_method?.code || fallback.paymentMethodCode,
                paymentMethodName: linkedCondition?.payment_method?.name || fallback.paymentMethodName,
                paymentConditionId: linkedCondition?.payment_condition?.id || fallback.paymentConditionId,
                paymentConditionName: linkedCondition?.payment_condition?.name || fallback.paymentConditionName,
                paymentConditionDescription: linkedCondition?.payment_condition?.description || fallback.paymentConditionDescription,
                paymentInstallments: rule.number_of_installments || linkedCondition?.payment_condition?.installments || fallback.paymentInstallments,
                paymentDiscountPercentage: rule.discount_percentage || 0,
                paymentSurchargePercentage: rule.surcharge_percentage || 0,
                paymentRuleId: rule.id,
            },
            error: null,
        }
    }

    const availability = await getAvailableCheckoutPayments(supabase, { cartTotal, priceTableId })
    const matchingLinks = availability.methodGroups
        .flatMap((group) => group.conditions)
        .filter((link) => link.payment_condition_id === selectedPaymentId)
        .sort(sortMethodConditions)

    if (matchingLinks.length > 0) {
        const link = matchingLinks[0]
        return {
            data: {
                source: 'condition',
                paymentMethodId: link.payment_method?.id || null,
                paymentMethodConditionId: link.id,
                paymentMethodCode: link.payment_method?.code || null,
                paymentMethodName: link.payment_method?.name || 'Nao informado',
                paymentConditionId: link.payment_condition?.id || selectedPaymentId,
                paymentConditionName: link.payment_condition?.name || 'Condicao de pagamento',
                paymentConditionDescription: link.payment_condition?.description || null,
                paymentInstallments: link.payment_condition?.installments || null,
                paymentDiscountPercentage: link.payment_condition?.discount_percentage || 0,
                paymentSurchargePercentage: link.payment_condition?.surcharge_percentage || 0,
                paymentRuleId: null,
            },
            error: null,
        }
    }

    const { data: condition, error } = await supabase
        .from('payment_conditions')
        .select('*')
        .eq('id', selectedPaymentId)
        .single()

    if (error || !condition) {
        return { data: null, error: 'Condicao de pagamento nao encontrada.' }
    }

    const paymentCondition = condition as PaymentCondition
    if (!paymentCondition.is_active) {
        return { data: null, error: 'A condicao de pagamento selecionada esta inativa.' }
    }

    if (!isCartTotalWithinRange(cartTotal, paymentCondition.min_order_value, paymentCondition.max_order_value)) {
        return { data: null, error: 'O valor do pedido nao e mais valido para esta condicao de pagamento.' }
    }

    return {
        data: {
            source: 'condition',
            paymentMethodId: null,
            paymentMethodConditionId: null,
            paymentMethodCode: null,
            paymentMethodName: 'Nao informado',
            paymentConditionId: paymentCondition.id,
            paymentConditionName: paymentCondition.name,
            paymentConditionDescription: paymentCondition.description,
            paymentInstallments: paymentCondition.installments,
            paymentDiscountPercentage: paymentCondition.discount_percentage,
            paymentSurchargePercentage: paymentCondition.surcharge_percentage,
            paymentRuleId: null,
        },
        error: null,
    }
}
