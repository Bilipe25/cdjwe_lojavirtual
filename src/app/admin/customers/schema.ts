import { z } from 'zod'
export { storeAddressSchema, type StoreAddressFormData } from '@/lib/schemas/store-address'

// Schema for creating a new customer (admin)
export const customerSchema = z.object({
    fullName: z.string().min(2, 'O nome deve ter no minimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail invalido'),
    phone: z.string().optional(),
    password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres'),
    companyName: z.string().min(2, 'A Razao Social deve ter no minimo 2 caracteres').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ invalido (minimo 14 caracteres)'),
    customerTypeId: z.string().optional(),
    representativeId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    // Legacy address fields (optional fallback)
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
})

export type CustomerFormData = z.infer<typeof customerSchema>

// Schema for editing an existing customer (admin)
export const customerEditSchema = z.object({
    fullName: z.string().min(2, 'O nome deve ter no minimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail invalido'),
    phone: z.string().optional(),
    companyName: z.string().min(2, 'A Razao Social deve ter no minimo 2 caracteres').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ invalido (minimo 14 caracteres)'),
    customerTypeId: z.string().optional(),
    representativeId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
})

export type CustomerEditFormData = z.infer<typeof customerEditSchema>
