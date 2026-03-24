'use server'

import { cookies } from 'next/headers'
import { revalidateTag, unstable_cache } from 'next/cache'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
    getAvailableCheckoutPayments,
    resolveCheckoutPaymentSelection,
} from '@/lib/payments/checkout-payment'
import {
    applyCommercialPaymentAvailability,
    getStoreCommercialSettings,
    resolveEffectivePriceTableIdForStore,
    validateCheckoutSelectionAgainstCommercialSettings,
    validateStoreCreditLimitForOrder,
} from '@/lib/commercial/store-commercial'
import {
    PRODUCT_VARIANT_DETAIL_SELECT,
    buildProductFabricGroups,
} from '@/lib/products/product-detail'
import {
    buildPricingCartKey,
    getPriceTableContextForStore,
    getVariantPricingSnapshotsForStore,
} from '@/lib/pricing/server-pricing'
import type {
    Order,
    OrderItem,
    PriceTable,
    Product,
    Profile,
    RepresentativeVisit,
    SalesQuote,
    Store,
    StoreAddress,
    CustomerType,
    SystemSettings,
} from '@/lib/types'

type RepresentativeBootstrapCustomer = Store & {
    profile?: Profile | null
    addresses?: StoreAddress[]
    assigned_price_tables?: PriceTable[]
    last_order?: Pick<Order, 'id' | 'order_number' | 'created_at' | 'total' | 'status'> | null
}

type RepresentativeCatalogProduct = Product & {
    images?: { url: string; is_primary: boolean; sort_order?: number }[]
}

type PaginatedResult<T> = {
    items: T[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

type RepresentativeCustomersPageInput = {
    page?: number
    pageSize?: number
    query?: string
    state?: string | null
    customerTypeId?: string | null
    inactivityBucket?: '30' | '60' | '90' | 'no_order' | null
    sort?: 'inactivity_desc' | 'name_asc' | 'recent_order_desc' | null
    segment?: 'reactivation_90' | 'hot_30' | 'never_ordered' | null
}

type CustomerPriorityLevel = 'high' | 'medium' | 'low'

type CustomerPriorityData = {
    score: number
    level: CustomerPriorityLevel
    next_action: string
}

type CustomerDataQualityData = {
    score: number
    issues: string[]
}

type RepresentativeCustomerRow = RepresentativeBootstrapCustomer & {
    open_quotes_count?: number
    overdue_followups_count?: number
    alerts?: string[]
    data_quality?: CustomerDataQualityData
    priority?: CustomerPriorityData
}

type RepresentativeCustomersPageSummary = {
    totalCustomers: number
    customersWithoutOrders: number
    customersWithRecentOrders30: number
    customersInactive60Plus: number
    customersInactive90Plus: number
    highPriorityCustomers: number
    lowQualityCustomers: number
    customersWithOverdueFollowups: number
}

type RepresentativeCustomersPageData = PaginatedResult<RepresentativeCustomerRow> & {
    summary: RepresentativeCustomersPageSummary
    facets: {
        states: string[]
        customerTypes: Array<{
            id: string
            name: string
        }>
    }
}

type RepresentativeOrdersPageInput = {
    page?: number
    pageSize?: number
}

type RepresentativeQuotesPageInput = {
    page?: number
    pageSize?: number
    query?: string
    status?: SalesQuote['status'] | null
}

type RepresentativeVisitsPageInput = {
    page?: number
    pageSize?: number
    query?: string
    outcome?: RepresentativeVisit['outcome'] | null
    storeId?: string | null
}

type VisitsAgendaSummary = {
    overdue: number
    dueToday: number
    dueNext7Days: number
    convertedThisMonth: number
    completedLast7Days: number
}

type RepresentativeVisitsPageData = PaginatedResult<RepresentativeVisit> & {
    agenda: VisitsAgendaSummary
}

type RepresentativeCatalogProductsPageInput = {
    page?: number
    pageSize?: number
    search?: string
    categoryId?: string | null
}

type QuotePipelineSummary = {
    status: SalesQuote['status']
    count: number
    totalValue: number
}

type QuoteAgingSummary = {
    bucket: '0_3' | '4_7' | '8_14' | '15_plus'
    label: string
    count: number
}

type QuoteIndicatorsSummary = {
    totalQuotes: number
    totalValue: number
    convertedQuotes: number
    conversionRate: number
    avgAgingDays: number
}

type RepresentativeQuotesPageData = PaginatedResult<SalesQuote> & {
    indicators: QuoteIndicatorsSummary
    pipeline: QuotePipelineSummary[]
    aging: QuoteAgingSummary[]
}

type RepresentativeDraftLine = {
    cartKey?: string
    variantId: string
    productId: string
    productName: string
    fabricName: string
    colorName: string
    sizeName?: string | null
    sizeOptionId?: string | null
    imageUrl?: string | null
    quantity: number
}

type RepresentativeDocumentPayload = {
    quoteId?: string | null
    sourceVisitId?: string | null
    storeId: string
    priceTableId?: string | null
    selectedPaymentId?: string | null
    isTableRule?: boolean
    selectedAddressId?: string | null
    notes?: string | null
    negotiationDiscountType?: 'percent' | 'value' | null
    negotiationDiscountValue?: number | null
    negotiationSurchargeAmount?: number | null
    negotiationReason?: string | null
    items: RepresentativeDraftLine[]
}

type SalesOrderLikeResult = {
    order_id?: string
    order_number?: string
    quote_id?: string
    quote_number?: string
}

function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Credenciais server-side do Supabase nao configuradas.')
    }

    return createServiceClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    })
}

const SALES_REPRESENTATIVE_CACHE_NAMESPACE = 'sales:representative'
const DEFAULT_CUSTOMERS_PAGE_SIZE = 20
const DEFAULT_ORDERS_PAGE_SIZE = 20
const DEFAULT_QUOTES_PAGE_SIZE = 20
const DEFAULT_VISITS_PAGE_SIZE = 20
const DEFAULT_PRODUCTS_PAGE_SIZE = 24

type RepresentativeCacheSegment =
    | 'customers'
    | 'orders'
    | 'quotes'
    | 'visits'
    | 'products'
    | 'dashboard'
    | 'builder'

function normalizePage(value?: number, fallback = 1) {
    const parsed = Number(value || fallback)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(1, Math.floor(parsed))
}

function normalizePageSize(value: number | undefined, fallback: number, max: number) {
    const parsed = Number(value || fallback)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(1, Math.min(max, Math.floor(parsed)))
}

function normalizeSearchTerm(value?: string | null) {
    return (value || '').trim().toLowerCase()
}

function escapeIlike(value: string) {
    return value.replaceAll('%', '\\%').replaceAll('_', '\\_')
}

function calculateAgingDays(createdAt: string, now = Date.now()) {
    const createdTime = new Date(createdAt).getTime()
    if (!Number.isFinite(createdTime)) return 0
    const diff = Math.max(0, now - createdTime)
    return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function calculateDaysSince(dateValue?: string | null, now = Date.now()) {
    if (!dateValue) return Number.POSITIVE_INFINITY
    const dateTime = new Date(dateValue).getTime()
    if (!Number.isFinite(dateTime)) return Number.POSITIVE_INFINITY
    const diff = Math.max(0, now - dateTime)
    return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function toSafeNonNegativeInt(value: unknown, fallback: number) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(0, Math.floor(parsed))
}

function toStringArray(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
}

function normalizeCustomersPageRpcPayload(
    rawPayload: unknown,
    fallbackPage: number,
    fallbackPageSize: number
): RepresentativeCustomersPageData | null {
    if (!rawPayload || typeof rawPayload !== 'object') return null

    const payload = rawPayload as Record<string, unknown>
    const items = Array.isArray(payload.items) ? (payload.items as RepresentativeCustomerRow[]) : []
    const total = toSafeNonNegativeInt(payload.total, items.length)
    const page = toSafeNonNegativeInt(payload.page, fallbackPage) || fallbackPage
    const pageSize = toSafeNonNegativeInt(payload.pageSize, fallbackPageSize) || fallbackPageSize
    const totalPages = Math.max(
        1,
        toSafeNonNegativeInt(payload.totalPages, Math.ceil(Math.max(1, total) / Math.max(1, pageSize)))
    )

    const summaryRaw =
        payload.summary && typeof payload.summary === 'object'
            ? (payload.summary as Record<string, unknown>)
            : {}
    const facetsRaw =
        payload.facets && typeof payload.facets === 'object'
            ? (payload.facets as Record<string, unknown>)
            : {}

    const customerTypesRaw = Array.isArray(facetsRaw.customerTypes)
        ? (facetsRaw.customerTypes as Array<Record<string, unknown>>)
        : []

    return {
        items,
        total,
        page,
        pageSize,
        totalPages,
        summary: {
            totalCustomers: toSafeNonNegativeInt(summaryRaw.totalCustomers, total),
            customersWithoutOrders: toSafeNonNegativeInt(summaryRaw.customersWithoutOrders, 0),
            customersWithRecentOrders30: toSafeNonNegativeInt(summaryRaw.customersWithRecentOrders30, 0),
            customersInactive60Plus: toSafeNonNegativeInt(summaryRaw.customersInactive60Plus, 0),
            customersInactive90Plus: toSafeNonNegativeInt(summaryRaw.customersInactive90Plus, 0),
            highPriorityCustomers: toSafeNonNegativeInt(summaryRaw.highPriorityCustomers, 0),
            lowQualityCustomers: toSafeNonNegativeInt(summaryRaw.lowQualityCustomers, 0),
            customersWithOverdueFollowups: toSafeNonNegativeInt(summaryRaw.customersWithOverdueFollowups, 0),
        },
        facets: {
            states: toStringArray(facetsRaw.states),
            customerTypes: customerTypesRaw
                .map((item) => {
                    const id = typeof item.id === 'string' ? item.id : ''
                    const name = typeof item.name === 'string' ? item.name : ''
                    if (!id || !name) return null
                    return { id, name }
                })
                .filter((item): item is { id: string; name: string } => Boolean(item)),
        },
    }
}

function decodeRpcJsonPayload(payload: unknown) {
    if (typeof payload === 'string') {
        try {
            return JSON.parse(payload)
        } catch {
            return null
        }
    }

    if (Array.isArray(payload)) {
        return payload[0] ?? null
    }

    return payload
}

function buildInputDataQualityAssessment(input: {
    cnpj?: string | null
    phone?: string | null
    email?: string | null
    city?: string | null
    state?: string | null
    customerTypeId?: string | null
    address?: string | null
    tradeName?: string | null
}) {
    const issues: string[] = []
    let penalty = 0

    const normalizedCnpj = (input.cnpj || '').trim()
    if (!normalizedCnpj) {
        penalty += 20
        issues.push('CNPJ ausente')
    }

    const normalizedPhone = (input.phone || '').trim()
    const normalizedEmail = (input.email || '').trim()
    if (!normalizedPhone && !normalizedEmail) {
        penalty += 20
        issues.push('Contato principal ausente')
    }

    const normalizedCity = (input.city || '').trim()
    const normalizedState = (input.state || '').trim()
    if (!normalizedCity || !normalizedState) {
        penalty += 15
        issues.push('Cidade/UF incompleto')
    }

    if (!(input.customerTypeId || '').trim()) {
        penalty += 15
        issues.push('Tipo de cliente nao definido')
    }

    if (!(input.address || '').trim()) {
        penalty += 15
        issues.push('Endereco principal ausente')
    }

    if (!(input.tradeName || '').trim()) {
        penalty += 5
    }

    const score = Math.max(0, 100 - penalty)
    return { score, issues }
}

function buildCustomerOperationalSignals(customer: RepresentativeBootstrapCustomer, now = Date.now()) {
    const openQuotesCount = toSafeNonNegativeInt(
        (customer as RepresentativeCustomerRow).open_quotes_count,
        0
    )
    const overdueFollowupsCount = toSafeNonNegativeInt(
        (customer as RepresentativeCustomerRow).overdue_followups_count,
        0
    )
    const inactivityDays = calculateDaysSince(customer.last_order?.created_at || null, now)
    const quality = buildInputDataQualityAssessment({
        cnpj: customer.cnpj,
        phone: customer.phone || customer.profile?.phone || null,
        email: customer.email || customer.profile?.email || null,
        city: customer.city || customer.addresses?.[0]?.city || null,
        state: customer.state || customer.addresses?.[0]?.state || null,
        customerTypeId: customer.customer_type_id || null,
        address: customer.address || customer.addresses?.[0]?.address || null,
        tradeName: customer.trade_name || null,
    })

    const inactivityPoints = !Number.isFinite(inactivityDays)
        ? 60
        : inactivityDays >= 90
            ? 60
            : inactivityDays >= 60
                ? 35
                : inactivityDays >= 30
                    ? 20
                    : 0
    const priorityScore = inactivityPoints
        + (openQuotesCount > 0 ? 20 : 0)
        + (overdueFollowupsCount > 0 ? 20 : 0)
        + (quality.score < 70 ? 10 : 0)

    const priorityLevel: CustomerPriorityLevel =
        priorityScore >= 70 ? 'high' : priorityScore >= 40 ? 'medium' : 'low'
    const nextAction =
        overdueFollowupsCount > 0
            ? 'Executar follow-up pendente'
            : openQuotesCount > 0
                ? 'Retomar negociacao de orcamento aberto'
                : !Number.isFinite(inactivityDays) || inactivityDays >= 90
                    ? 'Iniciar plano de reativacao'
                    : quality.score < 70
                        ? 'Corrigir cadastro do cliente'
                        : 'Manter relacionamento ativo'

    const alerts: string[] = []
    if (!Number.isFinite(inactivityDays)) alerts.push('Cliente sem historico de pedidos')
    if (Number.isFinite(inactivityDays) && inactivityDays >= 90) alerts.push('Reativacao urgente (90+ dias)')
    if (openQuotesCount > 0) alerts.push('Possui orcamento em aberto')
    if (overdueFollowupsCount > 0) alerts.push('Follow-up vencido')
    if (quality.score < 70) alerts.push('Cadastro com baixa qualidade')

    return {
        openQuotesCount,
        overdueFollowupsCount,
        alerts,
        quality,
        priority: {
            score: priorityScore,
            level: priorityLevel,
            next_action: nextAction,
        } satisfies CustomerPriorityData,
    }
}

function getRepresentativeScopeCacheKey(scopeRepresentativeId?: string | null) {
    return scopeRepresentativeId || 'admin-preview'
}

function getRepresentativeCacheTag(scopeKey: string, segment: RepresentativeCacheSegment) {
    return `${SALES_REPRESENTATIVE_CACHE_NAMESPACE}:${scopeKey}:${segment}`
}

function revalidateRepresentativeSegments(
    scopeRepresentativeId: string | null | undefined,
    segments: RepresentativeCacheSegment[]
) {
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)
    const dedupedSegments = Array.from(new Set(segments))
    dedupedSegments.forEach((segment) => {
        revalidateTag(getRepresentativeCacheTag(scopeKey, segment), 'max')
    })
}

