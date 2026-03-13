import { z } from 'zod';

// Schema for creating a new customer (admin)
export const customerSchema = z.object({
    fullName: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail inválido'),
    phone: z.string().optional(),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    // Store fields
    companyName: z.string().min(2, 'A Razão Social deve ter no mínimo 2 caracteres').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ inválido (mínimo 14 caracteres)'),
    customerTypeId: z.string().optional(),
    representativeId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    // Legacy Address fields (kept optional for fallback, will prioritize store_addresses)
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

// Schema for editing an existing customer (admin)
export const customerEditSchema = z.object({
    fullName: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail inválido'),
    phone: z.string().optional(),
    // Store fields
    companyName: z.string().min(2, 'A Razão Social deve ter no mínimo 2 caracteres').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ inválido (mínimo 14 caracteres)'),
    customerTypeId: z.string().optional(),
    representativeId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    // Legacy Address fields
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
});

export type CustomerEditFormData = z.infer<typeof customerEditSchema>;

// Schema for creating/editing a store address
export const storeAddressSchema = z.object({
    id: z.string().optional(),
    storeId: z.string(),
    title: z.string().min(2, 'Título deve ter no mínimo 2 caracteres').max(100, 'Título muito longo'),
    isMain: z.boolean().default(false),
    zipCode: z.string().min(8, 'CEP inválido'),
    address: z.string().min(3, 'Endereço muito curto'),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().min(2, 'Cidade inválida'),
    state: z.string().length(2, 'Use a sigla do estado (ex: SP)'),
});

export type StoreAddressFormData = z.infer<typeof storeAddressSchema>;
