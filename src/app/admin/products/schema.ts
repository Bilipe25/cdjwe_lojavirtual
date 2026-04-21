import { z } from 'zod'

export const productSchema = z.object({
    name: z.string().min(1, 'O nome do produto e obrigatorio'),
    description: z.string().optional(),
    manufacturer_name: z.string().optional(),
    category_id: z.string().min(1, 'A categoria e obrigatoria'),
    tax_profile_id: z.string().uuid('Perfil tributario invalido').optional().or(z.literal('')),
    size: z.string().optional(),
    has_size_variants: z.boolean().default(false),
    size_options: z
        .array(
            z.object({
                id: z.string().uuid().optional(),
                name: z.string().min(1, 'Informe o nome do tamanho'),
                price_mode: z.enum(['absolute', 'delta']).default('delta'),
                price_value: z.preprocess(
                    (value) => {
                        if (typeof value === 'string') {
                            const parsed = parseFloat(value.replace(',', '.'))
                            return Number.isNaN(parsed) ? 0 : parsed
                        }
                        if (typeof value === 'number') return value
                        return 0
                    },
                    z
                        .number({ message: 'Preco invalido' })
                        .min(0, 'Preco deve ser maior ou igual a zero')
                ),
                is_active: z.boolean().default(true),
                sort_order: z.number().int().default(0),
                is_default: z.boolean().default(false),
            })
        )
        .default([]),
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
