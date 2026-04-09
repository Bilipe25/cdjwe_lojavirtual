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
        entryId: z.string().uuid(),
        configId: z.string().uuid().optional(),
        versionId: z.string().uuid(),
        code: z.string().min(4),
        description: z.string().min(3),
        operationDirection: z.enum(['outbound', 'inbound', 'both']),
        operationGroup: z.enum(cfopOperationGroupValues as [string, ...string[]]),
        generalDescription: z.string().min(3, 'Informe a descrição operacional do CFOP.'),
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
        icmsConfig: z.object({
            calculateIcms: z.boolean().default(true),
            simpleNationalNonTaxed: z.boolean().default(false),
            omitIcmsForIndividual: z.boolean().default(false),
            highlightStOnInvoice: z.boolean().default(false),
            stCollectedPreviously: z.boolean().default(false),
        }),
        ibscbsConfig: z.object({
            cstCatalogVersionId: z.string().uuid().optional(),
            cstCode: optionalTrimmedString,
            classificationVersionId: z.string().uuid().optional(),
            classificationCode: optionalTrimmedString,
            regularCstCode: optionalTrimmedString,
            regularClassificationCode: optionalTrimmedString,
            presumedCreditCatalogVersionId: z.string().uuid().optional(),
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
                z.number().min(0, 'Alíquota de crédito presumido inválida').optional()
            ),
        }),
        piscofinsConfig: z.object({
            pisCstCode: optionalTrimmedString,
            cofinsCstCode: optionalTrimmedString,
        }),
    })
    .superRefine((value, ctx) => {
        const digits = value.code.replace(/\D/g, '')
        const directionFamily = digits.slice(0, 1)

        if (value.operationScope === 'internal' && !['1', '5'].includes(directionFamily)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['operationScope'],
                message: 'O escopo interno é incompatível com a família deste CFOP.',
            })
        }

        if (value.operationScope === 'interstate' && !['2', '6'].includes(directionFamily)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['operationScope'],
                message: 'O escopo interestadual é incompatível com a família deste CFOP.',
            })
        }

        if (value.operationScope === 'external' && !['3', '7'].includes(directionFamily)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['operationScope'],
                message: 'O escopo exterior é incompatível com a família deste CFOP.',
            })
        }

        if (value.impactsIbscbs) {
            if (!value.ibscbsConfig.cstCatalogVersionId || !value.ibscbsConfig.classificationVersionId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['ibscbsConfig', 'cstCatalogVersionId'],
                    message: 'Selecione as versões de catálogo de IBS/CBS.',
                })
            }

            if (!value.ibscbsConfig.cstCode || !value.ibscbsConfig.classificationCode) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['ibscbsConfig', 'classificationCode'],
                    message: 'CST e classificação tributária de IBS/CBS são obrigatórios.',
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
                    message: 'A classificação tributária deve pertencer ao mesmo CST selecionado.',
                })
            }
        }

        if (
            value.ibscbsConfig.regularCstCode &&
            value.ibscbsConfig.regularClassificationCode &&
            value.ibscbsConfig.regularClassificationCode.slice(0, 3) !== value.ibscbsConfig.regularCstCode
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ibscbsConfig', 'regularClassificationCode'],
                message: 'A classificação tributária regular deve pertencer ao mesmo CST regular.',
            })
        }
    })

export type CfopConfigFormValues = z.infer<typeof cfopConfigFormSchema>
