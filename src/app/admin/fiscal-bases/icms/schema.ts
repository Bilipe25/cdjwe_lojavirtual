import { z } from 'zod'
import type {
    IcmsBaseCalcType,
    IcmsInterstateConsumerFinalMode,
    IcmsStBaseCalcType,
} from '@/lib/fiscal/icms'

const optionalTrimmedString = z
    .string()
    .optional()
    .transform((value) => {
        const trimmed = (value || '').trim()
        return trimmed.length > 0 ? trimmed : undefined
    })

const optionalPercentage = z.preprocess(
    (value) => {
        if (value === '' || value === null || value === undefined) return undefined
        if (typeof value === 'string') {
            const parsed = Number(value.replace(',', '.'))
            return Number.isFinite(parsed) ? parsed : value
        }
        return value
    },
    z.number().min(0, 'Percentual invalido').max(100, 'Percentual invalido').optional()
)

const requiredPercentage = z.preprocess(
    (value) => {
        if (value === '' || value === null || value === undefined) return value
        if (typeof value === 'string') {
            const parsed = Number(value.replace(',', '.'))
            return Number.isFinite(parsed) ? parsed : value
        }
        return value
    },
    z.number().min(0, 'Percentual invalido').max(100, 'Percentual invalido')
)

const ruleSchema = z.object({
    id: z.string().uuid().optional(),
    targetUf: optionalTrimmedString,
    cstCode: z.string().min(2, 'Selecione um CST'),
    icmsRate: requiredPercentage,
    fcpRate: requiredPercentage,
    specialAdvanceDestination: z.boolean().default(false),
    differentiateConsumerFinalRate: z.boolean().default(false),
    baseCalcType: z.custom<IcmsBaseCalcType>(),
    baseCalcPercent: optionalPercentage,
    baseReductionPercent: optionalPercentage,
    baseNotes: optionalTrimmedString,
    isActive: z.boolean().default(true),
})

const interstateRuleSchema = z.object({
    id: z.string().uuid().optional(),
    targetUf: optionalTrimmedString,
    icmsRate: requiredPercentage,
    fcpRate: requiredPercentage,
    consumerFinalMode: z.custom<IcmsInterstateConsumerFinalMode>(),
    isActive: z.boolean().default(true),
})

const stRuleSchema = z.object({
    id: z.string().uuid().optional(),
    targetUf: optionalTrimmedString,
    stEnabled: z.boolean().default(false),
    stBaseCalcType: z.custom<IcmsStBaseCalcType>().optional(),
    stBaseCalcPercent: optionalPercentage,
    stBaseReductionPercent: optionalPercentage,
    stRate: optionalPercentage,
    stFcpRate: optionalPercentage,
    mvaOriginal: optionalPercentage,
    mvaAdjusted: optionalPercentage,
    stNotes: optionalTrimmedString,
    isActive: z.boolean().default(true),
})

export const icmsBaseFormSchema = z
    .object({
        id: z.string().uuid().optional(),
        name: z.string().min(3, 'Informe o nome da base de ICMS'),
        code: z.string().min(2, 'Informe o codigo interno'),
        description: optionalTrimmedString,
        isActive: z.boolean().default(true),
        enableInterstateRule: z.boolean().default(false),
        enableStRule: z.boolean().default(false),
        nationalRule: ruleSchema,
        stateRules: z.array(ruleSchema).default([]),
        interstateRule: interstateRuleSchema,
        stRule: stRuleSchema,
    })
    .superRefine((value, ctx) => {
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

            const normalized = rule.targetUf.toUpperCase()
            if (!/^[A-Z]{2}$/.test(normalized)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stateRules', index, 'targetUf'],
                    message: 'UF invalida. Use a sigla com 2 letras.',
                })
            }

            if (seenUf.has(normalized)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stateRules', index, 'targetUf'],
                    message: 'Ja existe uma regra para esta UF.',
                })
            }
            seenUf.add(normalized)
        })

        if (value.enableInterstateRule && value.interstateRule.targetUf && !/^[A-Z]{2}$/.test(value.interstateRule.targetUf.toUpperCase())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['interstateRule', 'targetUf'],
                message: 'UF invalida. Use a sigla com 2 letras.',
            })
        }

        if (value.enableStRule && value.stRule.targetUf && !/^[A-Z]{2}$/.test(value.stRule.targetUf.toUpperCase())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['stRule', 'targetUf'],
                message: 'UF invalida. Use a sigla com 2 letras.',
            })
        }

        if (value.enableStRule && value.stRule.stEnabled) {
            const hasMinimumPayload =
                value.stRule.stRate !== undefined ||
                value.stRule.mvaOriginal !== undefined ||
                value.stRule.stBaseCalcPercent !== undefined

            if (!hasMinimumPayload) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['stRule', 'stRate'],
                    message: 'Quando ST estiver habilitado, informe ao menos aliquota ST, MVA ou percentual de base ST.',
                })
            }
        }
    })

export type IcmsBaseFormValues = z.infer<typeof icmsBaseFormSchema>

export function createEmptyIcmsBaseFormValues(): IcmsBaseFormValues {
    return {
        id: undefined,
        name: '',
        code: '',
        description: undefined,
        isActive: true,
        enableInterstateRule: false,
        enableStRule: false,
        nationalRule: {
            targetUf: undefined,
            cstCode: '',
            icmsRate: 0,
            fcpRate: 0,
            specialAdvanceDestination: false,
            differentiateConsumerFinalRate: false,
            baseCalcType: 'operation_value',
            baseCalcPercent: undefined,
            baseReductionPercent: undefined,
            baseNotes: undefined,
            isActive: true,
        },
        stateRules: [],
        interstateRule: {
            targetUf: undefined,
            icmsRate: 0,
            fcpRate: 0,
            consumerFinalMode: 'standard',
            isActive: true,
        },
        stRule: {
            targetUf: undefined,
            stEnabled: false,
            stBaseCalcType: 'mva',
            stBaseCalcPercent: undefined,
            stBaseReductionPercent: undefined,
            stRate: undefined,
            stFcpRate: undefined,
            mvaOriginal: undefined,
            mvaAdjusted: undefined,
            stNotes: undefined,
            isActive: true,
        },
    }
}
