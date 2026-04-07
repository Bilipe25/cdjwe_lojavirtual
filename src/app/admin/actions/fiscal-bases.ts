'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
    FISCAL_BASE_LABELS,
    FISCAL_CATALOG_LABELS,
    isFiscalBaseType,
    isFiscalCatalogType,
    isFiscalImportSourceType,
    type FiscalBaseType,
    type FiscalCatalogType,
    type FiscalImportSourceType,
} from '@/lib/fiscal/constants'
import {
    buildFiscalImportPreview,
    buildFiscalTemplateCsv,
    type BuildFiscalImportPreviewInput,
    type FiscalImportPreviewSummary,
} from '@/lib/fiscal/import-utils'
import { validateFiscalPreviewAgainstReferenceBases } from '@/lib/fiscal/cross-validation'

export interface FiscalReferenceVersionItem {
    id: string
    tableType: FiscalBaseType
    versionLabel: string
    importedAt: string
    importedBy: string | null
    validFrom: string | null
    validTo: string | null
    isActive: boolean
    sourceFileName: string | null
    sourceType: FiscalImportSourceType
    rowCount: number
    activatedAt: string | null
    activatedBy: string | null
    metadata: Record<string, unknown>
    futureTaxPayload: Record<string, unknown>
}

export interface FiscalBaseDashboardCard {
    tableType: FiscalBaseType
    label: string
    description: string | null
    isEnabled: boolean
    recommendedRefreshDays: number
    activeVersion: FiscalReferenceVersionItem | null
    latestVersion: FiscalReferenceVersionItem | null
    lastImportAt: string | null
    rowCount: number
    isStale: boolean
    staleByDays: number | null
    hasAnyVersion: boolean
}

export interface FiscalBaseEntryRecord {
    id: string
    versionId: string
    versionLabel: string
    code: string
    description: string
    rowType: 'final' | 'structural'
    metadata?: Record<string, unknown>
    fullDescription?: string | null
    sourceCode?: string | null
    startDate?: string | null
    endDate?: string | null
    legalAct?: string | null
    legalNumber?: string | null
    legalYear?: string | null
    segment?: string | null
    exTipi?: string | null
    ipiRate?: number | null
    operationDirection?: 'outbound' | 'inbound' | 'both'
    ncmCodes?: string[]
}

export interface FiscalCatalogItemOption {
    id: string
    catalogType: FiscalCatalogType
    code: string
    label: string
    description: string | null
    sortOrder: number
    isActive: boolean
    metadata: Record<string, unknown>
}

export interface FiscalSearchOption {
    id: string
    versionId: string
    versionLabel: string
    code: string
    description: string
    secondaryText?: string | null
    metadata?: Record<string, unknown>
}

export interface FiscalImportBatchListItem {
    id: string
    tableType: FiscalBaseType
    status: 'draft' | 'imported' | 'failed' | 'cancelled'
    sourceFileName: string | null
    sourceType: FiscalImportSourceType
    importedBy: string | null
    importedByName: string | null
    startedAt: string
    finishedAt: string | null
    totalRows: number
    validRows: number
    invalidRows: number
    errorSummary: Record<string, unknown>
    versionId: string | null
    versionLabel: string | null
    activeVersion: boolean
}

export interface FiscalImportBatchDetail extends FiscalImportBatchListItem {
    items: Array<{
        id: string
        rowNumber: number
        validationStatus: 'valid' | 'invalid'
        rawPayload: Record<string, string>
        normalizedPayload: Record<string, unknown>
        validationErrors: string[]
        validationWarnings: string[]
    }>
}

