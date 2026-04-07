'use client'

import { FiscalAutocompleteField } from '@/app/admin/fiscal-bases/components/FiscalAutocompleteField'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'

interface TaxProfileNcmSelectorProps {
    value: FiscalSearchOption | null
    options: FiscalSearchOption[]
    loading?: boolean
    onSearch: (query: string) => void
    onSelect: (option: FiscalSearchOption) => void
    onClear: () => void
}

export function TaxProfileNcmSelector(props: TaxProfileNcmSelectorProps) {
    return (
        <FiscalAutocompleteField
            label="NCM"
            placeholder="Selecione um NCM da base fiscal"
            emptyText="Nenhum NCM encontrado."
            {...props}
        />
    )
}