function paginateItems<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)
    const offset = (safePage - 1) * pageSize

    return {
        items: items.slice(offset, offset + pageSize),
        total,
        page: safePage,
        pageSize,
        totalPages,
    }
}

async function requireRepresentativeContext() {
    const cookieStore = await cookies()
    const viewAsRepresentative = cookieStore.get('view_as_representative')?.value === 'true'
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Usuario nao autenticado.')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    const normalizedProfile = profile as Profile | null
    const isRepresentative = normalizedProfile?.role === 'representative'
    const isAdminPreview = normalizedProfile?.role === 'admin' && viewAsRepresentative

    if (!normalizedProfile || (!isRepresentative && !isAdminPreview)) {
        throw new Error('Acesso restrito ao modo representante.')
    }

    if (!isAdminPreview && normalizedProfile.status !== 'approved') {
        throw new Error('Representante sem aprovacao para operar.')
    }

    return {
        supabase,
        admin: getAdminClient(),
        user,
        profile: normalizedProfile,
        isAdminPreview,
        scopeRepresentativeId: isRepresentative ? user.id : null,
    }
}

function toNumber(value: number | string | null | undefined) {
    const parsed = Number(value || 0)
    return Number.isFinite(parsed) ? parsed : 0
}

function formatAddress(address?: StoreAddress | null) {
    if (!address) return null

    return `${address.title ? `[${address.title}] ` : ''}${address.address}${address.number ? `, ${address.number}` : ''}${address.complement ? ` - ${address.complement}` : ''}, ${address.neighborhood ? `${address.neighborhood}, ` : ''}${address.city} - ${address.state}, CEP: ${address.zip_code}`
}

function computeNegotiation(
    subtotal: number,
    discountType?: 'percent' | 'value' | null,
    discountValue?: number | null,
    surchargeAmount?: number | null
) {
    const safeSubtotal = Math.max(0, toNumber(subtotal))
    const safeDiscountValue = Math.max(0, toNumber(discountValue))
    const safeSurchargeAmount = Math.max(0, toNumber(surchargeAmount))

    let discountPercentage = 0
    let discountAmount = 0

    if (discountType === 'percent') {
        discountPercentage = Math.min(100, safeDiscountValue)
        discountAmount = safeSubtotal * (discountPercentage / 100)
    } else if (discountType === 'value') {
        discountAmount = Math.min(safeSubtotal, safeDiscountValue)
    }

    const adjustedSubtotal = Math.max(0, safeSubtotal - discountAmount + safeSurchargeAmount)

    return {
        adjustedSubtotal,
        discountPercentage,
        discountAmount,
        surchargeAmount: safeSurchargeAmount,
    }
}

type RepresentativeCommercialPolicy = {
    maxDiscountPercentage: number | null
    allowFreeNegotiation: boolean
    canOverridePriceTable: boolean
    allowedPriceTableIds: string[]
}

function isMissingRepresentativeCommercialSchemaError(error: { code?: string | null; message?: string | null } | null | undefined) {
    if (!error) return false
    if (error.code === '42P01') return true
    const message = (error.message || '').toLowerCase()
    return message.includes('representative_commercial_settings') || message.includes('representative_price_tables')
}

async function getRepresentativeCommercialPolicy(
    admin: ReturnType<typeof getAdminClient>,
    representativeId: string
): Promise<RepresentativeCommercialPolicy | null> {
    const [settingsRes, tablesRes] = await Promise.all([
        admin
            .from('representative_commercial_settings')
            .select('max_discount_percentage, allow_free_negotiation, can_override_price_table')
            .eq('profile_id', representativeId)
            .maybeSingle(),
        admin
            .from('representative_price_tables')
            .select('price_table_id')
            .eq('representative_id', representativeId),
    ])

    if (isMissingRepresentativeCommercialSchemaError(settingsRes.error) || isMissingRepresentativeCommercialSchemaError(tablesRes.error)) {
        return null
    }

    if (settingsRes.error) {
        throw new Error(settingsRes.error.message || 'Falha ao carregar politica comercial do representante.')
    }

    if (tablesRes.error) {
        throw new Error(tablesRes.error.message || 'Falha ao carregar tabelas permitidas do representante.')
    }

    const settings = settingsRes.data
    const tableIds = (tablesRes.data || []).map((row) => row.price_table_id).filter(Boolean)
    if (!settings && tableIds.length === 0) return null

    return {
        maxDiscountPercentage:
            settings?.max_discount_percentage !== null && settings?.max_discount_percentage !== undefined
                ? Number(settings.max_discount_percentage)
                : null,
        allowFreeNegotiation: settings?.allow_free_negotiation !== false,
        canOverridePriceTable: settings?.can_override_price_table !== false,
        allowedPriceTableIds: tableIds,
    }
}

function formatPercentage(value: number) {
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })
}

function generateRepresentativeTemporaryPassword() {
    const token = crypto.randomUUID().replace(/-/g, '')
    return `${token.slice(0, 8)}Aa1!`
}

type RepresentativeCustomerAccessScopeMode =
    | 'assigned_only'
    | 'all_admin_portfolio'
    | 'filtered_portfolio'

type RepresentativeCustomerAccessPolicy = {
    scopeMode: RepresentativeCustomerAccessScopeMode
    allowedStates: string[]
    allowedCities: string[]
}

type RepresentativeManualCustomerRule = {
    decision: 'allow' | 'deny'
    reason: string | null
}

type RepresentativeCustomerAccessContext = {
    policy: RepresentativeCustomerAccessPolicy
    manualRules: Map<string, RepresentativeManualCustomerRule>
}

type RepresentativeStoreAccessRow = {
    id: string
    representative_id: string | null
    state: string | null
    city: string | null
}

function normalizeRepresentativeScopeMode(value: string | null | undefined): RepresentativeCustomerAccessScopeMode {
    if (value === 'all_admin_portfolio' || value === 'filtered_portfolio' || value === 'assigned_only') {
        return value
    }
    return 'assigned_only'
}

function normalizeAccessValues(values?: string[] | null, transform?: (value: string) => string) {
    const mapper = transform || ((value: string) => value)
    return Array.from(new Set((values || []).map((value) => mapper(value.trim())).filter(Boolean)))
}

function isMissingRepresentativeAccessSchemaError(error: { code?: string | null; message?: string | null } | null | undefined) {
    if (!error) return false
    if (error.code === '42P01') return true
    const message = (error.message || '').toLowerCase()
    return message.includes('representative_customer_access_policies')
}

function isMissingRepresentativeManualRulesSchemaError(error: { code?: string | null; message?: string | null } | null | undefined) {
    if (!error) return false
    if (error.code === '42P01') return true
    const message = (error.message || '').toLowerCase()
    return message.includes('representative_customer_access_rules')
}

async function getRepresentativeCustomerAccessPolicy(
    admin: ReturnType<typeof getAdminClient>,
    representativeId: string
): Promise<RepresentativeCustomerAccessPolicy> {
    const { data, error } = await admin
        .from('representative_customer_access_policies')
        .select('scope_mode, allowed_states, allowed_cities')
        .eq('representative_id', representativeId)
        .maybeSingle()

    if (isMissingRepresentativeAccessSchemaError(error)) {
        return { scopeMode: 'assigned_only', allowedStates: [], allowedCities: [] }
    }

    if (error) {
        throw new Error(error.message || 'Falha ao carregar politica de carteira do representante.')
    }

    return {
        scopeMode: normalizeRepresentativeScopeMode(data?.scope_mode),
        allowedStates: normalizeAccessValues(data?.allowed_states, (value) => value.toUpperCase()),
        allowedCities: normalizeAccessValues(data?.allowed_cities, (value) => value.toLowerCase()),
    }
}

async function getRepresentativeManualCustomerRules(
    admin: ReturnType<typeof getAdminClient>,
    representativeId: string
): Promise<Map<string, RepresentativeManualCustomerRule>> {
    const { data, error } = await admin
        .from('representative_customer_access_rules')
        .select('store_id, decision, reason')
        .eq('representative_id', representativeId)

    if (isMissingRepresentativeManualRulesSchemaError(error)) {
        return new Map<string, RepresentativeManualCustomerRule>()
    }

    if (error) {
        throw new Error(error.message || 'Falha ao carregar regras manuais de carteira do representante.')
    }

    return new Map(
        (data || []).map((row) => [
            row.store_id,
            {
                decision: row.decision === 'deny' ? 'deny' : 'allow',
                reason: (row.reason || '').trim() || null,
            },
        ])
    )
}

async function getRepresentativeCustomerAccessContext(
    admin: ReturnType<typeof getAdminClient>,
    representativeId: string
): Promise<RepresentativeCustomerAccessContext> {
    const [policy, manualRules] = await Promise.all([
        getRepresentativeCustomerAccessPolicy(admin, representativeId),
        getRepresentativeManualCustomerRules(admin, representativeId),
    ])

    return { policy, manualRules }
}

function resolveUnassignedStoreAccessByPriority(
    store: Pick<RepresentativeStoreAccessRow, 'id' | 'state' | 'city'>,
    accessContext: RepresentativeCustomerAccessContext
) {
    const manualRule = accessContext.manualRules.get(store.id)
    if (manualRule?.decision === 'deny') return false
    if (manualRule?.decision === 'allow') return true

    const normalizedCity = (store.city || '').trim().toLowerCase()
    if (normalizedCity && accessContext.policy.allowedCities.includes(normalizedCity)) {
        return true
    }

    const normalizedState = (store.state || '').trim().toUpperCase()
    if (normalizedState && accessContext.policy.allowedStates.includes(normalizedState)) {
        return true
    }

    return accessContext.policy.scopeMode === 'all_admin_portfolio'
}

function canRepresentativeAccessStore(
    store: RepresentativeStoreAccessRow,
    representativeId: string,
    accessContext: RepresentativeCustomerAccessContext
) {
    if (store.representative_id === representativeId) return true
    if (store.representative_id && store.representative_id !== representativeId) return false
    return resolveUnassignedStoreAccessByPriority(store, accessContext)
}

async function loadStoreWithinRepresentativeScope(
    admin: ReturnType<typeof getAdminClient>,
    storeId: string,
    representativeId?: string | null
) {
    const { data: store } = await admin
        .from('stores')
        .select('id, profile_id, representative_id, state, city')
        .eq('id', storeId)
        .maybeSingle()

    if (!store) return null
    if (!representativeId) return store
    const accessContext = await getRepresentativeCustomerAccessContext(admin, representativeId)
    return canRepresentativeAccessStore(store as RepresentativeStoreAccessRow, representativeId, accessContext)
        ? store
        : null
}

