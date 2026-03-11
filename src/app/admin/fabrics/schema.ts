import { z } from 'zod'

// ==================== ZOD SCHEMAS ====================

export const fabricSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'O nome é obrigatório').max(100, 'Nome muito longo'),
  description: z.string().nullable().optional(),
  price_modifier: z.number().min(0, 'Valor não pode ser negativo'),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean(),
})

export type FabricFormData = z.infer<typeof fabricSchema>

export const fabricColorSchema = z.object({
  id: z.string().optional(),
  fabric_id: z.string(),
  name: z.string().min(1, 'A cor deve ter um nome').max(100, 'Nome muito longo'),
  hex_code: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean(),
})

export type FabricColorFormData = z.infer<typeof fabricColorSchema>