export interface FiscalBaseEntriesResult {
    version: FiscalReferenceVersionItem | null
    items: FiscalBaseEntryRecord[]
    entries: FiscalBaseEntryRecord[]
    baseState: 'empty' | 'inactive_only' | 'active_or_selected'
    totalCount: number
    page: number
    pageSize: number
    totalPages: number
    structuralRowCount: number
    finalRowCount: number
    includeStructuralRows?: boolean
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export type FiscalNcmSortBy =
    | 'code'
    | 'description'
    | 'start_date'
    | 'end_date'
    | 'legal_act'
    | 'legal_number'
    | 'legal_year'

export interface FiscalNcmSuggestions {
    ncm: FiscalSearchOption | null
    tipi: FiscalSearchOption[]
    cest: FiscalSearchOption[]
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

function normalizeFiscalImportConstraintError(error: unknown, fallback: string) {
    const message = getErrorMessage(error, fallback)
    const normalized = message.toLowerCase()

    if (
        normalized.includes('fiscal_import_batches_source_type_check') ||
        (normalized.includes('fiscal_import_batches') && normalized.includes('source_type_check'))
    ) {
        return 'A base de dados ainda nao foi atualizada para aceitar importacao XLSX. Aplique a migration 072 do modulo fiscal.'
    }

    if (
        normalized.includes('fiscal_reference_versions_source_type_check') ||
        (normalized.includes('fiscal_reference_versions') && normalized.includes('source_type_check'))
    ) {
        return 'A base de dados ainda nao foi atualizada para registrar versoes fiscais com origem XLSX. Aplique a migration 072 do modulo fiscal.'
    }

    return message
}

function normalizeFiscalVersionActivationError(error: unknown, fallback: string) {
    const message = getErrorMessage(error, fallback)
    const normalized = message.toLowerCase()

    if (
        normalized.includes('table_type') &&
        normalized.includes('ambiguous')
    ) {
        return 'A base de dados ainda está com a versão antiga da função de ativação fiscal. Aplique a migration 074_fix_activate_fiscal_version_table_type_ambiguity.sql e tente novamente.'
    }

    return message
}

function isValidUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function sanitizeText(value?: string | null) {
    const normalized = normalizeMojibakeText(value)
    return normalized && normalized.length > 0 ? normalized : null
}

function normalizeMojibakeText(value?: string | null) {
    const trimmed = (value || '').trim()
    if (!trimmed) return null
    if (!/[ÃƒÃ‚Ã¢ï¿½]/.test(trimmed)) return trimmed

    try {
        const decoded = Buffer.from(trimmed, 'latin1').toString('utf8').trim()
        if (decoded && !/[ÃƒÃ‚ï¿½]/.test(decoded)) {
            return decoded
        }
    } catch {
        return trimmed
    }

    return trimmed
}

function normalizeRequiredText(value: unknown, fallback = '') {
    if (typeof value !== 'string') return fallback
    return normalizeMojibakeText(value) || fallback
}

function sanitizeJsonObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function sanitizeJsonArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function getNcmRowType(code: string): FiscalBaseEntryRecord['rowType'] {
    return /^\d{8}$/.test(code) ? 'final' : 'structural'
}

function isFiscalNcmSortBy(value?: string | null): value is FiscalNcmSortBy {
    return ['code', 'description', 'start_date', 'end_date', 'legal_act', 'legal_number', 'legal_year'].includes(
        String(value || '')
    )
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

function mapVersionRow(row: Record<string, unknown>): FiscalReferenceVersionItem {
    return {
        id: String(row.id),
        tableType: row.table_type as FiscalBaseType,
        versionLabel: normalizeRequiredText(row.version_label),
        importedAt: String(row.imported_at || ''),
        importedBy: (row.imported_by as string | null) || null,
        validFrom: (row.valid_from as string | null) || null,
        validTo: (row.valid_to as string | null) || null,
        isActive: row.is_active === true,
        sourceFileName: (row.source_file_name as string | null) || null,
        sourceType: (String(row.source_type || 'csv') as FiscalImportSourceType),
        rowCount: Number(row.row_count || 0),
        activatedAt: (row.activated_at as string | null) || null,
        activatedBy: (row.activated_by as string | null) || null,
        metadata: sanitizeJsonObject(row.metadata_jsonb),
        futureTaxPayload: sanitizeJsonObject(row.future_tax_payload),
    }
}

async function resolveVersionId(
    tableType: FiscalBaseType,
    requestedVersionId?: string | null,
    options?: { allowLatestFallback?: boolean; allowNull?: boolean }
) {
    const adminSupabase = createServiceRoleClient()

    if (requestedVersionId && isValidUuid(requestedVersionId)) {
        const { data, error } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('*')
            .eq('id', requestedVersionId)
            .eq('table_type', tableType)
            .single()

        if (error || !data) throw error || new Error('Versao fiscal nao encontrada.')
        return mapVersionRow(data as Record<string, unknown>)
    }

    const { data, error } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('*')
        .eq('table_type', tableType)
        .eq('is_active', true)
        .single()

    if (!error && data) {
        return mapVersionRow(data as Record<string, unknown>)
    }

    if (options?.allowLatestFallback) {
        const { data: latestVersion, error: latestError } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('*')
            .eq('table_type', tableType)
            .order('imported_at', { ascending: false })
            .limit(1)

        if (latestError) throw latestError
        const latest = ((latestVersion || []) as Array<Record<string, unknown>>)[0]
        if (latest) return mapVersionRow(latest)
    }

    if (options?.allowNull) return null

    throw error || new Error(`Nenhuma versao ativa encontrada para ${FISCAL_BASE_LABELS[tableType]}.`)
}

function buildSuggestedVersionLabel(tableType: FiscalBaseType) {
    const now = new Date()
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('')
    return `${tableType.toUpperCase()}-${stamp}`
}

async function loadActiveNcmCodes() {
    const adminSupabase = createServiceRoleClient()
    const activeVersion = await resolveVersionId('ncm', null, { allowNull: true })
    if (!activeVersion) return null

    const { data, error } = await adminSupabase
        .from('fiscal_ncm_entries')
        .select('code')
        .eq('version_id', activeVersion.id)

    if (error) throw error
    return new Set(((data || []) as Array<Record<string, unknown>>).map((row) => String(row.code || '')))
}

async function insertFiscalEntriesForVersion(params: {
    tableType: FiscalBaseType
    versionId: string
    items: FiscalImportPreviewSummary['items']
}) {
    const adminSupabase = createServiceRoleClient()
    const validItems = params.items.filter((item) => item.validationStatus === 'valid')
    const insertInChunks = async (table: 'fiscal_ncm_entries' | 'fiscal_tipi_entries' | 'fiscal_cest_entries' | 'fiscal_cest_ncm_links' | 'fiscal_cfop_entries', rows: Record<string, unknown>[], chunkSize = 500) => {
        for (let index = 0; index < rows.length; index += chunkSize) {
            const chunk = rows.slice(index, index + chunkSize)
            if (chunk.length === 0) continue
            const { error } = await adminSupabase.from(table).insert(chunk as never)
            if (error) throw error
        }
    }

    switch (params.tableType) {
        case 'ncm': {
            const rows = validItems.map((item) => ({
                version_id: params.versionId,
                code: String(item.normalizedPayload.code || ''),
                description: String(item.normalizedPayload.description || ''),
                full_description: sanitizeText(item.normalizedPayload.full_description as string | null),
                metadata_jsonb: {
                    source_code: sanitizeText(item.normalizedPayload.source_code as string | null),
                    start_date: sanitizeText(item.normalizedPayload.start_date as string | null),
                    end_date: sanitizeText(item.normalizedPayload.end_date as string | null),
                    legal_act: sanitizeText(item.normalizedPayload.legal_act as string | null),
                    legal_number: sanitizeText(item.normalizedPayload.legal_number as string | null),
                    legal_year: sanitizeText(item.normalizedPayload.legal_year as string | null),
                    row_type: /^\d{8}$/.test(String(item.normalizedPayload.code || '')) ? 'final' : 'structural',
                },
                future_tax_payload: {},
            }))
            if (rows.length === 0) return
            await insertInChunks('fiscal_ncm_entries', rows)
            return
        }
        case 'tipi': {
            const rows = validItems.map((item) => ({
                version_id: params.versionId,
                ncm_code: String(item.normalizedPayload.ncm_code || ''),
                ex_tipi: sanitizeText(item.normalizedPayload.ex_tipi as string | null),
                description: String(item.normalizedPayload.description || ''),
                ipi_rate: Number(item.normalizedPayload.ipi_rate || 0),
                metadata_jsonb: {
                    row_type:
                        String(item.normalizedPayload.row_type || '').trim() === 'structural'
                            ? 'structural'
                            : 'final',
                    source_ncm_code: sanitizeText(item.normalizedPayload.source_ncm_code as string | null),
                    ipi_rate_label: sanitizeText(item.normalizedPayload.ipi_rate_label as string | null),
                },
                future_tax_payload: {},
            }))
            if (rows.length === 0) return
            await insertInChunks('fiscal_tipi_entries', rows)
            return
        }
        case 'cest': {
            const rows = validItems.map((item) => ({
                version_id: params.versionId,
                code: String(item.normalizedPayload.code || ''),
                description: String(item.normalizedPayload.description || ''),
                segment: sanitizeText(item.normalizedPayload.segment as string | null),
                metadata_jsonb: {},
                future_tax_payload: {},
            }))
            if (rows.length === 0) return

            await insertInChunks('fiscal_cest_entries', rows)

            const { data: insertedRows, error } = await adminSupabase
                .from('fiscal_cest_entries')
                .select('id, code')
                .eq('version_id', params.versionId)

            if (error) throw error

            const idByCode = new Map(
                ((insertedRows || []) as Array<Record<string, unknown>>).map((row) => [String(row.code), String(row.id)])
            )

            const linkRows = validItems.flatMap((item) => {
                const cestId = idByCode.get(String(item.normalizedPayload.code || ''))
                if (!cestId) return []
                return sanitizeJsonArray(item.normalizedPayload.ncm_codes).map((ncmCode) => ({
                    cest_entry_id: cestId,
                    ncm_code: ncmCode,
                    metadata_jsonb: {},
                }))
            })

            if (linkRows.length > 0) {
                await insertInChunks('fiscal_cest_ncm_links', linkRows)
            }
            return
        }
        case 'cfop': {
            const rows = validItems.map((item) => ({
                version_id: params.versionId,
                code: String(item.normalizedPayload.code || ''),
                description: String(item.normalizedPayload.description || ''),
                operation_direction: item.normalizedPayload.operation_direction || 'both',
                metadata_jsonb: {},
                future_tax_payload: {},
            }))
            if (rows.length === 0) return
            await insertInChunks('fiscal_cfop_entries', rows)
            return
        }
    }
}

async function listAllFiscalImportBatchItems(batchId: string) {
    const adminSupabase = createServiceRoleClient()
    const allRows: Array<Record<string, unknown>> = []
    const pageSize = 1000

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await adminSupabase
            .from('fiscal_import_batch_items')
            .select('*')
            .eq('batch_id', batchId)
            .order('row_number', { ascending: true })
            .range(offset, offset + pageSize - 1)

        if (error) throw error

        const rows = (data || []) as Array<Record<string, unknown>>
        allRows.push(...rows)

        if (rows.length < pageSize) break
    }

    return allRows
}

async function validatePreviewAgainstCurrentBases(
    tableType: FiscalBaseType,
    preview: FiscalImportPreviewSummary
) {
    return validateFiscalPreviewAgainstReferenceBases(tableType, preview)
}

export async function getFiscalBaseDashboardAction(): Promise<{
    success: boolean
    data?: FiscalBaseDashboardCard[]
    error?: string
}> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const [{ data: settings, error: settingsError }, { data: versions, error: versionsError }] = await Promise.all([
            adminSupabase
                .from('fiscal_reference_type_settings')
                .select('*')
                .order('sort_order', { ascending: true }),
            adminSupabase
                .from('fiscal_reference_versions')
                .select('*')
                .order('imported_at', { ascending: false }),
        ])