async function getRepresentativeCustomersInternal(representativeId?: string | null) {
    const admin = getAdminClient()
    const storeSelect = `
            *,
            customer_type:customer_types(*),
            profile:profiles!stores_profile_id_fkey(*),
            addresses:store_addresses(*),
            price_table_links:store_price_tables(
                price_table:price_tables(*)
            )
        `

    let stores: Array<Store & {
        profile?: Profile | null
        addresses?: StoreAddress[]
        price_table_links?: Array<{ price_table?: PriceTable | null }>
    }> = []

    if (!representativeId) {
        const { data: allStores } = await admin
            .from('stores')
            .select(storeSelect)
            .order('company_name')
        stores = (allStores || []) as typeof stores
    } else {
        const accessContext = await getRepresentativeCustomerAccessContext(admin, representativeId)
        const [assignedStoresRes, adminPortfolioStoresRes] = await Promise.all([
            admin
                .from('stores')
                .select(storeSelect)
                .eq('representative_id', representativeId)
                .order('company_name'),
            admin
                .from('stores')
                .select(storeSelect)
                .is('representative_id', null)
                .order('company_name'),
        ])

        if (assignedStoresRes.error) {
            throw new Error(assignedStoresRes.error.message || 'Falha ao carregar clientes do representante.')
        }

        if (adminPortfolioStoresRes.error) {
            throw new Error(adminPortfolioStoresRes.error.message || 'Falha ao carregar carteira geral do admin.')
        }

        const storeMap = new Map<string, (typeof stores)[number]>()

        ;(assignedStoresRes.data || []).forEach((store) => {
            storeMap.set(store.id, store as (typeof stores)[number])
        })

        ;(adminPortfolioStoresRes.data || []).forEach((store) => {
            const storeRow = store as RepresentativeStoreAccessRow
            if (
                !storeMap.has(store.id) &&
                canRepresentativeAccessStore(storeRow, representativeId, accessContext)
            ) {
                storeMap.set(store.id, store as (typeof stores)[number])
            }
        })

        stores = Array.from(storeMap.values()).sort((a, b) =>
            (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR')
        )
    }

    const normalizedStores = (stores || []).map((store) => ({
        ...store,
        assigned_price_tables: (store.price_table_links || [])
            .map((item) => item.price_table)
            .filter((value): value is PriceTable => Boolean(value)),
        addresses: (store.addresses || []).sort((a, b) => Number(b.is_main) - Number(a.is_main)),
    }))

    const storeIds = normalizedStores.map((store) => store.id)
    const lastOrders = new Map<string, RepresentativeBootstrapCustomer['last_order']>()

    if (storeIds.length > 0) {
        const { data: orders } = await admin
            .from('orders')
            .select('id, order_number, created_at, total, status, store_id')
            .in('store_id', storeIds)
            .order('created_at', { ascending: false })

        ;(orders || []).forEach((order) => {
            if (!lastOrders.has(order.store_id)) {
                lastOrders.set(order.store_id, {
                    id: order.id,
                    order_number: order.order_number,
                    created_at: order.created_at,
                    total: order.total,
                    status: order.status,
                })
            }
        })
    }

    return normalizedStores.map((store) => ({
        ...store,
        last_order: lastOrders.get(store.id) || null,
    })) as RepresentativeBootstrapCustomer[]
}

async function getRepresentativeCatalogProductsPageInternal(
    admin: ReturnType<typeof getAdminClient>,
    input: RepresentativeCatalogProductsPageInput
): Promise<PaginatedResult<RepresentativeCatalogProduct>> {
    const page = normalizePage(input.page, 1)
    const pageSize = normalizePageSize(input.pageSize, DEFAULT_PRODUCTS_PAGE_SIZE, 60)
    const search = normalizeSearchTerm(input.search)
    const offset = (page - 1) * pageSize

    const query = admin
        .from('products')
        .select(
            '*, category:categories(*), images:product_images(url, is_primary, sort_order), size_options:product_size_options(*)',
            { count: 'exact' }
        )
        .eq('is_active', true)
        .order('name', { ascending: true })
        .range(offset, offset + pageSize - 1)

    if (input.categoryId) {
        query.eq('category_id', input.categoryId)
    }

    if (search) {
        query.ilike('name', `%${search}%`)
    }

    const { data, count, error } = await query

    if (error) {
        throw new Error(error.message || 'Falha ao carregar catalogo de produtos.')
    }

    const total = count || 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return {
        items: (data || []) as RepresentativeCatalogProduct[],
        total,
        page: Math.min(page, totalPages),
        pageSize,
        totalPages,
    }
}

export async function getRepresentativeShellData() {
    const { profile, isAdminPreview } = await requireRepresentativeContext()
    return { profile, isAdminPreview }
}

export async function getRepresentativeDashboardData() {
    const { profile, admin, scopeRepresentativeId } = await requireRepresentativeContext()

    const recentOrdersQuery = admin
        .from('orders')
        .select(`
                id,
                order_number,
                created_at,
                total,
                status,
                store:stores(id, customer_code, company_name, trade_name)
            `)
        .order('created_at', { ascending: false })
        .limit(5)

    const recentQuotesQuery = admin
        .from('sales_quotes')
        .select(`
                id,
                quote_number,
                created_at,
                total,
                status,
                store:stores(id, customer_code, company_name, trade_name)
            `)
        .order('created_at', { ascending: false })
        .limit(5)

    const visitsCountQuery = admin.from('sales_visits').select('id', { count: 'exact', head: true })
    const ordersCountQuery = admin.from('orders').select('id', { count: 'exact', head: true })
    const quotesCountQuery = admin.from('sales_quotes').select('id', { count: 'exact', head: true })

    if (scopeRepresentativeId) {
        recentOrdersQuery.eq('created_by_profile_id', scopeRepresentativeId)
        recentQuotesQuery.eq('representative_id', scopeRepresentativeId)
        visitsCountQuery.eq('representative_id', scopeRepresentativeId)
        ordersCountQuery.eq('created_by_profile_id', scopeRepresentativeId)
        quotesCountQuery.eq('representative_id', scopeRepresentativeId)
    }

    const [customers, recentOrdersRes, recentQuotesRes, visitsRes, ordersCountRes, quotesCountRes] = await Promise.all([
        getRepresentativeCustomersInternal(scopeRepresentativeId),
        recentOrdersQuery,
        recentQuotesQuery,
        visitsCountQuery,
        ordersCountQuery,
        quotesCountQuery,
    ])

    return {
        profile,
        metrics: {
            customers: customers.length,
            orders: ordersCountRes.count || 0,
            quotes: quotesCountRes.count || 0,
            visits: visitsRes.count || 0,
        },
        recentOrders: recentOrdersRes.data || [],
        recentQuotes: recentQuotesRes.data || [],
        customers,
    }
}

export async function getRepresentativeCustomersData() {
    const { scopeRepresentativeId } = await requireRepresentativeContext()
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)
    const loadCustomers = unstable_cache(
        async () => getRepresentativeCustomersInternal(scopeRepresentativeId),
        ['rep-customers-list-v1', scopeKey],
        {
            tags: [getRepresentativeCacheTag(scopeKey, 'customers')],
            revalidate: 120,
        }
    )

    return loadCustomers()
}

export async function getRepresentativeCustomersPageData(
    input: RepresentativeCustomersPageInput = {}
): Promise<RepresentativeCustomersPageData> {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const page = normalizePage(input.page, 1)
    const pageSize = normalizePageSize(input.pageSize, DEFAULT_CUSTOMERS_PAGE_SIZE, 80)
    const query = normalizeSearchTerm(input.query)
    const state = (input.state || '').trim().toUpperCase()
    const customerTypeId = (input.customerTypeId || '').trim()
    const inactivityBucket = input.inactivityBucket || null
    const sort = input.sort || 'inactivity_desc'
    const segment = input.segment || null
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)

    const loadCustomersPage = unstable_cache(
        async () => {
            if (scopeRepresentativeId) {
                const accessContext = await getRepresentativeCustomerAccessContext(admin, scopeRepresentativeId)
                const manualAllowIds: string[] = []
                const manualDenyIds: string[] = []

                accessContext.manualRules.forEach((rule, storeId) => {
                    if (rule.decision === 'allow') {
                        manualAllowIds.push(storeId)
                        return
                    }
                    manualDenyIds.push(storeId)
                })

                const { data: rpcData, error: rpcError } = await admin.rpc('representative_get_customers_page', {
                    p_representative_id: scopeRepresentativeId,
                    p_query: query || null,
                    p_state: state || null,
                    p_customer_type_id: customerTypeId || null,
                    p_inactivity_bucket: inactivityBucket || null,
                    p_segment: segment || null,
                    p_sort: sort,
                    p_page: page,
                    p_page_size: pageSize,
                    p_scope_mode: accessContext.policy.scopeMode,
                    p_allowed_states: accessContext.policy.allowedStates,
                    p_allowed_cities: accessContext.policy.allowedCities,
                    p_manual_allow: manualAllowIds,
                    p_manual_deny: manualDenyIds,
                })

                if (!rpcError && rpcData) {
                    const payload = normalizeCustomersPageRpcPayload(
                        decodeRpcJsonPayload(rpcData),
                        page,
                        pageSize
                    )
                    if (payload) return payload
                }
            } else {
                const { data: rpcData, error: rpcError } = await admin.rpc('representative_get_customers_page', {
                    p_representative_id: null,
                    p_query: query || null,
                    p_state: state || null,
                    p_customer_type_id: customerTypeId || null,
                    p_inactivity_bucket: inactivityBucket || null,
                    p_segment: segment || null,
                    p_sort: sort,
                    p_page: page,
                    p_page_size: pageSize,
                    p_scope_mode: 'all_admin_portfolio',
                    p_allowed_states: [],
                    p_allowed_cities: [],
                    p_manual_allow: [],
                    p_manual_deny: [],
                })

                if (!rpcError && rpcData) {
                    const payload = normalizeCustomersPageRpcPayload(
                        decodeRpcJsonPayload(rpcData),
                        page,
                        pageSize
                    )
                    if (payload) return payload
                }
            }

            const allCustomers = await getRepresentativeCustomersInternal(scopeRepresentativeId)
            const now = Date.now()

            const searchedCustomers = query
                ? allCustomers.filter((customer) => {
                    const companyName = (customer.company_name || '').toLowerCase()
                    const cnpj = (customer.cnpj || '').toLowerCase()
                    const code = (customer.customer_code || '').toLowerCase()
                    const tradeName = (customer.trade_name || '').toLowerCase()
                    const buyerName = (customer.profile?.full_name || '').toLowerCase()
                    const buyerEmail = (customer.profile?.email || '').toLowerCase()
                    return (
                        companyName.includes(query) ||
                        cnpj.includes(query) ||
                        code.includes(query) ||
                        tradeName.includes(query) ||
                        buyerName.includes(query) ||
                        buyerEmail.includes(query)
                    )
                })
                : allCustomers

            const stateFilteredCustomers = state
                ? searchedCustomers.filter((customer) => {
                    const normalizedState =
                        (customer.state || customer.addresses?.[0]?.state || '').trim().toUpperCase()
                    return normalizedState === state
                })
                : searchedCustomers

            const customerTypeFilteredCustomers = customerTypeId
                ? stateFilteredCustomers.filter((customer) => customer.customer_type_id === customerTypeId)
                : stateFilteredCustomers

            const segmentFilteredCustomers = segment
                ? customerTypeFilteredCustomers.filter((customer) => {
                    const inactivityDays = calculateDaysSince(customer.last_order?.created_at || null, now)
                    if (segment === 'never_ordered') {
                        return !Number.isFinite(inactivityDays)
                    }

                    if (segment === 'hot_30') {
                        return Number.isFinite(inactivityDays) && inactivityDays <= 30
                    }

                    return Number.isFinite(inactivityDays) && inactivityDays >= 90
                })
                : customerTypeFilteredCustomers

            const inactivityFilteredCustomers = inactivityBucket
                ? segmentFilteredCustomers.filter((customer) => {
                    const inactivityDays = calculateDaysSince(customer.last_order?.created_at || null, now)
                    if (inactivityBucket === 'no_order') {
                        return !Number.isFinite(inactivityDays)
                    }

                    const threshold = Number(inactivityBucket)
                    if (!Number.isFinite(threshold)) return true
                    return inactivityDays >= threshold
                })
                : segmentFilteredCustomers

            const sortedCustomers = [...inactivityFilteredCustomers].sort((a, b) => {
                if (sort === 'name_asc') {
                    return (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR')
                }

                if (sort === 'recent_order_desc') {
                    const aDays = calculateDaysSince(a.last_order?.created_at || null, now)
                    const bDays = calculateDaysSince(b.last_order?.created_at || null, now)
                    const normalizedADays = Number.isFinite(aDays) ? aDays : Number.MAX_SAFE_INTEGER
                    const normalizedBDays = Number.isFinite(bDays) ? bDays : Number.MAX_SAFE_INTEGER

                    if (normalizedADays !== normalizedBDays) {
                        return normalizedADays - normalizedBDays
                    }
                    return (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR')
                }

                const aDays = calculateDaysSince(a.last_order?.created_at || null, now)
                const bDays = calculateDaysSince(b.last_order?.created_at || null, now)
                const normalizedADays = Number.isFinite(aDays) ? aDays : Number.MAX_SAFE_INTEGER
                const normalizedBDays = Number.isFinite(bDays) ? bDays : Number.MAX_SAFE_INTEGER

                if (normalizedADays !== normalizedBDays) {
                    return normalizedBDays - normalizedADays
                }
                return (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR')
            })

            const enrichedCustomers: RepresentativeCustomerRow[] = sortedCustomers.map((customer) => {
                const signals = buildCustomerOperationalSignals(customer, now)
                return {
                    ...customer,
                    open_quotes_count: signals.openQuotesCount,
                    overdue_followups_count: signals.overdueFollowupsCount,
                    alerts: signals.alerts,
                    data_quality: {
                        score: signals.quality.score,
                        issues: signals.quality.issues,
                    },
                    priority: signals.priority,
                }
            })

            const paginated = paginateItems(enrichedCustomers, page, pageSize)

            const summary = {
                totalCustomers: enrichedCustomers.length,
                customersWithoutOrders: enrichedCustomers.filter((customer) => !customer.last_order).length,
                customersWithRecentOrders30: enrichedCustomers.filter((customer) => {
                    const inactivityDays = calculateDaysSince(customer.last_order?.created_at || null, now)
                    return Number.isFinite(inactivityDays) && inactivityDays <= 30
                }).length,
                customersInactive60Plus: enrichedCustomers.filter((customer) => {
                    const inactivityDays = calculateDaysSince(customer.last_order?.created_at || null, now)
                    return Number.isFinite(inactivityDays) && inactivityDays >= 60
                }).length,
                customersInactive90Plus: enrichedCustomers.filter((customer) => {
                    const inactivityDays = calculateDaysSince(customer.last_order?.created_at || null, now)
                    return Number.isFinite(inactivityDays) && inactivityDays >= 90
                }).length,
                highPriorityCustomers: enrichedCustomers.filter((customer) => customer.priority?.level === 'high').length,
                lowQualityCustomers: enrichedCustomers.filter((customer) => (customer.data_quality?.score || 100) < 70).length,
                customersWithOverdueFollowups: enrichedCustomers.filter(
                    (customer) => (customer.overdue_followups_count || 0) > 0
                ).length,
            }

            const states = Array.from(
                new Set(
                    allCustomers
                        .map((customer) => (customer.state || customer.addresses?.[0]?.state || '').trim().toUpperCase())
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

            const customerTypes = Array.from(
                new Map(
                    allCustomers
                        .filter((customer) => customer.customer_type?.id && customer.customer_type?.name)
                        .map((customer) => [customer.customer_type!.id, {
                            id: customer.customer_type!.id,
                            name: customer.customer_type!.name,
                        }])
                ).values()
            ).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

            return {
                ...paginated,
                summary,
                facets: {
                    states,
                    customerTypes,
                },
            }
        },
        [
            'rep-customers-page-v2',
            scopeKey,
            String(page),
            String(pageSize),
            query,
            state || 'all',
            customerTypeId || 'all',
            segment || 'all',
            inactivityBucket || 'all',
            sort,
        ],
        {
            tags: [getRepresentativeCacheTag(scopeKey, 'customers')],
            revalidate: 120,
        }
    )

    return loadCustomersPage()
}

export async function getRepresentativeOrdersData() {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const query = admin
        .from('orders')
        .select(`
            *,
            store:stores(*),
            profile:profiles!orders_profile_id_fkey(*),
            created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at)
        `)
        .order('created_at', { ascending: false })

    if (scopeRepresentativeId) {
        query.eq('created_by_profile_id', scopeRepresentativeId)
    }

    const { data } = await query
    return (data || []) as Order[]
}

export async function getRepresentativeOrdersPageData(input: RepresentativeOrdersPageInput = {}) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const page = normalizePage(input.page, 1)
    const pageSize = normalizePageSize(input.pageSize, DEFAULT_ORDERS_PAGE_SIZE, 80)
    const offset = (page - 1) * pageSize
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)

    const loadOrdersPage = unstable_cache(
        async () => {
            const query = admin
                .from('orders')
                .select(
                    `
                        *,
                        store:stores(*),
                        profile:profiles!orders_profile_id_fkey(*),
                        created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at)
                    `,
                    { count: 'exact' }
                )
                .order('created_at', { ascending: false })
                .range(offset, offset + pageSize - 1)

            if (scopeRepresentativeId) {
                query.eq('created_by_profile_id', scopeRepresentativeId)
            }

            const { data, count, error } = await query
            if (error) {
                throw new Error(error.message || 'Falha ao carregar pedidos paginados.')
            }

            const total = count || 0
            const totalPages = Math.max(1, Math.ceil(total / pageSize))
            return {
                items: (data || []) as Order[],
                total,
                page: Math.min(page, totalPages),
                pageSize,
                totalPages,
            } satisfies PaginatedResult<Order>
        },
        ['rep-orders-page-v1', scopeKey, String(page), String(pageSize)],
        {
            tags: [getRepresentativeCacheTag(scopeKey, 'orders')],
            revalidate: 60,
        }
    )

    return loadOrdersPage()
}

export async function getRepresentativeOrderDetail(orderId: string) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const query = admin
        .from('orders')
        .select(`
            *,
            store:stores(*),
            profile:profiles!orders_profile_id_fkey(*),
            created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at),
            items:order_items(*),
            status_history:order_status_history(*, changed_by_profile:profiles!order_status_history_changed_by_fkey(id, full_name, role))
        `)
        .eq('id', orderId)

    if (scopeRepresentativeId) {
        query.eq('created_by_profile_id', scopeRepresentativeId)
    }

    const { data } = await query.single()
    return (data || null) as Order | null
}

export async function getRepresentativeOrderCompletionData(orderId: string) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()

        const orderQuery = admin
            .from('orders')
            .select(`
                *,
                store:stores(*),
                profile:profiles!orders_profile_id_fkey(*),
                payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage)
            `)
            .eq('id', orderId)

        if (scopeRepresentativeId) {
            orderQuery.eq('created_by_profile_id', scopeRepresentativeId)
        }

        const { data: orderData, error: orderError } = await orderQuery.single()
        if (orderError || !orderData) {
            return { error: 'Pedido nao encontrado para este representante.' }
        }

        const { data: itemsData, error: itemsError } = await admin
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at')

        if (itemsError) {
            return { error: 'Nao foi possivel carregar os itens do pedido.' }
        }

        const { data: settingsData } = await admin
            .from('system_settings')
            .select('*')
            .limit(1)
            .maybeSingle()

        return {
            success: true,
            order: orderData as Order,
            items: (itemsData || []) as OrderItem[],
            settings: (settingsData || null) as SystemSettings | null,
        }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao carregar dados da finalizacao do pedido.' }
    }
}

