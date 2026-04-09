'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
    inferCfopScopeFromCode,
    getCfopOperationGroupLabel,
    getCfopOperationScopeLabel,
    isCfopConfigurationStatus,
    isCfopOperationGroup,
    isCfopOperationScope,
    type CfopConfigurationStatus,
    type CfopOperationGroup,
    type CfopOperationScope,
} from '@/lib/fiscal/cfop'
import {
    buildCfopResolvedSuggestion,
    buildCfopSuggestedDefaultsSummary,
    isCfopDefaultSource,
    normalizeCfopMasterDefault,
    type CfopDefaultSource,
    type CfopMasterDefault,
    type CfopResolvedSuggestion,
} from '@/lib/fiscal/cfop-autofill'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'

export interface CfopConfigIcmsInput {
    calculateIcms: boolean
    simpleNationalNonTaxed: boolean
    omitIcmsForIndividual: boolean
    highlightStOnInvoice: boolean
    stCollectedPreviously: boolean
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface CfopConfigIbscbsInput {
    cstCatalogVersionId?: string | null
    cstCode?: string | null
    classificationVersionId?: string | null
    classificationCode?: string | null
    regularCstCode?: string | null
    regularClassificationCode?: string | null
    presumedCreditCatalogVersionId?: string | null
    presumedCreditCode?: string | null
    presumedCreditRate?: number | null
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface CfopConfigPiscofinsInput {
    pisCstCode?: string | null
    cofinsCstCode?: string | null
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface CfopConfigUsageSummary {
    defaultOutputCount: number
    defaultInputCount: number
    contextualRuleCount: number
    totalProfiles: number
}

export interface CfopConfigListItem {
    entryId: string
    configId: string | null
    versionId: string
    code: string
    description: string
    operationDirection: 'outbound' | 'inbound' | 'both'
    operationGroup: CfopOperationGroup | null
    operationScope: CfopOperationScope
    generalDescription: string | null
    configurationStatus: CfopConfigurationStatus
    isActive: boolean
    isLegacy: boolean
    isRecommended: boolean
    supportsSt: boolean
    impactsIcms: boolean
    impactsIbscbs: boolean
    appliesToOwnManufacture: boolean
    appliesToResale: boolean
    appliesOutsideEstablishment: boolean
    usage: CfopConfigUsageSummary
}

export interface CfopConfigDetail {
    entryId: string
    configId?: string | null
    versionId: string
    versionLabel: string
    isManualEntry: boolean
    code: string
    description: string
    operationDirection: 'outbound' | 'inbound' | 'both'
    operationGroup: CfopOperationGroup
    generalDescription?: string | null
    defaultNote?: string | null
    operationScope: CfopOperationScope
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
    isLegacy: boolean
    isActive: boolean
    configurationStatus: CfopConfigurationStatus
    defaultSource?: CfopDefaultSource | null
    defaultSeedCode?: string | null
    defaultAppliedAt?: string | null
    manualOverrides?: Record<string, unknown> | null
    suggestedDefaultsSummary?: Record<string, unknown> | null
    icmsConfig: CfopConfigIcmsInput
    ibscbsConfig: CfopConfigIbscbsInput
    piscofinsConfig: CfopConfigPiscofinsInput
    usage: CfopConfigUsageSummary
    prefilledFrom?: { configId: string; versionId: string; code: string } | null
}

export interface CfopConfigFormData
    extends Omit<
        CfopConfigDetail,
        'usage' | 'versionLabel' | 'prefilledFrom' | 'configurationStatus' | 'generalDescription' | 'defaultNote'
    > {
    generalDescription: string
    defaultNote?: string
}

export interface ResolveCfopDefaultsInput {
    cfopCode?: string | null
    description?: string | null
}

export interface CfopConfigListResult {
    versionId: string | null
    versionLabel: string | null
    items: CfopConfigListItem[]
    totalCount: number
    readyCount: number
    partialCount: number
    pendingCount: number
    legacyCount: number
    usedCount: number
}

export interface CfopConfigSearchOption extends FiscalSearchOption {
    configId: string
    referenceId: string
    operationDirection: 'outbound' | 'inbound' | 'both'
    operationScope: CfopOperationScope
    configurationStatus: CfopConfigurationStatus
    supportsSt: boolean
    impactsIcms: boolean
    impactsIbscbs: boolean
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

function sanitizeText(value?: string | null) {
    const normalized = (value || '').trim()
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

function isValidUuid(value?: string | null) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

async function ensureAdminAccess() {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) throw new Error('Nao autenticado.')

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single()

    if (profileError || !profile || profile.role !== 'admin') {
        throw new Error('Acesso negado.')
    }

    return authData.user.id
}

async function resolveCfopVersion(requestedVersionId?: string | null) {
    const adminSupabase = createServiceRoleClient()
    if (requestedVersionId && isValidUuid(requestedVersionId)) {
        const { data, error } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('id, version_label')
            .eq('id', requestedVersionId)
            .eq('table_type', 'cfop')
            .single()
        if (error || !data) throw error || new Error('Versao de CFOP nao encontrada.')
        return {
            id: String(data.id),
            versionLabel: String(data.version_label || ''),
        }
    }

    const { data: active } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('id, version_label')
        .eq('table_type', 'cfop')
        .eq('is_active', true)
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (active) {
        return {
            id: String(active.id),
            versionLabel: String(active.version_label || ''),
        }
    }

    const { data: latest, error } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('id, version_label')
        .eq('table_type', 'cfop')
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) throw error
    if (!latest) return null
    return {
        id: String(latest.id),
        versionLabel: String(latest.version_label || ''),
    }
}

async function buildUsageMap(configIds: string[]) {
    const adminSupabase = createServiceRoleClient()
    if (configIds.length === 0) return new Map<string, CfopConfigUsageSummary>()

    const [{ data: profiles }, { data: rules }] = await Promise.all([
        adminSupabase
            .from('product_tax_profiles')
            .select('default_output_cfop_config_id, default_input_cfop_config_id')
            .or(
                [
                    `default_output_cfop_config_id.in.(${configIds.join(',')})`,
                    `default_input_cfop_config_id.in.(${configIds.join(',')})`,
                ].join(',')
            ),
        adminSupabase
            .from('product_tax_profile_rules')
            .select('cfop_config_id')
            .in('cfop_config_id', configIds),
    ])

    const map = new Map<string, CfopConfigUsageSummary>()
    configIds.forEach((id) =>
        map.set(id, {
            defaultOutputCount: 0,
            defaultInputCount: 0,
            contextualRuleCount: 0,
            totalProfiles: 0,
        })
    )

    ;((profiles || []) as Array<Record<string, unknown>>).forEach((row) => {
        const touched = new Set<string>()
        const outputId = sanitizeText(row.default_output_cfop_config_id as string | null)
        const inputId = sanitizeText(row.default_input_cfop_config_id as string | null)

        if (outputId && map.has(outputId)) {
            const current = map.get(outputId)!
            current.defaultOutputCount += 1
            touched.add(outputId)
        }
        if (inputId && map.has(inputId)) {
            const current = map.get(inputId)!
            current.defaultInputCount += 1
            touched.add(inputId)
        }

        touched.forEach((id) => {
            const current = map.get(id)!
            current.totalProfiles += 1
        })
    })

    ;((rules || []) as Array<Record<string, unknown>>).forEach((row) => {
        const configId = sanitizeText(row.cfop_config_id as string | null)
        if (!configId || !map.has(configId)) return
        const current = map.get(configId)!
        current.contextualRuleCount += 1
    })

    return map
}

function buildEmptyUsage(): CfopConfigUsageSummary {
    return {
        defaultOutputCount: 0,
        defaultInputCount: 0,
        contextualRuleCount: 0,
        totalProfiles: 0,
    }
}

function normalizeStatus(value?: string | null): CfopConfigurationStatus {
    return isCfopConfigurationStatus(value) ? value : 'pending'
}

function mapCfopListItem(entry: Record<string, unknown>, config?: Record<string, unknown> | null, usage?: CfopConfigUsageSummary): CfopConfigListItem {
    return {
        entryId: String(entry.id),
        configId: config ? String(config.id) : null,
        versionId: String(entry.version_id || ''),
        code: String(entry.code || ''),
        description: String(entry.description || ''),
        operationDirection: (String(entry.operation_direction || 'both') as 'outbound' | 'inbound' | 'both'),
        operationGroup: config && isCfopOperationGroup(String(config.operation_group || ''))
            ? (String(config.operation_group) as CfopOperationGroup)
            : null,
        operationScope: config && isCfopOperationScope(String(config.operation_scope || ''))
            ? (String(config.operation_scope) as CfopOperationScope)
            : inferCfopScopeFromCode(String(entry.code || '')),
        generalDescription: sanitizeText(config?.general_description as string | null),
        configurationStatus: config ? normalizeStatus(String(config.configuration_status || 'pending')) : 'pending',
        isActive: config ? config.is_active !== false : false,
        isLegacy: config ? config.is_legacy === true : false,
        isRecommended: config ? config.is_recommended === true : false,
        supportsSt: config ? config.supports_st === true : false,
        impactsIcms: config ? config.impacts_icms !== false : false,
        impactsIbscbs: config ? config.impacts_ibscbs === true : false,
        appliesToOwnManufacture: config ? config.applies_to_own_manufacture === true : false,
        appliesToResale: config ? config.applies_to_resale === true : false,
        appliesOutsideEstablishment: config ? config.applies_outside_establishment === true : false,
        usage: usage || buildEmptyUsage(),
    }
}

export async function listCfopConfigsAction(params?: {
    versionId?: string | null
    search?: string | null
    direction?: 'all' | 'outbound' | 'inbound' | 'both'
    scope?: 'all' | CfopOperationScope
    status?: 'all' | CfopConfigurationStatus
    usageMode?: 'all' | 'used' | 'unused'
    stMode?: 'all' | 'with_st' | 'without_st'
}): Promise<{ success: boolean; data?: CfopConfigListResult; error?: string }> {
    try {
        await ensureAdminAccess()
        const version = await resolveCfopVersion(params?.versionId)
        if (!version) {
            return {
                success: true,
                data: {
                    versionId: null,
                    versionLabel: null,
                    items: [],
                    totalCount: 0,
                    readyCount: 0,
                    partialCount: 0,
                    pendingCount: 0,
                    legacyCount: 0,
                    usedCount: 0,
                },
            }
        }

        const adminSupabase = createServiceRoleClient()
        const search = sanitizeText(params?.search)?.toLowerCase() || ''
        const [{ data: entries, error: entriesError }, { data: configs, error: configsError }] = await Promise.all([
            adminSupabase
                .from('fiscal_cfop_entries')
                .select('id, version_id, code, description, operation_direction')
                .eq('version_id', version.id)
                .order('code', { ascending: true }),
            adminSupabase
                .from('fiscal_cfop_configs')
                .select('*')
                .eq('cfop_version_id', version.id),
        ])
        if (entriesError) throw entriesError
        if (configsError) throw configsError

        const configMap = new Map<string, Record<string, unknown>>(
            ((configs || []) as Array<Record<string, unknown>>).map((row) => [String(row.cfop_entry_id), row])
        )
        const usageMap = await buildUsageMap(
            ((configs || []) as Array<Record<string, unknown>>).map((row) => String(row.id))
        )

        const items = ((entries || []) as Array<Record<string, unknown>>)
            .map((entry) => {
                const config = configMap.get(String(entry.id)) || null
                const usage = config ? usageMap.get(String(config.id)) || buildEmptyUsage() : buildEmptyUsage()
                return mapCfopListItem(entry, config, usage)
            })
            .filter((item) => {
                if (search) {
                    const haystack = [item.code, item.description, item.generalDescription || '', item.operationGroup || '']
                        .join(' ')
                        .toLowerCase()
                    if (!haystack.includes(search)) return false
                }
                if (params?.direction === 'outbound' && !['outbound', 'both'].includes(item.operationDirection)) return false
                if (params?.direction === 'inbound' && !['inbound', 'both'].includes(item.operationDirection)) return false
                if (params?.scope && params.scope !== 'all' && item.operationScope !== params.scope) return false
                if (params?.status && params.status !== 'all' && item.configurationStatus !== params.status) return false
                if (params?.usageMode === 'used' && item.usage.totalProfiles === 0 && item.usage.contextualRuleCount === 0) return false
                if (params?.usageMode === 'unused' && (item.usage.totalProfiles > 0 || item.usage.contextualRuleCount > 0)) return false
                if (params?.stMode === 'with_st' && !item.supportsSt) return false
                if (params?.stMode === 'without_st' && item.supportsSt) return false
                return true
            })

        return {
            success: true,
            data: {
                versionId: version.id,
                versionLabel: version.versionLabel,
                totalCount: items.length,
                readyCount: items.filter((item) => item.configurationStatus === 'ready').length,
                partialCount: items.filter((item) => item.configurationStatus === 'partial').length,
                pendingCount: items.filter((item) => item.configurationStatus === 'pending').length,
                legacyCount: items.filter((item) => item.configurationStatus === 'legacy').length,
                usedCount: items.filter((item) => item.usage.totalProfiles > 0 || item.usage.contextualRuleCount > 0).length,
                items,
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar configuracoes de CFOP.') }
    }
}

export async function getCfopConfigDetailAction(entryId: string): Promise<{ success: boolean; data?: CfopConfigDetail; error?: string }> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(entryId)) throw new Error('CFOP invalido.')
        const adminSupabase = createServiceRoleClient()

        const { data: entry, error: entryError } = await adminSupabase
            .from('fiscal_cfop_entries')
            .select('id, version_id, code, description, operation_direction, fiscal_reference_versions!inner(version_label, source_type)')
            .eq('id', entryId)
            .single()
        if (entryError || !entry) throw entryError || new Error('CFOP nao encontrado.')

        const { data: config } = await adminSupabase
            .from('fiscal_cfop_configs')
            .select('*')
            .eq('cfop_entry_id', entryId)
            .maybeSingle()

        const configMetadata = sanitizeJsonObject(config?.metadata_jsonb)
        const defaultSource = isCfopDefaultSource(sanitizeText(configMetadata.default_source as string | null))
            ? (sanitizeText(configMetadata.default_source as string | null) as CfopDefaultSource)
            : null

        const configId = sanitizeText(config?.id as string | null)
        const usageMap = await buildUsageMap(configId ? [configId] : [])
        const usage = configId ? usageMap.get(configId) || buildEmptyUsage() : buildEmptyUsage()

        let icmsConfig: Record<string, unknown> | null = null
        let ibscbsConfig: Record<string, unknown> | null = null
        let piscofinsConfig: Record<string, unknown> | null = null
        if (configId) {
            const [icmsResult, ibscbsResult, piscofinsResult] = await Promise.all([
                adminSupabase.from('fiscal_cfop_icms_configs').select('*').eq('cfop_config_id', configId).maybeSingle(),
                adminSupabase.from('fiscal_cfop_ibscbs_configs').select('*').eq('cfop_config_id', configId).maybeSingle(),
                adminSupabase.from('fiscal_cfop_piscofins_configs').select('*').eq('cfop_config_id', configId).maybeSingle(),
            ])
            icmsConfig = (icmsResult.data || null) as Record<string, unknown> | null
            ibscbsConfig = (ibscbsResult.data || null) as Record<string, unknown> | null
            piscofinsConfig = (piscofinsResult.data || null) as Record<string, unknown> | null
        }

        let prefilledFrom: CfopConfigDetail['prefilledFrom'] = null
        if (!configId) {
            const { data: siblingEntries } = await adminSupabase
                .from('fiscal_cfop_entries')
                .select('id')
                .eq('code', entry.code)
                .neq('id', entryId)

            const siblingEntryIds = ((siblingEntries || []) as Array<Record<string, unknown>>)
                .map((row) => String(row.id || ''))
                .filter((value) => value.length > 0)

            if (siblingEntryIds.length > 0) {
                const { data: previousConfig } = await adminSupabase
                    .from('fiscal_cfop_configs')
                    .select('id, cfop_version_id, cfop_entry_id')
                    .in('cfop_entry_id', siblingEntryIds)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (previousConfig) {
                    prefilledFrom = {
                        configId: String(previousConfig.id),
                        versionId: String(previousConfig.cfop_version_id || ''),
                        code: String(entry.code || ''),
                    }
                }
            }
        }

        return {
            success: true,
            data: {
                entryId: String(entry.id),
                configId,
                versionId: String(entry.version_id || ''),
                versionLabel: String(
                    Array.isArray(entry.fiscal_reference_versions)
                        ? entry.fiscal_reference_versions[0]?.version_label || ''
                        : (entry.fiscal_reference_versions as { version_label?: string } | null)?.version_label || ''
                ),
                isManualEntry: String(
                    Array.isArray(entry.fiscal_reference_versions)
                        ? entry.fiscal_reference_versions[0]?.source_type || ''
                        : (entry.fiscal_reference_versions as { source_type?: string } | null)?.source_type || ''
                ) === 'manual',
                code: String(entry.code || ''),
                description: String(entry.description || ''),
                operationDirection: String(entry.operation_direction || 'both') as 'outbound' | 'inbound' | 'both',
                operationGroup: config && isCfopOperationGroup(String(config.operation_group || ''))
                    ? (String(config.operation_group) as CfopOperationGroup)
                    : 'other',
                generalDescription: sanitizeText(config?.general_description as string | null),
                defaultNote: sanitizeText(config?.default_note as string | null),
                operationScope: config && isCfopOperationScope(String(config.operation_scope || ''))
                    ? (String(config.operation_scope) as CfopOperationScope)
                    : inferCfopScopeFromCode(String(entry.code || '')),
                appliesToOwnManufacture: config?.applies_to_own_manufacture === true,
                appliesToResale: config?.applies_to_resale === true,
                appliesOutsideEstablishment: config?.applies_outside_establishment === true,
                appliesConsumerFinal: config?.applies_consumer_final === true,
                appliesTaxpayer: config?.applies_taxpayer === true,
                supportsSt: config?.supports_st === true,
                impactsIcms: config ? config.impacts_icms !== false : true,
                impactsIbscbs: config?.impacts_ibscbs === true,
                sumOperationTotalInvoice: config ? config.sum_operation_total_invoice !== false : true,
                isRecommended: config?.is_recommended === true,
                isLegacy: config?.is_legacy === true,
                isActive: config?.is_active !== false,
                configurationStatus: config ? normalizeStatus(String(config.configuration_status || 'pending')) : 'pending',
                defaultSource,
                defaultSeedCode: sanitizeText(configMetadata.default_seed_code as string | null),
                defaultAppliedAt: sanitizeText(configMetadata.default_applied_at as string | null),
                manualOverrides: sanitizeJsonObject(configMetadata.manual_overrides),
                suggestedDefaultsSummary: sanitizeJsonObject(configMetadata.suggested_defaults_summary),
                icmsConfig: {
                    calculateIcms: icmsConfig?.calculate_icms !== false,
                    simpleNationalNonTaxed: icmsConfig?.simple_national_non_taxed === true,
                    omitIcmsForIndividual: icmsConfig?.omit_icms_for_individual === true,
                    highlightStOnInvoice: icmsConfig?.highlight_st_on_invoice === true,
                    stCollectedPreviously: icmsConfig?.st_collected_previously === true,
                    metadata: sanitizeJsonObject(icmsConfig?.metadata_jsonb),
                    futureTaxPayload: sanitizeJsonObject(icmsConfig?.future_tax_payload),
                },
                ibscbsConfig: {
                    cstCatalogVersionId: sanitizeText(ibscbsConfig?.cst_catalog_version_id as string | null),
                    cstCode: sanitizeText(ibscbsConfig?.cst_code as string | null),
                    classificationVersionId: sanitizeText(ibscbsConfig?.classification_version_id as string | null),
                    classificationCode: sanitizeText(ibscbsConfig?.classification_code as string | null),
                    regularCstCode: sanitizeText(ibscbsConfig?.regular_cst_code as string | null),
                    regularClassificationCode: sanitizeText(ibscbsConfig?.regular_classification_code as string | null),
                    presumedCreditCatalogVersionId: sanitizeText(ibscbsConfig?.presumed_credit_catalog_version_id as string | null),
                    presumedCreditCode: sanitizeText(ibscbsConfig?.presumed_credit_code as string | null),
                    presumedCreditRate: toNullableNumber(ibscbsConfig?.presumed_credit_rate),
                    metadata: sanitizeJsonObject(ibscbsConfig?.metadata_jsonb),
                    futureTaxPayload: sanitizeJsonObject(ibscbsConfig?.future_tax_payload),
                },
                piscofinsConfig: {
                    pisCstCode: sanitizeText(piscofinsConfig?.pis_cst_code as string | null),
                    cofinsCstCode: sanitizeText(piscofinsConfig?.cofins_cst_code as string | null),
                    metadata: sanitizeJsonObject(piscofinsConfig?.metadata_jsonb),
                    futureTaxPayload: sanitizeJsonObject(piscofinsConfig?.future_tax_payload),
                },
                usage,
                prefilledFrom,
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao carregar configuracao de CFOP.') }
    }
}

async function fetchCfopMasterDefaults(): Promise<CfopMasterDefault[]> {
    const adminSupabase = createServiceRoleClient()
    try {
        const { data, error } = await adminSupabase
            .from('fiscal_cfop_master_defaults')
            .select('*')
            .eq('is_active', true)
            .order('cfop_code', { ascending: true })

        if (error) throw error

        return ((data || []) as Array<Record<string, unknown>>)
            .map((row) => normalizeCfopMasterDefault(row))
            .filter((row): row is CfopMasterDefault => row !== null)
    } catch {
        return []
    }
}

async function fetchCfopMasterDefaultByCode(cfopCode?: string | null) {
    const digits = String(cfopCode || '').replace(/\D/g, '').slice(0, 4)
    if (!/^\d{4}$/.test(digits)) return null

    const adminSupabase = createServiceRoleClient()
    try {
        const { data, error } = await adminSupabase
            .from('fiscal_cfop_master_defaults')
            .select('*')
            .eq('cfop_code', digits)
            .eq('is_active', true)
            .maybeSingle()

        if (error || !data) return null
        return normalizeCfopMasterDefault(data as Record<string, unknown>)
    } catch {
        return null
    }
}

export async function getCfopManualDraftAction(): Promise<{ success: boolean; data?: CfopConfigDetail; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()

        const { data: manualVersion } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('id, version_label')
            .eq('table_type', 'cfop')
            .eq('source_type', 'manual')
            .order('imported_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        return {
            success: true,
            data: {
                entryId: '',
                configId: null,
                versionId: String(manualVersion?.id || ''),
                versionLabel: String(manualVersion?.version_label || 'CFOP manual'),
                isManualEntry: true,
                code: '',
                description: '',
                operationDirection: 'both',
                operationGroup: 'other',
                generalDescription: '',
                defaultNote: null,
                operationScope: 'all',
                appliesToOwnManufacture: false,
                appliesToResale: false,
                appliesOutsideEstablishment: false,
                appliesConsumerFinal: false,
                appliesTaxpayer: false,
                supportsSt: false,
                impactsIcms: true,
                impactsIbscbs: false,
                sumOperationTotalInvoice: true,
                isRecommended: false,
                isLegacy: false,
                isActive: true,
                configurationStatus: 'pending',
                defaultSource: null,
                defaultSeedCode: null,
                defaultAppliedAt: null,
                manualOverrides: {},
                suggestedDefaultsSummary: {},
                icmsConfig: {
                    calculateIcms: true,
                    simpleNationalNonTaxed: false,
                    omitIcmsForIndividual: false,
                    highlightStOnInvoice: false,
                    stCollectedPreviously: false,
                    metadata: {},
                    futureTaxPayload: {},
                },
                ibscbsConfig: {
                    cstCatalogVersionId: null,
                    cstCode: null,
                    classificationVersionId: null,
                    classificationCode: null,
                    regularCstCode: null,
                    regularClassificationCode: null,
                    presumedCreditCatalogVersionId: null,
                    presumedCreditCode: null,
                    presumedCreditRate: null,
                    metadata: {},
                    futureTaxPayload: {},
                },
                piscofinsConfig: {
                    pisCstCode: null,
                    cofinsCstCode: null,
                    metadata: {},
                    futureTaxPayload: {},
                },
                usage: buildEmptyUsage(),
                prefilledFrom: null,
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao preparar o rascunho manual de CFOP.') }
    }
}

export async function upsertCfopConfigAction(input: CfopConfigFormData): Promise<{ success: boolean; data?: { configId: string; entryId: string; versionId: string; created: boolean; configurationStatus: CfopConfigurationStatus }; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()

        const sharedPayload = {
            p_cfop_config_id: input.configId || null,
            p_operation_group: input.operationGroup,
            p_general_description: sanitizeText(input.generalDescription) || sanitizeText(input.description),
            p_default_note: input.defaultNote || null,
            p_operation_scope: input.operationScope,
            p_applies_to_own_manufacture: input.appliesToOwnManufacture,
            p_applies_to_resale: input.appliesToResale,
            p_applies_outside_establishment: input.appliesOutsideEstablishment,
            p_applies_consumer_final: input.appliesConsumerFinal,
            p_applies_taxpayer: input.appliesTaxpayer,
            p_supports_st: input.supportsSt,
            p_impacts_icms: input.impactsIcms,
            p_impacts_ibscbs: input.impactsIbscbs,
            p_sum_operation_total_invoice: input.sumOperationTotalInvoice,
            p_is_recommended: input.isRecommended,
            p_is_legacy: input.isLegacy,
            p_is_active: input.isActive,
            p_icms_config: {
                calculate_icms: input.icmsConfig.calculateIcms,
                simple_national_non_taxed: input.icmsConfig.simpleNationalNonTaxed,
                omit_icms_for_individual: input.icmsConfig.omitIcmsForIndividual,
                highlight_st_on_invoice: input.icmsConfig.highlightStOnInvoice,
                st_collected_previously: input.icmsConfig.stCollectedPreviously,
                metadata_jsonb: input.icmsConfig.metadata || {},
                future_tax_payload: input.icmsConfig.futureTaxPayload || {},
            },
            p_ibscbs_config: {
                cst_catalog_version_id: input.ibscbsConfig.cstCatalogVersionId || null,
                cst_code: input.ibscbsConfig.cstCode || null,
                classification_version_id: input.ibscbsConfig.classificationVersionId || null,
                classification_code: input.ibscbsConfig.classificationCode || null,
                regular_cst_code: input.ibscbsConfig.regularCstCode || null,
                regular_classification_code: input.ibscbsConfig.regularClassificationCode || null,
                presumed_credit_catalog_version_id: input.ibscbsConfig.presumedCreditCatalogVersionId || null,
                presumed_credit_code: input.ibscbsConfig.presumedCreditCode || null,
                presumed_credit_rate: input.ibscbsConfig.presumedCreditRate ?? null,
                metadata_jsonb: input.ibscbsConfig.metadata || {},
                future_tax_payload: input.ibscbsConfig.futureTaxPayload || {},
            },
              p_piscofins_config: {
                  pis_cst_code: input.piscofinsConfig.pisCstCode || null,
                  cofins_cst_code: input.piscofinsConfig.cofinsCstCode || null,
                  metadata_jsonb: input.piscofinsConfig.metadata || {},
                  future_tax_payload: input.piscofinsConfig.futureTaxPayload || {},
              },
              p_metadata_jsonb: {
                  default_source: input.defaultSource || null,
                  default_seed_code: input.defaultSeedCode || null,
                  default_applied_at: input.defaultAppliedAt || null,
                  manual_overrides: sanitizeJsonObject(input.manualOverrides),
                  suggested_defaults_summary:
                      Object.keys(sanitizeJsonObject(input.suggestedDefaultsSummary)).length > 0
                          ? sanitizeJsonObject(input.suggestedDefaultsSummary)
                          : buildCfopSuggestedDefaultsSummary(
                                buildCfopResolvedSuggestion({
                                    cfopCode: input.code,
                                    description: input.description,
                                })
                            ),
              },
              p_future_tax_payload: {},
          }

        const rpcName = input.isManualEntry ? 'admin_upsert_fiscal_cfop_manual_config' : 'admin_upsert_fiscal_cfop_config'
        const rpcPayload = input.isManualEntry
            ? {
                  ...sharedPayload,
                  p_cfop_entry_id: isValidUuid(input.entryId) ? input.entryId : null,
                  p_code: input.code,
                  p_description: input.description,
                  p_operation_direction: input.operationDirection,
              }
            : {
                  ...sharedPayload,
                  p_cfop_entry_id: input.entryId,
                  p_cfop_version_id: input.versionId,
              }

        const { data, error } = await adminSupabase.rpc(rpcName, rpcPayload)

        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row) throw new Error('Nao foi possivel salvar a configuracao de CFOP.')

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/cfop')
        revalidatePath(`/admin/fiscal-bases/cfop/${input.entryId}/editar`)
        revalidatePath('/admin/product-tax-profiles')

        return {
            success: true,
            data: {
                configId: String(row.cfop_config_id),
                entryId: String(row.cfop_entry_id || input.entryId || ''),
                versionId: String(row.cfop_version_id || input.versionId || ''),
                created: row.created === true,
                configurationStatus: normalizeStatus(String(row.configuration_status || 'pending')),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao salvar configuracao de CFOP.') }
    }
}

export async function listCfopMasterDefaultsAction(params?: {
    query?: string | null
    limit?: number
}): Promise<{ success: boolean; data?: CfopMasterDefault[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const search = sanitizeText(params?.query)?.toLowerCase() || ''
        const limit = Math.max(1, Math.min(50, params?.limit || 20))
        const items = await fetchCfopMasterDefaults()
        const filtered = items
            .filter((item) => {
                if (!search) return true
                const haystack = [
                    item.cfopCode,
                    item.defaultDescription,
                    item.primaryContext,
                    item.defaultGeneralDescription || '',
                    item.internalNotes || '',
                ]
                    .join(' ')
                    .toLowerCase()
                return haystack.includes(search)
            })
            .slice(0, limit)

        return { success: true, data: filtered }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar defaults mestres de CFOP.') }
    }
}

export async function getCfopMasterDefaultAction(
    cfopCode: string
): Promise<{ success: boolean; data?: CfopMasterDefault | null; error?: string }> {
    try {
        await ensureAdminAccess()
        return { success: true, data: await fetchCfopMasterDefaultByCode(cfopCode) }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao carregar default mestre de CFOP.') }
    }
}

export async function resolveCfopDefaultsAction(
    input: ResolveCfopDefaultsInput
): Promise<{ success: boolean; data?: CfopResolvedSuggestion | null; error?: string }> {
    try {
        await ensureAdminAccess()
        const digits = String(input.cfopCode || '').replace(/\D/g, '').slice(0, 4)
        if (!/^\d{4}$/.test(digits)) return { success: true, data: null }

        const masterDefault = await fetchCfopMasterDefaultByCode(digits)
        return {
            success: true,
            data: buildCfopResolvedSuggestion({
                cfopCode: digits,
                description: input.description,
                masterDefault,
            }),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao resolver sugestao de CFOP.') }
    }
}

export async function searchCfopConfigOptionsAction(params?: {
    query?: string | null
    operationDirection?: 'outbound' | 'inbound'
    operationScope?: CfopOperationScope | 'all'
    supportsSt?: boolean | null
    impactsIbscbs?: boolean | null
    limit?: number
}): Promise<{ success: boolean; data?: CfopConfigSearchOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const { data: versionRows, error: versionError } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('id, version_label, source_type, is_active')
            .eq('table_type', 'cfop')
            .or('is_active.eq.true,source_type.eq.manual')
            .order('imported_at', { ascending: false })

        if (versionError) throw versionError
        const candidateVersions = (versionRows || []) as Array<Record<string, unknown>>
        if (candidateVersions.length === 0) return { success: true, data: [] }

        const versionLabelById = new Map<string, string>(
            candidateVersions.map((row) => [String(row.id), String(row.version_label || '')])
        )
        const versionIds = candidateVersions.map((row) => String(row.id))

        const [{ data: entries, error: entriesError }, { data: configs, error: configsError }] = await Promise.all([
            adminSupabase
                .from('fiscal_cfop_entries')
                .select('id, version_id, code, description, operation_direction')
                .in('version_id', versionIds)
                .order('code', { ascending: true }),
            adminSupabase
                .from('fiscal_cfop_configs')
                .select('*')
                .in('cfop_version_id', versionIds),
        ])

        if (entriesError) throw entriesError
        if (configsError) throw configsError

        const configMap = new Map<string, Record<string, unknown>>(
            ((configs || []) as Array<Record<string, unknown>>).map((row) => [String(row.cfop_entry_id), row])
        )
        const usageMap = await buildUsageMap(
            ((configs || []) as Array<Record<string, unknown>>).map((row) => String(row.id))
        )
        const search = sanitizeText(params?.query)?.toLowerCase() || ''

        const filtered = ((entries || []) as Array<Record<string, unknown>>)
            .map((entry) => {
                const config = configMap.get(String(entry.id)) || null
                const usage = config ? usageMap.get(String(config.id)) || buildEmptyUsage() : buildEmptyUsage()
                return mapCfopListItem(entry, config, usage)
            })
            .filter((item) => item.configId && item.configurationStatus !== 'pending' && item.isActive)
            .filter((item) => {
                if (search) {
                    const haystack = [item.code, item.description, item.generalDescription || '', item.operationGroup || '']
                        .join(' ')
                        .toLowerCase()
                    if (!haystack.includes(search)) return false
                }
                if (params?.operationDirection === 'outbound' && !['outbound', 'both'].includes(item.operationDirection)) {
                    return false
                }
                if (params?.operationDirection === 'inbound' && !['inbound', 'both'].includes(item.operationDirection)) {
                    return false
                }
                if (params?.impactsIbscbs === true && !item.impactsIbscbs) return false
                if (params?.impactsIbscbs === false && item.impactsIbscbs) return false
                return true
            })
            .slice(0, Math.max(1, Math.min(30, params?.limit || 15)))
            .map((item) => ({
                id: item.configId!,
                configId: item.configId!,
                referenceId: item.entryId,
                versionId: item.versionId,
                versionLabel: versionLabelById.get(item.versionId) || '',
                code: item.code,
                description: item.description,
                secondaryText: [
                    item.operationDirection === 'inbound' ? 'Entrada' : item.operationDirection === 'outbound' ? 'Saida' : 'Entrada e saida',
                    getCfopOperationScopeLabel(item.operationScope),
                    item.operationGroup ? getCfopOperationGroupLabel(item.operationGroup) : null,
                    versionLabelById.get(item.versionId)?.toLowerCase().includes('manual') ? 'Manual' : null,
                    item.supportsSt ? 'ST' : null,
                ]
                    .filter(Boolean)
                    .join(' | '),
                metadata: {
                    operation_direction: item.operationDirection,
                    operation_scope: item.operationScope,
                    configuration_status: item.configurationStatus,
                    supports_st: item.supportsSt,
                    impacts_icms: item.impactsIcms,
                    impacts_ibscbs: item.impactsIbscbs,
                },
                operationDirection: item.operationDirection,
                operationScope: item.operationScope,
                configurationStatus: item.configurationStatus,
                supportsSt: item.supportsSt,
                impactsIcms: item.impactsIcms,
                impactsIbscbs: item.impactsIbscbs,
            }))

        return { success: true, data: filtered }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao buscar opcoes de CFOP contextual.') }
    }
}

export async function listCfopUsageSummaryAction(configIds: string[]): Promise<{ success: boolean; data?: Record<string, CfopConfigUsageSummary>; error?: string }> {
    try {
        await ensureAdminAccess()
        const validIds = configIds.filter((item) => isValidUuid(item))
        const map = await buildUsageMap(validIds)
        return {
            success: true,
            data: Object.fromEntries(Array.from(map.entries())),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao carregar resumo de uso dos CFOPs.') }
    }
}

