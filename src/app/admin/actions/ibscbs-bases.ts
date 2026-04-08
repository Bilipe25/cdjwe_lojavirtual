'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { IbscbsVersionStatus } from '@/lib/fiscal/ibscbs'

export interface IbscbsRuleInput {
    id?: string | null
    targetUf?: string | null
    cstCode: string
    classificationCode: string
    isActive?: boolean
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface IbscbsBaseVersionItem {
    id: string
    versionNumber: number
    versionLabel: string
    status: IbscbsVersionStatus
    validFrom: string | null
    validTo: string | null
    activatedAt: string | null
    ruleCount: number
    ufCount: number
}

export interface IbscbsBaseFormData {
    baseId?: string | null
    versionId?: string | null
    name: string
    code: string
    description?: string | null
    isBaseActive: boolean
    versionLabel: string
    status: IbscbsVersionStatus
    validFrom?: string | null
    validTo?: string | null
    cstCatalogVersionId: string
    classificationCatalogVersionId: string
    nationalRule: IbscbsRuleInput
    stateRules: IbscbsRuleInput[]
}

export interface IbscbsBaseDetail {
    form: IbscbsBaseFormData
    activeVersionId: string | null
    versionHistory: IbscbsBaseVersionItem[]
}

export interface IbscbsBaseListItem {
    id: string
    name: string
    code: string
    description: string | null
    isActive: boolean
    updatedAt: string
    totalVersions: number
    activeVersionId: string | null
    activeVersionLabel: string | null
    activeValidFrom: string | null
    activeValidTo: string | null
    totalRuleCount: number
    ufCount: number
    hasDraft: boolean
    hasFutureVersion: boolean
    hasExpiredVersion: boolean
}

export interface IbscbsBaseOption {
    baseId: string
    versionId: string
    code: string
    name: string
    description: string | null
    versionLabel: string
    validFrom: string | null
    validTo: string | null
    isBaseActive: boolean
    isVersionActive: boolean
    status: IbscbsVersionStatus
}

export interface IbscbsCatalogVersionItem {
    id: string
    versionLabel: string
    validFrom: string | null
    validTo: string | null
    isActive: boolean
    sourceType: string
    importBatchLabel: string | null
}

export interface IbscbsCstCatalogItem {
    id: string
    catalogVersionId: string
    code: string
    label: string
    description: string | null
    sortOrder: number
    isActive: boolean
}

export interface IbscbsClassificationCatalogItem {
    id: string
    catalogVersionId: string
    code: string
    cstCode: string
    label: string
    shortLabel: string | null
    description: string | null
    validFrom: string | null
    validTo: string | null
    isActive: boolean
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

function mapRuleRow(row: Record<string, unknown>): IbscbsRuleInput {
    return {
        id: String(row.id),
        targetUf: typeof row.target_uf === 'string' ? row.target_uf : null,
        cstCode: String(row.cst_code || ''),
        classificationCode: String(row.classification_code || ''),
        isActive: row.is_active !== false,
        metadata: sanitizeJsonObject(row.metadata_jsonb),
        futureTaxPayload: sanitizeJsonObject(row.future_tax_payload),
    }
}

export async function listIbscbsCatalogVersionsAction(): Promise<{
    success: boolean
    data?: { cstVersions: IbscbsCatalogVersionItem[]; classificationVersions: IbscbsCatalogVersionItem[] }
    error?: string
}> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const [{ data: cstRows, error: cstError }, { data: classificationRows, error: classificationError }] =
            await Promise.all([
                adminSupabase.from('fiscal_ibscbs_cst_catalog_versions').select('*').order('valid_from', { ascending: false, nullsFirst: false }),
                adminSupabase.from('fiscal_ibscbs_classification_versions').select('*').order('valid_from', { ascending: false, nullsFirst: false }),
            ])

        if (cstError) throw cstError
        if (classificationError) throw classificationError

        const mapVersion = (row: Record<string, unknown>): IbscbsCatalogVersionItem => ({
            id: String(row.id),
            versionLabel: String(row.version_label || ''),
            validFrom: typeof row.valid_from === 'string' ? row.valid_from : null,
            validTo: typeof row.valid_to === 'string' ? row.valid_to : null,
            isActive: row.is_active !== false,
            sourceType: String(row.source_type || 'seed'),
            importBatchLabel: sanitizeText(row.import_batch_label as string | null),
        })