export async function getRepresentativeQuotesData() {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const query = admin
        .from('sales_quotes')
        .select(`
            *,
            store:stores(*),
            customer_profile:profiles!sales_quotes_customer_profile_id_fkey(*),
            representative:profiles!sales_quotes_representative_id_fkey(*),
            items:sales_quote_items(*, product_variant:product_variants(product_id, image_url))
        `)
        .order('created_at', { ascending: false })

    if (scopeRepresentativeId) {
        query.eq('representative_id', scopeRepresentativeId)
    }

    const { data } = await query
    return (data || []) as SalesQuote[]
}

export async function getRepresentativeQuotesPageData(
    input: RepresentativeQuotesPageInput = {}
) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const page = normalizePage(input.page, 1)
    const pageSize = normalizePageSize(input.pageSize, DEFAULT_QUOTES_PAGE_SIZE, 80)
    const queryTerm = normalizeSearchTerm(input.query)
    const status = input.status || null
    const offset = (page - 1) * pageSize
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)

    const loadQuotesPage = unstable_cache(
        async () => {
            const pageQuery = admin
                .from('sales_quotes')
                .select(
                    `
                        *,
                        store:stores(*),
                        customer_profile:profiles!sales_quotes_customer_profile_id_fkey(*),
                        representative:profiles!sales_quotes_representative_id_fkey(*),
                        items:sales_quote_items(*, product_variant:product_variants(product_id, image_url))
                    `,
                    { count: 'exact' }
                )
                .order('created_at', { ascending: false })
                .range(offset, offset + pageSize - 1)

            if (scopeRepresentativeId) {
                pageQuery.eq('representative_id', scopeRepresentativeId)
            }

            if (status) {
                pageQuery.eq('status', status)
            }

            if (queryTerm) {
                const escaped = escapeIlike(queryTerm)
                pageQuery.or(`quote_number.ilike.%${escaped}%,company_name_snapshot.ilike.%${escaped}%`)
            }

            const { data, count, error } = await pageQuery
            if (error) {
                throw new Error(error.message || 'Falha ao carregar orcamentos paginados.')
            }

            const summaryQuery = admin
                .from('sales_quotes')
                .select('id, status, total, created_at', { count: 'exact' })

            if (scopeRepresentativeId) {
                summaryQuery.eq('representative_id', scopeRepresentativeId)
            }

            if (status) {
                summaryQuery.eq('status', status)
            }

            if (queryTerm) {
                const escaped = escapeIlike(queryTerm)
                summaryQuery.or(`quote_number.ilike.%${escaped}%,company_name_snapshot.ilike.%${escaped}%`)
            }

            const { data: summaryRows, error: summaryError } = await summaryQuery
            if (summaryError) {
                throw new Error(summaryError.message || 'Falha ao carregar indicadores de orcamentos.')
            }

            const total = count || 0
            const totalPages = Math.max(1, Math.ceil(total / pageSize))

            const normalizedSummary = (summaryRows || []) as Array<{
                id: string
                status: SalesQuote['status']
                total: number
                created_at: string
            }>

            const now = Date.now()
            const statuses: SalesQuote['status'][] = ['draft', 'sent', 'approved', 'converted', 'cancelled']

            const pipeline: QuotePipelineSummary[] = statuses.map((statusKey) => {
                const statusRows = normalizedSummary.filter((row) => row.status === statusKey)
                const totalValue = statusRows.reduce((sum, row) => sum + toNumber(row.total), 0)
                return {
                    status: statusKey,
                    count: statusRows.length,
                    totalValue,
                }
            })

            const openQuotes = normalizedSummary.filter(
                (row) => row.status !== 'converted' && row.status !== 'cancelled'
            )
            const openAgingDays = openQuotes.map((row) => calculateAgingDays(row.created_at, now))

            const aging: QuoteAgingSummary[] = [
                { bucket: '0_3', label: '0-3 dias', count: 0 },
                { bucket: '4_7', label: '4-7 dias', count: 0 },
                { bucket: '8_14', label: '8-14 dias', count: 0 },
                { bucket: '15_plus', label: '15+ dias', count: 0 },
            ]

            openAgingDays.forEach((days) => {
                if (days <= 3) {
                    aging[0].count += 1
                    return
                }
                if (days <= 7) {
                    aging[1].count += 1
                    return
                }
                if (days <= 14) {
                    aging[2].count += 1
                    return
                }
                aging[3].count += 1
            })

            const convertedQuotes = normalizedSummary.filter((row) => row.status === 'converted').length
            const totalValue = normalizedSummary.reduce((sum, row) => sum + toNumber(row.total), 0)
            const conversionRate = total > 0 ? (convertedQuotes / total) * 100 : 0
            const avgAgingDays =
                openAgingDays.length > 0
                    ? openAgingDays.reduce((sum, days) => sum + days, 0) / openAgingDays.length
                    : 0

            const indicators: QuoteIndicatorsSummary = {
                totalQuotes: total,
                totalValue,
                convertedQuotes,
                conversionRate: Number(conversionRate.toFixed(1)),
                avgAgingDays: Number(avgAgingDays.toFixed(1)),
            }

            return {
                items: (data || []) as SalesQuote[],
                total,
                page: Math.min(page, totalPages),
                pageSize,
                totalPages,
                indicators,
                pipeline,
                aging,
            } satisfies RepresentativeQuotesPageData
        },
        [
            'rep-quotes-page-v1',
            scopeKey,
            String(page),
            String(pageSize),
            queryTerm,
            status || 'all',
        ],
        {
            tags: [getRepresentativeCacheTag(scopeKey, 'quotes')],
            revalidate: 60,
        }
    )

    return loadQuotesPage()
}

export async function getRepresentativeQuoteDetail(quoteId: string) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const query = admin
        .from('sales_quotes')
        .select(`
            *,
            store:stores(*),
            customer_profile:profiles!sales_quotes_customer_profile_id_fkey(*),
            representative:profiles!sales_quotes_representative_id_fkey(*),
            items:sales_quote_items(*, product_variant:product_variants(product_id, image_url))
        `)
        .eq('id', quoteId)

    if (scopeRepresentativeId) {
        query.eq('representative_id', scopeRepresentativeId)
    }

    const { data } = await query.single()
    return (data || null) as SalesQuote | null
}

export async function getRepresentativeQuoteTimeline(quoteId: string) {
    const quote = await getRepresentativeQuoteDetail(quoteId)
    if (!quote) return null

    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()

    const visitsQuery = admin
        .from('sales_visits')
        .select('id, visited_at, created_at, outcome, result_summary, next_step, generated_order_id')
        .eq('generated_quote_id', quoteId)
        .order('visited_at', { ascending: false })

    if (scopeRepresentativeId) {
        visitsQuery.eq('representative_id', scopeRepresentativeId)
    }

    const { data: visits, error: visitsError } = await visitsQuery
    if (visitsError) {
        return {
            quote,
            sla: {
                agingDays: calculateAgingDays(quote.created_at),
                slaDays: 7,
                isOverdue:
                    quote.status !== 'converted' &&
                    quote.status !== 'cancelled' &&
                    calculateAgingDays(quote.created_at) > 7,
            },
            events: [],
            warning: visitsError.message || 'Falha ao carregar timeline de visitas.',
        }
    }

    const events: Array<{
        id: string
        type: 'quote_created' | 'quote_updated' | 'quote_converted' | 'visit'
        label: string
        timestamp: string
        details?: string | null
    }> = [
        {
            id: `${quote.id}:created`,
            type: 'quote_created',
            label: 'Orcamento criado',
            timestamp: quote.created_at,
            details: quote.company_name_snapshot || quote.store?.company_name || null,
        },
    ]

    if (quote.updated_at !== quote.created_at) {
        events.push({
            id: `${quote.id}:updated`,
            type: 'quote_updated',
            label: 'Orcamento atualizado',
            timestamp: quote.updated_at,
            details: `Status atual: ${quote.status}`,
        })
    }

    if (quote.status === 'converted' && quote.converted_order_id) {
        events.push({
            id: `${quote.id}:converted`,
            type: 'quote_converted',
            label: 'Orcamento convertido em pedido',
            timestamp: quote.updated_at,
            details: `Pedido: ${quote.converted_order_id}`,
        })
    }

    ;(visits || []).forEach((visit) => {
        events.push({
            id: visit.id,
            type: 'visit',
            label: 'Visita comercial vinculada',
            timestamp: visit.visited_at || visit.created_at,
            details: visit.result_summary || visit.next_step || visit.outcome,
        })
    })

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const agingDays = calculateAgingDays(quote.created_at)
    const slaDays = 7
    const isOverdue = quote.status !== 'converted' && quote.status !== 'cancelled' && agingDays > slaDays

    return {
        quote,
        sla: {
            agingDays,
            slaDays,
            isOverdue,
        },
        events,
        warning: null as string | null,
    }
}

export async function updateRepresentativeQuoteStatusAction(
    quoteId: string,
    targetStatus: Exclude<SalesQuote['status'], 'converted'>
) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()

        const quoteQuery = admin
            .from('sales_quotes')
            .select('id, status')
            .eq('id', quoteId)

        if (scopeRepresentativeId) {
            quoteQuery.eq('representative_id', scopeRepresentativeId)
        }

        const { data: quote, error: quoteError } = await quoteQuery.maybeSingle()
        if (quoteError) {
            return { error: quoteError.message || 'Falha ao localizar orcamento.' }
        }
        if (!quote) {
            return { error: 'Orcamento nao encontrado para este representante.' }
        }
        if (quote.status === 'converted') {
            return { error: 'Nao e possivel alterar status de um orcamento convertido.' }
        }
        if (quote.status === targetStatus) {
            return { success: true, status: targetStatus }
        }

        const { error: updateError } = await admin
            .from('sales_quotes')
            .update({ status: targetStatus })
            .eq('id', quoteId)

        if (updateError) {
            return { error: updateError.message || 'Falha ao atualizar status do orcamento.' }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'dashboard'])
        return { success: true, status: targetStatus }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao atualizar status do orcamento.' }
    }
}

