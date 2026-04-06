import { z } from 'zod'

const optionalTrimmedString = z
    .string()
    .optional()
    .transform((value) => {
        const trimmed = (value || '').trim()
        return trimmed.length > 0 ? trimmed : undefined
    })

export const productTaxProfileSchema = z
    .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2, 'Nome obrigatorio'),
        code: z.string().min(2, 'Codigo interno obrigatorio'),
        description: optionalTrimmedString,
        ncm: optionalTrimmedString,
        cest: optionalTrimmedString,
        originCode: z.string().default('0'),
        commercialUnit: optionalTrimmedString,
        taxUnit: optionalTrimmedString,
        eanGtin: optionalTrimmedString,
        taxEanGtin: optionalTrimmedString,
        defaultFiscalDescription: optionalTrimmedString,
        fiscalType: z.string().default('goods'),
        itemType: z.string().default('goods'),
        hasSubstitutionTax: z.boolean().default(false),
        requiresCest: z.boolean().default(false),
        hasIpi: z.boolean().default(false),
        ipiCstOut: optionalTrimmedString,
        ipiEnquadramentoCodigo: optionalTrimmedString,
        pisCst: optionalTrimmedString,
        cofinsCst: optionalTrimmedString,
        pisAliquota: z.preprocess(
            (value) => {
                if (value === '' || value === null || value === undefined) return undefined
                if (typeof value === 'string') {
                    const parsed = Number(value.replace(',', '.'))
                    return Number.isFinite(parsed) ? parsed : undefined
                }
                if (typeof value === 'number') return value
                return undefined
            },
            z.number().min(0, 'Aliquota invalida').optional()
        ),
        cofinsAliquota: z.preprocess(
            (value) => {
                if (value === '' || value === null || value === undefined) return undefined
                if (typeof value === 'string') {
                    const parsed = Number(value.replace(',', '.'))
                    return Number.isFinite(parsed) ? parsed : undefined
                }
                if (typeof value === 'number') return value
                return undefined
            },
            z.number().min(0, 'Aliquota invalida').optional()
        ),
        defaultOutputCfop: optionalTrimmedString,
        defaultInputCfop: optionalTrimmedString,
        internalFiscalCode: optionalTrimmedString,
        defaultFiscalNotes: optionalTrimmedString,
        isActive: z.boolean().default(true),
        requiresTaxConfiguration: z.boolean().default(true),
    })
    .superRefine((value, ctx) => {
        const ncmDigits = (value.ncm || '').replace(/\D/g, '')
        const cestDigits = (value.cest || '').replace(/\D/g, '')
        const outCfopDigits = (value.defaultOutputCfop || '').replace(/\D/g, '')
        const inCfopDigits = (value.defaultInputCfop || '').replace(/\D/g, '')

        if (value.requiresTaxConfiguration && ncmDigits.length !== 8) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ncm'],
                message: 'NCM deve ter 8 digitos quando o perfil exige configuracao fiscal.',
            })
        }

        if (value.requiresCest && cestDigits.length !== 7) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cest'],
                message: 'CEST deve ter 7 digitos quando obrigatorio.',
            })
        }

        if (value.hasSubstitutionTax && !value.requiresCest) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['requiresCest'],
                message: 'Substituicao tributaria exige CEST.',
            })
        }

        if (value.hasIpi && !(value.ipiCstOut || '').trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ipiCstOut'],
                message: 'Informe CST de IPI quando IPI estiver ativo.',
            })
        }

        if (value.defaultOutputCfop && outCfopDigits.length !== 4) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['defaultOutputCfop'],
                message: 'CFOP de saida deve ter 4 digitos.',
            })
        }

        if (value.defaultInputCfop && inCfopDigits.length !== 4) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['defaultInputCfop'],
                message: 'CFOP de entrada deve ter 4 digitos.',
            })
        }
    })

export type ProductTaxProfileFormData = z.infer<typeof productTaxProfileSchema>

