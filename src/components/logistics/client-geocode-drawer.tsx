'use client'

import { AlertCircle, CheckCircle2, Crosshair, Loader2, MapPin, Navigation, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ClientMapItem } from './client-map-types'
import type { GeocodeFlowState, LogisticsGeocodeCandidate } from './use-logistics-geocode'

type MapBootState =
    | 'boot_start'
    | 'style_ready'
    | 'render_ready'
    | 'ready'
    | 'map_error'

interface ClientGeocodeDrawerProps {
    open: boolean
    client: ClientMapItem | null
    searchAddress: string
    onSearchAddressChange: (value: string) => void
    onSearch: () => void
    onSelectCandidate: (candidate: LogisticsGeocodeCandidate) => void
    onClose: () => void
    onSave: () => void
    onReinitializeMap: () => void
    geocodeState: GeocodeFlowState
    geocodeError: string | null
    geocodeCandidates: LogisticsGeocodeCandidate[]
    mapBootState: MapBootState
    coords: { lat: number; lng: number } | null
}

function mapBootLabel(state: MapBootState) {
    if (state === 'boot_start') return 'Inicializando mapa...'
    if (state === 'style_ready') return 'Carregando estilo do mapa...'
    if (state === 'render_ready') return 'Renderizando mapa...'
    if (state === 'map_error') return 'Falha ao carregar mapa'
    return 'Mapa pronto'
}

function geocodeStateLabel(state: GeocodeFlowState) {
    if (state === 'resolving_address') return 'Preparando busca...'
    if (state === 'geocoding') return 'Geocodificando...'
    if (state === 'saving') return 'Salvando coordenadas...'
    if (state === 'saved') return 'Coordenadas salvas com sucesso'
    if (state === 'failed') return 'Nao foi possivel completar a operacao'
    if (state === 'map_error') return 'Erro no mapa'
    if (state === 'map_ready') return 'Mapa pronto para ajuste'
    return 'Pronto para geocodificar'
}

export default function ClientGeocodeDrawer({
    open,
    client,
    searchAddress,
    onSearchAddressChange,
    onSearch,
    onSelectCandidate,
    onClose,
    onSave,
    onReinitializeMap,
    geocodeState,
    geocodeError,
    geocodeCandidates,
    mapBootState,
    coords,
}: ClientGeocodeDrawerProps) {
    if (!open || !client) return null

    const isBusy = geocodeState === 'resolving_address' || geocodeState === 'geocoding' || geocodeState === 'saving'
    const canSave = Boolean(coords) && geocodeState !== 'saving'

    return (
        <aside className="absolute inset-x-2 top-2 z-20 sm:inset-x-auto sm:right-3 sm:top-3 sm:w-[360px]">
            <div className="rounded-xl border bg-white/95 shadow-lg backdrop-blur-sm">
                <div className="border-b px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                            <Navigation className="h-3.5 w-3.5" />
                            Geocodificar Cliente
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onClose}>
                            Fechar
                        </Button>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-900">
                        {client.company_name || client.client_name || 'Cliente'}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                        {client.geocode_query || client.primary_address_label || 'Endereco nao informado'}
                    </p>
                </div>

                <div className="space-y-2.5 px-3 py-3">
                    <div className="flex gap-2">
                        <Input
                            className="h-8 text-xs"
                            value={searchAddress}
                            placeholder="Buscar endereco..."
                            onChange={(event) => onSearchAddressChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    onSearch()
                                }
                            }}
                        />
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1.5 px-3 text-xs bg-indigo-600 hover:bg-indigo-700"
                            onClick={onSearch}
                            disabled={isBusy || !searchAddress.trim()}
                        >
                            {geocodeState === 'geocoding' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                            Buscar
                        </Button>
                    </div>

                    {geocodeError ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
                            <div className="inline-flex items-center gap-1.5 font-medium">
                                <AlertCircle className="h-3.5 w-3.5" />
                                {geocodeError}
                            </div>
                        </div>
                    ) : null}

                    <div className="rounded-lg border bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                        <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5">
                                {mapBootState === 'map_error' ? (
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                ) : mapBootState === 'ready' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                                )}
                                {mapBootLabel(mapBootState)}
                            </span>
                            {mapBootState === 'map_error' ? (
                                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={onReinitializeMap}>
                                    <RotateCcw className="h-3 w-3" />
                                </Button>
                            ) : null}
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">
                            {geocodeStateLabel(geocodeState)}
                        </p>
                    </div>

                    <div className="rounded-lg border bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                        {coords ? (
                            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                                <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                Clique no mapa ou arraste o marcador
                            </span>
                        )}
                    </div>

                    {geocodeCandidates.length > 0 ? (
                        <div className="rounded-lg border bg-slate-50/80 px-2.5 py-2">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Sugestoes de endereco
                            </p>
                            <div className="space-y-1">
                                {geocodeCandidates.map((candidate, index) => {
                                    const isActive = (
                                        coords
                                        && Math.abs(coords.lat - candidate.lat) < 0.0000005
                                        && Math.abs(coords.lng - candidate.lng) < 0.0000005
                                    )
                                    return (
                                        <button
                                            key={`${candidate.source}-${candidate.lat}-${candidate.lng}-${index}`}
                                            type="button"
                                            onClick={() => onSelectCandidate(candidate)}
                                            className={`w-full rounded-md border px-2 py-1.5 text-left transition ${
                                                isActive
                                                    ? 'border-indigo-300 bg-indigo-50'
                                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="line-clamp-1 text-[11px] font-medium text-slate-800">
                                                {candidate.label}
                                            </div>
                                            <div className="mt-0.5 text-[10px] text-slate-500">
                                                {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)} · {candidate.source === 'openrouteservice' ? 'ORS' : candidate.source === 'nominatim' ? 'Nominatim' : 'Resolvido'}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={onSave} disabled={!canSave}>
                            {geocodeState === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Salvar coordenadas
                        </Button>
                    </div>
                </div>
            </div>
        </aside>
    )
}