export async function getRepresentativeVisitsData() {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const query = admin
        .from('sales_visits')
        .select(`
            *,
            store:stores(*),
            customer_profile:profiles!sales_visits_customer_profile_id_fkey(*),
            representative:profiles!sales_visits_representative_id_fkey(*)
        `)
        .order('visited_at', { ascending: false })

    if (scopeRepresentativeId) {
        query.eq('representative_id', scopeRepresentativeId)
    }

    const { data } = await query
    return (data || []) as RepresentativeVisit[]
}

export async function getRepresentativeVisitsPageData(
    input: RepresentativeVisitsPageInput = {}
) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const page = normalizePage(input.page, 1)
    const pageSize = normalizePageSize(input.pageSize, DEFAULT_VISITS_PAGE_SIZE, 80)
    const queryTerm = normalizeSearchTerm(input.query)
    const outcome = input.outcome || null
    const storeId = input.storeId || null
    const offset = (page - 1) * pageSize
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)

    const loadVisitsPage = unstable_cache(
        async () => {
            const query = admin
                .from('sales_visits')
                .select(
                    `
                        *,
                        store:stores(*),
                        customer_profile:profiles!sales_visits_customer_profile_id_fkey(*),
                        representative:profiles!sales_visits_representative_id_fkey(*)
                    `,
                    { count: 'exact' }
                )
                .order('visited_at', { ascending: false })
                .range(offset, offset + pageSize - 1)

            const agendaQuery = admin
                .from('sales_visits')
                .select('id, visited_at, outcome')

            if (scopeRepresentativeId) {
                query.eq('representative_id', scopeRepresentativeId)
                agendaQuery.eq('representative_id', scopeRepresentativeId)
            }

            if (outcome) {
                query.eq('outcome', outcome)
            }

            if (storeId) {
                query.eq('store_id', storeId)
                agendaQuery.eq('store_id', storeId)
            }

            if (queryTerm) {
                const escaped = escapeIlike(queryTerm)
                query.or(`result_summary.ilike.%${escaped}%,next_step.ilike.%${escaped}%,notes.ilike.%${escaped}%`)
            }

            const [{ data, count, error }, { data: agendaRows, error: agendaError }] = await Promise.all([
                query,
                agendaQuery,
            ])

            if (error) {
                throw new Error(error.message || 'Falha ao carregar visitas paginadas.')
            }
            if (agendaError) {
                throw new Error(agendaError.message || 'Falha ao carregar agenda de visitas.')
            }

            const now = new Date()
            const startOfToday = new Date(now)
            startOfToday.setHours(0, 0, 0, 0)
            const endOfToday = new Date(now)
            endOfToday.setHours(23, 59, 59, 999)
            const next7DaysLimit = new Date(endOfToday)
            next7DaysLimit.setDate(next7DaysLimit.getDate() + 7)
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            const last7DaysLimit = new Date(now)
            last7DaysLimit.setDate(last7DaysLimit.getDate() - 7)

            const agenda = (agendaRows || []).reduce<VisitsAgendaSummary>(
                (acc, row) => {
                    const visitedTime = new Date(row.visited_at)
                    if (!Number.isFinite(visitedTime.getTime())) return acc

                    const isOpenFollowUp = row.outcome === 'planned' || row.outcome === 'follow_up'
                    if (isOpenFollowUp) {
                        if (visitedTime < startOfToday) {
                            acc.overdue += 1
                        } else if (visitedTime <= endOfToday) {
                            acc.dueToday += 1
                        } else if (visitedTime <= next7DaysLimit) {
                            acc.dueNext7Days += 1
                        }
                    }

                    if (
                        (row.outcome === 'converted_quote' || row.outcome === 'converted_order') &&
                        visitedTime >= startOfMonth
                    ) {
                        acc.convertedThisMonth += 1
                    }

                    if (row.outcome === 'completed' && visitedTime >= last7DaysLimit) {
                        acc.completedLast7Days += 1
                    }

                    return acc
                },
                {
                    overdue: 0,
                    dueToday: 0,
                    dueNext7Days: 0,
                    convertedThisMonth: 0,
                    completedLast7Days: 0,
                }
            )

            const total = count || 0
            const totalPages = Math.max(1, Math.ceil(total / pageSize))
            return {
                items: (data || []) as RepresentativeVisit[],
                total,
                page: Math.min(page, totalPages),
                pageSize,
                totalPages,
                agenda,
            } satisfies RepresentativeVisitsPageData
        },
        [
            'rep-visits-page-v2',
            scopeKey,
            String(page),
            String(pageSize),
            queryTerm,
            outcome || 'all',
            storeId || 'all',
        ],
        {
            tags: [getRepresentativeCacheTag(scopeKey, 'visits')],
            revalidate: 60,
        }
    )

    return loadVisitsPage()
}

export async function getRepresentativeOrderBuilderData() {
    const { profile, admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)
    const loadBuilderBootstrap = unstable_cache(
        async () => {
            const representativePolicy = scopeRepresentativeId
                ? await getRepresentativeCommercialPolicy(admin, scopeRepresentativeId)
                : null

            const priceTablesQuery = admin
                .from('price_tables')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true })

            if (representativePolicy?.allowedPriceTableIds?.length) {
                priceTablesQuery.in('id', representativePolicy.allowedPriceTableIds)
            }

            const [customers, initialProductsPage, categoriesRes, priceTablesRes, customerTypesRes] = await Promise.all([
                getRepresentativeCustomersInternal(scopeRepresentativeId),
                getRepresentativeCatalogProductsPageInternal(admin, {
                    page: 1,
                    pageSize: DEFAULT_PRODUCTS_PAGE_SIZE,
                }),
                admin.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
                priceTablesQuery,
                admin
                    .from('customer_types')
                    .select('*')
                    .order('is_active', { ascending: false })
                    .order('sort_order', { ascending: true }),
            ])

            return {
                customers,
                products: initialProductsPage.items,
                categories: categoriesRes.data || [],
                priceTables: (priceTablesRes.data || []) as PriceTable[],
                customerTypes: (customerTypesRes.data || []) as CustomerType[],
            }
        },
        ['rep-builder-bootstrap-v1', scopeKey],
        {
            tags: [
                getRepresentativeCacheTag(scopeKey, 'builder'),
                getRepresentativeCacheTag(scopeKey, 'customers'),
                getRepresentativeCacheTag(scopeKey, 'products'),
            ],
            revalidate: 120,
        }
    )

    const bootstrap = await loadBuilderBootstrap()

    return {
        profile,
        ...bootstrap,
    }
}

export async function getRepresentativeCatalogProductsPageAction(
    input: RepresentativeCatalogProductsPageInput = {}
) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const page = normalizePage(input.page, 1)
    const pageSize = normalizePageSize(input.pageSize, DEFAULT_PRODUCTS_PAGE_SIZE, 60)
    const search = normalizeSearchTerm(input.search)
    const categoryId = input.categoryId || null
    const scopeKey = getRepresentativeScopeCacheKey(scopeRepresentativeId)

    const loadProductsPage = unstable_cache(
        async () => getRepresentativeCatalogProductsPageInternal(admin, { page, pageSize, search, categoryId }),
        ['rep-products-page-v1', scopeKey, String(page), String(pageSize), search, categoryId || 'all'],
        {
            tags: [getRepresentativeCacheTag(scopeKey, 'products')],
            revalidate: 60,
        }
    )

    return loadProductsPage()
}

export async function getRepresentativeProductConfiguratorData(input: {
    storeId: string
    productId: string
    priceTableId?: string | null
}) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const store = await loadStoreWithinRepresentativeScope(admin, input.storeId, scopeRepresentativeId)

    if (!store) {
        return { error: 'Cliente nao disponivel para este representante.' }
    }

    const representativePolicy = scopeRepresentativeId
        ? await getRepresentativeCommercialPolicy(admin, scopeRepresentativeId)
        : null

    if (scopeRepresentativeId && representativePolicy && !representativePolicy.canOverridePriceTable && input.priceTableId) {
        return { error: 'Este representante nao pode trocar manualmente a tabela de precos.' }
    }

    if (
        scopeRepresentativeId &&
        representativePolicy?.allowedPriceTableIds.length &&
        input.priceTableId &&
        !representativePolicy.allowedPriceTableIds.includes(input.priceTableId)
    ) {
        return { error: 'Tabela de preco nao permitida para este representante.' }
    }

    const { data: product } = await admin
        .from('products')
        .select('*, images:product_images(*), size_options:product_size_options(*)')
        .eq('id', input.productId)
        .single()

    if (!product || !product.is_active) {
        return { error: 'Produto nao encontrado.' }
    }

    const { data: variants } = await admin
        .from('product_variants')
        .select(PRODUCT_VARIANT_DETAIL_SELECT)
        .eq('product_id', input.productId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

    const variantIds = ((variants || []) as Array<{ id: string }>).map((variant) => variant.id)
    const priceTableContext = await getPriceTableContextForStore(admin as never, input.storeId, variantIds, input.priceTableId)

    return {
        product,
        variants: variants || [],
        fabrics: buildProductFabricGroups((variants || []) as never),
        priceTableContext,
    }
}

export async function getRepresentativePaymentOptions(input: {
    storeId: string
    subtotal: number
    priceTableId?: string | null
}) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const store = await loadStoreWithinRepresentativeScope(admin, input.storeId, scopeRepresentativeId)

    if (!store) {
        return { error: 'Cliente nao disponivel para este representante.' }
    }

    const representativePolicy = scopeRepresentativeId
        ? await getRepresentativeCommercialPolicy(admin, scopeRepresentativeId)
        : null

    if (scopeRepresentativeId && representativePolicy && !representativePolicy.canOverridePriceTable && input.priceTableId) {
        return { error: 'Este representante nao pode trocar manualmente a tabela de precos.' }
    }

    const commercialSettings = await getStoreCommercialSettings(admin as never, store.id)
    const resolvedPriceTable = await resolveEffectivePriceTableIdForStore(admin as never, {
        storeId: store.id,
        preferredPriceTableId: input.priceTableId || null,
        settings: commercialSettings,
    })

    if (
        scopeRepresentativeId &&
        representativePolicy?.allowedPriceTableIds.length &&
        (!resolvedPriceTable.priceTableId || !representativePolicy.allowedPriceTableIds.includes(resolvedPriceTable.priceTableId))
    ) {
        return { error: 'Tabela de preco nao permitida para este representante.' }
    }

    const availability = await getAvailableCheckoutPayments(admin as never, {
        cartTotal: toNumber(input.subtotal),
        priceTableId: resolvedPriceTable.priceTableId,
    })
    const filteredAvailability = applyCommercialPaymentAvailability(availability, commercialSettings)

    return {
        paymentMethods: filteredAvailability.methodGroups,
        globalConditions: filteredAvailability.globalConditions,
        priceTableRules: filteredAvailability.priceTableRules,
        checkoutBlocked: filteredAvailability.blocked,
        restrictionMessage: filteredAvailability.reason,
    }
}

export async function validateRepresentativeDraftPricingAction(input: {
    storeId: string
    priceTableId?: string | null
    lines: Array<{ cartKey?: string; variantId: string; sizeOptionId?: string | null }>
}) {
    const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
    const store = await loadStoreWithinRepresentativeScope(admin, input.storeId, scopeRepresentativeId)

    if (!store) {
        return { error: 'Cliente nao disponivel para este representante.' }
    }

    const representativePolicy = scopeRepresentativeId
        ? await getRepresentativeCommercialPolicy(admin, scopeRepresentativeId)
        : null

    if (scopeRepresentativeId && representativePolicy && !representativePolicy.canOverridePriceTable && input.priceTableId) {
        return { error: 'Este representante nao pode trocar manualmente a tabela de precos.' }
    }

    let effectivePriceTableId = input.priceTableId || null
    if (scopeRepresentativeId && representativePolicy?.allowedPriceTableIds.length) {
        const commercialSettings = await getStoreCommercialSettings(admin as never, store.id)
        const resolvedPriceTable = await resolveEffectivePriceTableIdForStore(admin as never, {
            storeId: store.id,
            preferredPriceTableId: input.priceTableId || null,
            settings: commercialSettings,
        })
        effectivePriceTableId = resolvedPriceTable.priceTableId

        if (!effectivePriceTableId || !representativePolicy.allowedPriceTableIds.includes(effectivePriceTableId)) {
            return { error: 'Tabela de preco nao permitida para este representante.' }
        }
    }

    return getVariantPricingSnapshotsForStore(
        admin as never,
        input.storeId,
        input.lines.map((line) => ({
            cartKey: line.cartKey || buildPricingCartKey(line.variantId, line.sizeOptionId ?? null),
            variantId: line.variantId,
            sizeOptionId: line.sizeOptionId ?? null,
        })),
        effectivePriceTableId
    )
}

async function resolveSourceVisitForDocument(
    admin: ReturnType<typeof getAdminClient>,
    scopeRepresentativeId: string | null | undefined,
    sourceVisitId: string | null | undefined,
    storeId: string
) {
    if (!sourceVisitId) {
        return { visit: null as null | Pick<RepresentativeVisit, 'id' | 'store_id' | 'generated_quote_id' | 'generated_order_id'> }
    }

    const visitQuery = admin
        .from('sales_visits')
        .select('id, store_id, generated_quote_id, generated_order_id')
        .eq('id', sourceVisitId)

    if (scopeRepresentativeId) {
        visitQuery.eq('representative_id', scopeRepresentativeId)
    }

    const { data: visit, error: visitError } = await visitQuery.maybeSingle()
    if (visitError) {
        return { error: visitError.message || 'Falha ao localizar visita de origem.' }
    }
    if (!visit) {
        return { error: 'Visita de origem nao encontrada para este representante.' }
    }
    if (visit.store_id !== storeId) {
        return { error: 'A visita de origem nao pertence ao cliente selecionado.' }
    }

    return { visit }
}