        if (settingsError) throw settingsError
        if (versionsError) throw versionsError

        const rowsByType = new Map<FiscalBaseType, FiscalReferenceVersionItem[]>()
        ;((versions || []) as Array<Record<string, unknown>>).forEach((row) => {
            if (!isFiscalBaseType(String(row.table_type || ''))) return
            const tableType = row.table_type as FiscalBaseType
            const list = rowsByType.get(tableType) || []
            list.push(mapVersionRow(row))
            rowsByType.set(tableType, list)
        })

        const cards = ((settings || []) as Array<Record<string, unknown>>)
            .filter((row) => isFiscalBaseType(String(row.table_type || '')))
            .map((settingRow) => {
                const tableType = settingRow.table_type as FiscalBaseType
                const versionRows = rowsByType.get(tableType) || []
                const activeVersion = versionRows.find((row) => row.isActive) || null
                const latestVersion = versionRows[0] || null
                const recommendedRefreshDays = Number(settingRow.recommended_refresh_days || 180)
                const referenceDate = latestVersion?.importedAt || null
                const staleByDays =
                    referenceDate
                        ? Math.max(
                              0,
                              Math.floor(
                                  (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)
                              ) - recommendedRefreshDays
                          )
                        : null
                const isStale = staleByDays !== null && staleByDays > 0

                return {
                    tableType,
                    label: normalizeRequiredText(settingRow.label, FISCAL_BASE_LABELS[tableType]),
                    description: normalizeMojibakeText((settingRow.description as string | null) || null),
                    isEnabled: settingRow.is_enabled !== false,
                    recommendedRefreshDays,
                    activeVersion,
                    latestVersion,
                    lastImportAt: latestVersion?.importedAt || null,
                    rowCount: activeVersion?.rowCount || latestVersion?.rowCount || 0,
                    isStale,
                    staleByDays,
                    hasAnyVersion: versionRows.length > 0,
                } satisfies FiscalBaseDashboardCard
            })

        return { success: true, data: cards }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao carregar dashboard das bases fiscais.'),
        }
    }
}

export async function listFiscalReferenceVersionsAction(
    tableType: FiscalBaseType
): Promise<{ success: boolean; data?: FiscalReferenceVersionItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        if (!isFiscalBaseType(tableType)) throw new Error('Tipo de base fiscal invalido.')

        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('*')
            .eq('table_type', tableType)
            .order('imported_at', { ascending: false })

        if (error) throw error
        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map(mapVersionRow),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao listar versoes fiscais.'),
        }
    }
}

