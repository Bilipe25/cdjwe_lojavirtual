'use server'

import {
    getCostSettings as getCostSettingsAction,
    saveCostSettings as saveCostSettingsAction,
    getRouteCostEstimate as getRouteCostEstimateAction,
    getRouteCostProfile as getRouteCostProfileAction,
    saveRouteCostOverride as saveRouteCostOverrideAction,
    clearRouteCostOverride as clearRouteCostOverrideAction,
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

export async function getRouteCostProfile(...args: Parameters<typeof getRouteCostProfileAction>) {
    return getRouteCostProfileAction(...args)
}

export async function saveRouteCostOverride(...args: Parameters<typeof saveRouteCostOverrideAction>) {
    return saveRouteCostOverrideAction(...args)
}

export async function clearRouteCostOverride(...args: Parameters<typeof clearRouteCostOverrideAction>) {
    return clearRouteCostOverrideAction(...args)
}

export type {
    CostSettings,
    RouteCostOverrideSettings,
    RouteCostEffectiveSettings,
    RouteCostEstimate,
    RouteCostProfile,
} from '../actions'