async function syncVisitDocumentLinks(
    admin: ReturnType<typeof getAdminClient>,
    visit: Pick<RepresentativeVisit, 'id' | 'generated_quote_id' | 'generated_order_id'>,
    updates: {
        generatedQuoteId?: string | null
        generatedOrderId?: string | null
    }
) {
    const nextGeneratedQuoteId = updates.generatedQuoteId ?? visit.generated_quote_id ?? null
    const nextGeneratedOrderId = updates.generatedOrderId ?? visit.generated_order_id ?? null
    const nextOutcome: RepresentativeVisit['outcome'] = nextGeneratedOrderId
        ? 'converted_order'
        : nextGeneratedQuoteId
            ? 'converted_quote'
            : 'follow_up'

    const { error } = await admin
        .from('sales_visits')
        .update({
            generated_quote_id: nextGeneratedQuoteId,
            generated_order_id: nextGeneratedOrderId,
            outcome: nextOutcome,
        })
        .eq('id', visit.id)

    if (error) {
        throw new Error(error.message || 'Falha ao atualizar vinculo da visita com documento comercial.')
    }
}

export async function createRepresentativeVisitAction(payload: {
    storeId: string
    visitedAt?: string | null
    notes?: string | null
    resultSummary?: string | null
    nextStep?: string | null
    outcome?: RepresentativeVisit['outcome']
    generatedQuoteId?: string | null
    generatedOrderId?: string | null
}) {
    try {
        const { user, admin, scopeRepresentativeId } = await requireRepresentativeContext()


        const store = await loadStoreWithinRepresentativeScope(admin, payload.storeId, scopeRepresentativeId)

        if (!store) {
            return { error: 'Cliente nao disponivel para este representante.' }
        }

        const representativeActorId = scopeRepresentativeId || store.representative_id || user.id

        const { data, error } = await admin
            .from('sales_visits')
            .insert({
                representative_id: representativeActorId,
                store_id: store.id,
                customer_profile_id: store.profile_id,
                visited_at: payload.visitedAt || new Date().toISOString(),
                notes: payload.notes || null,
                result_summary: payload.resultSummary || null,
                next_step: payload.nextStep || null,
                outcome: payload.outcome || 'planned',
                generated_quote_id: payload.generatedQuoteId || null,
                generated_order_id: payload.generatedOrderId || null,
            })
            .select('*')
            .single()

        if (error || !data) {
            return { error: error?.message || 'Falha ao registrar visita.' }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['visits', 'dashboard'])
        return { success: true, visit: data }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao registrar visita.' }
    }
}

export async function updateRepresentativeVisitAction(payload: {
    id: string
    visitedAt?: string | null
    notes?: string | null
    resultSummary?: string | null
    nextStep?: string | null
    outcome?: RepresentativeVisit['outcome']
    generatedQuoteId?: string | null
    generatedOrderId?: string | null
}) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()

        const query = admin
            .from('sales_visits')
            .select('id, generated_quote_id, generated_order_id')
            .eq('id', payload.id)

        if (scopeRepresentativeId) {
            query.eq('representative_id', scopeRepresentativeId)
        }

        const { data: existingVisit, error: loadError } = await query.maybeSingle()
        if (loadError) {
            return { error: loadError.message || 'Falha ao localizar visita para atualizacao.' }
        }
        if (!existingVisit) {
            return { error: 'Visita nao encontrada para este representante.' }
        }

        const updateData: Record<string, unknown> = {}
        if (payload.visitedAt !== undefined) updateData.visited_at = payload.visitedAt || new Date().toISOString()
        if (payload.notes !== undefined) updateData.notes = payload.notes || null
        if (payload.resultSummary !== undefined) updateData.result_summary = payload.resultSummary || null
        if (payload.nextStep !== undefined) updateData.next_step = payload.nextStep || null
        if (payload.outcome !== undefined) updateData.outcome = payload.outcome
        if (payload.generatedQuoteId !== undefined) updateData.generated_quote_id = payload.generatedQuoteId || null
        if (payload.generatedOrderId !== undefined) updateData.generated_order_id = payload.generatedOrderId || null

        if (Object.keys(updateData).length === 0) {
            return { success: true }
        }

        const generatedQuoteId =
            payload.generatedQuoteId !== undefined
                ? payload.generatedQuoteId
                : (existingVisit.generated_quote_id as string | null)
        const generatedOrderId =
            payload.generatedOrderId !== undefined
                ? payload.generatedOrderId
                : (existingVisit.generated_order_id as string | null)

        if (payload.outcome === undefined && (payload.generatedQuoteId !== undefined || payload.generatedOrderId !== undefined)) {
            if (generatedOrderId) {
                updateData.outcome = 'converted_order'
            } else if (generatedQuoteId) {
                updateData.outcome = 'converted_quote'
            }
        }

        const { data: updatedVisit, error: updateError } = await admin
            .from('sales_visits')
            .update(updateData)
            .eq('id', payload.id)
            .select('*')
            .single()

        if (updateError || !updatedVisit) {
            return { error: updateError?.message || 'Falha ao atualizar visita.' }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['visits', 'dashboard'])
        return { success: true, visit: updatedVisit }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao atualizar visita.' }
    }
}

export async function deleteRepresentativeVisitAction(visitId: string) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
        const query = admin
            .from('sales_visits')
            .select('id')
            .eq('id', visitId)

        if (scopeRepresentativeId) {
            query.eq('representative_id', scopeRepresentativeId)
        }

        const { data: visit, error: visitError } = await query.maybeSingle()
        if (visitError) {
            return { error: visitError.message || 'Falha ao localizar visita para exclusao.' }
        }
        if (!visit) {
            return { error: 'Visita nao encontrada para este representante.' }
        }

        const { error: deleteError } = await admin
            .from('sales_visits')
            .delete()
            .eq('id', visitId)

        if (deleteError) {
            return { error: deleteError.message || 'Falha ao excluir visita.' }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['visits', 'dashboard'])
        return { success: true }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao excluir visita.' }
    }
}

