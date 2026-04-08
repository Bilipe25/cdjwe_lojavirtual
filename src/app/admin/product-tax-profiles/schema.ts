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
        ncmReferenceId: z.string().uuid().optional(),
        ncmVersionId: z.string().uuid().optional(),
        tipiReferenceId: z.string().uuid().optional(),
        tipiVersionId: z.string().uuid().optional(),
        cestReferenceId: z.string().uuid().optional(),
        cestVersionId: z.string().uuid().optional(),
        defaultOutputCfopReferenceId: z.string().uuid().optional(),
        defaultOutputCfopVersionId: z.string().uuid().optional(),
        defaultInputCfopReferenceId: z.string().uuid().optional(),
        defaultInputCfopVersionId: z.string().uuid().optional(),
        icmsBaseId: z.string().uuid().optional(),
        ibscbsBaseId: z.string().uuid().optional(),
        ibscbsVersionId: z.string().uuid().optional(),
        fiscalReferenceSnapshot: z.record(z.string(), z.unknown()).optional(),
    })
    .superRefine((value, ctx) => {
        const ncmDigits = (value.ncm || '').replace(/\D/g, '')
        const cestDigits = (value.cest || '').replace(/\D/g, '')
        const outCfopDigits = (value.defaultOutputCfop || '').replace(/\D/g, '')
        const inCfopDigits = (value.defaultInputCfop || '').replace(/\D/g, '')
        const hasNcmReference = Boolean(value.ncmReferenceId)
        const hasCestReference = Boolean(value.cestReferenceId)
        const hasOutputCfopReference = Boolean(value.defaultOutputCfopReferenceId)
        const hasInputCfopReference = Boolean(value.defaultInputCfopReferenceId)

        if (value.requiresTaxConfiguration && !hasNcmReference && ncmDigits.length !== 8) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ncm'],
                message: 'Selecione um NCM da base fiscal ou informe um NCM de 8 digitos.',
            })
        }

        const referencePairs = [
            ['ncmReferenceId', 'ncmVersionId', 'NCM'],
            ['tipiReferenceId', 'tipiVersionId', 'TIPI'],
            ['cestReferenceId', 'cestVersionId', 'CEST'],
            ['defaultOutputCfopReferenceId', 'defaultOutputCfopVersionId', 'CFOP de saida'],
            ['defaultInputCfopReferenceId', 'defaultInputCfopVersionId', 'CFOP de entrada'],
        ] as const

        referencePairs.forEach(([referenceKey, versionKey, label]) => {
            const hasReference = Boolean(value[referenceKey])
            const hasVersion = Boolean(value[versionKey])
            if (hasReference !== hasVersion) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [versionKey],
                    message: `${label} precisa manter referencia e versao sincronizadas.`,
                })
            }
        })

        const hasIbscbsBase = Boolean(value.ibscbsBaseId)
        const hasIbscbsVersion = Boolean(value.ibscbsVersionId)
        if (hasIbscbsBase !== hasIbscbsVersion) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ibscbsVersionId'],
                message: 'Base e versao de IBS/CBS precisam permanecer sincronizadas.',
            })
        }

        if (value.requiresCest && !hasCestReference && cestDigits.length !== 7) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cest'],
                message: 'Selecione um CEST da base fiscal ou informe um CEST de 7 digitos.',
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

        if (value.defaultOutputCfop && !hasOutputCfopReference && outCfopDigits.length !== 4) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['defaultOutputCfop'],
                message: 'CFOP de saida deve ter 4 digitos.',
            })
        }

        if (value.defaultInputCfop && !hasInputCfopReference && inCfopDigits.length !== 4) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['defaultInputCfop'],
                message: 'CFOP de entrada deve ter 4 digitos.',
            })
        }
    })

export type ProductTaxProfileFormData = z.infer<typeof productTaxProfileSchema>
