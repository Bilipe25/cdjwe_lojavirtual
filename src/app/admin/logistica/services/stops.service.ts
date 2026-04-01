'use server'

import {
    updateStopStatus as updateStopStatusAction,
    applyOptimizationResult as applyOptimizationResultAction,
    saveRouteStopsOrder as saveRouteStopsOrderAction,
    addRouteStop as addRouteStopAction,
    removeRouteStop as removeRouteStopAction,
    updateRoutePolyline as updateRoutePolylineAction,
    updateStopMetrics as updateStopMetricsAction,
    updateStopCoordinates as updateStopCoordinatesAction,
} from '../actions'

export async function updateStopStatus(...args: Parameters<typeof updateStopStatusAction>) {
    return updateStopStatusAction(...args)
}

export async function applyOptimizationResult(...args: Parameters<typeof applyOptimizationResultAction>) {
    return applyOptimizationResultAction(...args)
}

export async function saveRouteStopsOrder(...args: Parameters<typeof saveRouteStopsOrderAction>) {
    return saveRouteStopsOrderAction(...args)
}

export async function addRouteStop(...args: Parameters<typeof addRouteStopAction>) {
    return addRouteStopAction(...args)
}

export async function removeRouteStop(...args: Parameters<typeof removeRouteStopAction>) {
    return removeRouteStopAction(...args)
}

export async function updateRoutePolyline(...args: Parameters<typeof updateRoutePolylineAction>) {
    return updateRoutePolylineAction(...args)
}

export async function updateStopMetrics(...args: Parameters<typeof updateStopMetricsAction>) {
    return updateStopMetricsAction(...args)
}

export async function updateStopCoordinates(...args: Parameters<typeof updateStopCoordinatesAction>) {
    return updateStopCoordinatesAction(...args)
}