        return {
            success: true,
            data: {
                cstVersions: ((cstRows || []) as Array<Record<string, unknown>>).map(mapVersion),
                classificationVersions: ((classificationRows || []) as Array<Record<string, unknown>>).map(mapVersion),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar versoes de catalogo IBS/CBS.') }
    }
}

export async function listIbscbsCstCatalogAction(params?: {
    catalogVersionId?: string | null
}): Promise<{ success: boolean; data?: IbscbsCstCatalogItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        let catalogVersionId = sanitizeText(params?.catalogVersionId)
        if (!catalogVersionId) {
            const { data: activeVersion, error } = await adminSupabase
                .from('fiscal_ibscbs_cst_catalog_versions')
                .select('id')
                .eq('is_active', true)
                .order('valid_from', { ascending: false, nullsFirst: false })
                .limit(1)
                .single()

            if (error || !activeVersion) throw error || new Error('Catalogo CST IBS/CBS nao encontrado.')
            catalogVersionId = String(activeVersion.id)
        }

        const { data, error } = await adminSupabase
            .from('fiscal_ibscbs_cst_catalog_items')
            .select('*')
            .eq('catalog_version_id', catalogVersionId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('code', { ascending: true })

        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                catalogVersionId: String(row.catalog_version_id || ''),
                code: String(row.code || ''),
                label: String(row.label || ''),
                description: sanitizeText(row.description as string | null),
                sortOrder: Number(row.sort_order || 0),
                isActive: row.is_active !== false,
            })),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar catalogo CST IBS/CBS.') }
    }
}

export async function searchIbscbsClassificationAction(params?: {
    query?: string | null
    cstCode?: string | null
    catalogVersionId?: string | null
    limit?: number
}): Promise<{ success: boolean; data?: IbscbsClassificationCatalogItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        let catalogVersionId = sanitizeText(params?.catalogVersionId)
        if (!catalogVersionId) {
            const { data: activeVersion, error } = await adminSupabase
                .from('fiscal_ibscbs_classification_versions')
                .select('id')
                .eq('is_active', true)
                .order('valid_from', { ascending: false, nullsFirst: false })
                .limit(1)
                .single()
            if (error || !activeVersion) throw error || new Error('Catalogo de classificacao IBS/CBS nao encontrado.')
            catalogVersionId = String(activeVersion.id)
        }

        let queryBuilder = adminSupabase
            .from('fiscal_ibscbs_classification_items')
            .select('*')
            .eq('catalog_version_id', catalogVersionId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('code', { ascending: true })
            .limit(Math.max(1, Math.min(30, params?.limit || 12)))

        const cstCode = sanitizeText(params?.cstCode)
        if (cstCode) queryBuilder = queryBuilder.eq('cst_code', cstCode)

        const search = sanitizeText(params?.query)
        if (search) queryBuilder = queryBuilder.or(`code.ilike.%${search}%,label.ilike.%${search}%,short_label.ilike.%${search}%`)

        const { data, error } = await queryBuilder
        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                catalogVersionId: String(row.catalog_version_id || ''),
                code: String(row.code || ''),
                cstCode: String(row.cst_code || ''),
                label: String(row.label || ''),
                shortLabel: sanitizeText(row.short_label as string | null),
                description: sanitizeText(row.description as string | null),
                validFrom: typeof row.valid_from === 'string' ? row.valid_from : null,
                validTo: typeof row.valid_to === 'string' ? row.valid_to : null,
                isActive: row.is_active !== false,
            })),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao buscar classificacoes IBS/CBS.') }
    }
}