export async function listFiscalBaseEntriesAction(params: {
    tableType: FiscalBaseType
    versionId?: string | null
    search?: string | null
    limit?: number
    page?: number
    pageSize?: number
    sortBy?: string | null
    sortOrder?: 'asc' | 'desc' | null
    includeStructuralRows?: boolean
}): Promise<{
    success: boolean
    data?: FiscalBaseEntriesResult
    error?: string
}> {
    try {
        await ensureAdminAccess()
        if (!isFiscalBaseType(params.tableType)) throw new Error('Tipo de base fiscal invalido.')

        const version = await resolveVersionId(params.tableType, params.versionId, {
            allowLatestFallback: true,
            allowNull: true,
        })
        const adminSupabase = createServiceRoleClient()
        const search = sanitizeText(params.search)
        const pageSize = Math.max(10, Math.min(200, params.pageSize || params.limit || 50))
        const page = Math.max(1, params.page || 1)
        const sortOrder: 'asc' | 'desc' = params.sortOrder === 'desc' ? 'desc' : 'asc'
        const rangeFrom = (page - 1) * pageSize
        const rangeTo = rangeFrom + pageSize - 1

        if (!version) {
            return {
                success: true,
                data: {
                    version: null,
                    items: [],
                    entries: [],
                    baseState: 'empty',
                    totalCount: 0,
                    page: 1,
                    pageSize,
                    totalPages: 0,
                    structuralRowCount: 0,
                    finalRowCount: 0,
                    includeStructuralRows: params.includeStructuralRows === true,
                    sortBy: params.sortBy || 'code',
                    sortOrder,
                },
            }
        }

        const baseState: FiscalBaseEntriesResult['baseState'] = version.isActive ? 'active_or_selected' : 'inactive_only'

        if (params.tableType === 'ncm') {
            const includeStructuralRows = params.includeStructuralRows === true
            const sortBy: FiscalNcmSortBy = isFiscalNcmSortBy(params.sortBy) ? params.sortBy : 'code'
            const sortColumnByField: Record<FiscalNcmSortBy, string> = {
                code: 'code',
                description: 'description',
                start_date: 'metadata_jsonb->>start_date',
                end_date: 'metadata_jsonb->>end_date',
                legal_act: 'metadata_jsonb->>legal_act',
                legal_number: 'metadata_jsonb->>legal_number',
                legal_year: 'metadata_jsonb->>legal_year',
            }

            const applyNcmFilters = (query: any) => {
                let next = query.eq('version_id', version.id)

                if (!includeStructuralRows) {
                    next = next.filter('code', 'match', '^\\d{8}$')
                }

                if (search) {
                    const safeSearch = search.replace(/,/g, ' ').trim()
                    next = next.or(
                        [
                            `code.ilike.%${safeSearch}%`,
                            `description.ilike.%${safeSearch}%`,
                            `full_description.ilike.%${safeSearch}%`,
                        ].join(',')
                    )
                }

                return next
            }

            let dataQuery = adminSupabase
                .from('fiscal_ncm_entries')
                .select('*')
                .range(rangeFrom, rangeTo)

            dataQuery = applyNcmFilters(dataQuery)
            dataQuery = dataQuery.order(sortColumnByField[sortBy], { ascending: sortOrder === 'asc' })

            const [dataResult, totalResult, finalCountResult, structuralCountResult] = await Promise.all([
                dataQuery,
                applyNcmFilters(
                    adminSupabase.from('fiscal_ncm_entries').select('id', { count: 'exact', head: true })
                ),
                adminSupabase
                    .from('fiscal_ncm_entries')
                    .select('id', { count: 'exact', head: true })
                    .eq('version_id', version.id)
                    .filter('code', 'match', '^\\d{8}$'),
                adminSupabase
                    .from('fiscal_ncm_entries')
                    .select('id', { count: 'exact', head: true })
                    .eq('version_id', version.id)
                    .filter('code', 'not.match', '^\\d{8}$'),
            ])

            const { data, error } = dataResult
            if (error) throw error
            if (totalResult.error) throw totalResult.error
            if (finalCountResult.error) throw finalCountResult.error
            if (structuralCountResult.error) throw structuralCountResult.error

            const items = ((data || []) as Array<Record<string, unknown>>).map((row) => {
                const metadata = sanitizeJsonObject(row.metadata_jsonb)
                const code = String(row.code || '')
                return {
                    id: String(row.id),
                    versionId: String(row.version_id),
                    versionLabel: version.versionLabel,
                    code,
                    rowType: getNcmRowType(code),
                    metadata,
                    description: normalizeRequiredText(row.description),
                    fullDescription: normalizeMojibakeText((row.full_description as string | null) || null),
                    sourceCode: normalizeMojibakeText((metadata.source_code as string | null) || null),
                    startDate: (metadata.start_date as string | null) || null,
                    endDate: (metadata.end_date as string | null) || null,
                    legalAct: normalizeMojibakeText((metadata.legal_act as string | null) || null),
                    legalNumber: normalizeMojibakeText((metadata.legal_number as string | null) || null),
                    legalYear: normalizeMojibakeText((metadata.legal_year as string | null) || null),
                } satisfies FiscalBaseEntryRecord
            })

            const totalCount = Number(totalResult.count || 0)
            const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize)

            return {
                success: true,
                data: {
                    version,
                    items,
                    baseState,
                    entries: items,
                    totalCount,
                    page,
                    pageSize,
                    totalPages,
                    structuralRowCount: Number(structuralCountResult.count || 0),
                    finalRowCount: Number(finalCountResult.count || 0),
                    includeStructuralRows,
                    sortBy,
                    sortOrder,
                },
            }
        }

        if (params.tableType === 'tipi') {
            let query = adminSupabase
                .from('fiscal_tipi_entries')
                .select('*')
                .eq('version_id', version.id)
                .order('ncm_code', { ascending: true })
                .limit(pageSize)
            if (search) {
                query = query.or(`ncm_code.ilike.%${search}%,description.ilike.%${search}%`)
            }
            const { data, error } = await query
            if (error) throw error
            const rows = (data || []) as Array<Record<string, unknown>>
            const mappedRows = rows.map((row) => {
                const metadata = sanitizeJsonObject(row.metadata_jsonb)
                const code = String(row.ncm_code || '')
                const rowType =
                    String(metadata.row_type || '').trim() === 'structural' || !/^\d{8}$/.test(code)
                        ? 'structural'
                        : 'final'

                return {
                    id: String(row.id),
                    versionId: String(row.version_id),
                    versionLabel: version.versionLabel,
                    code,
                    rowType,
                    metadata,
                    description: normalizeRequiredText(row.description),
                    exTipi: (row.ex_tipi as string | null) || null,
                    ipiRate: Number(row.ipi_rate || 0),
                    sourceCode: normalizeMojibakeText((metadata.source_ncm_code as string | null) || null),
                } satisfies FiscalBaseEntryRecord
            })

            return {
                success: true,
                data: {
                    version,
                    items: mappedRows,
                    baseState,
                    entries: mappedRows,
                    totalCount: rows.length,
                    page: 1,
                    pageSize,
                    totalPages: rows.length > 0 ? 1 : 0,
                    structuralRowCount: mappedRows.filter((row) => row.rowType === 'structural').length,
                    finalRowCount: mappedRows.filter((row) => row.rowType === 'final').length,
                    includeStructuralRows: false,
                    sortBy: 'code',
                    sortOrder: 'asc',
                },
            }
        }

        if (params.tableType === 'cest') {
            let query = adminSupabase
                .from('fiscal_cest_entries')
                .select('*')
                .eq('version_id', version.id)
                .order('code', { ascending: true })
                .limit(pageSize)
            if (search) {
                query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)
            }
            const { data, error } = await query
            if (error) throw error

            const rows = (data || []) as Array<Record<string, unknown>>
            const entryIds = rows.map((row) => String(row.id))
            const { data: links } = await adminSupabase
                .from('fiscal_cest_ncm_links')
                .select('cest_entry_id, ncm_code')
                .in('cest_entry_id', entryIds.length > 0 ? entryIds : ['00000000-0000-0000-0000-000000000000'])

            const ncmCodesByCestId = new Map<string, string[]>()
            ;((links || []) as Array<Record<string, unknown>>).forEach((row) => {
                const key = String(row.cest_entry_id)
                const list = ncmCodesByCestId.get(key) || []
                list.push(String(row.ncm_code || ''))
                ncmCodesByCestId.set(key, list)
            })

            return {
                success: true,
                data: {
                    version,
                    baseState,
                    items: rows.map((row) => ({
                        id: String(row.id),
                        versionId: String(row.version_id),
                        versionLabel: version.versionLabel,
                        code: String(row.code || ''),
                        rowType: 'final',
                        description: normalizeRequiredText(row.description),
                        segment: normalizeMojibakeText((row.segment as string | null) || null),
                        ncmCodes: ncmCodesByCestId.get(String(row.id)) || [],
                    })),
                    entries: rows.map((row) => ({
                        id: String(row.id),
                        versionId: String(row.version_id),
                        versionLabel: version.versionLabel,
                        code: String(row.code || ''),
                        rowType: 'final',
                        description: normalizeRequiredText(row.description),
                        segment: normalizeMojibakeText((row.segment as string | null) || null),
                        ncmCodes: ncmCodesByCestId.get(String(row.id)) || [],
                    })),
                    totalCount: rows.length,
                    page: 1,
                    pageSize,
                    totalPages: rows.length > 0 ? 1 : 0,
                    structuralRowCount: 0,
                    finalRowCount: rows.length,
                    includeStructuralRows: false,
                    sortBy: 'code',
                    sortOrder: 'asc',
                },
            }
        }

        let query = adminSupabase
            .from('fiscal_cfop_entries')
            .select('*')
            .eq('version_id', version.id)
            .order('code', { ascending: true })
            .limit(pageSize)
        if (search) {
            query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)
        }
        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: {
                version,
                items: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row.id),
                    versionId: String(row.version_id),
                    versionLabel: version.versionLabel,
                    code: String(row.code || ''),
                    rowType: 'final',
                    description: normalizeRequiredText(row.description),
                    operationDirection: (row.operation_direction as 'outbound' | 'inbound' | 'both') || 'both',
                })),
                baseState,
                entries: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row.id),
                    versionId: String(row.version_id),
                    versionLabel: version.versionLabel,
                    code: String(row.code || ''),
                    rowType: 'final',
                    description: normalizeRequiredText(row.description),
                    operationDirection: (row.operation_direction as 'outbound' | 'inbound' | 'both') || 'both',
                })),
                totalCount: (data || []).length,
                page: 1,
                pageSize,
                totalPages: (data || []).length > 0 ? 1 : 0,
                structuralRowCount: 0,
                finalRowCount: (data || []).length,
                includeStructuralRows: false,
                sortBy: 'code',
                sortOrder: 'asc',
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao listar registros da base fiscal.'),
        }
    }
}

