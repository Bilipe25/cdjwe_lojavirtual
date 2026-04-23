import { z } from 'zod'
import {
    CFOP_OPERATION_GROUP_OPTIONS,
    CFOP_OPERATION_SCOPE_OPTIONS,
} from '@/lib/fiscal/cfop'

const optionalTrimmedString = z
    .string()
    .optional()
    .transform((value) => {
        const trimmed = (value || '').trim()
        return trimmed.length > 0 ? trimmed : undefined
    })

const optionalUuidString = z.preprocess(
    (value) => {
        if (value === null || value === undefined) return undefined
        if (typeof value === 'string') {
            const trimmed = value.trim()
            return trimmed.length > 0 ? trimmed : undefined
        }
        return value
    },
    z.string().uuid().optional()
)

const cfopOperationGroupValues = CFOP_OPERATION_GROUP_OPTIONS.map((item) => item.value) as [
    string,
    ...string[],
]
const cfopOperationScopeValues = CFOP_OPERATION_SCOPE_OPTIONS.map((item) => item.value) as [
    string,
    ...string[],
]

export const cfopConfigFormSchema = z
    .object({
        entryId: z.string().default(''),
        configId: optionalUuidString,
        versionId: z.string().default(''),
        isManualEntry: z.boolean().default(false),
        code: z.string().trim().regex(/^\d{4}$/, 'Informe um CFOP com 4 digitos.'),
        description: z.string().trim().min(3, 'Informe a descricao oficial do CFOP.'),
        operationDirection: z.enum(['outbound', 'inbound', 'both']),
        operationGroup: z.enum(cfopOperationGroupValues as [string, ...string[]]),
        generalDescription: z.string().default(''),
        defaultNote: optionalTrimmedString,
        operationScope: z.enum(cfopOperationScopeValues as [string, ...string[]]),
        appliesToOwnManufacture: z.boolean().default(false),
        appliesToResale: z.boolean().default(false),
        appliesOutsideEstablishment: z.boolean().default(false),
        appliesConsumerFinal: z.boolean().default(false),
        appliesTaxpayer: z.boolean().default(false),
        supportsSt: z.boolean().default(false),
        impactsIcms: z.boolean().default(true),
        impactsIbscbs: z.boolean().default(false),
        sumOperationTotalInvoice: z.boolean().default(true),
        isRecommended: z.boolean().default(false),
        isLegacy: z.boolean().default(false),
        isActive: z.boolean().default(true),
        defaultSource: z.enum(['manual', 'code_inference', 'master_seed']).optional(),
        defaultSeedCode: optionalTrimmedString,
        defaultAppliedAt: optionalTrimmedString,
        manualOverrides: z.record(z.string(), z.unknown()).optional(),
        suggestedDefaultsSummary: z.record(z.string(), z.unknown()).optional(),
        icmsConfig: z.object({
            calculateIcms: z.boolean().default(true),
            simpleNationalNonTaxed: z.boolean().default(false),
            omitIcmsForIndividual: z.boolean().default(false),
            highlightStOnInvoice: z.boolean().default(false),
            stCollectedPreviously: z.boolean().default(false),
        }),
        ibscbsConfig: z.object({
            cstCatalogVersionId: optionalUuidString,
            cstCode: optionalTrimmedString,
            classificationVersionId: optionalUuidString,
            classificationCode: optionalTrimmedString,
            regularCstCode: optionalTrimmedString,
            regularClassificationCode: optionalTrimmedString,
            presumedCreditCatalogVersionId: optionalUuidString,
            presumedCreditCode: optionalTrimmedString,
            presumedCreditRate: z.preprocess(
                (value) => {
                    if (value === '' || value === null || value === undefined) return undefined
                    if (typeof value === 'string') {
                        const parsed = Number(value.replace(',', '.'))
                        return Number.isFinite(parsed) ? parsed : undefined
                    }
                    if (typeof value === 'number') return value
                    return undefined
                },
                z.number().min(0, 'Aliquota de credito presumido invalida').optional()
            ),
        }),
        piscofinsConfig: z.object({
            pisCstCode: optionalTrimmedString,
            cofinsCstCode: optionalTrimmedString,
        }),
    })
    .superRefine((value, ctx) => {
        if (!value.isManualEntry) {
            if (!z.string().uuid().safeParse(value.entryId).success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['entryId'],
                    message: 'Selecione um CFOP oficial valido.',
                })
            }

            if (!z.string().uuid().safeParse(value.versionId).success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['versionId'],
                    message: 'A versao oficial do CFOP e obrigatoria.',
                })
            }
        } else if (value.entryId && !z.string().uuid().safeParse(value.entryId).success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['entryId'],
                message: 'O identificador do CFOP manual ficou invalido.',
            })
        }

        const digits = value.code.replace(/\D/g, '')
        const directionFamily = digits.slice(0, 1)

        if (value.operationScope === 'internal' && !['1', '5'].includes(directionFamily)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['operationScope'],
                message: 'O escopo interno e incompativel com a familia deste CFOP.',
            })
        }

        if (value.operationScope === 'interstate' && !['2', '6'].includes(directionFamily)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['operationScope'],
                message: 'O escopo interestadual e incompativel com a familia deste CFOP.',
            })
        }

        if (value.operationScope === 'external' && !['3', '7'].includes(directionFamily)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['operationScope'],
                message: 'O escopo exterior e incompativel com a familia deste CFOP.',
            })
        }

        if (value.impactsIbscbs) {
            if (!value.ibscbsConfig.cstCatalogVersionId || !value.ibscbsConfig.classificationVersionId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['ibscbsConfig', 'cstCatalogVersionId'],
                    message: 'Selecione as versoes de catalogo de IBS/CBS.',
                })
            }

            if (!value.ibscbsConfig.cstCode || !value.ibscbsConfig.classificationCode) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['ibscbsConfig', 'classificationCode'],
                    message: 'CST e classificacao tributaria de IBS/CBS sao obrigatorios.',
                })
            }

            if (
                value.ibscbsConfig.cstCode &&
                value.ibscbsConfig.classificationCode &&
                value.ibscbsConfig.classificationCode.slice(0, 3) !== value.ibscbsConfig.cstCode
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['ibscbsConfig', 'classificationCode'],
                    message: 'A classificacao tributaria deve pertencer ao mesmo CST selecionado.',
                })
            }
        }

        if (
            value.ibscbsConfig.regularClassificationCode &&
            !value.ibscbsConfig.regularCstCode
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ibscbsConfig', 'regularCstCode'],
                message: 'Informe o CST regular quando houver classificacao regular.',
            })
        }

        if (
            value.ibscbsConfig.regularCstCode &&
            value.ibscbsConfig.regularClassificationCode &&
            value.ibscbsConfig.regularClassificationCode.slice(0, 3) !== value.ibscbsConfig.regularCstCode
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ibscbsConfig', 'regularClassificationCode'],
                message: 'A classificacao tributaria regular deve pertencer ao mesmo CST regular.',
            })
        }
    })

export type CfopConfigFormValues = z.infer<typeof cfopConfigFormSchema>
