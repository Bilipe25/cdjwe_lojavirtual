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
    // Address fields
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
    // Address fields
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
});

export type CustomerEditFormData = z.infer<typeof customerEditSchema>;
