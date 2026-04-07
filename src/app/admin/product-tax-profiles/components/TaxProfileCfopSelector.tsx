'use client'

import { FiscalAutocompleteField } from '@/app/admin/fiscal-bases/components/FiscalAutocompleteField'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'

interface TaxProfileCfopSelectorProps {
    label: string
    value: FiscalSearchOption | null
    options: FiscalSearchOption[]
    loading?: boolean
    onSearch: (query: string) => void
    onSelect: (option: FiscalSearchOption) => void
    onClear: () => void
}

export function TaxProfileCfopSelector({
    label,
    ...props
}: TaxProfileCfopSelectorProps) {
    return (
        <FiscalAutocompleteField
            label={label}
            placeholder="Selecione um CFOP da base fiscal"
            emptyText="Nenhum CFOP encontrado."
            {...props}
        />
    )
}