export async function listIbscbsBasesAction(params?: {
    search?: string | null
    includeInactive?: boolean
}): Promise<{ success: boolean; data?: IbscbsBaseListItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase.from('fiscal_ibscbs_bases').select('*').order('updated_at', { ascending: false })
        if (params?.includeInactive === false) query = query.eq('is_active', true)
        const search = sanitizeText(params?.search)
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,description.ilike.%${search}%`)
        const { data: bases, error } = await query
        if (error) throw error

        const baseIds = ((bases || []) as Array<Record<string, unknown>>).map((row) => String(row.id))
        if (baseIds.length === 0) return { success: true, data: [] }

        const { data: versionRows, error: versionError } = await adminSupabase
            .from('fiscal_ibscbs_base_versions')
            .select('*')
            .in('ibscbs_base_id', baseIds)
            .order('version_number', { ascending: false })
        if (versionError) throw versionError
        const versions = (versionRows || []) as Array<Record<string, unknown>>
        const versionIds = versions.map((row) => String(row.id))
        let rules: Array<Record<string, unknown>> = []
        if (versionIds.length > 0) {
            const { data, error: rulesFetchError } = await adminSupabase
                .from('fiscal_ibscbs_rules')
                .select('ibscbs_version_id, target_uf, is_active')
                .in('ibscbs_version_id', versionIds)
            if (rulesFetchError) throw rulesFetchError
            rules = (data || []) as Array<Record<string, unknown>>
        }

        return {
            success: true,
            data: ((bases || []) as Array<Record<string, unknown>>).map((baseRow) => {
                const id = String(baseRow.id)
                const relatedVersions = versions.filter((row) => String(row.ibscbs_base_id) === id)
                const activeVersion = relatedVersions.find((row) => String(row.status) === 'active') || null
                const relatedVersionIds = new Set(relatedVersions.map((row) => String(row.id)))
                const relatedRules = rules.filter((row) => relatedVersionIds.has(String(row.ibscbs_version_id)) && row.is_active !== false)
                return {
                    id,
                    name: String(baseRow.name || ''),
                    code: String(baseRow.code || ''),
                    description: sanitizeText(baseRow.description as string | null),
                    isActive: baseRow.is_active !== false,
                    updatedAt: String(baseRow.updated_at || baseRow.created_at || ''),
                    totalVersions: relatedVersions.length,
                    activeVersionId: activeVersion ? String(activeVersion.id) : null,
                    activeVersionLabel: activeVersion ? String(activeVersion.version_label || '') : null,
                    activeValidFrom: activeVersion && typeof activeVersion.valid_from === 'string' ? activeVersion.valid_from : null,
                    activeValidTo: activeVersion && typeof activeVersion.valid_to === 'string' ? activeVersion.valid_to : null,
                    totalRuleCount: relatedRules.length,
                    ufCount: relatedRules.filter((row) => typeof row.target_uf === 'string' && String(row.target_uf).trim()).length,
                    hasDraft: relatedVersions.some((row) => String(row.status) === 'draft'),
                    hasFutureVersion: relatedVersions.some((row) => typeof row.valid_from === 'string' && new Date(String(row.valid_from)) > new Date()),
                    hasExpiredVersion: relatedVersions.some((row) => typeof row.valid_to === 'string' && new Date(String(row.valid_to)) < new Date()),
                } satisfies IbscbsBaseListItem
            }),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar bases de IBS/CBS.') }
    }
}

export async function listIbscbsBaseOptionsAction(params?: {
    includeCurrentVersionId?: string | null
}): Promise<{ success: boolean; data?: IbscbsBaseOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const currentVersionId = sanitizeText(params?.includeCurrentVersionId)
        let query = adminSupabase
            .from('fiscal_ibscbs_base_versions')
            .select('id, ibscbs_base_id, version_label, valid_from, valid_to, status')
            .order('version_label', { ascending: true })

        query = currentVersionId ? query.or(`status.eq.active,id.eq.${currentVersionId}`) : query.eq('status', 'active')

        const { data: versionRows, error } = await query
        if (error) throw error
        const versions = (versionRows || []) as Array<Record<string, unknown>>
        const baseIds = Array.from(new Set(versions.map((row) => String(row.ibscbs_base_id))))
        if (baseIds.length === 0) return { success: true, data: [] }

        const { data: baseRows, error: baseError } = await adminSupabase
            .from('fiscal_ibscbs_bases')
            .select('id, code, name, description, is_active')
            .in('id', baseIds)
        if (baseError) throw baseError

        const baseById = ((baseRows || []) as Array<Record<string, unknown>>).reduce<Record<string, Record<string, unknown>>>((acc, row) => {
            acc[String(row.id)] = row
            return acc
        }, {})

        return {
            success: true,
            data: versions
                .map((row) => {
                    const base = baseById[String(row.ibscbs_base_id)]
                    if (!base) return null
                    return {
                        baseId: String(base.id),
                        versionId: String(row.id),
                        code: String(base.code || ''),
                        name: String(base.name || ''),
                        description: sanitizeText(base.description as string | null),
                        versionLabel: String(row.version_label || ''),
                        validFrom: typeof row.valid_from === 'string' ? row.valid_from : null,
                        validTo: typeof row.valid_to === 'string' ? row.valid_to : null,
                        isBaseActive: base.is_active !== false,
                        isVersionActive: String(row.status) === 'active',
                        status: String(row.status || 'draft') as IbscbsVersionStatus,
                    } satisfies IbscbsBaseOption
                })
                .filter((item): item is IbscbsBaseOption => item !== null)
                .sort((left, right) => left.name.localeCompare(right.name) || left.versionLabel.localeCompare(right.versionLabel)),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar opcoes de base IBS/CBS.') }
    }
}

export async function getIbscbsBaseDetailAction(
    ibscbsBaseId: string,
    versionId?: string | null
): Promise<{ success: boolean; data?: IbscbsBaseDetail; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const [{ data: base, error: baseError }, { data: versionRows, error: versionError }] = await Promise.all([
            adminSupabase.from('fiscal_ibscbs_bases').select('*').eq('id', ibscbsBaseId).single(),
            adminSupabase.from('fiscal_ibscbs_base_versions').select('*').eq('ibscbs_base_id', ibscbsBaseId).order('version_number', { ascending: false }),
        ])
        if (baseError || !base) throw baseError || new Error('Base IBS/CBS nao encontrada.')
        if (versionError) throw versionError

        const versions = (versionRows || []) as Array<Record<string, unknown>>
        const selectedVersion =
            versions.find((row) => String(row.id) === String(versionId || '')) ||
            versions.find((row) => String(row.status) === 'draft') ||
            versions.find((row) => String(row.status) === 'active') ||
            versions[0]

        if (!selectedVersion) throw new Error('Nenhuma versao encontrada para a base IBS/CBS.')

        const versionIds = versions.map((row) => String(row.id))
        const { data: ruleRows, error: ruleError } = await adminSupabase
            .from('fiscal_ibscbs_rules')
            .select('*')
            .in('ibscbs_version_id', versionIds)
            .order('ibscbs_version_id', { ascending: true })
            .order('target_uf', { ascending: true, nullsFirst: true })
        if (ruleError) throw ruleError

        const mappedRulesByVersionId = ((ruleRows || []) as Array<Record<string, unknown>>).reduce<Record<string, IbscbsRuleInput[]>>(
            (acc, row) => {
                const key = String(row.ibscbs_version_id)
                const list = acc[key] || []
                list.push(mapRuleRow(row))
                acc[key] = list
                return acc
            },
            {}
        )
        const mappedRules = mappedRulesByVersionId[String(selectedVersion.id)] || []
        const versionHistory = versions.map((row) => {
            const versionRuleRows = mappedRulesByVersionId[String(row.id)] || []
            return {
                id: String(row.id),
                versionNumber: Number(row.version_number || 1),
                versionLabel: String(row.version_label || ''),
                status: String(row.status || 'draft') as IbscbsVersionStatus,
                validFrom: typeof row.valid_from === 'string' ? row.valid_from : null,
                validTo: typeof row.valid_to === 'string' ? row.valid_to : null,
                activatedAt: typeof row.activated_at === 'string' ? row.activated_at : null,
                ruleCount: versionRuleRows.length,
                ufCount: versionRuleRows.filter((rule) => Boolean(rule.targetUf)).length,
            } satisfies IbscbsBaseVersionItem
        })

        const nationalRule =
            mappedRules.find((rule) => !rule.targetUf) ||
            ({
                cstCode: '',
                classificationCode: '',
                isActive: true,
            } satisfies IbscbsRuleInput)

        return {
            success: true,
            data: {
                form: {
                    baseId: String(base.id),
                    versionId: String(selectedVersion.id),
                    name: String(base.name || ''),
                    code: String(base.code || ''),
                    description: sanitizeText(base.description as string | null),
                    isBaseActive: base.is_active !== false,
                    versionLabel: String(selectedVersion.version_label || ''),
                    status: String(selectedVersion.status || 'draft') as IbscbsVersionStatus,
                    validFrom: typeof selectedVersion.valid_from === 'string' ? selectedVersion.valid_from : null,
                    validTo: typeof selectedVersion.valid_to === 'string' ? selectedVersion.valid_to : null,
                    cstCatalogVersionId: String(selectedVersion.cst_catalog_version_id || ''),
                    classificationCatalogVersionId: String(selectedVersion.classification_catalog_version_id || ''),
                    nationalRule,
                    stateRules: mappedRules.filter((rule) => Boolean(rule.targetUf)),
                },
                activeVersionId: versions.find((row) => String(row.status) === 'active')?.id ? String(versions.find((row) => String(row.status) === 'active')?.id) : null,
                versionHistory,
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao carregar base IBS/CBS.') }
    }
}

export async function upsertIbscbsBaseVersionAction(
    input: IbscbsBaseFormData
): Promise<{ success: boolean; data?: { ibscbsBaseId: string; ibscbsVersionId: string; createdBase: boolean; createdVersion: boolean }; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_upsert_fiscal_ibscbs_base_version', {
            p_ibscbs_base_id: input.baseId ?? null,
            p_ibscbs_version_id: input.versionId ?? null,
            p_name: input.name.trim(),
            p_code: input.code.trim().toUpperCase(),
            p_description: sanitizeText(input.description),
            p_base_is_active: input.isBaseActive !== false,
            p_version_label: input.versionLabel.trim(),
            p_valid_from: input.validFrom || null,
            p_valid_to: input.validTo || null,
            p_cst_catalog_version_id: input.cstCatalogVersionId,
            p_classification_catalog_version_id: input.classificationCatalogVersionId,
            p_national_rule: {
                id: input.nationalRule.id ?? null,
                cst_code: input.nationalRule.cstCode,
                classification_code: input.nationalRule.classificationCode,
                is_active: input.nationalRule.isActive !== false,
                metadata_jsonb: sanitizeJsonObject(input.nationalRule.metadata),
                future_tax_payload: sanitizeJsonObject(input.nationalRule.futureTaxPayload),
            },
            p_state_rules: input.stateRules.map((rule) => ({
                id: rule.id ?? null,
                target_uf: rule.targetUf ?? null,
                cst_code: rule.cstCode,
                classification_code: rule.classificationCode,
                is_active: rule.isActive !== false,
                metadata_jsonb: sanitizeJsonObject(rule.metadata),
                future_tax_payload: sanitizeJsonObject(rule.futureTaxPayload),
            })),
            p_metadata_jsonb: {},
            p_future_tax_payload: {},
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.ibscbs_base_id || !row?.ibscbs_version_id) throw new Error('Falha ao salvar base IBS/CBS.')

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/ibscbs')
        revalidatePath('/admin/product-tax-profiles')

        return {
            success: true,
            data: {
                ibscbsBaseId: String(row.ibscbs_base_id),
                ibscbsVersionId: String(row.ibscbs_version_id),
                createdBase: Boolean(row.created_base),
                createdVersion: Boolean(row.created_version),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao salvar base IBS/CBS.') }
    }
}

export async function createIbscbsBaseVersionAction(
    ibscbsBaseId: string,
    sourceVersionId?: string | null
): Promise<{ success: boolean; data?: { ibscbsBaseId: string; ibscbsVersionId: string }; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_create_fiscal_ibscbs_base_version', {
            p_ibscbs_base_id: ibscbsBaseId,
            p_source_version_id: sourceVersionId ?? null,
            p_version_label: null,
            p_valid_from: null,
            p_valid_to: null,
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.ibscbs_base_id || !row?.ibscbs_version_id) throw new Error('Falha ao criar nova versao IBS/CBS.')

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/ibscbs')
        return {
            success: true,
            data: {
                ibscbsBaseId: String(row.ibscbs_base_id),
                ibscbsVersionId: String(row.ibscbs_version_id),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao criar nova versao IBS/CBS.') }
    }
}

export async function activateIbscbsBaseVersionAction(
    ibscbsVersionId: string
): Promise<{ success: boolean; data?: { ibscbsBaseId: string; ibscbsVersionId: string; versionLabel: string }; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_activate_fiscal_ibscbs_base_version', {
            p_ibscbs_version_id: ibscbsVersionId,
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.ibscbs_base_id || !row?.ibscbs_version_id) throw new Error('Falha ao ativar versao IBS/CBS.')

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/ibscbs')
        revalidatePath('/admin/product-tax-profiles')

        return {
            success: true,
            data: {
                ibscbsBaseId: String(row.ibscbs_base_id),
                ibscbsVersionId: String(row.ibscbs_version_id),
                versionLabel: String(row.version_label || ''),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao ativar versao IBS/CBS.') }
    }
}