export async function createFiscalImportPreviewAction(params: {
    tableType: FiscalBaseType
    fileName: string
    sourceType: FiscalImportSourceType
    textContent?: string | null
    fileBase64?: string | null
}): Promise<{
    success: boolean
    data?: FiscalImportPreviewSummary & { batchId: string; suggestedVersionLabel: string }
    error?: string
}> {
    try {
        const actorId = await ensureAdminAccess()
        if (!isFiscalBaseType(params.tableType)) throw new Error('Tipo de base fiscal invalido.')
        if (!sanitizeText(params.fileName)) throw new Error('Arquivo de importacao invalido.')
        if (!isFiscalImportSourceType(params.sourceType)) throw new Error('Formato de importacao invalido.')

        const importInput: BuildFiscalImportPreviewInput =
            params.sourceType === 'xlsx'
                ? {
                      sourceType: 'xlsx',
                      fileBase64: sanitizeText(params.fileBase64) || '',
                  }
                : {
                      sourceType: 'csv',
                      textContent: sanitizeText(params.textContent) || '',
                  }

        const preview = await validateFiscalPreviewAgainstReferenceBases(
            params.tableType,
            buildFiscalImportPreview(params.tableType, importInput)
        )
        if (preview.totalRows === 0) throw new Error('Nenhuma linha valida foi encontrada no arquivo.')

        const adminSupabase = createServiceRoleClient()
        const { data: batch, error: batchError } = await adminSupabase
            .from('fiscal_import_batches')
            .insert({
                table_type: params.tableType,
                status: 'draft',
                source_file_name: params.fileName,
                source_type: params.sourceType,
                imported_by: actorId,
                total_rows: preview.totalRows,
                valid_rows: preview.validRows,
                invalid_rows: preview.invalidRows,
                error_summary_jsonb: {
                    preview_invalid_rows: preview.invalidRows,
                    preview_valid_rows: preview.validRows,
                    preview_structural_rows: preview.structuralRows,
                    source_type: preview.sourceType,
                    source_sheet_name: preview.sheetName || null,
                },
            })
            .select('id')
            .single()

        if (batchError || !batch?.id) throw batchError || new Error('Falha ao criar lote fiscal.')

        const itemsPayload = preview.items.map((item) => ({
            batch_id: batch.id,
            row_number: item.rowNumber,
            validation_status: item.validationStatus,
            raw_payload_jsonb: item.rawPayload,
            normalized_payload_jsonb: item.normalizedPayload,
            validation_errors_jsonb: item.validationErrors,
            validation_warnings_jsonb: item.validationWarnings,
        }))

        if (itemsPayload.length > 0) {
            for (let index = 0; index < itemsPayload.length; index += 500) {
                const chunk = itemsPayload.slice(index, index + 500)
                const { error: itemsError } = await adminSupabase.from('fiscal_import_batch_items').insert(chunk)
                if (itemsError) throw itemsError
            }
        }

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/imports')

        return {
            success: true,
            data: {
                ...preview,
                batchId: String(batch.id),
                suggestedVersionLabel: buildSuggestedVersionLabel(params.tableType),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: normalizeFiscalImportConstraintError(error, 'Erro ao gerar preview da importacao fiscal.'),
        }
    }
}

export async function confirmFiscalImportAction(params: {
    batchId: string
    versionLabel?: string | null
    validFrom?: string | null
}): Promise<{
    success: boolean
    data?: { versionId: string; versionLabel: string; tableType: FiscalBaseType; rowCount: number }
    error?: string
}> {
    let createdVersionId: string | null = null

    try {
        const actorId = await ensureAdminAccess()
        if (!isValidUuid(params.batchId)) throw new Error('Lote fiscal invalido.')

        const adminSupabase = createServiceRoleClient()
        const [{ data: batch, error: batchError }, items] = await Promise.all([
            adminSupabase.from('fiscal_import_batches').select('*').eq('id', params.batchId).single(),
            listAllFiscalImportBatchItems(params.batchId),
        ])

        if (batchError || !batch) throw batchError || new Error('Lote fiscal nao encontrado.')
        if (!isFiscalBaseType(String(batch.table_type || ''))) throw new Error('Tipo do lote fiscal invalido.')
        if (batch.status !== 'draft') throw new Error('Somente lotes em rascunho podem ser confirmados.')

        const previewItems = (items as Array<Record<string, unknown>>).map((row) => ({
            rowNumber: Number(row.row_number || 0),
            validationStatus: (row.validation_status as 'valid' | 'invalid') || 'invalid',
            rawPayload: sanitizeJsonObject(row.raw_payload_jsonb) as Record<string, string>,
            normalizedPayload: sanitizeJsonObject(row.normalized_payload_jsonb),
            validationErrors: sanitizeJsonArray(row.validation_errors_jsonb),
            validationWarnings: sanitizeJsonArray(row.validation_warnings_jsonb),
        }))

        const validItems = previewItems.filter((item) => item.validationStatus === 'valid')
        if (validItems.length === 0) {
            throw new Error('Nao ha registros validos para confirmar nesta importacao.')
        }

        const versionLabel = sanitizeText(params.versionLabel) || buildSuggestedVersionLabel(batch.table_type as FiscalBaseType)

        const { data: version, error: versionError } = await adminSupabase
            .from('fiscal_reference_versions')
            .insert({
                table_type: batch.table_type,
                version_label: versionLabel,
                import_batch_id: batch.id,
                imported_by: actorId,
                imported_at: new Date().toISOString(),
                valid_from: sanitizeText(params.validFrom),
                is_active: false,
                source_file_name: batch.source_file_name,
                source_type: batch.source_type,
                row_count: validItems.length,
                metadata_jsonb: {
                    structural_rows: batch.error_summary_jsonb && typeof batch.error_summary_jsonb === 'object'
                        ? Number((batch.error_summary_jsonb as Record<string, unknown>).preview_structural_rows || 0)
                        : 0,
                },
                future_tax_payload: {},
            })
            .select('id, version_label')
            .single()

        if (versionError || !version?.id) throw versionError || new Error('Falha ao criar versao fiscal.')
        createdVersionId = String(version.id)

        await insertFiscalEntriesForVersion({
            tableType: batch.table_type as FiscalBaseType,
            versionId: createdVersionId,
            items: previewItems,
        })

        const { error: updateBatchError } = await adminSupabase
            .from('fiscal_import_batches')
            .update({
                status: 'imported',
                finished_at: new Date().toISOString(),
                error_summary_jsonb: {
                    ...sanitizeJsonObject(batch.error_summary_jsonb),
                    version_id: createdVersionId,
                        version_label: version.version_label,
                        imported_records: validItems.length,
                        invalid_rows: previewItems.filter((item) => item.validationStatus === 'invalid').length,
                        structural_rows: previewItems.filter((item) => {
                            const code = String(item.normalizedPayload.code || '')
                            return batch.table_type === 'ncm' && code.length >= 2 && code.length < 8
                        }).length,
                    },
                })
            .eq('id', batch.id)

        if (updateBatchError) throw updateBatchError

        revalidatePath('/admin/fiscal-bases')
        revalidatePath(`/admin/fiscal-bases/${batch.table_type}`)
        revalidatePath('/admin/fiscal-bases/imports')

        return {
            success: true,
            data: {
                versionId: createdVersionId,
                versionLabel: String(version.version_label),
                tableType: batch.table_type as FiscalBaseType,
                rowCount: validItems.length,
            },
        }
    } catch (error: unknown) {
        if (createdVersionId) {
            try {
                const adminSupabase = createServiceRoleClient()
                await adminSupabase.from('fiscal_reference_versions').delete().eq('id', createdVersionId)
            } catch (cleanupError) {
                console.error('Falha ao limpar versao fiscal apos erro:', cleanupError)
            }
        }

        if (isValidUuid(params.batchId)) {
            try {
                const adminSupabase = createServiceRoleClient()
                await adminSupabase
                    .from('fiscal_import_batches')
                    .update({
                        status: 'failed',
                        finished_at: new Date().toISOString(),
                        error_summary_jsonb: {
                            message: getErrorMessage(error, 'Falha na confirmacao do lote fiscal.'),
                        },
                    })
                    .eq('id', params.batchId)
            } catch (batchCleanupError) {
                console.error('Falha ao atualizar lote fiscal com erro:', batchCleanupError)
            }
        }

        return {
            success: false,
            error: normalizeFiscalImportConstraintError(error, 'Erro ao confirmar importacao fiscal.'),
        }
    }
}

export async function cancelFiscalImportBatchAction(batchId: string): Promise<{
    success: boolean
    data?: { batchId: string; status: 'cancelled' }
    error?: string
}> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(batchId)) throw new Error('Lote fiscal invalido.')

        const adminSupabase = createServiceRoleClient()
        const { data: batch, error: batchError } = await adminSupabase
            .from('fiscal_import_batches')
            .select('id, status')
            .eq('id', batchId)
            .single()

        if (batchError || !batch) throw batchError || new Error('Lote fiscal nao encontrado.')
        if (batch.status !== 'draft') throw new Error('Apenas lotes em rascunho podem ser cancelados.')

        const { error } = await adminSupabase
            .from('fiscal_import_batches')
            .update({
                status: 'cancelled',
                finished_at: new Date().toISOString(),
            })
            .eq('id', batchId)

        if (error) throw error

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/imports')

        return {
            success: true,
            data: { batchId, status: 'cancelled' },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao cancelar lote fiscal.'),
        }
    }
}

