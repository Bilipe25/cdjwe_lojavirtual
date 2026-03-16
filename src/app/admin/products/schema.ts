import { z } from 'zod'

export const productSchema = z.object({
    name: z.string().min(1, 'O nome do produto e obrigatorio'),
    description: z.string().optional(),
    category_id: z.string().min(1, 'A categoria e obrigatoria'),
    size: z.string().optional(),
    base_price: z.preprocess(
        (value) => {
            if (typeof value === 'string') {
                const parsed = parseFloat(value.replace(',', '.'))
                return Number.isNaN(parsed) ? 0 : parsed
            }
            if (typeof value === 'number') return value
            return 0
        },
        z.number({ message: 'Preco invalido' }).min(0, 'O preco deve ser maior ou igual a zero')
    ),
    is_active: z.boolean().default(true),
    is_featured: z.boolean().default(false),
})

export type ProductFormData = z.infer<typeof productSchema>
