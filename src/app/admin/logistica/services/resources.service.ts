'use server'

import {
    getRoutableOrders as getRoutableOrdersAction,
    getClientMapDataset as getClientMapDatasetAction,
    getVehicles as getVehiclesAction,
    upsertVehicle as upsertVehicleAction,
    deleteVehicle as deleteVehicleAction,
    getDrivers as getDriversAction,
    upsertDriver as upsertDriverAction,
    deleteDriver as deleteDriverAction,
    getRegions as getRegionsAction,
    upsertRegion as upsertRegionAction,
    deleteRegion as deleteRegionAction,
    getCenters as getCentersAction,
    upsertCenter as upsertCenterAction,
    deleteCenter as deleteCenterAction,
    getDistinctCities as getDistinctCitiesAction,
    updateClientCoordinates as updateClientCoordinatesAction,
} from '../actions'

export async function getRoutableOrders(...args: Parameters<typeof getRoutableOrdersAction>) {
    return getRoutableOrdersAction(...args)
}

export async function getClientMapDataset(...args: Parameters<typeof getClientMapDatasetAction>) {
    return getClientMapDatasetAction(...args)
}

export async function getVehicles(...args: Parameters<typeof getVehiclesAction>) {
    return getVehiclesAction(...args)
}

export async function upsertVehicle(...args: Parameters<typeof upsertVehicleAction>) {
    return upsertVehicleAction(...args)
}

export async function deleteVehicle(...args: Parameters<typeof deleteVehicleAction>) {
    return deleteVehicleAction(...args)
}

export async function getDrivers(...args: Parameters<typeof getDriversAction>) {
    return getDriversAction(...args)
}

export async function upsertDriver(...args: Parameters<typeof upsertDriverAction>) {
    return upsertDriverAction(...args)
}

export async function deleteDriver(...args: Parameters<typeof deleteDriverAction>) {
    return deleteDriverAction(...args)
}

export async function getRegions(...args: Parameters<typeof getRegionsAction>) {
    return getRegionsAction(...args)
}

export async function upsertRegion(...args: Parameters<typeof upsertRegionAction>) {
    return upsertRegionAction(...args)
}

export async function deleteRegion(...args: Parameters<typeof deleteRegionAction>) {
    return deleteRegionAction(...args)
}

export async function getCenters(...args: Parameters<typeof getCentersAction>) {
    return getCentersAction(...args)
}

export async function upsertCenter(...args: Parameters<typeof upsertCenterAction>) {
    return upsertCenterAction(...args)
}

export async function deleteCenter(...args: Parameters<typeof deleteCenterAction>) {
    return deleteCenterAction(...args)
}

export async function getDistinctCities(...args: Parameters<typeof getDistinctCitiesAction>) {
    return getDistinctCitiesAction(...args)
}

export async function updateClientCoordinates(...args: Parameters<typeof updateClientCoordinatesAction>) {
    return updateClientCoordinatesAction(...args)
}

export type {
    PaginationMeta,
    RoutableOrder,
    ClientMapScope,
    ClientMapItem,
    ClientMapDatasetResponse,
    VehicleItem,
    DriverItem,
    RegionItem,
    CenterItem,
} from '../actions'
