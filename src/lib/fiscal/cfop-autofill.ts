import {
    getCfopOperationGroupLabel,
    getCfopOperationScopeLabel,
    inferCfopScopeFromCode,
    isCfopOperationGroup,
    type CfopOperationGroup,
    type CfopOperationScope,
} from '@/lib/fiscal/cfop'

export type CfopResolvedDirection = 'outbound' | 'inbound' | 'both'
export type CfopDefaultSource = 'manual' | 'code_inference' | 'master_seed'

export interface CfopMasterDefault {
    cfopCode: string
    defaultDescription: string
    inferredDirection: CfopResolvedDirection
    inferredScope: CfopOperationScope
    operationGroup: CfopOperationGroup
    primaryContext: string
    defaultGeneralDescription?: string | null
    defaultNote?: string | null
    properties: Record<string, unknown>
    icmsConfig: Record<string, unknown>
    ibscbsConfig: Record<string, unknown>
    piscofinsConfig: Record<string, unknown>
    internalNotes?: string | null
    seedVersion?: string | null
    isActive: boolean
    metadata: Record<string, unknown>
}

export interface CfopSuggestionPatch {
    code: string
    description?: string | null
    operationDirection: CfopResolvedDirection
    operationGroup: CfopOperationGroup
    operationScope: CfopOperationScope
    generalDescription: string
    defaultNote?: string | null
    appliesToOwnManufacture: boolean
    appliesToResale: boolean
    appliesOutsideEstablishment: boolean
    appliesConsumerFinal: boolean
    appliesTaxpayer: boolean
    supportsSt: boolean
    impactsIcms: boolean
    impactsIbscbs: boolean
    sumOperationTotalInvoice: boolean
    isRecommended: boolean
    icmsConfig: {
        calculateIcms: boolean
        simpleNationalNonTaxed: boolean
        omitIcmsForIndividual: boolean
        highlightStOnInvoice: boolean
        stCollectedPreviously: boolean
    }
    ibscbsConfig: {
        cstCode?: string | null
        classificationCode?: string | null
        regularCstCode?: string | null
        regularClassificationCode?: string | null
        presumedCreditCode?: string | null
        presumedCreditRate?: number | null
    }
    piscofinsConfig: {
        pisCstCode?: string | null
        cofinsCstCode?: string | null
    }
}

export interface CfopResolvedSuggestion {
    cfopCode: string
    recognized: boolean
    source: CfopDefaultSource
    defaultSeedCode?: string | null
    defaultSeedVersion?: string | null
    inferredDirection: CfopResolvedDirection
    inferredScope: CfopOperationScope
    operationGroup: CfopOperationGroup
    operationGroupLabel: string
    operationScopeLabel: string
    primaryContext: string
    summaryBadges: string[]
    reviewAlerts: string[]
    internalNotes?: string | null
    patch: CfopSuggestionPatch
}

export interface CfopAutoFillResult {
    suggestion: CfopResolvedSuggestion | null
    canAutoApply: boolean
    reason?: string | null
}

export const CFOP_SUGGESTION_TRACKED_PATHS = [
    'description',
    'operationDirection',
    'operationGroup',
    'operationScope',
    'generalDescription',
    'defaultNote',
    'appliesToOwnManufacture',
    'appliesToResale',
    'appliesOutsideEstablishment',
    'appliesConsumerFinal',
    'appliesTaxpayer',
    'supportsSt',
    'impactsIcms',
    'impactsIbscbs',
    'sumOperationTotalInvoice',
    'isRecommended',
    'icmsConfig.calculateIcms',
    'icmsConfig.simpleNationalNonTaxed',
    'icmsConfig.omitIcmsForIndividual',
    'icmsConfig.highlightStOnInvoice',
    'icmsConfig.stCollectedPreviously',
    'ibscbsConfig.cstCode',
    'ibscbsConfig.classificationCode',
    'ibscbsConfig.regularCstCode',
    'ibscbsConfig.regularClassificationCode',
    'ibscbsConfig.presumedCreditCode',
    'ibscbsConfig.presumedCreditRate',
    'piscofinsConfig.pisCstCode',
    'piscofinsConfig.cofinsCstCode',
] as const

function sanitizeText(value?: string | null) {
    const normalized = String(value || '').trim()
    return normalized.length > 0 ? normalized : null
}

function sanitizeJsonObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function toNullableNumber(value: unknown) {
    if (value === '' || value === null || value === undefined) return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

export function isCfopDefaultSource(value?: string | null): value is CfopDefaultSource {
    return value === 'manual' || value === 'code_inference' || value === 'master_seed'
}

export function inferCfopDirectionFromCode(code?: string | null): CfopResolvedDirection {
    const family = String(code || '').replace(/\D/g, '').slice(0, 1)
    if (['1', '2', '3'].includes(family)) return 'inbound'
    if (['5', '6', '7'].includes(family)) return 'outbound'
    return 'both'
}

export function resolveGenericCfopContext(code?: string | null) {
    const direction = inferCfopDirectionFromCode(code)
    const scope = inferCfopScopeFromCode(code)
    return {
        direction,
        scope,
        operationGroup: 'other' as CfopOperationGroup,
        primaryContext: direction === 'inbound' ? 'entry_context' : direction === 'outbound' ? 'exit_context' : 'mixed_context',
    }
}

export function normalizeCfopMasterDefault(row: Record<string, unknown>): CfopMasterDefault | null {
    const cfopCode = sanitizeText(row.cfop_code as string | null) || sanitizeText(row.cfopCode as string | null)
    const defaultDescription =
        sanitizeText(row.default_description as string | null) || sanitizeText(row.defaultDescription as string | null)
    const operationGroup =
        sanitizeText(row.operation_group as string | null) || sanitizeText(row.operationGroup as string | null)
    const primaryContext =
        sanitizeText(row.primary_context as string | null) || sanitizeText(row.primaryContext as string | null)

    if (!cfopCode || !defaultDescription || !operationGroup || !primaryContext || !isCfopOperationGroup(operationGroup)) {
        return null
    }

    return {
        cfopCode,
        defaultDescription,
        inferredDirection:
            (sanitizeText(row.inferred_direction as string | null) as CfopResolvedDirection | null) ||
            inferCfopDirectionFromCode(cfopCode),
        inferredScope:
            (sanitizeText(row.inferred_scope as string | null) as CfopOperationScope | null) ||
            inferCfopScopeFromCode(cfopCode),
        operationGroup,
        primaryContext,
        defaultGeneralDescription:
            sanitizeText(row.default_general_description as string | null) ||
            sanitizeText(row.defaultGeneralDescription as string | null),
        defaultNote: sanitizeText(row.default_note as string | null) || sanitizeText(row.defaultNote as string | null),
        properties: sanitizeJsonObject(row.properties_jsonb ?? row.properties),
        icmsConfig: sanitizeJsonObject(row.default_icms_config ?? row.icmsConfig),
        ibscbsConfig: sanitizeJsonObject(row.default_ibscbs_config ?? row.ibscbsConfig),
        piscofinsConfig: sanitizeJsonObject(row.default_piscofins_config ?? row.piscofinsConfig),
        internalNotes: sanitizeText(row.internal_notes as string | null) || sanitizeText(row.internalNotes as string | null),
        seedVersion: sanitizeText(row.seed_version as string | null) || sanitizeText(row.seedVersion as string | null),
        isActive: row.is_active !== false && row.isActive !== false,
        metadata: sanitizeJsonObject(row.metadata_jsonb ?? row.metadata),
    }
}

export function buildCfopResolvedSuggestion(params: {
    cfopCode: string
    description?: string | null
    masterDefault?: CfopMasterDefault | null
}): CfopResolvedSuggestion | null {
    const cfopCode = String(params.cfopCode || '').replace(/\D/g, '').slice(0, 4)
    if (!/^\d{4}$/.test(cfopCode)) return null

    const generic = resolveGenericCfopContext(cfopCode)
    const masterDefault = params.masterDefault && params.masterDefault.isActive ? params.masterDefault : null
    const source: CfopDefaultSource = masterDefault ? 'master_seed' : 'code_inference'

    const properties = masterDefault?.properties || {}
    const icms = masterDefault?.icmsConfig || {}
    const ibscbs = masterDefault?.ibscbsConfig || {}
    const piscofins = masterDefault?.piscofinsConfig || {}
    const description = masterDefault?.defaultDescription || sanitizeText(params.description) || cfopCode

    const impactsIcms = masterDefault
        ? properties.impactsIcms === true || Object.keys(icms).length > 0
        : true

    const patch: CfopSuggestionPatch = {
        code: cfopCode,
        description,
        operationDirection: masterDefault?.inferredDirection || generic.direction,
        operationGroup: masterDefault?.operationGroup || generic.operationGroup,
        operationScope: masterDefault?.inferredScope || generic.scope,
        generalDescription: masterDefault?.defaultGeneralDescription || sanitizeText(params.description) || description,
        defaultNote: masterDefault?.defaultNote || null,
        appliesToOwnManufacture: properties.appliesToOwnManufacture === true,
        appliesToResale: properties.appliesToResale === true,
        appliesOutsideEstablishment: properties.appliesOutsideEstablishment === true,
        appliesConsumerFinal: properties.appliesConsumerFinal === true,
        appliesTaxpayer: properties.appliesTaxpayer === true,
        supportsSt: properties.supportsSt === true,
        impactsIcms,
        impactsIbscbs: ibscbs.enabled === true,
        sumOperationTotalInvoice: properties.sumOperationTotalInvoice !== false,
        isRecommended: properties.isRecommended === true,
        icmsConfig: {
            calculateIcms: icms.calculateIcms !== false,
            simpleNationalNonTaxed: icms.simpleNationalNonTaxed === true,
            omitIcmsForIndividual: icms.omitIcmsForIndividual === true,
            highlightStOnInvoice: icms.highlightStOnInvoice === true,
            stCollectedPreviously: icms.stCollectedPreviously === true,
        },
        ibscbsConfig: {
            cstCode: sanitizeText(ibscbs.cstCode as string | null),
            classificationCode: sanitizeText(ibscbs.classificationCode as string | null),
            regularCstCode: sanitizeText(ibscbs.regularCstCode as string | null),
            regularClassificationCode: sanitizeText(ibscbs.regularClassificationCode as string | null),
            presumedCreditCode: sanitizeText(ibscbs.presumedCreditCode as string | null),
            presumedCreditRate: toNullableNumber(ibscbs.presumedCreditRate),
        },
        piscofinsConfig: {
            pisCstCode: sanitizeText(piscofins.pisCstCode as string | null),
            cofinsCstCode: sanitizeText(piscofins.cofinsCstCode as string | null),
        },
    }

    const summaryBadges = [
        patch.operationDirection === 'outbound' ? 'Saida' : patch.operationDirection === 'inbound' ? 'Entrada' : 'Entrada e saida',
        getCfopOperationScopeLabel(patch.operationScope),
        getCfopOperationGroupLabel(patch.operationGroup),
    ]

    if (patch.supportsSt) summaryBadges.push('ST')
    if (patch.appliesToResale) summaryBadges.push('Revenda')
    if (patch.appliesToOwnManufacture) summaryBadges.push('Fabricacao propria')
    if (patch.appliesOutsideEstablishment) summaryBadges.push('Fora do estabelecimento')

    const reviewAlerts: string[] = []
    if (properties.requiresPiscofinsReview === true) {
        reviewAlerts.push('PIS/COFINS ainda exigem revisao manual para este contexto.')
        summaryBadges.push('Revisar PIS/COFINS')
    }
    if (properties.requiresIcmsReview === true) {
        reviewAlerts.push('ICMS exige revisao manual complementar para este contexto.')
    }
    if (properties.requiresIbscbsReview === true) {
        reviewAlerts.push('IBS/CBS exigem revisao manual complementar para este contexto.')
    }

    return {
        cfopCode,
        recognized: masterDefault !== null,
        source,
        defaultSeedCode: masterDefault?.cfopCode || null,
        defaultSeedVersion: masterDefault?.seedVersion || null,
        inferredDirection: patch.operationDirection,
        inferredScope: patch.operationScope,
        operationGroup: patch.operationGroup,
        operationGroupLabel: getCfopOperationGroupLabel(patch.operationGroup),
        operationScopeLabel: getCfopOperationScopeLabel(patch.operationScope),
        primaryContext: masterDefault?.primaryContext || generic.primaryContext,
        summaryBadges,
        reviewAlerts,
        internalNotes: masterDefault?.internalNotes || null,
        patch,
    }
}

function getValueAtPath(value: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
        return (current as Record<string, unknown>)[key]
    }, value)
}

export function diffCfopSuggestionOverrides(currentValue: unknown, suggestion: CfopResolvedSuggestion | null) {
    if (!suggestion) return []
    return CFOP_SUGGESTION_TRACKED_PATHS.filter((path) => {
        const current = getValueAtPath(currentValue, path)
        const suggested = getValueAtPath(suggestion.patch, path)
        return JSON.stringify(current ?? null) !== JSON.stringify(suggested ?? null)
    })
}

export function buildCfopSuggestedDefaultsSummary(suggestion: CfopResolvedSuggestion | null) {
    if (!suggestion) return {}
    return {
        cfop_code: suggestion.cfopCode,
        source: suggestion.source,
        primary_context: suggestion.primaryContext,
        inferred_direction: suggestion.inferredDirection,
        inferred_scope: suggestion.inferredScope,
        operation_group: suggestion.operationGroup,
        summary_badges: suggestion.summaryBadges,
        review_alerts: suggestion.reviewAlerts,
    }
}
