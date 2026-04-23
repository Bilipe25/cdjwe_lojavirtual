import { z } from 'zod'
import type { IbscbsVersionStatus } from '@/lib/fiscal/ibscbs'
import type { IbscbsBaseMode } from '@/lib/fiscal/ibscbs-config'

const ibscbsBaseModeSchema = z.enum(['subtotal', 'fiscal_gross', 'fiscal_gross_less_icms_fcp']) satisfies z.ZodType<IbscbsBaseMode>

const optionalTrimmedString = z
    .string()
    .optional()
    .transform((value) => {
        const trimmed = (value || '').trim()
        return trimmed.length > 0 ? trimmed : undefined
    })

const optionalPercentageNumber = z.preprocess(
    (value) => {
        if (value === '' || value === null || value === undefined) return undefined
        if (typeof value === 'string') {
            const parsed = Number(value.replace(',', '.'))
            return Number.isFinite(parsed) ? parsed : undefined
        }
        if (typeof value === 'number') return value
        return undefined
    },
    z.number().min(0, 'Informe um percentual igual ou maior que zero.').optional()
)

const ruleSchema = z.object({
    id: z.string().uuid().optional(),
    targetUf: optionalTrimmedString,
    cstCode: z.string().regex(/^\d{3}$/, 'Selecione um CST valido'),
    classificationCode: z.string().regex(/^\d{6}$/, 'Selecione uma classificacao tributaria valida'),
    isActive: z.boolean().default(true),
})

export const ibscbsBaseFormSchema = z
    .object({
        baseId: z.string().uuid().optional(),
        versionId: z.string().uuid().optional(),
        name: z.string().min(3, 'Informe o nome da base IBS/CBS'),
        code: z.string().min(2, 'Informe o codigo interno da base'),
        description: optionalTrimmedString,
        isBaseActive: z.boolean().default(true),
        versionLabel: z.string().min(2, 'Informe o rotulo da versao'),
        status: z.custom<IbscbsVersionStatus>(),
        validFrom: optionalTrimmedString,
        validTo: optionalTrimmedString,
        cstCatalogVersionId: z.string().uuid('Selecione a versao de catalogo CST'),
        classificationCatalogVersionId: z.string().uuid('Selecione a versao do catalogo de classificacao'),
        baseMode: ibscbsBaseModeSchema,
        basePercent: optionalPercentageNumber,
        baseReductionPercent: optionalPercentageNumber,
        ibsUfRate: optionalPercentageNumber,
        ibsMunRate: optionalPercentageNumber,
        cbsRate: optionalPercentageNumber,
        nationalRule: ruleSchema,
        stateRules: z.array(ruleSchema).default([]),
    })
    .superRefine((value, ctx) => {
        if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['validTo'],
                message: 'A vigencia final deve ser igual ou posterior a vigencia inicial.',
            })
        }

        if (value.nationalRule.classificationCode.slice(0, 3) !== value.nationalRule.cstCode) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['nationalRule', 'classificationCode'],
                message: 'A classificacao tributaria deve pertencer ao mesmo CST selecionado.',
            })
        }

        if ((value.ibsUfRate || 0) <= 0 && (value.ibsMunRate || 0) <= 0 && (value.cbsRate || 0) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ibsUfRate'],
                message: 'Informe pelo menos uma aliquota numerica de IBS UF, IBS Municipio ou CBS.',
            })
        }

        const seenUf = new Set<string>()
        value.stateRules.forEach((rule, index) => {
            if (!rule.targetUf) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stateRules', index, 'targetUf'],
                    message: 'Informe a UF da excecao estadual.',
                })
                return
            }

            const normalizedUf = rule.targetUf.toUpperCase()
            if (!/^[A-Z]{2}$/.test(normalizedUf)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stateRules', index, 'targetUf'],
                    message: 'UF invalida. Use a sigla com 2 letras.',
                })
            }

            if (seenUf.has(normalizedUf)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stateRules', index, 'targetUf'],
                    message: 'Ja existe uma excecao cadastrada para esta UF.',
                })
            }
            seenUf.add(normalizedUf)

            if (rule.classificationCode.slice(0, 3) !== rule.cstCode) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stateRules', index, 'classificationCode'],
                    message: 'A classificacao tributaria deve pertencer ao mesmo CST selecionado.',
                })
            }
        })
    })

export type IbscbsBaseFormValues = z.infer<typeof ibscbsBaseFormSchema>

export function createEmptyIbscbsBaseFormValues(): IbscbsBaseFormValues {
    return {
        baseId: undefined,
        versionId: undefined,
        name: '',
        code: '',
        description: undefined,
        isBaseActive: true,
        versionLabel: 'IBSCBS-V1',
        status: 'draft',
        validFrom: undefined,
        validTo: undefined,
        cstCatalogVersionId: '',
        classificationCatalogVersionId: '',
        baseMode: 'fiscal_gross_less_icms_fcp',
        basePercent: 100,
        baseReductionPercent: 0,
        ibsUfRate: undefined,
        ibsMunRate: undefined,
        cbsRate: undefined,
        nationalRule: {
            id: undefined,
            targetUf: undefined,
            cstCode: '',
            classificationCode: '',
            isActive: true,
        },
        stateRules: [],
    }
}
