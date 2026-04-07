'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'
import { cn } from '@/lib/utils'

interface FiscalAutocompleteFieldProps {
    label: string
    placeholder: string
    value: FiscalSearchOption | null
    options: FiscalSearchOption[]
    loading?: boolean
    emptyText?: string
    onSearch: (query: string) => void
    onSelect: (option: FiscalSearchOption) => void
    onClear?: () => void
}

export function FiscalAutocompleteField({
    label,
    placeholder,
    value,
    options,
    loading = false,
    emptyText = 'Nenhum resultado encontrado.',
    onSearch,
    onSelect,
    onClear,
}: FiscalAutocompleteFieldProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')

    useEffect(() => {
        if (!open) return
        onSearch(query)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, query])

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <div className="flex gap-2">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger
                        className={cn(
                            buttonVariants({ variant: 'outline' }),
                            'w-full justify-between font-normal'
                        )}
                    >
                        <span className="truncate text-left">
                            {value ? `${value.code} - ${value.description}` : placeholder}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] max-w-[90vw] p-0" align="start">
                        <Command>
                            <CommandInput
                                value={query}
                                onValueChange={setQuery}
                                placeholder={`Buscar ${label.toLowerCase()}...`}
                            />
                            <CommandList>
                                <CommandEmpty>{loading ? 'Buscando...' : emptyText}</CommandEmpty>
                                <CommandGroup>
                                    {options.map((option) => (
                                        <CommandItem
                                            key={option.id}
                                            value={`${option.code} ${option.description}`}
                                            onSelect={() => {
                                                onSelect(option)
                                                setOpen(false)
                                            }}
                                        >
                                            <div className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate font-medium">{option.code}</span>
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {option.description}
                                                    {option.secondaryText ? ` - ${option.secondaryText}` : ''}
                                                </span>
                                            </div>
                                            {value?.id === option.id ? (
                                                <Check className="h-4 w-4 text-emerald-600" />
                                            ) : null}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                {loading ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : null}
                {value && onClear ? (
                    <Button type="button" variant="outline" size="icon" onClick={onClear}>
                        <X className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>
        </div>
    )
}
