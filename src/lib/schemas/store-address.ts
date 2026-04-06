import { z } from 'zod'
import type { StoreAddress } from '@/lib/types'

export const storeAddressSchema = z.object({
    id: z.string().optional(),
    storeId: z.string(),
    title: z.string().min(2, 'Titulo deve ter no minimo 2 caracteres').max(100, 'Titulo muito longo'),
    isMain: z.boolean(),
    zipCode: z.string().min(8, 'CEP invalido'),
    address: z.string().min(3, 'Endereco muito curto'),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().min(2, 'Cidade invalida'),
    state: z.string().length(2, 'Use a sigla do estado (ex: SP)'),
    municipalityCode: z.string().optional(),
    countryCode: z.string().optional(),
})

export type StoreAddressFormData = z.infer<typeof storeAddressSchema>

export function toStoreAddressFormData(address: StoreAddress, fallbackStoreId: string): StoreAddressFormData {
    return {
        id: address.id,
        storeId: address.store_id || fallbackStoreId,
        title: address.title,
        isMain: address.is_main,
        zipCode: address.zip_code,
        address: address.address,
        number: address.number || '',
        complement: address.complement || '',
        neighborhood: address.neighborhood || '',
        city: address.city,
        state: address.state,
        municipalityCode: address.municipality_code || '',
        countryCode: address.country_code || '',
    }
}

export function createEmptyStoreAddressFormData(storeId: string, isMain: boolean): StoreAddressFormData {
    return {
        storeId,
        title: '',
        isMain,
        zipCode: '',
        address: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        municipalityCode: '',
        countryCode: '1058',
    }
}
