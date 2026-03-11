import { z } from 'zod';

export const customerSchema = z.object({
    fullName: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail inválido'),
    phone: z.string().optional(),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    // Store fields
    companyName: z.string().min(2, 'A Razão Social deve ter no mínimo 2 caracteres').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ inválido (mínimo 14 caracteres)') // Simplified for now, can apply regex later
});

export type CustomerFormData = z.infer<typeof customerSchema>;