export async function activateFiscalReferenceVersionAction(versionId: string): Promise<{
    success: boolean
    data?: { versionId: string; tableType: FiscalBaseType; deactivatedCount: number }
    error?: string
}> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(versionId)) throw new Error('Versao fiscal invalida.')

        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_activate_fiscal_reference_version', {
            p_version_id: versionId,
        })

        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.version_id || !isFiscalBaseType(String(row.table_type || ''))) {
            throw new Error('Nao foi possivel ativar a versao fiscal.')
        }

        revalidatePath('/admin/fiscal-bases')
        revalidatePath(`/admin/fiscal-bases/${row.table_type}`)
        revalidatePath('/admin/fiscal-bases/imports')
        revalidatePath('/admin/product-tax-profiles')

        return {
            success: true,
            data: {
                versionId: String(row.version_id),
                tableType: row.table_type as FiscalBaseType,
                deactivatedCount: Number(row.deactivated_count || 0),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: normalizeFiscalVersionActivationError(error, 'Erro ao ativar versao fiscal.'),
        }
    }
}

export async function listFiscalImportBatchesAction(params?: {
    tableType?: FiscalBaseType | null
    status?: FiscalImportBatchListItem['status'] | 'all' | null
    includeDrafts?: boolean
}): Promise<{ success: boolean; data?: FiscalImportBatchListItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase
            .from('fiscal_import_batches')
            .select('*')
            .order('started_at', { ascending: false })

        if (params?.tableType) {
            if (!isFiscalBaseType(params.tableType)) throw new Error('Tipo de base fiscal invalido.')
            query = query.eq('table_type', params.tableType)
        }
        if (params?.status && params.status !== 'all') {
            query = query.eq('status', params.status)
        }
        if (params?.includeDrafts === false) {
            query = query.neq('status', 'draft')
        }

        const { data, error } = await query.limit(200)
        if (error) throw error

        const batches = (data || []) as Array<Record<string, unknown>>
        const batchIds = batches.map((row) => String(row.id))
        const importedByIds = Array.from(
            new Set(
                batches
                    .map((row) => (row.imported_by ? String(row.imported_by) : null))
                    .filter((value): value is string => Boolean(value))
            )
        )
        const [{ data: versionRows, error: versionsError }, { data: importerRows, error: importerError }] =
            await Promise.all([
                adminSupabase
                    .from('fiscal_reference_versions')
                    .select('id, import_batch_id, version_label, is_active')
                    .in('import_batch_id', batchIds.length > 0 ? batchIds : ['00000000-0000-0000-0000-000000000000']),
                adminSupabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', importedByIds.length > 0 ? importedByIds : ['00000000-0000-0000-0000-000000000000']),
            ])

        if (versionsError) throw versionsError
        if (importerError) throw importerError

        const versionByBatchId = new Map<string, { id: string; version_label: string; is_active: boolean }>()
        ;((versionRows || []) as Array<Record<string, unknown>>).forEach((row) => {
            versionByBatchId.set(String(row.import_batch_id), {
                id: String(row.id),
                version_label: String(row.version_label || ''),
                is_active: row.is_active === true,
            })
        })
        const importerById = new Map<string, string>()
        ;((importerRows || []) as Array<Record<string, unknown>>).forEach((row) => {
            importerById.set(String(row.id), String(row.full_name || row.email || 'UsuÃ¡rio removido'))
        })

        return {
            success: true,
            data: batches.map((row) => {
                const version = versionByBatchId.get(String(row.id))
                const importedBy = (row.imported_by as string | null) || null
                return {
                    id: String(row.id),
                    tableType: row.table_type as FiscalBaseType,
                    status: row.status as FiscalImportBatchListItem['status'],
                    sourceFileName: (row.source_file_name as string | null) || null,
                    sourceType: String(row.source_type || 'csv') as FiscalImportSourceType,
                    importedBy,
                    importedByName: importedBy ? importerById.get(importedBy) || null : null,
                    startedAt: String(row.started_at || ''),
                    finishedAt: (row.finished_at as string | null) || null,
                    totalRows: Number(row.total_rows || 0),
                    validRows: Number(row.valid_rows || 0),
                    invalidRows: Number(row.invalid_rows || 0),
                    errorSummary: sanitizeJsonObject(row.error_summary_jsonb),
                    versionId: version?.id || null,
                    versionLabel: version?.version_label || null,
                    activeVersion: version?.is_active === true,
                }
            }),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao listar historico de importacoes fiscais.'),
        }
    }
}

