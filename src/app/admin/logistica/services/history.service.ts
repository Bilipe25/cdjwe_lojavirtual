'use server'

import { getRouteHistory as getRouteHistoryAction } from '../actions'

export async function getRouteHistory(...args: Parameters<typeof getRouteHistoryAction>) {
    return getRouteHistoryAction(...args)
}

export type { RouteHistoryItem } from '../actions'
