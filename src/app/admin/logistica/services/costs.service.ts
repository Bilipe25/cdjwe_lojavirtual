'use server'

import {
    getCostSettings as getCostSettingsAction,
    saveCostSettings as saveCostSettingsAction,
    getRouteCostEstimate as getRouteCostEstimateAction,
} from '../actions'

export async function getCostSettings(...args: Parameters<typeof getCostSettingsAction>) {
    return getCostSettingsAction(...args)
}

export async function saveCostSettings(...args: Parameters<typeof saveCostSettingsAction>) {
    return saveCostSettingsAction(...args)
}

export async function getRouteCostEstimate(...args: Parameters<typeof getRouteCostEstimateAction>) {
    return getRouteCostEstimateAction(...args)
}

export type { CostSettings } from '../actions'