export async function getFiscalImportBatchDetailAction(batchId: string): Promise<{
    success: boolean
    data?: FiscalImportBatchDetail
    error?: string
}> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(batchId)) throw new Error('Lote fiscal invalido.')

        const adminSupabase = createServiceRoleClient()
        const [{ data: batch, error: batchError }, items, { data: versionRows, error: versionError }] =
            await Promise.all([
                adminSupabase.from('fiscal_import_batches').select('*').eq('id', batchId).single(),
                listAllFiscalImportBatchItems(batchId),
                adminSupabase
                    .from('fiscal_reference_versions')
                    .select('id, version_label, import_batch_id, is_active')
                    .eq('import_batch_id', batchId)
                    .limit(1),
            ])

        if (batchError || !batch) throw batchError || new Error('Lote fiscal nao encontrado.')
        if (versionError) throw versionError

        const version = ((versionRows || []) as Array<Record<string, unknown>>)[0]
        let importedByName: string | null = null
        if (batch.imported_by) {
            const { data: importer } = await adminSupabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', batch.imported_by)
                .single()
            importedByName = importer ? String(importer.full_name || importer.email || '') : null
        }

        return {
            success: true,
            data: {
                id: String(batch.id),
                tableType: batch.table_type as FiscalBaseType,
                status: batch.status as FiscalImportBatchListItem['status'],
                sourceFileName: (batch.source_file_name as string | null) || null,
                sourceType: String(batch.source_type || 'csv') as FiscalImportSourceType,
                importedBy: (batch.imported_by as string | null) || null,
                importedByName,
                startedAt: String(batch.started_at || ''),
                finishedAt: (batch.finished_at as string | null) || null,
                totalRows: Number(batch.total_rows || 0),
                validRows: Number(batch.valid_rows || 0),
                invalidRows: Number(batch.invalid_rows || 0),
                errorSummary: sanitizeJsonObject(batch.error_summary_jsonb),
                versionId: version ? String(version.id) : null,
                versionLabel: version ? String(version.version_label || '') : null,
                activeVersion: version ? version.is_active === true : false,
                items: (items as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row.id),
                    rowNumber: Number(row.row_number || 0),
                    validationStatus: (row.validation_status as 'valid' | 'invalid') || 'invalid',
                    rawPayload: sanitizeJsonObject(row.raw_payload_jsonb) as Record<string, string>,
                    normalizedPayload: sanitizeJsonObject(row.normalized_payload_jsonb),
                    validationErrors: sanitizeJsonArray(row.validation_errors_jsonb),
                    validationWarnings: sanitizeJsonArray(row.validation_warnings_jsonb),
                })),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao carregar detalhes da importacao fiscal.'),
        }
    }
}

export async function searchFiscalNcmEntriesAction(params: {
    query?: string | null
    limit?: number
    versionId?: string | null
}): Promise<{ success: boolean; data?: FiscalSearchOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const version = await resolveVersionId('ncm', params.versionId, { allowNull: true })
        if (!version) return { success: true, data: [] }
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase
            .from('fiscal_ncm_entries')
            .select('*')
            .eq('version_id', version.id)
            .filter('code', 'match', '^\\d{8}$')
            .order('code', { ascending: true })
            .limit(Math.max(1, Math.min(20, params.limit || 10)))

        const search = sanitizeText(params.query)
        if (search) query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)

        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => {
                const metadata = sanitizeJsonObject(row.metadata_jsonb)
                const secondaryParts = [
                    normalizeMojibakeText((row.full_description as string | null) || null),
                    [
                        metadata.start_date ? `Inicio ${new Date(String(metadata.start_date)).toLocaleDateString('pt-BR')}` : null,
                        metadata.end_date ? `Fim ${new Date(String(metadata.end_date)).toLocaleDateString('pt-BR')}` : null,
                        metadata.legal_act
                            ? `${String(metadata.legal_act)}${metadata.legal_number ? ` ${String(metadata.legal_number)}` : ''}${metadata.legal_year ? `/${String(metadata.legal_year)}` : ''}`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(' | '),
                ].filter((value): value is string => Boolean(value && value.trim()))

                return {
                    id: String(row.id),
                    versionId: version.id,
                    versionLabel: version.versionLabel,
                    code: String(row.code || ''),
                    description: normalizeRequiredText(row.description),
                    secondaryText: secondaryParts.join(' | ') || null,
                    metadata,
                }
            }),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao buscar NCMs.'),
        }
    }
}

