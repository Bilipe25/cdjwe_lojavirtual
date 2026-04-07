'use client'

import { FiscalAutocompleteField } from '@/app/admin/fiscal-bases/components/FiscalAutocompleteField'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'

interface TaxProfileCestSelectorProps {
    value: FiscalSearchOption | null
    options: FiscalSearchOption[]
    loading?: boolean
    onSearch: (query: string) => void
    onSelect: (option: FiscalSearchOption) => void
    onClear: () => void
}

export function TaxProfileCestSelector(props: TaxProfileCestSelectorProps) {
    return (
        <FiscalAutocompleteField
            label="CEST"
            placeholder="Selecione um CEST da base fiscal"
            emptyText="Nenhum CEST encontrado."
            {...props}
        />
    )
}