async function persistRepresentativeDocument(
    mode: 'order' | 'quote',
    payload: RepresentativeDocumentPayload
) {
    try {
        const { admin, supabase, scopeRepresentativeId } = await requireRepresentativeContext()
        const store = await loadStoreWithinRepresentativeScope(admin, payload.storeId, scopeRepresentativeId)

        if (!store) {
            return { error: 'Cliente nao disponivel para este representante.' }
        }

        const sourceVisitResult = await resolveSourceVisitForDocument(
            admin,
            scopeRepresentativeId,
            payload.sourceVisitId || null,
            store.id
        )
        if (sourceVisitResult.error) {
            return { error: sourceVisitResult.error }
        }
        const sourceVisit = sourceVisitResult.visit

        const representativePolicy = scopeRepresentativeId
            ? await getRepresentativeCommercialPolicy(admin, scopeRepresentativeId)
            : null

        const commercialSettings = await getStoreCommercialSettings(admin as never, store.id)
        if (mode === 'order' && commercialSettings?.financial_profile === 'block_sales') {
            return { error: 'Este cliente esta com vendas restritas para novos pedidos.' }
        }

        const resolvedPriceTable = await resolveEffectivePriceTableIdForStore(admin as never, {
            storeId: store.id,
            preferredPriceTableId: payload.priceTableId || null,
            settings: commercialSettings,
        })
        const effectivePriceTableId = resolvedPriceTable.priceTableId

        if (scopeRepresentativeId && representativePolicy) {
            if (!representativePolicy.canOverridePriceTable && payload.priceTableId) {
                return { error: 'Este representante nao pode trocar manualmente a tabela de precos.' }
            }

            if (representativePolicy.allowedPriceTableIds.length > 0) {
                if (!effectivePriceTableId || !representativePolicy.allowedPriceTableIds.includes(effectivePriceTableId)) {
                    return { error: 'A tabela de preco selecionada nao esta permitida para este representante.' }
                }
            }
        }

        if (!payload.items?.length) {
            return { error: mode === 'order' ? 'Adicione itens ao pedido.' : 'Adicione itens ao orcamento.' }
        }

        const pricingResult = await getVariantPricingSnapshotsForStore(
            admin as never,
            store.id,
            payload.items.map((item) => ({
                cartKey: item.cartKey || buildPricingCartKey(item.variantId, item.sizeOptionId ?? null),
                variantId: item.variantId,
                sizeOptionId: item.sizeOptionId ?? null,
            })),
            effectivePriceTableId
        )

        if ('error' in pricingResult && pricingResult.error) {
            return { error: pricingResult.error }
        }

        if (pricingResult.missingKeys.length > 0 || pricingResult.missingVariantIds.length > 0) {
            return { error: 'Alguns itens nao estao mais disponiveis. Revise o documento antes de salvar.' }
        }

        const validatedItems = payload.items.map((item) => {
            const cartKey = item.cartKey || buildPricingCartKey(item.variantId, item.sizeOptionId ?? null)
            const price = pricingResult.prices[cartKey]
            if (!price) {
                throw new Error(`Preco nao localizado para ${item.productName}.`)
            }

            return {
                cartKey,
                ...item,
                sizeName: price.sizeName ?? item.sizeName ?? null,
                unitPrice: price.unitPrice,
                productPrice: price.productPrice,
                variationPrice: price.variationPrice,
                sizePrice: price.sizePrice,
                finalPrice: price.finalPrice,
                subtotal: price.unitPrice * item.quantity,
            }
        })

        const subtotal = validatedItems.reduce((sum, item) => sum + item.subtotal, 0)
        const negotiation = computeNegotiation(
            subtotal,
            payload.negotiationDiscountType,
            payload.negotiationDiscountValue,
            payload.negotiationSurchargeAmount
        )
        const effectiveNegotiationDiscountPercentage =
            subtotal > 0 ? (negotiation.discountAmount / subtotal) * 100 : 0

        if (scopeRepresentativeId && representativePolicy) {
            if (
                !representativePolicy.allowFreeNegotiation &&
                (negotiation.discountAmount > 0 || negotiation.surchargeAmount > 0)
            ) {
                return { error: 'Este representante nao possui permissao para negociar desconto/acrescimo manual.' }
            }

            if (
                representativePolicy.maxDiscountPercentage !== null &&
                effectiveNegotiationDiscountPercentage > representativePolicy.maxDiscountPercentage + 0.0001
            ) {
                return {
                    error: `Desconto de ${formatPercentage(effectiveNegotiationDiscountPercentage)}% excede o limite permitido de ${formatPercentage(representativePolicy.maxDiscountPercentage)}%.`,
                }
            }
        }

        const paymentSelection = payload.selectedPaymentId
            ? await resolveCheckoutPaymentSelection(supabase as never, {
                cartTotal: negotiation.adjustedSubtotal,
                selectedPaymentId: payload.selectedPaymentId,
                isTableRule: Boolean(payload.isTableRule),
                priceTableId: effectivePriceTableId,
            })
            : { data: null, error: null }

        if (paymentSelection.error) {
            return { error: paymentSelection.error }
        }

        if (paymentSelection.data) {
            const selectionValidationError = validateCheckoutSelectionAgainstCommercialSettings({
                settings: commercialSettings,
                paymentMethodId: paymentSelection.data.paymentMethodId,
                paymentConditionId: paymentSelection.data.paymentConditionId,
                paymentInstallments: paymentSelection.data.paymentInstallments,
            })

            if (selectionValidationError) {
                return { error: selectionValidationError }
            }
        }

        const paymentDiscountPercentage = paymentSelection.data?.paymentDiscountPercentage || 0
        const paymentSurchargePercentage = paymentSelection.data?.paymentSurchargePercentage || 0
        const paymentDiscountAmount = negotiation.adjustedSubtotal * (paymentDiscountPercentage / 100)
        const afterPaymentDiscount = Math.max(0, negotiation.adjustedSubtotal - paymentDiscountAmount)
        const paymentSurchargeAmount = afterPaymentDiscount * (paymentSurchargePercentage / 100)
        const total = Math.max(0, afterPaymentDiscount + paymentSurchargeAmount)

        if (mode === 'order') {
            const creditLimitMessage = await validateStoreCreditLimitForOrder({
                supabase: admin as never,
                storeId: store.id,
                settings: commercialSettings,
                orderTotal: total,
            })
            if (creditLimitMessage) {
                return { error: creditLimitMessage }
            }
        }

        let shippingAddress: string | null = null
        if (payload.selectedAddressId) {
            const { data: address } = await admin
                .from('store_addresses')
                .select('*')
                .eq('id', payload.selectedAddressId)
                .eq('store_id', store.id)
                .single()
            shippingAddress = formatAddress(address as StoreAddress | null)
        } else {
            const { data: address } = await admin
                .from('store_addresses')
                .select('*')
                .eq('store_id', store.id)
                .eq('is_main', true)
                .single()
            shippingAddress = formatAddress(address as StoreAddress | null)
        }

        const itemsPayload = validatedItems.map((item) => ({
            product_variant_id: item.variantId,
            size_option_id: item.sizeOptionId || null,
            product_name: item.productName,
            fabric_name: item.fabricName,
            color_name: item.colorName,
            size: item.sizeName || null,
            size_name: item.sizeName || null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            product_price: item.productPrice,
            size_price: item.sizePrice,
            variation_price: item.variationPrice,
            final_price: item.finalPrice,
            subtotal: item.subtotal,
        }))

        if (mode === 'order') {
            const { data, error } = await supabase.rpc('representative_create_order_atomic', {
                p_store_id: store.id,
                p_price_table_id: effectivePriceTableId,
                p_payment_method_id: paymentSelection.data?.paymentMethodId || null,
                p_payment_condition_id: paymentSelection.data?.paymentConditionId || null,
                p_payment_rule_id: paymentSelection.data?.paymentRuleId || null,
                p_payment_method_condition_id: paymentSelection.data?.paymentMethodConditionId || null,
                p_payment_method_code: paymentSelection.data?.paymentMethodCode || null,
                p_payment_method_name: paymentSelection.data?.paymentMethodName || null,
                p_payment_condition_name: paymentSelection.data?.paymentConditionName || null,
                p_payment_condition_description: paymentSelection.data?.paymentConditionDescription || null,
                p_payment_installments: paymentSelection.data?.paymentInstallments || null,
                p_payment_discount_percentage: paymentDiscountPercentage,
                p_payment_surcharge_percentage: paymentSurchargePercentage,
                p_subtotal: subtotal,
                p_payment_discount_amount: paymentDiscountAmount,
                p_negotiation_discount_percentage: effectiveNegotiationDiscountPercentage,
                p_negotiation_discount_amount: negotiation.discountAmount,
                p_negotiation_surcharge_amount: negotiation.surchargeAmount,
                p_total: total,
                p_shipping_address: shippingAddress,
                p_notes: payload.notes || null,
                p_negotiation_reason: payload.negotiationReason || null,
                p_items: itemsPayload,
                p_created_note: 'Pedido criado pelo representante em vendas presenciais.',
                p_source_quote_id: null,
            })

            const result = Array.isArray(data) ? (data[0] as SalesOrderLikeResult | undefined) : (data as SalesOrderLikeResult | null)
            if (error || !result?.order_id) {
                return { error: error?.message || 'Falha ao criar pedido do representante.' }
            }

            if (sourceVisit) {
                await syncVisitDocumentLinks(admin, sourceVisit, {
                    generatedOrderId: result.order_id,
                })
            }

            revalidateRepresentativeSegments(scopeRepresentativeId, ['orders', 'customers', 'visits', 'dashboard'])
            return { success: true, orderId: result.order_id, orderNumber: result.order_number }
        }

        if (payload.quoteId) {
            const quoteQuery = admin
                .from('sales_quotes')
                .select('id, quote_number, status, representative_id, items:sales_quote_items(*)')
                .eq('id', payload.quoteId)

            if (scopeRepresentativeId) {
                quoteQuery.eq('representative_id', scopeRepresentativeId)
            }

            const { data: existingQuote, error: existingQuoteError } = await quoteQuery.maybeSingle()
            if (existingQuoteError) {
                return { error: existingQuoteError.message || 'Falha ao localizar orcamento para edicao.' }
            }
            if (!existingQuote) {
                return { error: 'Orcamento nao encontrado para este representante.' }
            }
            if (existingQuote.status === 'converted') {
                return { error: 'Nao e possivel editar um orcamento convertido em pedido.' }
            }
            if (existingQuote.status === 'cancelled') {
                return { error: 'Nao e possivel editar um orcamento cancelado.' }
            }

            const [storeSnapshotRes, customerProfileRes, priceTableRes] = await Promise.all([
                admin
                    .from('stores')
                    .select('company_name, customer_code')
                    .eq('id', store.id)
                    .maybeSingle(),
                admin
                    .from('profiles')
                    .select('full_name')
                    .eq('id', store.profile_id)
                    .maybeSingle(),
                effectivePriceTableId
                    ? admin
                        .from('price_tables')
                        .select('name')
                        .eq('id', effectivePriceTableId)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null } as const),
            ])

            if (storeSnapshotRes.error) {
                return { error: storeSnapshotRes.error.message || 'Falha ao carregar dados do cliente para atualizar o orcamento.' }
            }
            if (customerProfileRes.error) {
                return { error: customerProfileRes.error.message || 'Falha ao carregar dados de contato do cliente para atualizar o orcamento.' }
            }
            if (priceTableRes.error) {
                return { error: priceTableRes.error.message || 'Falha ao carregar tabela de preco para atualizar o orcamento.' }
            }

            const { error: updateQuoteError } = await admin
                .from('sales_quotes')
                .update({
                    store_id: store.id,
                    customer_profile_id: store.profile_id,
                    representative_id: existingQuote.representative_id,
                    price_table_id: effectivePriceTableId,
                    status: 'draft',
                    payment_method_id: paymentSelection.data?.paymentMethodId || null,
                    payment_condition_id: paymentSelection.data?.paymentConditionId || null,
                    payment_rule_id: paymentSelection.data?.paymentRuleId || null,
                    payment_method_condition_id: paymentSelection.data?.paymentMethodConditionId || null,
                    payment_method_code: paymentSelection.data?.paymentMethodCode || null,
                    payment_method_name: paymentSelection.data?.paymentMethodName || null,
                    payment_condition_name: paymentSelection.data?.paymentConditionName || null,
                    payment_condition_description: paymentSelection.data?.paymentConditionDescription || null,
                    payment_installments: paymentSelection.data?.paymentInstallments || null,
                    payment_discount_percentage: paymentDiscountPercentage,
                    payment_surcharge_percentage: paymentSurchargePercentage,
                    subtotal,
                    payment_discount_amount: paymentDiscountAmount,
                    negotiation_discount_percentage: effectiveNegotiationDiscountPercentage,
                    negotiation_discount_amount: negotiation.discountAmount,
                    negotiation_surcharge_amount: negotiation.surchargeAmount,
                    total,
                    notes: payload.notes || null,
                    shipping_address: shippingAddress,
                    negotiation_reason: payload.negotiationReason || null,
                    converted_order_id: null,
                    customer_name_snapshot: customerProfileRes.data?.full_name || null,
                    customer_code_snapshot: storeSnapshotRes.data?.customer_code || null,
                    company_name_snapshot: storeSnapshotRes.data?.company_name || null,
                    price_table_name_snapshot: priceTableRes.data?.name || null,
                })
                .eq('id', payload.quoteId)

            if (updateQuoteError) {
                return { error: updateQuoteError.message || 'Falha ao atualizar orcamento.' }
            }

            const previousItems = (existingQuote.items || []) as Array<{
                product_variant_id: string
                size_option_id: string | null
                product_name: string
                fabric_name: string
                color_name: string
                size: string | null
                size_name: string | null
                quantity: number
                unit_price: number
                product_price: number | null
                size_price: number | null
                variation_price: number | null
                final_price: number | null
                subtotal: number
            }>

            const { error: deleteItemsError } = await admin
                .from('sales_quote_items')
                .delete()
                .eq('quote_id', payload.quoteId)

            if (deleteItemsError) {
                return { error: deleteItemsError.message || 'Falha ao atualizar itens do orcamento.' }
            }

            const { error: insertItemsError } = await admin
                .from('sales_quote_items')
                .insert(itemsPayload.map((item) => ({ ...item, quote_id: payload.quoteId })))

            if (insertItemsError) {
                if (previousItems.length > 0) {
                    await admin.from('sales_quote_items').insert(
                        previousItems.map((item) => ({
                            quote_id: payload.quoteId as string,
                            product_variant_id: item.product_variant_id,
                            size_option_id: item.size_option_id,
                            product_name: item.product_name,
                            fabric_name: item.fabric_name,
                            color_name: item.color_name,
                            size: item.size,
                            size_name: item.size_name,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            product_price: item.product_price,
                            size_price: item.size_price,
                            variation_price: item.variation_price,
                            final_price: item.final_price,
                            subtotal: item.subtotal,
                        }))
                    )
                }

                return { error: insertItemsError.message || 'Falha ao salvar os novos itens do orcamento.' }
            }

            if (sourceVisit) {
                await syncVisitDocumentLinks(admin, sourceVisit, {
                    generatedQuoteId: payload.quoteId,
                })
            }

            revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'visits', 'dashboard'])
            return {
                success: true,
                quoteId: payload.quoteId,
                quoteNumber: existingQuote.quote_number,
            }
        }

        const { data, error } = await supabase.rpc('representative_create_quote_atomic', {
            p_store_id: store.id,
            p_price_table_id: effectivePriceTableId,
            p_payment_method_id: paymentSelection.data?.paymentMethodId || null,
            p_payment_condition_id: paymentSelection.data?.paymentConditionId || null,
            p_payment_rule_id: paymentSelection.data?.paymentRuleId || null,
            p_payment_method_condition_id: paymentSelection.data?.paymentMethodConditionId || null,
            p_payment_method_code: paymentSelection.data?.paymentMethodCode || null,
            p_payment_method_name: paymentSelection.data?.paymentMethodName || null,
            p_payment_condition_name: paymentSelection.data?.paymentConditionName || null,
            p_payment_condition_description: paymentSelection.data?.paymentConditionDescription || null,
            p_payment_installments: paymentSelection.data?.paymentInstallments || null,
            p_payment_discount_percentage: paymentDiscountPercentage,
            p_payment_surcharge_percentage: paymentSurchargePercentage,
            p_subtotal: subtotal,
            p_payment_discount_amount: paymentDiscountAmount,
            p_negotiation_discount_percentage: effectiveNegotiationDiscountPercentage,
            p_negotiation_discount_amount: negotiation.discountAmount,
            p_negotiation_surcharge_amount: negotiation.surchargeAmount,
            p_total: total,
            p_shipping_address: shippingAddress,
            p_notes: payload.notes || null,
            p_negotiation_reason: payload.negotiationReason || null,
            p_items: itemsPayload,
            p_status: 'draft',
        })

        const result = Array.isArray(data) ? (data[0] as SalesOrderLikeResult | undefined) : (data as SalesOrderLikeResult | null)
        if (error || !result?.quote_id) {
            return { error: error?.message || 'Falha ao criar orcamento do representante.' }
        }

        if (sourceVisit) {
            await syncVisitDocumentLinks(admin, sourceVisit, {
                generatedQuoteId: result.quote_id,
            })
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'visits', 'dashboard'])
        return { success: true, quoteId: result.quote_id, quoteNumber: result.quote_number }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao salvar documento comercial.' }
    }
}

export async function createRepresentativeOrderAction(payload: RepresentativeDocumentPayload) {
    return persistRepresentativeDocument('order', payload)
}

export async function saveRepresentativeQuoteAction(payload: RepresentativeDocumentPayload) {
    return persistRepresentativeDocument('quote', payload)
}

export async function cancelRepresentativeQuoteAction(quoteId: string) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
        const query = admin
            .from('sales_quotes')
            .select('id, status')
            .eq('id', quoteId)

        if (scopeRepresentativeId) {
            query.eq('representative_id', scopeRepresentativeId)
        }

        const { data: quote, error: quoteError } = await query.maybeSingle()
        if (quoteError) {
            return { error: quoteError.message || 'Falha ao localizar orcamento.' }
        }
        if (!quote) {
            return { error: 'Orcamento nao encontrado para este representante.' }
        }
        if (quote.status === 'converted') {
            return { error: 'Nao e possivel cancelar um orcamento ja convertido.' }
        }
        if (quote.status === 'cancelled') {
            return { success: true }
        }

        const { error: updateError } = await admin
            .from('sales_quotes')
            .update({ status: 'cancelled' })
            .eq('id', quoteId)

        if (updateError) {
            return { error: updateError.message || 'Falha ao cancelar orcamento.' }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'dashboard'])
        return { success: true }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao cancelar orcamento.' }
    }
}

export async function duplicateRepresentativeQuoteAction(quoteId: string) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
        const query = admin
            .from('sales_quotes')
            .select('*, items:sales_quote_items(*, product_variant:product_variants(product_id, image_url))')
            .eq('id', quoteId)

        if (scopeRepresentativeId) {
            query.eq('representative_id', scopeRepresentativeId)
        }

        const { data: quote, error: quoteError } = await query.maybeSingle()
        if (quoteError) {
            return { error: quoteError.message || 'Falha ao localizar orcamento para duplicacao.' }
        }
        if (!quote) {
            return { error: 'Orcamento nao encontrado para este representante.' }
        }

        const { data: duplicatedQuote, error: duplicatedQuoteError } = await admin
            .from('sales_quotes')
            .insert({
                store_id: quote.store_id,
                customer_profile_id: quote.customer_profile_id,
                representative_id: quote.representative_id,
                price_table_id: quote.price_table_id,
                status: 'draft',
                payment_method_id: quote.payment_method_id,
                payment_condition_id: quote.payment_condition_id,
                payment_rule_id: quote.payment_rule_id,
                payment_method_condition_id: quote.payment_method_condition_id,
                payment_method_code: quote.payment_method_code,
                payment_method_name: quote.payment_method_name,
                payment_condition_name: quote.payment_condition_name,
                payment_condition_description: quote.payment_condition_description,
                payment_installments: quote.payment_installments,
                payment_discount_percentage: quote.payment_discount_percentage,
                payment_surcharge_percentage: quote.payment_surcharge_percentage,
                subtotal: quote.subtotal,
                payment_discount_amount: quote.payment_discount_amount,
                negotiation_discount_percentage: quote.negotiation_discount_percentage,
                negotiation_discount_amount: quote.negotiation_discount_amount,
                negotiation_surcharge_amount: quote.negotiation_surcharge_amount,
                total: quote.total,
                notes: quote.notes,
                shipping_address: quote.shipping_address,
                negotiation_reason: quote.negotiation_reason,
                converted_order_id: null,
                customer_name_snapshot: quote.customer_name_snapshot,
                customer_code_snapshot: quote.customer_code_snapshot,
                company_name_snapshot: quote.company_name_snapshot,
                price_table_name_snapshot: quote.price_table_name_snapshot,
            })
            .select('id, quote_number')
            .single()

        if (duplicatedQuoteError || !duplicatedQuote) {
            return { error: duplicatedQuoteError?.message || 'Falha ao duplicar orcamento.' }
        }

        const sourceItems = (quote.items || []) as Array<{
            product_variant_id: string
            size_option_id: string | null
            product_name: string
            fabric_name: string
            color_name: string
            size: string | null
            size_name: string | null
            quantity: number
            unit_price: number
            product_price: number | null
            size_price: number | null
            variation_price: number | null
            final_price: number | null
            subtotal: number
        }>

        if (sourceItems.length > 0) {
            const { error: itemsError } = await admin
                .from('sales_quote_items')
                .insert(
                    sourceItems.map((item) => ({
                        quote_id: duplicatedQuote.id,
                        product_variant_id: item.product_variant_id,
                        size_option_id: item.size_option_id,
                        product_name: item.product_name,
                        fabric_name: item.fabric_name,
                        color_name: item.color_name,
                        size: item.size,
                        size_name: item.size_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        product_price: item.product_price,
                        size_price: item.size_price,
                        variation_price: item.variation_price,
                        final_price: item.final_price,
                        subtotal: item.subtotal,
                    }))
                )

            if (itemsError) {
                await admin.from('sales_quotes').delete().eq('id', duplicatedQuote.id)
                return { error: itemsError.message || 'Falha ao duplicar itens do orcamento.' }
            }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'dashboard'])
        return {
            success: true,
            quoteId: duplicatedQuote.id as string,
            quoteNumber: duplicatedQuote.quote_number as string | null,
        }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao duplicar orcamento.' }
    }
}

