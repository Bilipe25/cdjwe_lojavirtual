'use client'

import { useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin } from 'lucide-react'
import { StoreAddressManager } from '@/components/addresses/StoreAddressManager'
import { getMyAddresses, upsertMyAddress, deleteMyAddress } from '../actions'
import type { StoreAddressFormData } from '@/lib/schemas/store-address'

const SESSION_STORE_ID_PLACEHOLDER = 'session-store'

export function ProfileAddressManager() {
    const fetchAddresses = useCallback(() => getMyAddresses(), [])

    const saveAddress = useCallback((data: StoreAddressFormData) => {
        return upsertMyAddress({
            id: data.id,
            title: data.title,
            isMain: data.isMain,
            zipCode: data.zipCode,
            address: data.address,
            number: data.number,
            complement: data.complement,
            neighborhood: data.neighborhood,
            city: data.city,
            state: data.state,
        })
    }, [])

    const removeAddress = useCallback((id: string) => deleteMyAddress(id), [])

    return (
        <Card className="glass-card border-0">
            <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-bronze" />
                    Meus Enderecos
                </CardTitle>
            </CardHeader>
            <CardContent>
                <StoreAddressManager
                    storeId={SESSION_STORE_ID_PLACEHOLDER}
                    fetchAddresses={fetchAddresses}
                    saveAddress={saveAddress}
                    deleteAddress={removeAddress}
                    labels={{
                        sectionTitle: 'Meus enderecos',
                        addButtonLabel: 'Adicionar',
                        emptyStateLabel: 'Voce ainda nao tem enderecos cadastrados.',
                        mainToggleLabel: 'Este e meu endereco principal / faturamento',
                    }}
                />
            </CardContent>
        </Card>
    )
}
