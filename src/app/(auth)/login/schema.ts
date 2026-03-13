import { z } from 'zod';

export const loginSchema = z.object({
    identifier: z.string().min(1, 'E-mail, CNPJ ou Razão Social é obrigatório'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
