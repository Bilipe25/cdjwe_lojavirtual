'use server'

import {
    getRoutes as getRoutesAction,
    createRoute as createRouteAction,
    getRouteDetail as getRouteDetailAction,
    getLogisticsPdfBranding as getLogisticsPdfBrandingAction,
    updateRouteStatus as updateRouteStatusAction,
    deleteRoute as deleteRouteAction,
    updateRouteAssignment as updateRouteAssignmentAction,
} from '../actions'

export async function getRoutes(...args: Parameters<typeof getRoutesAction>) {
    return getRoutesAction(...args)
}

export async function createRoute(...args: Parameters<typeof createRouteAction>) {
    return createRouteAction(...args)
}

export async function getRouteDetail(...args: Parameters<typeof getRouteDetailAction>) {
    return getRouteDetailAction(...args)
}

export async function getLogisticsPdfBranding(...args: Parameters<typeof getLogisticsPdfBrandingAction>) {
    return getLogisticsPdfBrandingAction(...args)
}

export async function updateRouteStatus(...args: Parameters<typeof updateRouteStatusAction>) {
    return updateRouteStatusAction(...args)
}

export async function deleteRoute(...args: Parameters<typeof deleteRouteAction>) {
    return deleteRouteAction(...args)
}

export async function updateRouteAssignment(...args: Parameters<typeof updateRouteAssignmentAction>) {
    return updateRouteAssignmentAction(...args)
}

export type { RouteListItem, LogisticsPdfBranding } from '../actions'
