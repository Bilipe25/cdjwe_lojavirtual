import { create } from 'zustand'
import { normalizeFinancialProfile, type FinancialProfile, type StoreCommercialSettings } from '@/lib/commercial/types'

type CustomerCommercialState = {
    settings: StoreCommercialSettings | null
    financialProfile: FinancialProfile
    isSalesBlocked: boolean
    isCashOnly: boolean
    setSettings: (settings: StoreCommercialSettings | null) => void
    clearSettings: () => void
}

const defaultState = {
    settings: null,
    financialProfile: 'no_restriction' as FinancialProfile,
    isSalesBlocked: false,
    isCashOnly: false,
}

export const useCustomerCommercialStore = create<CustomerCommercialState>((set) => ({
    ...defaultState,
    setSettings: (settings) => {
        const financialProfile = normalizeFinancialProfile(settings?.financial_profile)
        set({
            settings: settings
                ? {
                      ...settings,
                      financial_profile: financialProfile,
                  }
                : null,
            financialProfile,
            isSalesBlocked: financialProfile === 'block_sales',
            isCashOnly: financialProfile === 'cash_only',
        })
    },
    clearSettings: () => set(defaultState),
}))
