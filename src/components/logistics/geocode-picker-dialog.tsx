'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ACTIVE_BASEMAP, MAP_TILE_LAYERS } from './map-config'
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
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog'

interface GeocodePickerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    stopId: string
    customerName: string
    address: string
    addressId?: string | null
    initialLat?: number | null
    initialLng?: number | null
    onConfirm: (stopId: string, lat: number, lng: number) => Promise<void>
}

export default function GeocodePickerDialog({
    open,
    onOpenChange,
    stopId,
    customerName,
    address,
    addressId,
    initialLat,
    initialLng,
    onConfirm,
}: GeocodePickerDialogProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<L.Map | null>(null)
    const markerRef = useRef<L.Marker | null>(null)
    const initDoneRef = useRef(false)

    const [searchAddress, setSearchAddress] = useState(address || '')
    const [geocoding, setGeocoding] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
        initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
    )

    // Clean address text — remove [Endereco Principal] prefixes
    function cleanAddress(text: string): string {
        return text
            .replace(/\[.*?\]\s*/g, '')       // Remove [Endereco Principal] etc
            .replace(/CEP:\s*/gi, '')          // Remove "CEP:" prefix
            .replace(/,\s*,/g, ',')            // Remove double commas  
            .replace(/,\s*$/g, '')             // Remove trailing comma
            .replace(/\s+/g, ' ')             // Normalize whitespace
            .trim()
    }

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            const cleaned = cleanAddress(address || '')
            setSearchAddress(cleaned)
            setCoords(initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null)
            setError(null)
            initDoneRef.current = false
            markerRef.current = null
        } else {
            // Clean up map on close
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
                markerRef.current = null
            }
        }
    }, [open, address, initialLat, initialLng])

    function createMarkerIcon() {
        return L.divIcon({
            className: '',
            html: `<div style="
                width: 32px; height: 32px; border-radius: 50% 50% 50% 0;
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                transform: rotate(-45deg);
                display: flex; align-items: center; justify-content: center;
                border: 3px solid white; box-shadow: 0 4px 14px rgba(99,102,241,0.5);
                cursor: grab;
            "><div style="transform: rotate(45deg); color: white; font-weight: 900; font-size: 14px; line-height: 1;">⬤</div></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
        })
    }

    function placeMarker(map: L.Map, lat: number, lng: number) {
        if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng])
        } else {
            const marker = L.marker([lat, lng], {
                icon: createMarkerIcon(),
                draggable: true,
            }).addTo(map)

            marker.on('dragend', () => {
                const pos = marker.getLatLng()
                setCoords({ lat: Number(pos.lat.toFixed(7)), lng: Number(pos.lng.toFixed(7)) })
            })

            markerRef.current = marker
        }

        map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
    }

    // Initialize map after dialog has fully rendered and animated
    useEffect(() => {
        if (!open) {
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.off()
                    mapInstanceRef.current.remove()
                } catch (e) {
                    // Ignore cleanup errors
                }
                mapInstanceRef.current = null
                markerRef.current = null
                initDoneRef.current = false
            }
            return
        }

        const timer = setTimeout(() => {
            if (!mapContainerRef.current || initDoneRef.current) return
            initDoneRef.current = true

            // Force cleanup container to ensure fresh Leaflet instance
            const container = mapContainerRef.current as any // eslint-disable-line @typescript-eslint/no-explicit-any
            delete container._leaflet_id
            container.innerHTML = ''

            const hasCoords = initialLat && initialLng
            const center: [number, number] = hasCoords
                ? [initialLat!, initialLng!]
                : [-14.235, -51.9253] // Brazil center

            const map = L.map(mapContainerRef.current!, {
                center,
                zoom: hasCoords ? 16 : 4,
                zoomControl: true,
                attributionControl: false,
            })

            // Add tile layer with runtime fallback to OSM if provider fails.
            const primaryTileLayer = L.tileLayer(ACTIVE_BASEMAP.url, {
                maxZoom: ACTIVE_BASEMAP.maxZoom,
                attribution: ACTIVE_BASEMAP.attribution,
            }).addTo(map)

            if (ACTIVE_BASEMAP !== MAP_TILE_LAYERS.osm) {
                let switchedToFallback = false
                primaryTileLayer.on('tileerror', () => {
                    if (switchedToFallback) return
                    switchedToFallback = true
                    try {
                        map.removeLayer(primaryTileLayer)
                    } catch {
                        // no-op
                    }
                    L.tileLayer(MAP_TILE_LAYERS.osm.url, {
                        maxZoom: MAP_TILE_LAYERS.osm.maxZoom,
                        attribution: MAP_TILE_LAYERS.osm.attribution,
                    }).addTo(map)
                })
            }

            mapInstanceRef.current = map

            // Force recalculate map size after dialog animation
            setTimeout(() => {
                if (!mapInstanceRef.current) return
                try {
                    mapInstanceRef.current.invalidateSize()
                    if (hasCoords) placeMarker(mapInstanceRef.current, initialLat!, initialLng!)
                } catch (e) {
                    // Ignore _leaflet_pos errors
                }
            }, 150)

            // Another invalidateSize for safety
            setTimeout(() => {
                if (!mapInstanceRef.current) return
                try { mapInstanceRef.current.invalidateSize() } catch (e) {}
            }, 500)

            // Click to place marker
            map.on('click', (e: L.LeafletMouseEvent) => {
                const { lat, lng } = e.latlng
                placeMarker(map, lat, lng)
                setCoords({ lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) })
            })

            // Auto-geocode if no coords and address exists
            if (!hasCoords && address) {
                void doGeocode(cleanAddress(address))
            }
        }, 400) // Wait for dialog open animation

        return () => {
            clearTimeout(timer)
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.off()
                    mapInstanceRef.current.remove()
                } catch (e) {
                    // Ignore cleanup errors
                }
                mapInstanceRef.current = null
                markerRef.current = null
                initDoneRef.current = false
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    async function doGeocode(searchText: string) {
        if (!searchText.trim()) return

        setGeocoding(true)
        setError(null)

        try {
            // Build request body: prefer addressId for caching, fallback to freeform
            const body: Record<string, string> = addressId
                ? { addressId }
                : { address: searchText }

            const response = await fetch('/api/logistics/geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await response.json()

            if (!response.ok || !data.lat) {
                setError(data.error || 'Endereço não encontrado. Ajuste o texto e tente novamente, ou clique no mapa para posicionar manualmente.')
                setGeocoding(false)
                return
            }

            const newCoords = { lat: data.lat, lng: data.lng }
            setCoords(newCoords)

            if (mapInstanceRef.current) {
                placeMarker(mapInstanceRef.current, newCoords.lat, newCoords.lng)
            }
        } catch {
            setError('Erro de conexão ao geocodificar.')
        }

        setGeocoding(false)
    }

    // Manual geocode from search bar (always freeform, ignores addressId)
    function handleManualGeocode() {
        void doGeocode(searchAddress)
    }

    async function handleConfirm() {
        if (!coords) return
        setSaving(true)
        setError(null)
        try {
            await onConfirm(stopId, coords.lat, coords.lng)
            onOpenChange(false)
        } catch {
            setError('Erro ao salvar coordenadas.')
        }
        setSaving(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-5 pb-3">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                            <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <Navigation className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            Geocodificar Parada
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Localize o endereço no mapa. Arraste o marcador para ajustar a posição exata.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-5 space-y-3 flex-1 overflow-y-auto">
                    {/* Customer info */}
                    <div className="rounded-lg border bg-slate-50/80 p-3 flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-black text-xs shrink-0">
                            {customerName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-navy truncate">{customerName}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {cleanAddress(address) || 'Sem endereço cadastrado'}
                            </p>
                        </div>
                    </div>

                    {/* Search bar */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                className="pl-9 h-9 text-sm"
                                placeholder="Pesquisar endereço..."
                                value={searchAddress}
                                onChange={(e) => setSearchAddress(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleManualGeocode()}
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

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Map Container */}
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100" style={{ height: 360 }}>
                        <div
                            ref={mapContainerRef}
                            style={{ height: '100%', width: '100%' }}
                        />
                        {geocoding && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-500">
                                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Geocodificando...
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Coordinates info bar */}
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
                                    Clique no mapa ou busque um endereço
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

                {/* Footer */}
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
                        {saving ? 'Salvando...' : 'Confirmar Localização'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
