export type FinancialProfile = 'no_restriction' | 'cash_only' | 'block_sales'

export interface StoreCommercialSettings {
    id: string
    store_id: string
    override_price_table_id: string | null
    override_payment_method_id: string | null
    override_payment_condition_id: string | null
    financial_profile: FinancialProfile
    max_discount_percentage: number | null
    credit_limit: number | null
    commercial_notes: string | null
    created_at: string
    updated_at: string
}

export const FINANCIAL_PROFILE_LABELS: Record<FinancialProfile, string> = {
    no_restriction: 'Sem restricao',
    cash_only: 'Somente a vista',
    block_sales: 'Restringir todas as vendas',
}

export const FINANCIAL_PROFILE_DESCRIPTIONS: Record<FinancialProfile, string> = {
    no_restriction: 'Cliente segue o fluxo comercial padrao do sistema.',
    cash_only: 'Checkout aceita somente condicoes a vista (1 parcela).',
    block_sales: 'Bloqueia novos pedidos e finalizacao de compra ate liberacao.',
}

export function normalizeFinancialProfile(value: string | null | undefined): FinancialProfile {
    if (value === 'cash_only' || value === 'block_sales' || value === 'no_restriction') {
        return value
    }

    return 'no_restriction'
}