export async function deleteRepresentativeQuoteAction(quoteId: string) {
    try {
        const { admin, scopeRepresentativeId } = await requireRepresentativeContext()
        const query = admin
            .from('sales_quotes')
            .select('id, status')
            .eq('id', quoteId)

        if (scopeRepresentativeId) {
            query.eq('representative_id', scopeRepresentativeId)
        }

        const { data: quote, error: quoteError } = await query.maybeSingle()
        if (quoteError) {
            return { error: quoteError.message || 'Falha ao localizar orcamento para exclusao.' }
        }
        if (!quote) {
            return { error: 'Orcamento nao encontrado para este representante.' }
        }
        if (quote.status === 'converted') {
            return { error: 'Nao e possivel excluir um orcamento convertido em pedido.' }
        }

        const { error: deleteError } = await admin
            .from('sales_quotes')
            .delete()
            .eq('id', quoteId)

        if (deleteError) {
            return { error: deleteError.message || 'Falha ao excluir orcamento.' }
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'visits', 'dashboard'])
        return { success: true }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao excluir orcamento.' }
    }
}

export async function convertRepresentativeQuoteToOrderAction(quoteId: string) {
    try {
        const { admin, supabase, scopeRepresentativeId } = await requireRepresentativeContext()

        const { data, error } = await supabase.rpc('representative_convert_quote_to_order_atomic', {
            p_quote_id: quoteId,
            p_created_note: 'Pedido gerado a partir de orcamento no modo representante.',
        })

        const result = Array.isArray(data) ? (data[0] as SalesOrderLikeResult | undefined) : (data as SalesOrderLikeResult | null)
        if (error || !result?.order_id) {
            return { error: error?.message || 'Falha ao converter orcamento em pedido.' }
        }

        const linkedVisitsQuery = admin
            .from('sales_visits')
            .update({
                generated_order_id: result.order_id,
                outcome: 'converted_order',
            })
            .eq('generated_quote_id', quoteId)

        if (scopeRepresentativeId) {
            linkedVisitsQuery.eq('representative_id', scopeRepresentativeId)
        }
        await linkedVisitsQuery

        revalidateRepresentativeSegments(scopeRepresentativeId, ['quotes', 'orders', 'customers', 'visits', 'dashboard'])
        return { success: true, orderId: result.order_id, orderNumber: result.order_number }
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao converter orcamento.' }
    }
}

// ==================== REPRESENTATIVE CUSTOMER CREATION ====================

async function appendRepresentativeCustomerAuditLog(
    admin: ReturnType<typeof getAdminClient>,
    payload: {
        storeId?: string | null
        representativeId?: string | null
        actorProfileId?: string | null
        action: 'create' | 'update' | 'quality_flag' | 'automated_alert'
        details?: Record<string, unknown> | null
    }
) {
    const { error } = await admin
        .from('representative_customer_audit_logs')
        .insert({
            store_id: payload.storeId || null,
            representative_id: payload.representativeId || null,
            actor_profile_id: payload.actorProfileId || null,
            action: payload.action,
            details: payload.details || null,
        })

    if (error) {
        console.warn('Customer audit log skipped:', error.message || error)
    }
}

export async function createCustomerAsRepresentativeTx(data: {
    fullName: string
    email: string
    password?: string
    phone?: string
    companyName: string
    cnpj: string
    tradeName?: string
    customerTypeId?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
}) {
    const { admin, scopeRepresentativeId, user } = await requireRepresentativeContext()

    // In admin preview mode we keep it unassigned, while representative users keep own scope.
    const representativeToAssign = scopeRepresentativeId || null

    const { 
        email, 
        password, 
        fullName, 
        phone, 
        companyName, 
        cnpj, 
        tradeName, 
        customerTypeId, 
        address, 
        city, 
        state, 
        zipCode 
    } = data

    if (!email || !fullName || !companyName || !cnpj) {
        return { error: 'Campos obrigatÃƒÂ³rios faltando.' }
    }

    try {
        const normalizedEmail = email.trim().toLowerCase()
        const passwordToUse = password && password.trim().length >= 6 ? password : generateRepresentativeTemporaryPassword()

        // 1. Check if email already exists
        const { data: existingProfileByEmail } = await admin
            .from('profiles')
            .select('id')
            .eq('email', normalizedEmail)
            .limit(1)
            .maybeSingle()

        if (existingProfileByEmail?.id) {
            return { error: 'Este email jÃƒÂ¡ estÃƒÂ¡ cadastrado.' }
        }

        // 2. Create user in Auth
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
            email: normalizedEmail,
            password: passwordToUse,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: 'client',
            },
        })

        if (authError || !authData?.user?.id) {
            let errorMsg = 'Falha ao criar usuÃƒÂ¡rio.'
            if (authError?.message?.toLowerCase().includes('already registered')) {
                errorMsg = 'Este email jÃƒÂ¡ estÃƒÂ¡ cadastrado.'
            }
            throw new Error(errorMsg)
        }

        // 3. Insert domain records using the same RPC the admin uses
        const { data: rpcData, error: rpcError } = await admin.rpc('admin_upsert_customer_domain', {
            p_profile_id: authData.user.id,
            p_full_name: fullName,
            p_phone: phone || null,
            p_status: 'approved',
            p_store_id: null,
            p_company_name: companyName,
            p_trade_name: tradeName || null,
            p_cnpj: cnpj.replace(/\D/g, ''),
            p_email: normalizedEmail,
            p_customer_type_id: customerTypeId || null,
            p_representative_id: representativeToAssign,
            p_address: address || null,
            p_city: city || null,
            p_state: state || null,
            p_zip_code: zipCode || null,
            p_tag_ids: [],
        })

        if (rpcError) {
            // Clean up auth user on complete failure
            await admin.auth.admin.deleteUser(authData.user.id)
            throw new Error(rpcError.message)
        }

        const firstRow = Array.isArray(rpcData) ? rpcData[0] : rpcData
        const createdStoreId =
            firstRow && typeof firstRow === 'object' && 'store_id' in firstRow
                ? String((firstRow as { store_id?: string }).store_id || '')
                : ''

        await appendRepresentativeCustomerAuditLog(admin, {
            storeId: createdStoreId || null,
            representativeId: representativeToAssign,
            actorProfileId: user.id,
            action: 'create',
            details: {
                source: 'representative_customer_create',
                customerTypeId: customerTypeId || null,
                city: city || null,
                state: state || null,
            },
        })

        const qualityAssessment = buildInputDataQualityAssessment({
            cnpj,
            phone,
            email: normalizedEmail,
            city,
            state,
            customerTypeId,
            address,
            tradeName,
        })

        if (qualityAssessment.issues.length > 0) {
            await appendRepresentativeCustomerAuditLog(admin, {
                storeId: createdStoreId || null,
                representativeId: representativeToAssign,
                actorProfileId: user.id,
                action: 'quality_flag',
                details: {
                    source: 'representative_customer_create',
                    score: qualityAssessment.score,
                    issues: qualityAssessment.issues,
                },
            })
        }

        if (qualityAssessment.score < 70) {
            await appendRepresentativeCustomerAuditLog(admin, {
                storeId: createdStoreId || null,
                representativeId: representativeToAssign,
                actorProfileId: user.id,
                action: 'automated_alert',
                details: {
                    source: 'representative_customer_create',
                    priority: 'medium',
                    alert: 'Cadastro com baixa qualidade',
                    score: qualityAssessment.score,
                },
            })
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['customers', 'dashboard', 'builder'])
        return { success: true, storeId: createdStoreId || undefined }
    } catch (err: unknown) {
        console.error('Representative Customer Creation TX Error:', err)
        let msg = 'Erro ao criar o cliente.'
        if (err instanceof Error && err.message) msg = err.message
        return { error: msg }
    }
}

export async function updateCustomerAsRepresentativeTx(data: {
    id: string
    profileId?: string
    fullName: string
    email: string
    phone?: string
    companyName: string
    cnpj: string
    tradeName?: string
    customerTypeId?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
}) {
    const { admin, scopeRepresentativeId, user } = await requireRepresentativeContext()

    const { 
        id: storeId, 
        profileId: inputProfileId, 
        email, 
        fullName, 
        phone, 
        companyName, 
        cnpj, 
        tradeName, 
        customerTypeId, 
        address, 
        city, 
        state, 
        zipCode 
    } = data

    if (!email || !fullName || !companyName || !cnpj) {
        return { error: 'Campos obrigatÃƒÂ³rios faltando.' }
    }

    try {
        const normalizedEmail = email.trim().toLowerCase()

        // 1. Determine profileId if not provided
        let profileId = inputProfileId
        if (!profileId) {
            const { data: storeData } = await admin
                .from('stores')
                .select('profile_id')
                .eq('id', storeId)
                .single()
            profileId = storeData?.profile_id
        }

        if (!profileId) {
            return { error: 'Cadastro base do cliente nÃƒÂ£o encontrado.' }
        }

        // 2. Verify if it belongs to representative
        const { data: storeToUpdate, error: loadError } = await admin
            .from('stores')
            .select('id, representative_id')
            .eq('id', storeId)
            .eq('profile_id', profileId)
            .single()

        if (loadError || !storeToUpdate) {
            return { error: 'Cliente nÃƒÂ£o encontrado.' }
        }

        if (scopeRepresentativeId && storeToUpdate.representative_id && storeToUpdate.representative_id !== scopeRepresentativeId) {
            return { error: 'Acesso negado. Cliente pertence a outro representante.' }
        }

        const representativeToPersist = scopeRepresentativeId || storeToUpdate.representative_id || null

        // Email collision check
        const { data: currentProfile, error: currentProfileError } = await admin
            .from('profiles')
            .select('email')
            .eq('id', profileId)
            .single()

        if (currentProfileError || !currentProfile) {
            return { error: 'Cadastro base do cliente nÃƒÂ£o encontrado.' }
        }

        if ((currentProfile.email || '').toLowerCase() !== normalizedEmail) {
            const { data: existingProfileByEmail } = await admin
                .from('profiles')
                .select('id')
                .eq('email', normalizedEmail)
                .neq('id', profileId)
                .limit(1)
                .maybeSingle()

            if (existingProfileByEmail?.id) {
                return { error: 'Este email jÃƒÂ¡ estÃƒÂ¡ sendo utilizado por outro cadastro.' }
            }

            const { error: authUpdateError } = await admin.auth.admin.updateUserById(profileId, {
                email: normalizedEmail,
                email_confirm: true,
            })

            if (authUpdateError) {
                return { error: 'Falha ao atualizar o e-mail no provedor de acesso.' }
            }
        }

        // 3. Upsert using RPC
        const { error: rpcError } = await admin.rpc('admin_upsert_customer_domain', {
            p_profile_id: profileId,
            p_full_name: fullName,
            p_phone: phone || null,
            p_status: 'approved',
            p_store_id: storeId,
            p_company_name: companyName,
            p_trade_name: tradeName || null,
            p_cnpj: cnpj.replace(/\D/g, ''),
            p_email: normalizedEmail,
            p_customer_type_id: customerTypeId || null,
            p_representative_id: representativeToPersist,
            p_address: address || null,
            p_city: city || null,
            p_state: state || null,
            p_zip_code: zipCode || null,
            p_tag_ids: [],
        })

        if (rpcError) {
            throw new Error(rpcError.message)
        }

        await appendRepresentativeCustomerAuditLog(admin, {
            storeId,
            representativeId: representativeToPersist,
            actorProfileId: user.id,
            action: 'update',
            details: {
                source: 'representative_customer_update',
                customerTypeId: customerTypeId || null,
                city: city || null,
                state: state || null,
            },
        })

        const qualityAssessment = buildInputDataQualityAssessment({
            cnpj,
            phone,
            email: normalizedEmail,
            city,
            state,
            customerTypeId,
            address,
            tradeName,
        })

        if (qualityAssessment.issues.length > 0) {
            await appendRepresentativeCustomerAuditLog(admin, {
                storeId,
                representativeId: representativeToPersist,
                actorProfileId: user.id,
                action: 'quality_flag',
                details: {
                    source: 'representative_customer_update',
                    score: qualityAssessment.score,
                    issues: qualityAssessment.issues,
                },
            })
        }

        if (qualityAssessment.score < 70) {
            await appendRepresentativeCustomerAuditLog(admin, {
                storeId,
                representativeId: representativeToPersist,
                actorProfileId: user.id,
                action: 'automated_alert',
                details: {
                    source: 'representative_customer_update',
                    priority: 'medium',
                    alert: 'Cadastro com baixa qualidade',
                    score: qualityAssessment.score,
                },
            })
        }

        revalidateRepresentativeSegments(scopeRepresentativeId, ['customers', 'dashboard', 'builder'])
        return { success: true, storeId }
    } catch (err: unknown) {
        console.error('Representative Customer Edit TX Error:', err)
        let msg = 'Erro ao atualizar o cliente.'
        if (err instanceof Error && err.message) msg = err.message
        return { error: msg }
    }
}

