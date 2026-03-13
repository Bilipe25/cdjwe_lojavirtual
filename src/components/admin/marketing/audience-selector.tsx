'use client'

import { useState, useEffect } from 'react'
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
}

interface AudienceSelectorProps {
    value: 'all' | 'segment'
    segmentData: TargetSegment
    onChangeValue: (val: 'all' | 'segment') => void
    onChangeSegment: (segment: TargetSegment) => void
}

export function AudienceSelector({ value, segmentData, onChangeValue, onChangeSegment }: AudienceSelectorProps) {
    const [availableStates, setAvailableStates] = useState<string[]>([])
    const [availableCities, setAvailableCities] = useState<string[]>([])
    
    const [openState, setOpenState] = useState(false)
    const [openCity, setOpenCity] = useState(false)

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

    const toggleState = (state: string) => {
        const current = new Set(segmentData.states)
        if (current.has(state)) {
            current.delete(state)
        } else {
            current.add(state)
        }
        
        const newStates = Array.from(current)
        onChangeSegment({
            states: newStates,
            // Automatically clear cities if their state was unselected
            cities: segmentData.cities.filter(c => availableCities.includes(c)) // simplified cleanup handled by backend or next render
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

    const removeState = (state: string) => toggleState(state)
    const removeCity = (city: string) => toggleCity(city)

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
                    Segmentar por Região
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
        </div>
    )
}
