import { z } from 'zod'

const optionalTrimmedString = z
    .preprocess((value) => (value === null ? undefined : value), z.string().optional())
    .transform((value) => {
        const trimmed = (value || '').trim()
        return trimmed.length > 0 ? trimmed : undefined
    })

const optionalUuid = z
    .preprocess((value) => (value === null ? undefined : value), z.string().optional())
    .transform((value) => {
        const trimmed = (value || '').trim()
        return trimmed.length > 0 ? trimmed : undefined
    })
    .refine((value) => value === undefined || z.string().uuid().safeParse(value).success, 'Identificador invalido')

const optionalJsonRecord = z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .transform((value) => value ?? undefined)

const optionalNonNegativeNumber = (message: string) =>
    z.preprocess(
        (value) => {
            if (value === '' || value === null || value === undefined) return undefined
            if (typeof value === 'string') {
                const parsed = Number(value.replace(',', '.'))
                return Number.isFinite(parsed) ? parsed : undefined
            }
            if (typeof value === 'number') return value
            return undefined
        },
        z.number().min(0, message).optional()
    )

const productTaxProfileRuleSchema = z
    .object({
        id: optionalUuid,
        ruleName: z.string().min(2, 'Nome da regra obrigatorio'),
        operationDirection: z.enum(['outbound', 'inbound']),
        originUf: optionalTrimmedString,
        destinationUf: optionalTrimmedString,
        customerTypeId: optionalUuid,
        personType: z.enum(['individual', 'legal_entity']).optional().nullable(),
        taxpayerIndicator: z.enum(['contributor', 'non_contributor', 'exempt']).optional().nullable(),
        cfopOverride: optionalTrimmedString,
        cfopConfigId: optionalUuid,
        cfopReferenceId: optionalUuid,
        cfopVersionId: optionalUuid,
        priority: z.number().int().min(0, 'Prioridade invalida').default(0),
        isActive: z.boolean().default(true),
        effectiveFrom: optionalTrimmedString,
        effectiveTo: optionalTrimmedString,
        rulePayload: optionalJsonRecord,
        futureTaxPayload: optionalJsonRecord,
        cfopConfigSnapshot: z
            .object({
                config_id: optionalUuid,
                reference_id: optionalUuid,
                version_id: optionalUuid,
                code: optionalTrimmedString,
                description: optionalTrimmedString,
                operation_direction: z.enum(['outbound', 'inbound', 'both']).optional(),
                operation_group: optionalTrimmedString,
                operation_scope: optionalTrimmedString,
                configuration_status: optionalTrimmedString,
                supports_st: z.boolean().optional(),
                impacts_icms: z.boolean().optional(),
                impacts_ibscbs: z.boolean().optional(),
                is_active: z.boolean().optional(),
            })
            .nullable()
            .optional(),
    })
    .superRefine((value, ctx) => {
        if (value.originUf && !/^[A-Z]{2}$/i.test(value.originUf)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['originUf'],
                message: 'UF de origem invalida.',
            })
        }

        if (value.destinationUf && !/^[A-Z]{2}$/i.test(value.destinationUf)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['destinationUf'],
                message: 'UF de destino invalida.',
            })
        }

        if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['effectiveTo'],
                message: 'A vigencia final deve ser igual ou posterior a vigencia inicial.',
            })
        }
    })

export const productTaxProfileSchema = z
    .object({
        id: optionalUuid,
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
        pisAliquota: optionalNonNegativeNumber('Aliquota invalida'),
        cofinsAliquota: optionalNonNegativeNumber('Aliquota invalida'),
        pisUnitRate: optionalNonNegativeNumber('Aliquota por unidade invalida'),
        cofinsUnitRate: optionalNonNegativeNumber('Aliquota por unidade invalida'),
        approxTaxRatePercent: optionalNonNegativeNumber('Percentual aproximado invalido'),
        defaultOutputCfop: optionalTrimmedString,
        defaultInputCfop: optionalTrimmedString,
        internalFiscalCode: optionalTrimmedString,
        defaultFiscalNotes: optionalTrimmedString,
        isActive: z.boolean().default(true),
        requiresTaxConfiguration: z.boolean().default(true),
        ncmReferenceId: optionalUuid,
        ncmVersionId: optionalUuid,
        tipiReferenceId: optionalUuid,
        tipiVersionId: optionalUuid,
        cestReferenceId: optionalUuid,
        cestVersionId: optionalUuid,
        defaultOutputCfopReferenceId: optionalUuid,
        defaultOutputCfopVersionId: optionalUuid,
        defaultInputCfopReferenceId: optionalUuid,
        defaultInputCfopVersionId: optionalUuid,
        defaultOutputCfopConfigId: optionalUuid,
        defaultInputCfopConfigId: optionalUuid,
        icmsBaseId: optionalUuid,
        ibscbsBaseId: optionalUuid,
        ibscbsVersionId: optionalUuid,
        fiscalReferenceSnapshot: optionalJsonRecord,
        rules: z.array(productTaxProfileRuleSchema).default([]),
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
