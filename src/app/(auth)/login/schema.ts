import { z } from 'zod'

export const loginSchema = z.object({
    identifier: z.string().min(1, 'CPF, CNPJ ou e-mail e obrigatorio'),
    password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres'),
})

export type LoginFormData = z.infer<typeof loginSchema>
