'use client'
/* eslint-disable react-hooks/set-state-in-effect */

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapIcon, Globe2, ListFilter, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getClientMapDataset, updateClientCoordinates } from '@/app/admin/logistica/services'
import ClientMapSidebar from './client-map-sidebar'
import ClientMapView from './client-map-view'
import type {
    ClientMapDatasetResponse,
    ClientMapFilters,
    ClientMapItem,
    ClientMapScope,
} from './client-map-types'

const GeocodePickerDialog = dynamic(() => import('@/components/logistics/geocode-picker-dialog'), { ssr: false })

interface ClientMapModeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialScope: ClientMapScope
    initialSelectedClientIds: string[]
    cities: string[]
    regions: string[]
    onApply: (payload: { selectedClientIds: string[]; scope: ClientMapScope }) => void
}

const emptyDataset: ClientMapDatasetResponse = {
    scope: 'routable',
    items: [],
    total_clients: 0,
    loaded_clients: 0,
    truncated: false,
}

const defaultFilters: ClientMapFilters = {
    search: '',
    city: '',
    region: '',
    onlyWithOrders: false,
    onlyWithoutOrders: false,
    onlyWithCoordinates: false,
    onlyWithoutCoordinates: false,
    onlySelected: false,
}

export default function ClientMapModeDialog({
    open,
    onOpenChange,
    initialScope,
    initialSelectedClientIds,
    cities,
    regions,
    onApply,
}: ClientMapModeDialogProps) {
    const isMobile = useIsMobile()
    const [scope, setScope] = useState<ClientMapScope>(initialScope)
    const [filters, setFilters] = useState<ClientMapFilters>(defaultFilters)
    const [dataset, setDataset] = useState<ClientMapDatasetResponse>(emptyDataset)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mobileTab, setMobileTab] = useState<'list' | 'map'>('map')
    const [focusedClientId, setFocusedClientId] = useState<string | null>(null)
    const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set(initialSelectedClientIds))
    const [geocodeDialog, setGeocodeDialog] = useState<{
        storeId: string
        customerName: string
        address: string
        addressId: string | null
        lat: number | null
        lng: number | null
    } | null>(null)

    const requestIdRef = useRef(0)
    const [debouncedSearch, setDebouncedSearch] = useState(filters.search)

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedSearch(filters.search), 280)
        return () => window.clearTimeout(timeoutId)
    }, [filters.search])

    useEffect(() => {
        if (!open) return
        setScope(initialScope)
        setSelectedClientIds(new Set(initialSelectedClientIds))
        setFilters(defaultFilters)
        setFocusedClientId(null)
        setMobileTab('map')
        setGeocodeDialog(null)
    }, [open, initialScope, initialSelectedClientIds])

    const selectedIdsForQuery = useMemo(() => (
        filters.onlySelected ? Array.from(selectedClientIds) : []
    ), [filters.onlySelected, selectedClientIds])

    const loadDataset = useCallback(async () => {
        if (!open) return
        if (filters.onlySelected && selectedClientIds.size === 0) {
            setDataset({ ...emptyDataset, scope })
            setError(null)
            setLoading(false)
            return
        }
        const requestId = requestIdRef.current + 1
        requestIdRef.current = requestId

        setLoading(true)
        setError(null)

        const response = await getClientMapDataset({
            scope,
            search: debouncedSearch || undefined,
            city: filters.city || undefined,
            region: filters.region || undefined,
            onlyWithOrders: filters.onlyWithOrders,
            onlyWithoutOrders: filters.onlyWithoutOrders,
            onlyWithCoordinates: filters.onlyWithCoordinates,
            onlyWithoutCoordinates: filters.onlyWithoutCoordinates,
            onlySelectedIds: selectedIdsForQuery.length > 0 ? selectedIdsForQuery : undefined,
            limit: 1800,
        })

        if (requestId !== requestIdRef.current) return

        if ('error' in response && response.error) {
            setError(response.error)
            setDataset({ ...emptyDataset, scope })
            setLoading(false)
            return
        }

        if ('data' in response && response.data) {
            setDataset({
                scope,
                items: response.data.items as ClientMapItem[],
                total_clients: response.data.total_clients,
                loaded_clients: response.data.loaded_clients,
                truncated: response.data.truncated,
            })
        } else {
            setDataset({ ...emptyDataset, scope })
        }
        setLoading(false)
    }, [
        open,
        scope,
        debouncedSearch,
        filters.city,
        filters.region,
        filters.onlyWithOrders,
        filters.onlyWithoutOrders,
        filters.onlyWithCoordinates,
        filters.onlyWithoutCoordinates,
        filters.onlySelected,
        selectedClientIds,
        selectedIdsForQuery,
    ])

    useEffect(() => {
        void loadDataset()
    }, [loadDataset])

    const allCities = useMemo(() => {
        const merged = new Set<string>(cities)
        for (const item of dataset.items) {
            if (item.city) merged.add(item.city)
        }
        return Array.from(merged).sort((a, b) => a.localeCompare(b))
    }, [cities, dataset.items])

    const allRegions = useMemo(() => {
        const merged = new Set<string>(regions.filter((value): value is string => Boolean(value)))
        for (const item of dataset.items) {
            if (item.region) merged.add(item.region)
        }
        return Array.from(merged).sort((a, b) => a.localeCompare(b))
    }, [regions, dataset.items])

    const itemsById = useMemo(() => {
        const map = new Map<string, ClientMapItem>()
        for (const item of dataset.items) map.set(item.store_id, item)
        return map
    }, [dataset.items])

    const selectedWithOrdersCount = useMemo(() => (
        Array.from(selectedClientIds).reduce((acc, storeId) => {
            return acc + (itemsById.get(storeId)?.has_routable_orders ? 1 : 0)
        }, 0)
    ), [itemsById, selectedClientIds])

    const updateFilters = useCallback((next: Partial<ClientMapFilters>) => {
        setFilters((prev) => ({ ...prev, ...next }))
    }, [])

    const handleToggleClient = useCallback((storeId: string) => {
        setSelectedClientIds((prev) => {
            const next = new Set(prev)
            if (next.has(storeId)) next.delete(storeId)
            else next.add(storeId)
            return next
        })
    }, [])

    const handleSelectAllFiltered = useCallback(() => {
        setSelectedClientIds((prev) => {
            const next = new Set(prev)
            for (const item of dataset.items) next.add(item.store_id)
            return next
        })
    }, [dataset.items])

    const handleSelectWithOrders = useCallback(() => {
        setSelectedClientIds((prev) => {
            const next = new Set(prev)
            for (const item of dataset.items) {
                if (item.has_routable_orders) next.add(item.store_id)
            }
            return next
        })
    }, [dataset.items])

    const handleSelectByCurrentArea = useCallback(() => {
        setSelectedClientIds((prev) => {
            const next = new Set(prev)
            for (const item of dataset.items) next.add(item.store_id)
            return next
        })
    }, [dataset.items])

    const handleClearSelection = useCallback(() => {
        setSelectedClientIds(new Set())
    }, [])

    const handleOpenGeocode = useCallback((client: ClientMapItem) => {
        setFocusedClientId(client.store_id)
        setGeocodeDialog({
            storeId: client.store_id,
            customerName: client.company_name || client.client_name || 'Cliente',
            address: client.primary_address_label || `${client.city || ''}${client.state ? ` / ${client.state}` : ''}`,
            addressId: client.primary_address_id,
            lat: client.latitude ?? null,
            lng: client.longitude ?? null,
        })
    }, [])

    const handleOpenGeocodeByStoreId = useCallback((storeId: string) => {
        const client = dataset.items.find((item) => item.store_id === storeId)
        if (!client) return
        handleOpenGeocode(client)
    }, [dataset.items, handleOpenGeocode])

    const applyLocalCoordinateUpdate = useCallback((payload: {
        store_id: string
        primary_address_id: string | null
        primary_address_label: string | null
        latitude: number
        longitude: number
        coordinates_source: string | null
    }) => {
        let removedFromView = false
        setDataset((prev) => {
            const exists = prev.items.some((item) => item.store_id === payload.store_id)
            if (!exists) return prev

            const updatedItems = prev.items.map((item) => (
                item.store_id === payload.store_id
                    ? {
                        ...item,
                        primary_address_id: payload.primary_address_id,
                        primary_address_label: payload.primary_address_label,
                        latitude: payload.latitude,
                        longitude: payload.longitude,
                        coordinates_source: payload.coordinates_source,
                        has_valid_coordinates: true,
                    }
                    : item
            ))

            let visibleItems = updatedItems
            if (filters.onlyWithCoordinates) {
                visibleItems = visibleItems.filter((item) => item.has_valid_coordinates)
            }
            if (filters.onlyWithoutCoordinates) {
                visibleItems = visibleItems.filter((item) => !item.has_valid_coordinates)
            }

            removedFromView = !visibleItems.some((item) => item.store_id === payload.store_id)

            const removedCount = updatedItems.length - visibleItems.length
            return {
                ...prev,
                items: visibleItems,
                loaded_clients: visibleItems.length,
                total_clients: Math.max(0, prev.total_clients - removedCount),
            }
        })

        if (removedFromView && focusedClientId === payload.store_id) {
            setFocusedClientId(null)
        }
    }, [filters.onlyWithCoordinates, filters.onlyWithoutCoordinates, focusedClientId])

    const handleConfirmClientGeocode = useCallback(async (storeId: string, lat: number, lng: number) => {
        const response = await updateClientCoordinates({ storeId, lat, lng })
        if ('error' in response && response.error) {
            throw new Error(response.error)
        }
        if ('data' in response && response.data) {
            applyLocalCoordinateUpdate(response.data)
        }
    }, [applyLocalCoordinateUpdate])

    const handleApply = useCallback(() => {
        onApply({
            selectedClientIds: Array.from(selectedClientIds),
            scope,
        })
        onOpenChange(false)
    }, [onApply, onOpenChange, scope, selectedClientIds])

    const dialogClassName = isMobile
        ? 'h-[100dvh] w-[100vw] max-w-none rounded-none border-0 p-0'
        : 'h-[94dvh] w-[96vw] max-w-[96vw] sm:max-w-[96vw] overflow-hidden gap-0 p-0'

    const bodyContent = (
        <>
            <div className="border-b bg-white px-4 py-3">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 text-navy">
                            <MapIcon className="h-4 w-4 text-indigo-600" />
                            Mapa de Clientes
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {dataset.scope === 'global' ? 'Base Global' : 'Aptos para Rota'}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-3 inline-flex rounded-lg border bg-slate-50 p-1">
                    <Button
                        type="button"
                        size="sm"
                        className={cn(
                            'h-8 gap-1.5 rounded-md px-3 text-xs',
                            scope === 'routable'
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'bg-transparent text-slate-600 hover:bg-slate-100',
                        )}
                        onClick={() => setScope('routable')}
                    >
                        <ListFilter className="h-3.5 w-3.5" />
                        Roteirizaveis
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className={cn(
                            'h-8 gap-1.5 rounded-md px-3 text-xs',
                            scope === 'global'
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'bg-transparent text-slate-600 hover:bg-slate-100',
                        )}
                        onClick={() => setScope('global')}
                    >
                        <Globe2 className="h-3.5 w-3.5" />
                        Base Global
                    </Button>
                </div>
            </div>

            {isMobile ? (
                <Tabs value={mobileTab} onValueChange={(value) => setMobileTab(value as 'list' | 'map')} className="flex min-h-0 flex-1 flex-col">
                    <div className="border-b bg-white px-4 py-2">
                        <TabsList className="h-9 rounded-xl bg-slate-100 p-1">
                            <TabsTrigger value="list" className="rounded-lg text-xs">Painel</TabsTrigger>
                            <TabsTrigger value="map" className="rounded-lg text-xs">Mapa</TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="list" className="min-h-0 flex-1">
                        <ClientMapSidebar
                            loading={loading}
                            error={error}
                            filters={filters}
                            clients={dataset.items}
                            scope={scope}
                            selectedClientIds={selectedClientIds}
                            focusedClientId={focusedClientId}
                            cities={allCities}
                            regions={allRegions}
                            totalClients={dataset.total_clients}
                            loadedClients={dataset.loaded_clients}
                            truncated={dataset.truncated}
                            selectedWithOrdersCount={selectedWithOrdersCount}
                            onSearchChange={(value) => updateFilters({ search: value })}
                            onCityChange={(value) => updateFilters({ city: value })}
                            onRegionChange={(value) => updateFilters({ region: value })}
                            onToggleWithOrders={() => updateFilters({ onlyWithOrders: !filters.onlyWithOrders, onlyWithoutOrders: false })}
                            onToggleWithoutOrders={() => updateFilters({ onlyWithoutOrders: !filters.onlyWithoutOrders, onlyWithOrders: false })}
                            onToggleWithCoordinates={() => updateFilters({ onlyWithCoordinates: !filters.onlyWithCoordinates, onlyWithoutCoordinates: false })}
                            onToggleWithoutCoordinates={() => updateFilters({ onlyWithoutCoordinates: !filters.onlyWithoutCoordinates, onlyWithCoordinates: false })}
                            onToggleOnlySelected={() => updateFilters({ onlySelected: !filters.onlySelected })}
                            onToggleClient={handleToggleClient}
                            onFocusClient={setFocusedClientId}
                            onSelectAllFiltered={handleSelectAllFiltered}
                            onSelectWithOrders={handleSelectWithOrders}
                            onSelectByCurrentArea={handleSelectByCurrentArea}
                            onClearSelection={handleClearSelection}
                            onOpenGeocode={handleOpenGeocode}
                        />
                    </TabsContent>
                    <TabsContent value="map" className="min-h-0 flex-1">
                        <div className="h-full min-h-0 border-t bg-slate-100">
                            <ClientMapView
                                clients={dataset.items}
                                selectedClientIds={selectedClientIds}
                                focusedClientId={focusedClientId}
                                onToggleClient={handleToggleClient}
                                onFocusClient={setFocusedClientId}
                                onOpenGeocode={handleOpenGeocodeByStoreId}
                                loading={loading}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            ) : (
                <div className="grid min-h-0 flex-1 grid-cols-[430px_1fr]">
                    <div className="min-h-0 border-r">
                        <ClientMapSidebar
                            loading={loading}
                            error={error}
                            filters={filters}
                            clients={dataset.items}
                            scope={scope}
                            selectedClientIds={selectedClientIds}
                            focusedClientId={focusedClientId}
                            cities={allCities}
                            regions={allRegions}
                            totalClients={dataset.total_clients}
                            loadedClients={dataset.loaded_clients}
                            truncated={dataset.truncated}
                            selectedWithOrdersCount={selectedWithOrdersCount}
                            onSearchChange={(value) => updateFilters({ search: value })}
                            onCityChange={(value) => updateFilters({ city: value })}
                            onRegionChange={(value) => updateFilters({ region: value })}
                            onToggleWithOrders={() => updateFilters({ onlyWithOrders: !filters.onlyWithOrders, onlyWithoutOrders: false })}
                            onToggleWithoutOrders={() => updateFilters({ onlyWithoutOrders: !filters.onlyWithoutOrders, onlyWithOrders: false })}
                            onToggleWithCoordinates={() => updateFilters({ onlyWithCoordinates: !filters.onlyWithCoordinates, onlyWithoutCoordinates: false })}
                            onToggleWithoutCoordinates={() => updateFilters({ onlyWithoutCoordinates: !filters.onlyWithoutCoordinates, onlyWithCoordinates: false })}
                            onToggleOnlySelected={() => updateFilters({ onlySelected: !filters.onlySelected })}
                            onToggleClient={handleToggleClient}
                            onFocusClient={setFocusedClientId}
                            onSelectAllFiltered={handleSelectAllFiltered}
                            onSelectWithOrders={handleSelectWithOrders}
                            onSelectByCurrentArea={handleSelectByCurrentArea}
                            onClearSelection={handleClearSelection}
                            onOpenGeocode={handleOpenGeocode}
                        />
                    </div>

                    <div className="min-h-0 bg-slate-100 p-3">
                        <div className="h-full overflow-hidden rounded-xl border bg-white">
                            <ClientMapView
                                clients={dataset.items}
                                selectedClientIds={selectedClientIds}
                                focusedClientId={focusedClientId}
                                onToggleClient={handleToggleClient}
                                onFocusClient={setFocusedClientId}
                                onOpenGeocode={handleOpenGeocodeByStoreId}
                                loading={loading}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="border-t bg-white px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                            {selectedClientIds.size} cliente(s) selecionado(s)
                        </span>
                        <span className="mx-1.5 text-slate-400">|</span>
                        <span>{selectedWithOrdersCount} com pedidos aptos</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700" onClick={handleApply}>
                            <CheckCircle2 className="h-4 w-4" />
                            Aplicar selecao
                        </Button>
                    </div>
                </div>
            </div>
        </>
    )

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className={dialogClassName}>
                    <div className="flex h-full min-h-0 flex-col">
                        {bodyContent}
                    </div>
                </DialogContent>
            </Dialog>
            {geocodeDialog ? (
                <GeocodePickerDialog
                    open={Boolean(geocodeDialog)}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setGeocodeDialog(null)
                    }}
                    stopId={geocodeDialog.storeId}
                    customerName={geocodeDialog.customerName}
                    address={geocodeDialog.address}
                    addressId={geocodeDialog.addressId}
                    initialLat={geocodeDialog.lat}
                    initialLng={geocodeDialog.lng}
                    context="client"
                    onConfirm={handleConfirmClientGeocode}
                />
            ) : null}
        </>
    )
}
