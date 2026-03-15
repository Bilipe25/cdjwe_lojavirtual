'use client'

import { useCallback } from 'react'
import { StoreAddressManager } from '@/components/addresses/StoreAddressManager'
import { getStoreAddresses, upsertStoreAddress, deleteStoreAddress } from '../actions'
import type { StoreAddressFormData } from '@/lib/schemas/store-address'

interface CustomerAddressManagerProps {
    storeId: string
}

export function CustomerAddressManager({ storeId }: CustomerAddressManagerProps) {
    const fetchAddresses = useCallback(() => getStoreAddresses(storeId), [storeId])

    const saveAddress = useCallback((data: StoreAddressFormData) => upsertStoreAddress(data), [])

    const removeAddress = useCallback((id: string) => deleteStoreAddress(id), [])

    return (
        <StoreAddressManager
            storeId={storeId}
            fetchAddresses={fetchAddresses}
            saveAddress={saveAddress}
            deleteAddress={removeAddress}
            labels={{
                sectionTitle: 'Enderecos da loja',
                addButtonLabel: 'Novo endereco',
                emptyStateLabel: 'Nenhum endereco cadastrado.',
                mainToggleLabel: 'Este e o endereco principal / faturamento',
            }}
        />
    )
}
