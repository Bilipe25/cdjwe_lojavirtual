'use client'

import { FiscalAutocompleteField } from '@/app/admin/fiscal-bases/components/FiscalAutocompleteField'
import type { CfopConfigSearchOption } from '@/app/admin/actions/cfop-configs'

interface TaxProfileCfopConfigSelectorProps {
    label: string
    value: CfopConfigSearchOption | null
    options: CfopConfigSearchOption[]
    loading?: boolean
    onSearch: (query: string) => void
    onSelect: (option: CfopConfigSearchOption) => void
    onClear: () => void
}

export function TaxProfileCfopConfigSelector({
    label,
    ...props
}: TaxProfileCfopConfigSelectorProps) {
    return (
        <FiscalAutocompleteField
            label={label}
            placeholder="Selecione um CFOP configurado"
            emptyText="Nenhum CFOP configurado e elegivel foi encontrado."
            {...props}
        />
    )
}