export async function searchFiscalTipiEntriesAction(params: {
    ncmCode?: string | null
    query?: string | null
    limit?: number
    versionId?: string | null
}): Promise<{ success: boolean; data?: FiscalSearchOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const version = await resolveVersionId('tipi', params.versionId, { allowNull: true })
        if (!version) return { success: true, data: [] }
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase
            .from('fiscal_tipi_entries')
            .select('*')
            .eq('version_id', version.id)
            .order('ncm_code', { ascending: true })
            .limit(Math.max(1, Math.min(20, params.limit || 10)))

        const ncmCode = sanitizeText(params.ncmCode)?.replace(/\D/g, '') || null
        const search = sanitizeText(params.query)
        if (ncmCode) query = query.eq('ncm_code', ncmCode)
        else if (search) query = query.or(`ncm_code.ilike.%${search}%,description.ilike.%${search}%`)

        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                versionId: version.id,
                versionLabel: version.versionLabel,
                code: String(row.ncm_code || ''),
                description: normalizeRequiredText(row.description),
                secondaryText: `IPI ${Number(row.ipi_rate || 0).toFixed(2)}%${row.ex_tipi ? ` | EX ${row.ex_tipi}` : ''}`,
            })),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao buscar referencias TIPI.'),
        }
    }
}

export async function searchFiscalCestEntriesAction(params: {
    query?: string | null
    ncmCode?: string | null
    limit?: number
    versionId?: string | null
}): Promise<{ success: boolean; data?: FiscalSearchOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const version = await resolveVersionId('cest', params.versionId, { allowNull: true })
        if (!version) return { success: true, data: [] }
        const adminSupabase = createServiceRoleClient()
        const ncmCode = sanitizeText(params.ncmCode)?.replace(/\D/g, '') || null

        let allowedIds: string[] | null = null
        if (ncmCode) {
            const { data: links, error: linksError } = await adminSupabase
                .from('fiscal_cest_ncm_links')
                .select('cest_entry_id')
                .eq('ncm_code', ncmCode)
            if (linksError) throw linksError
            allowedIds = ((links || []) as Array<Record<string, unknown>>).map((row) => String(row.cest_entry_id))
            if (allowedIds.length === 0) return { success: true, data: [] }
        }

        let query = adminSupabase
            .from('fiscal_cest_entries')
            .select('*')
            .eq('version_id', version.id)
            .order('code', { ascending: true })
            .limit(Math.max(1, Math.min(20, params.limit || 10)))

        if (allowedIds) query = query.in('id', allowedIds)
        const search = sanitizeText(params.query)
        if (search) query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)

        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                versionId: version.id,
                versionLabel: version.versionLabel,
                code: String(row.code || ''),
                description: normalizeRequiredText(row.description),
                secondaryText: normalizeMojibakeText((row.segment as string | null) || null),
            })),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao buscar CESTs.'),
        }
    }
}

export async function searchFiscalCfopEntriesAction(params: {
    query?: string | null
    direction?: 'outbound' | 'inbound' | 'both' | null
    limit?: number
    versionId?: string | null
}): Promise<{ success: boolean; data?: FiscalSearchOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const version = await resolveVersionId('cfop', params.versionId, { allowNull: true })
        if (!version) return { success: true, data: [] }
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase
            .from('fiscal_cfop_entries')
            .select('*')
            .eq('version_id', version.id)
            .order('code', { ascending: true })
            .limit(Math.max(1, Math.min(20, params.limit || 10)))

        if (params.direction && params.direction !== 'both') {
            query = query.in('operation_direction', [params.direction, 'both'])
        }
        const search = sanitizeText(params.query)
        if (search) query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)

        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                versionId: version.id,
                versionLabel: version.versionLabel,
                code: String(row.code || ''),
                description: normalizeRequiredText(row.description),
                secondaryText: String(row.operation_direction || 'both'),
            })),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao buscar CFOPs.'),
        }
    }
}

export async function listFiscalCatalogItemsAction(
    catalogType: FiscalCatalogType
): Promise<{ success: boolean; data?: FiscalCatalogItemOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        if (!isFiscalCatalogType(catalogType)) throw new Error('Catalogo fiscal invalido.')

        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase
            .from('fiscal_catalog_items')
            .select('*')
            .eq('catalog_type', catalogType)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('label', { ascending: true })

        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                catalogType: row.catalog_type as FiscalCatalogType,
                code: String(row.code || ''),
                label: normalizeRequiredText(row.label),
                description: normalizeMojibakeText((row.description as string | null) || null),
                sortOrder: Number(row.sort_order || 0),
                isActive: row.is_active !== false,
                metadata: sanitizeJsonObject(row.metadata_jsonb),
            })),
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, `Erro ao listar catalogo ${FISCAL_CATALOG_LABELS[catalogType]}.`),
        }
    }
}

export async function getFiscalSuggestionsByNcmAction(
    ncmCode: string
): Promise<{ success: boolean; data?: FiscalNcmSuggestions; error?: string }> {
    try {
        await ensureAdminAccess()
        const normalizedNcm = sanitizeText(ncmCode)?.replace(/\D/g, '') || ''
        if (!/^\d{8}$/.test(normalizedNcm)) throw new Error('NCM invalido para sugestoes.')

        const [ncmResult, tipiResult, cestResult] = await Promise.all([
            searchFiscalNcmEntriesAction({ query: normalizedNcm, limit: 5 }),
            searchFiscalTipiEntriesAction({ ncmCode: normalizedNcm, limit: 5 }),
            searchFiscalCestEntriesAction({ ncmCode: normalizedNcm, limit: 10 }),
        ])

        if (!ncmResult.success) throw new Error(ncmResult.error || 'Falha ao buscar NCM.')
        if (!tipiResult.success) throw new Error(tipiResult.error || 'Falha ao buscar TIPI.')
        if (!cestResult.success) throw new Error(cestResult.error || 'Falha ao buscar CEST.')

        return {
            success: true,
            data: {
                ncm: (ncmResult.data || []).find((item) => item.code === normalizedNcm) || null,
                tipi: tipiResult.data || [],
                cest: cestResult.data || [],
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao buscar sugestoes fiscais por NCM.'),
        }
    }
}

export async function downloadFiscalImportTemplateAction(tableType: FiscalBaseType): Promise<{
    success: boolean
    data?: { fileName: string; content: string }
    error?: string
}> {
    try {
        await ensureAdminAccess()
        if (!isFiscalBaseType(tableType)) throw new Error('Tipo de base fiscal invalido.')

        return {
            success: true,
            data: {
                fileName: `modelo_${tableType}_base_fiscal.csv`,
                content: buildFiscalTemplateCsv(tableType),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao gerar modelo de importacao fiscal.'),
        }
    }
}

