import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentCondition, PaymentMethod, PaymentMethodCondition, PriceTablePaymentRule } from '@/lib/types'
import { normalizeFinancialProfile, type StoreCommercialSettings } from '@/lib/commercial/types'

type SupabaseErrorLike = {
    code?: string | null
    message?: string | null
}

export type ResolvedPriceTableSource =
    | 'preferred'
    | 'customer_override'
    | 'store_assignment'
    | 'default'
    | 'none'

type PriceTableCandidate = {
    id: string
    source: Exclude<ResolvedPriceTableSource, 'none'>
}

type PriceTableRow = {
    id: string
    is_active: boolean | null
    valid_from: string | null
    valid_until: string | null
}

export type CheckoutPaymentMethodGroup = {
    method: PaymentMethod
    conditions: PaymentMethodCondition[]
    rules: PriceTablePaymentRule[]
}

export type CommercialPaymentAvailabilityInput = {
    methodGroups: CheckoutPaymentMethodGroup[]
    globalConditions: PaymentCondition[]
    priceTableRules: PriceTablePaymentRule[]
}

export type CommercialPaymentAvailabilityResult = CommercialPaymentAvailabilityInput & {
    blocked: boolean
    reason: string | null
}

function isMissingRelationError(error: SupabaseErrorLike | null | undefined) {
    if (!error) return false
    if (error.code === '42P01') return true
    const message = (error.message || '').toLowerCase()
    return message.includes('does not exist') && message.includes('store_commercial_settings')
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isPriceTableCurrentlyValid(table: PriceTableRow | null | undefined) {
    if (!table || !table.id) return false
    if (table.is_active === false) return false

    const now = new Date()
    const validFrom = table.valid_from ? new Date(table.valid_from) : null
    const validUntil = table.valid_until ? new Date(table.valid_until) : null
    const isStarted = !validFrom || now >= validFrom
    const isExpired = Boolean(validUntil && now > validUntil)

    return isStarted && !isExpired
}

function dedupeCandidates(candidates: PriceTableCandidate[]) {
    const seen = new Set<string>()
    const output: PriceTableCandidate[] = []

    candidates.forEach((candidate) => {
        if (!candidate.id || seen.has(candidate.id)) return
        seen.add(candidate.id)
        output.push(candidate)
    })

    return output
}

export async function getStoreCommercialSettings(
    supabase: SupabaseClient,
    storeId: string
): Promise<StoreCommercialSettings | null> {
    if (!storeId) return null

    const { data, error } = await supabase
        .from('store_commercial_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle()

    if (error) {
        if (isMissingRelationError(error)) return null
        console.error('[COMMERCIAL] failed to load store commercial settings:', error)
        return null
    }

    if (!data) return null

    const row = data as StoreCommercialSettings
    return {
        ...row,
        financial_profile: normalizeFinancialProfile(row.financial_profile),
    }
}

export async function resolveEffectivePriceTableIdForStore(
    supabase: SupabaseClient,
    params: {
        storeId: string
        preferredPriceTableId?: string | null
        settings?: StoreCommercialSettings | null
    }
) {
    const { storeId, preferredPriceTableId = null } = params
    const settings = params.settings ?? (await getStoreCommercialSettings(supabase, storeId))

    const candidates: PriceTableCandidate[] = []

    if (preferredPriceTableId) {
        candidates.push({ id: preferredPriceTableId, source: 'preferred' })
    }

    if (settings?.override_price_table_id) {
        candidates.push({
            id: settings.override_price_table_id,
            source: 'customer_override',
        })
    }

    const { data: assignment } = await supabase
        .from('store_price_tables')
        .select('price_table_id')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (assignment?.price_table_id) {
        candidates.push({ id: assignment.price_table_id, source: 'store_assignment' })
    }

    const { data: defaultTable } = await supabase
        .from('price_tables')
        .select('id')
        .eq('is_default', true)
        .limit(1)
        .maybeSingle()

    if (defaultTable?.id) {
        candidates.push({ id: defaultTable.id, source: 'default' })
    }

    const uniqueCandidates = dedupeCandidates(candidates)

    if (uniqueCandidates.length === 0) {
        return {
            settings,
            priceTableId: null,
            source: 'none' as const,
        }
    }

    const { data: tables, error: tablesError } = await supabase
        .from('price_tables')
        .select('id, is_active, valid_from, valid_until')
        .in(
            'id',
            uniqueCandidates.map((candidate) => candidate.id)
        )

    if (tablesError) {
        console.error('[COMMERCIAL] failed to validate price table candidates:', tablesError)
    }

    const tableById = new Map<string, PriceTableRow>()
    ;((tables || []) as PriceTableRow[]).forEach((table) => {
        tableById.set(table.id, table)
    })

    for (const candidate of uniqueCandidates) {
        const table = tableById.get(candidate.id)
        if (!isPriceTableCurrentlyValid(table)) continue

        return {
            settings,
            priceTableId: candidate.id,
            source: candidate.source,
        }
    }

    return {
        settings,
        priceTableId: null,
        source: 'none' as const,
    }
}

function filterMethodGroupByCommercialRules(
    group: CheckoutPaymentMethodGroup,
    settings: StoreCommercialSettings | null
) {
    const financialProfile = settings?.financial_profile || 'no_restriction'
    const methodOverride = settings?.override_payment_method_id || null
    const conditionOverride = settings?.override_payment_condition_id || null

    if (methodOverride && group.method.id !== methodOverride) {
        return null
    }

    let conditions = [...group.conditions]
    let rules = [...group.rules]

    if (conditionOverride) {
        conditions = conditions.filter((condition) => condition.payment_condition_id === conditionOverride)
        rules = rules.filter(
            (rule) => rule.payment_method_condition?.payment_condition_id === conditionOverride
        )
    }

    if (financialProfile === 'cash_only') {
        conditions = conditions.filter((condition) => {
            const installments = condition.payment_condition?.installments ?? 1
            return installments <= 1
        })
        rules = rules.filter((rule) => (rule.number_of_installments || 1) <= 1)
    }

    if (conditions.length === 0 && rules.length === 0) {
        return null
    }

    return {
        ...group,
        conditions,
        rules,
    }
}

export function applyCommercialPaymentAvailability(
    availability: CommercialPaymentAvailabilityInput,
    settings: StoreCommercialSettings | null
): CommercialPaymentAvailabilityResult {
    const financialProfile = settings?.financial_profile || 'no_restriction'

    if (financialProfile === 'block_sales') {
        return {
            methodGroups: [],
            globalConditions: [],
            priceTableRules: [],
            blocked: true,
            reason: 'Cliente com perfil financeiro restrito para novas compras.',
        }
    }

    const methodGroups = availability.methodGroups
        .map((group) => filterMethodGroupByCommercialRules(group, settings))
        .filter((group): group is CheckoutPaymentMethodGroup => Boolean(group))

    const conditionOverride = settings?.override_payment_condition_id || null

    const globalConditions = availability.globalConditions.filter((condition) => {
        if (conditionOverride && condition.id !== conditionOverride) return false
        if (financialProfile === 'cash_only' && (condition.installments || 1) > 1) return false
        return true
    })

    const priceTableRules = methodGroups.flatMap((group) => group.rules)

    if (methodGroups.length === 0 && globalConditions.length === 0 && priceTableRules.length === 0) {
        let reason = 'Nenhum pagamento disponivel para a politica comercial deste cliente.'
        if (financialProfile === 'cash_only') {
            reason = 'Cliente configurado para compra somente a vista e nao ha condicao compativel ativa.'
        } else if (conditionOverride || settings?.override_payment_method_id) {
            reason = 'Os overrides comerciais do cliente nao possuem combinacao de pagamento ativa.'
        }

        return {
            methodGroups,
            globalConditions,
            priceTableRules,
            blocked: true,
            reason,
        }
    }

    return {
        methodGroups,
        globalConditions,
        priceTableRules,
        blocked: false,
        reason: null,
    }
}

export function validateCheckoutSelectionAgainstCommercialSettings(params: {
    settings: StoreCommercialSettings | null
    paymentMethodId: string | null
    paymentConditionId: string | null
    paymentInstallments: number | null
}) {
    const { settings, paymentMethodId, paymentConditionId, paymentInstallments } = params
    if (!settings) return null

    if (settings.financial_profile === 'block_sales') {
        return 'Este cliente esta com vendas restritas e nao pode finalizar novos pedidos.'
    }

    if (
        settings.override_payment_method_id &&
        paymentMethodId &&
        paymentMethodId !== settings.override_payment_method_id
    ) {
        return 'Este cliente possui meio de pagamento fixo definido no cadastro comercial.'
    }

    if (
        settings.override_payment_condition_id &&
        paymentConditionId &&
        paymentConditionId !== settings.override_payment_condition_id
    ) {
        return 'Este cliente possui condicao de pagamento fixa definida no cadastro comercial.'
    }

    if (settings.financial_profile === 'cash_only') {
        const installments = paymentInstallments || 0
        if (installments > 1 || installments <= 0) {
            return 'Este cliente pode comprar somente a vista (1 parcela).'
        }
    }

    return null
}

export async function validateStoreCreditLimitForOrder(params: {
    supabase: SupabaseClient
    storeId: string
    settings: StoreCommercialSettings | null
    orderTotal: number
}) {
    const { supabase, storeId, settings, orderTotal } = params
    const creditLimit = settings?.credit_limit ?? null
    if (creditLimit === null || creditLimit <= 0) return null

    const { data, error } = await supabase
        .from('orders')
        .select('total')
        .eq('store_id', storeId)
        .neq('status', 'cancelled')
        .in('payment_status', ['pending', 'overdue'])

    if (error) {
        console.error('[COMMERCIAL] failed to validate credit limit:', error)
        return null
    }

    const openExposure = (data || []).reduce((sum, order) => sum + Number(order.total || 0), 0)
    const projectedTotal = openExposure + Math.max(0, Number(orderTotal || 0))

    if (projectedTotal <= creditLimit) return null

    const available = Math.max(0, creditLimit - openExposure)
    return `Limite de credito excedido. Limite: R$ ${formatCurrency(creditLimit)}. Disponivel: R$ ${formatCurrency(available)}.`
}
