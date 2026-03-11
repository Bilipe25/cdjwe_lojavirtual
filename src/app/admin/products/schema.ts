import { z } from "zod";

export const productSchema = z.object({
    name: z.string().min(1, "O nome do produto é obrigatório"),
    description: z.string().optional(),
    category_id: z.string().min(1, "A categoria é obrigatória"),
    size: z.string().optional(),
    base_price: z.preprocess(
        (val) => {
            if (typeof val === 'string') {
                const parsed = parseFloat(val.replace(',', '.'));
                return isNaN(parsed) ? 0 : parsed;
            }
            if (typeof val === 'number') return val;
            return 0;
        },
        z.number({ message: "Preço inválido" }).min(0, "O preço deve ser maior ou igual a zero")
    ),
    is_active: z.boolean().default(true),
    is_featured: z.boolean().default(false),
});

export type ProductFormData = z.infer<typeof productSchema>;
