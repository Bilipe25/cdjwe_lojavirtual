'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'

export type TargetSegment = {
    states: string[]
    cities: string[]
    clientIds: string[]
}

interface AudienceSelectorProps {
    value: 'all' | 'segment' | 'specific'
    segmentData: TargetSegment
    onChangeValue: (val: 'all' | 'segment' | 'specific') => void
    onChangeSegment: (segment: TargetSegment) => void
}

type AudienceClient = {
    id: string
    name: string
    email: string
}

export function AudienceSelector({ value, segmentData, onChangeValue, onChangeSegment }: AudienceSelectorProps) {
    const [availableStates, setAvailableStates] = useState<string[]>([])
    const [availableCities, setAvailableCities] = useState<string[]>([])
    const [availableClients, setAvailableClients] = useState<AudienceClient[]>([])

    const [clientSearch, setClientSearch] = useState('')
    const [clientPage, setClientPage] = useState(1)
    const [clientHasMore, setClientHasMore] = useState(false)
    const [clientLoading, setClientLoading] = useState(false)
    const [clientError, setClientError] = useState<string | null>(null)

    const [openState, setOpenState] = useState(false)
    const [openCity, setOpenCity] = useState(false)
    const [openClient, setOpenClient] = useState(false)

    useEffect(() => {
        loadLocations()
    }, [])

    useEffect(() => {
        if (segmentData.states.length > 0) {
            loadCitiesForStates(segmentData.states)
        } else {
            setAvailableCities([])
        }
    }, [segmentData.states])

    const loadLocations = async () => {
        const supabase = createClient()
        // Distinct states from stores
        const { data } = await supabase.from('stores').select('state').not('state', 'is', null)
        if (data) {
            const states = Array.from(new Set(data.map(d => d.state))).filter(Boolean) as string[]
            setAvailableStates(states.sort())
        }
    }

    const loadCitiesForStates = async (states: string[]) => {
        const supabase = createClient()
        const { data } = await supabase.from('stores').select('city').in('state', states).not('city', 'is', null)
        if (data) {
            const cities = Array.from(new Set(data.map(d => d.city))).filter(Boolean) as string[]
            setAvailableCities(cities.sort())
        }
    }

    const loadClients = useCallback(async (page: number, query: string, reset = false) => {
        try {
            setClientLoading(true)
            setClientError(null)

            const params = new URLSearchParams({
                page: String(page),
                pageSize: '20',
            })

            if (query.trim()) {
                params.set('q', query.trim())
            }

            const response = await fetch(`/api/marketing/audience/clients?${params.toString()}`)
            const payload = await response.json()

            if (!response.ok) {
                throw new Error(payload.error || 'Falha ao carregar clientes.')
            }

            const clients = (payload.clients || []) as AudienceClient[]
            setAvailableClients((prev) => {
                if (reset) return clients
                const merged = [...prev, ...clients]
                const dedup = new Map(merged.map((client) => [client.id, client]))
                return Array.from(dedup.values())
            })
            setClientHasMore(Boolean(payload.pagination?.hasMore))
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Falha ao carregar clientes.'
            setClientError(message)
            if (reset) {
                setAvailableClients([])
                setClientHasMore(false)
            }
        } finally {
            setClientLoading(false)
        }
    }, [])

    useEffect(() => {
        if (value !== 'specific') return
        const timer = setTimeout(() => {
            setClientPage(1)
            void loadClients(1, clientSearch, true)
        }, 250)

        return () => clearTimeout(timer)
    }, [clientSearch, value, loadClients])

    useEffect(() => {
        if (value !== 'specific') return
        if (openClient && availableClients.length === 0 && !clientLoading) {
            setClientPage(1)
            void loadClients(1, clientSearch, true)
        }
    }, [openClient, value, availableClients.length, clientLoading, clientSearch, loadClients])

    const toggleState = (state: string) => {
        const current = new Set(segmentData.states)
        if (current.has(state)) {
            current.delete(state)
        } else {
            current.add(state)
        }
        
        const newStates = Array.from(current)
        onChangeSegment({
            ...segmentData,
            states: newStates,
            // Automatically clear cities if their state was unselected
            cities: segmentData.cities.filter(c => availableCities.includes(c))
        })
    }

    const toggleCity = (city: string) => {
        const current = new Set(segmentData.cities)
        if (current.has(city)) {
            current.delete(city)
        } else {
            current.add(city)
        }
        onChangeSegment({
            ...segmentData,
            cities: Array.from(current)
        })
    }

    const toggleClient = (clientId: string) => {
        const current = new Set(segmentData.clientIds || [])
        if (current.has(clientId)) {
            current.delete(clientId)
        } else {
            current.add(clientId)
        }
        onChangeSegment({
            ...segmentData,
            clientIds: Array.from(current)
        })
    }

    const removeState = (state: string) => toggleState(state)
    const removeCity = (city: string) => toggleCity(city)
    const removeClient = (clientId: string) => toggleClient(clientId)
    const selectedClientsById = useMemo(
        () => new Map(availableClients.map((client) => [client.id, client])),
        [availableClients],
    )

    const handleLoadMoreClients = async () => {
        if (!clientHasMore || clientLoading) return
        const nextPage = clientPage + 1
        setClientPage(nextPage)
        await loadClients(nextPage, clientSearch, false)
    }

    return (
        <div className="space-y-4">
            <label className="text-sm font-medium block">Público Alvo</label>
            <div className="flex gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => onChangeValue('all')}
                    className={cn(
                        "flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-center",
                        value === 'all'
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:bg-slate-50"
                    )}
                >
                    Todos os Clientes
                </button>
                <button
                    type="button"
                    onClick={() => onChangeValue('segment')}
                    className={cn(
                        "flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-center",
                        value === 'segment'
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:bg-slate-50"
                    )}
                >
                    Região
                </button>
                <button
                    type="button"
                    onClick={() => onChangeValue('specific')}
                    className={cn(
                        "flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-center",
                        value === 'specific'
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:bg-slate-50"
                    )}
                >
                    Clientes Específicos
                </button>
            </div>

            {value === 'segment' && (
                <div className="p-4 rounded-xl border bg-slate-50/50 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    {/* States Selector */}
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                            Filtrar por Estados (UF)
                        </label>
                        <Popover open={openState} onOpenChange={setOpenState}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openState}
                                    className="w-full justify-between bg-white"
                                >
                                    Selecionar Estados...
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                                <Command>
                                    <CommandInput placeholder="Buscar estado..." />
                                    <CommandEmpty>Nenhum estado encontrado.</CommandEmpty>
                                    <CommandGroup className="max-h-60 overflow-y-auto">
                                        {availableStates.map((state) => (
                                            <CommandItem
                                                key={state}
                                                onSelect={() => toggleState(state)}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        segmentData.states.includes(state) ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {state}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        {/* Selected States Badges */}
                        {segmentData.states.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {segmentData.states.map(state => (
                                    <Badge key={state} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                                        {state}
                                        <button onClick={() => removeState(state)} className="rounded-full hover:bg-muted p-0.5">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cities Selector (Only if a state is selected) */}
                    {segmentData.states.length > 0 && (
                        <div className="pt-2 border-t">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                                Refinar por Cidades (Opcional)
                            </label>
                            <Popover open={openCity} onOpenChange={setOpenCity}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openCity}
                                        className="w-full justify-between bg-white"
                                    >
                                        Selecionar Cidades específicas...
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0">
                                    <Command>
                                        <CommandInput placeholder="Buscar cidade..." />
                                        <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
                                        <CommandGroup className="max-h-60 overflow-y-auto">
                                            {availableCities.map((city) => (
                                                <CommandItem
                                                    key={city}
                                                    onSelect={() => toggleCity(city)}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            segmentData.cities.includes(city) ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {city}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </Command>
                                </PopoverContent>
                            </Popover>

                            {/* Selected Cities Badges */}
                            {segmentData.cities.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {segmentData.cities.map(city => (
                                        <Badge key={city} variant="outline" className="pl-2 pr-1 py-1 gap-1 border-blue-200 bg-blue-50 text-blue-700">
                                            {city}
                                            <button onClick={() => removeCity(city)} className="rounded-full hover:bg-blue-100 p-0.5">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-2">
                                Se nenhuma cidade for selecionada, a campanha será enviada para o estado inteiro.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {value === 'specific' && (
                <div className="p-4 rounded-xl border bg-slate-50/50 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                            Buscar e Selecionar Clientes
                        </label>
                        <Popover open={openClient} onOpenChange={setOpenClient}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openClient}
                                    className="w-full justify-between bg-white text-left font-normal"
                                >
                                    Selecione os clientes...
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                                <Command>
                                    <CommandInput
                                        placeholder="Buscar por nome ou email..."
                                        value={clientSearch}
                                        onValueChange={setClientSearch}
                                    />
                                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                                    <CommandGroup className="max-h-60 overflow-y-auto">
                                        {availableClients.map((client) => {
                                            const isSelected = (segmentData.clientIds || []).includes(client.id)
                                            return (
                                                <CommandItem
                                                    key={client.id}
                                                    onSelect={() => toggleClient(client.id)}
                                                    value={`${client.name} ${client.email}`} // for better searching
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4 shrink-0",
                                                            isSelected ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span>{client.name}</span>
                                                        <span className="text-xs text-muted-foreground">{client.email}</span>
                                                    </div>
                                                </CommandItem>
                                            )
                                        })}
                                    </CommandGroup>
                                    {clientError && (
                                        <div className="px-3 py-2 text-xs text-destructive border-t">
                                            {clientError}
                                        </div>
                                    )}
                                    {clientLoading && (
                                        <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                                            Carregando clientes...
                                        </div>
                                    )}
                                    {!clientLoading && clientHasMore && (
                                        <div className="p-2 border-t">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => void handleLoadMoreClients()}
                                                className="w-full"
                                            >
                                                Carregar mais clientes
                                            </Button>
                                        </div>
                                    )}
                                </Command>
                            </PopoverContent>
                        </Popover>

                        {/* Selected Clients Badges */}
                        {(segmentData.clientIds || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {(segmentData.clientIds || []).map(clientId => {
                                    const client = selectedClientsById.get(clientId)
                                    return (
                                        <Badge key={clientId} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                                            <span className="truncate max-w-[150px]">{client?.name || 'Cliente selecionado'}</span>
                                            <button onClick={() => removeClient(clientId)} className="rounded-full hover:bg-muted p-0.5">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
