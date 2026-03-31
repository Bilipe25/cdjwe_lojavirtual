'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
    MapPin,
    Search,
    Crosshair,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Navigation,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { attachResizeObserver, createLogisticsMap } from './map-provider'
import { normalizeAddressText, useLogisticsGeocode } from './use-logistics-geocode'

interface GeocodePickerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    stopId: string
    customerName: string
    address: string
    addressId?: string | null
    cityHint?: string | null
    stateHint?: string | null
    zipCodeHint?: string | null
    initialLat?: number | null
    initialLng?: number | null
    onConfirm: (stopId: string, lat: number, lng: number) => Promise<void>
    context?: 'stop' | 'client'
}

export default function GeocodePickerDialog({
    open,
    onOpenChange,
    stopId,
    customerName,
    address,
    addressId,
    cityHint,
    stateHint,
    zipCodeHint,
    initialLat,
    initialLng,
    onConfirm,
    context = 'stop',
}: GeocodePickerDialogProps) {
    const isClientContext = context === 'client'
    const dialogTitle = isClientContext ? 'Geocodificar Cliente' : 'Geocodificar Parada'
    const dialogDescription = isClientContext
        ? 'Localize o endereco principal do cliente no mapa e ajuste a posicao.'
        : 'Localize o endereco no mapa e arraste o marcador para ajustar a posicao.'
    const confirmLabel = isClientContext ? 'Salvar Coordenadas do Cliente' : 'Confirmar Localizacao'

    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<maplibregl.Map | null>(null)
    const markerRef = useRef<maplibregl.Marker | null>(null)
    const resizeControllerRef = useRef<ReturnType<typeof attachResizeObserver> | null>(null)
    const hasAutoGeocodedRef = useRef(false)
    const mapReadyFallbackTimerRef = useRef<number | null>(null)

    const [searchAddress, setSearchAddress] = useState(address || '')
    const [isMapReady, setIsMapReady] = useState(false)
    const [mapInitError, setMapInitError] = useState<string | null>(null)
    const [mapBootNonce, setMapBootNonce] = useState(0)
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
        Number.isFinite(initialLat) && Number.isFinite(initialLng) ? { lat: Number(initialLat), lng: Number(initialLng) } : null,
    )

    const geocodeEngine = useLogisticsGeocode({
        addressId,
        defaultAddress: address,
        cityHint,
        stateHint,
        zipCodeHint,
    })
    const {
        status: geocodeStatus,
        error,
        geocode,
        setMapReady,
        setMapError,
        setSaving,
        setSaved,
        reset,
        setError,
        setStatus,
    } = geocodeEngine

    const geocoding = geocodeStatus === 'resolving_address' || geocodeStatus === 'geocoding'
    const saving = geocodeStatus === 'saving'

    const cleanupMap = useCallback(() => {
        if (mapReadyFallbackTimerRef.current !== null) {
            window.clearTimeout(mapReadyFallbackTimerRef.current)
            mapReadyFallbackTimerRef.current = null
        }

        markerRef.current?.remove()
        markerRef.current = null

        resizeControllerRef.current?.destroy()
        resizeControllerRef.current = null

        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove()
            mapInstanceRef.current = null
        }
    }, [])

    const normalizeAddress = useCallback((text: string) => normalizeAddressText(text), [])

    function createMarkerElement() {
        const element = document.createElement('div')
        element.style.width = '32px'
        element.style.height = '32px'
        element.style.borderRadius = '50% 50% 50% 0'
        element.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)'
        element.style.transform = 'rotate(-45deg)'
        element.style.display = 'grid'
        element.style.placeItems = 'center'
        element.style.border = '3px solid white'
        element.style.boxShadow = '0 4px 14px rgba(99,102,241,0.5)'
        element.style.cursor = 'grab'

        const inner = document.createElement('div')
        inner.style.transform = 'rotate(45deg)'
        inner.style.width = '8px'
        inner.style.height = '8px'
        inner.style.borderRadius = '999px'
        inner.style.background = 'white'
        element.append(inner)

        return element
    }

    const placeMarker = useCallback((map: maplibregl.Map, lat: number, lng: number, fly = true) => {
        if (markerRef.current) {
            markerRef.current.setLngLat([lng, lat])
        } else {
            const marker = new maplibregl.Marker({
                element: createMarkerElement(),
                anchor: 'bottom',
                draggable: true,
            }).setLngLat([lng, lat]).addTo(map)

            marker.on('dragend', () => {
                const pos = marker.getLngLat()
                setCoords({ lat: Number(pos.lat.toFixed(7)), lng: Number(pos.lng.toFixed(7)) })
            })

            markerRef.current = marker
        }

        if (fly) {
            map.easeTo({
                center: [lng, lat],
                zoom: Math.max(map.getZoom(), 16),
                duration: 600,
            })
        }
    }, [])

    const doGeocode = useCallback(async (searchText: string) => {
        if (!searchText.trim()) return

        const response = await geocode(searchText, { mode: 'manual' })
        if ('error' in response) return

        const newCoords = { lat: response.lat, lng: response.lng }
        setCoords(newCoords)

        if (mapInstanceRef.current) {
            placeMarker(mapInstanceRef.current, newCoords.lat, newCoords.lng)
        }
    }, [geocode, placeMarker])

    function handleManualGeocode() {
        void doGeocode(searchAddress)
    }

    async function handleConfirm() {
        if (!coords) return
        setSaving()
        setError(null)
        try {
            await onConfirm(stopId, coords.lat, coords.lng)
            setSaved()
            onOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao salvar coordenadas.')
            setStatus('failed')
        }
    }

    useEffect(() => {
        if (open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSearchAddress(normalizeAddress(address || ''))
            setCoords(
                Number.isFinite(initialLat) && Number.isFinite(initialLng)
                    ? { lat: Number(initialLat), lng: Number(initialLng) }
                    : null,
            )
            reset()
            setIsMapReady(false)
            setMapInitError(null)
            setMapBootNonce((prev) => prev + 1)
            hasAutoGeocodedRef.current = false
        } else {
            cleanupMap()
        }
    }, [address, cleanupMap, initialLat, initialLng, normalizeAddress, open, reset])

    useEffect(() => {
        if (!open) return
        if (!mapContainerRef.current || mapInstanceRef.current) return

        const timer = setTimeout(() => {
            if (!mapContainerRef.current || mapInstanceRef.current) return

            const hasCoords = Number.isFinite(initialLat) && Number.isFinite(initialLng)
            const mapCenter: [number, number] = hasCoords
                ? [Number(initialLng), Number(initialLat)]
                : [-51.9253, -14.235]

            let map: maplibregl.Map
            try {
                const created = createLogisticsMap({
                    container: mapContainerRef.current,
                    center: mapCenter,
                    zoom: hasCoords ? 16 : 4,
                })
                map = created.map
            } catch {
                setMapInitError('Nao foi possivel inicializar o mapa neste momento.')
                setIsMapReady(true)
                setMapError('Falha ao inicializar mapa do geocodificador.')
                return
            }

            mapInstanceRef.current = map
            map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

            const resizeController = attachResizeObserver(map, mapContainerRef.current)
            resizeControllerRef.current = resizeController
            resizeController.scheduleResize()
            window.setTimeout(() => resizeController.scheduleResize(), 120)
            window.setTimeout(() => resizeController.scheduleResize(), 320)

            const handleMapReady = () => {
                setIsMapReady(true)
                setMapReady()
                resizeController.scheduleResize()

                if (hasCoords) {
                    placeMarker(map, Number(initialLat), Number(initialLng), false)
                } else if (address && !hasAutoGeocodedRef.current) {
                    hasAutoGeocodedRef.current = true
                    void doGeocode(normalizeAddress(address))
                }
            }

            map.on('load', handleMapReady)
            map.on('style.load', handleMapReady)
            map.once('render', () => {
                setIsMapReady(true)
                setMapReady()
                resizeController.scheduleResize()
            })

            if (map.isStyleLoaded()) {
                handleMapReady()
            }

            mapReadyFallbackTimerRef.current = window.setTimeout(() => {
                if (mapInstanceRef.current === map) {
                    setIsMapReady(true)
                    setMapReady()
                    resizeController.scheduleResize()
                }
            }, 1800)

            map.on('click', (event) => {
                const { lat, lng } = event.lngLat
                placeMarker(map, lat, lng)
                setCoords({ lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) })
            })
        }, 220)

        return () => {
            clearTimeout(timer)
            cleanupMap()
        }
    }, [address, cleanupMap, doGeocode, initialLat, initialLng, mapBootNonce, normalizeAddress, open, placeMarker, setMapError, setMapReady])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <Navigation className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            {dialogTitle}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {dialogDescription}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-5 space-y-3 flex-1 overflow-y-auto">
                    <div className="rounded-lg border bg-slate-50/80 p-3 flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-black text-xs shrink-0">
                            {customerName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-navy truncate">{customerName}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {normalizeAddress(address) || 'Sem endereco cadastrado'}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                className="pl-9 h-9 text-sm"
                                placeholder="Pesquisar endereco..."
                                value={searchAddress}
                                onChange={(event) => setSearchAddress(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && handleManualGeocode()}
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4"
                            onClick={handleManualGeocode}
                            disabled={geocoding || !searchAddress.trim()}
                        >
                            {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                            {geocoding ? 'Buscando...' : 'Buscar'}
                        </Button>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100" style={{ height: 360 }}>
                        <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
                        {!isMapReady && !mapInitError && (
                            <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-100 text-xs text-slate-500">
                                Carregando mapa...
                            </div>
                        )}
                        {mapInitError && (
                            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-slate-100 text-xs text-slate-600">
                                <span>{mapInitError}</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-[11px]"
                                    onClick={() => {
                                        cleanupMap()
                                        setMapInitError(null)
                                        setIsMapReady(false)
                                        setMapBootNonce((prev) => prev + 1)
                                    }}
                                >
                                    Tentar novamente
                                </Button>
                            </div>
                        )}
                        {geocoding && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
                                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Geocodificando...
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border bg-slate-50/60 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                            {coords ? (
                                <>
                                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Localizado
                                    </span>
                                    <span className="font-mono text-muted-foreground text-[11px]">
                                        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-muted-foreground flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    Clique no mapa ou busque um endereco
                                </span>
                            )}
                        </div>
                        {coords && (
                            <span className="text-[10px] text-muted-foreground/60 hidden sm:block">
                                Arraste o pin para ajustar
                            </span>
                        )}
                    </div>
                </div>

                <div className="px-5 py-4 border-t flex justify-end gap-2 mt-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!coords || saving}
                        className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {saving ? 'Salvando...' : confirmLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

