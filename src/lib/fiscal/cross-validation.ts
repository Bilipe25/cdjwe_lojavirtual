import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { FiscalBaseType } from '@/lib/fiscal/constants'
import type {
    FiscalCestNcmLinkPreview,
    FiscalImportPreviewSummary,
} from '@/lib/fiscal/import-utils'

interface NcmValidationVersionRow {
    id: string
    version_label: string | null
    is_active: boolean
    imported_at: string | null
}

interface NcmValidationContext {
    versionId: string
    versionLabel: string | null
    isActive: boolean
    importedAt: string | null
    codes: Set<string>
    codeList: string[]
}

export interface FiscalReferenceValidationInfo {
    referenceTableType: 'ncm'
    versionId: string | null
    versionLabel: string | null
    isActive: boolean
    sourceMode: 'latest_available' | 'unavailable'
    message: string
}

declare module '@/lib/fiscal/import-utils' {
    interface FiscalImportPreviewSummary {
        referenceValidation?: FiscalReferenceValidationInfo
    }
}

async function resolvePreferredNcmValidationVersion() {
    const adminSupabase = createServiceRoleClient()

    const { data: activeRows, error: activeError } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('id, version_label, is_active, imported_at')
        .eq('table_type', 'ncm')
        .eq('is_active', true)
        .order('imported_at', { ascending: false })
        .limit(1)

    if (activeError) throw activeError

    const activeVersion = ((activeRows || []) as NcmValidationVersionRow[])[0]
    if (activeVersion?.id) return activeVersion

    const { data: latestRows, error: latestError } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('id, version_label, is_active, imported_at')
        .eq('table_type', 'ncm')
        .order('imported_at', { ascending: false })
        .limit(1)

    if (latestError) throw latestError

    return ((latestRows || []) as NcmValidationVersionRow[])[0] || null
}

async function resolveLatestNcmValidationContext(): Promise<NcmValidationContext | null> {
    const adminSupabase = createServiceRoleClient()
    const selectedVersion = await resolvePreferredNcmValidationVersion()
    if (!selectedVersion?.id) return null

    const codes: string[] = []
    const pageSize = 1000

    for (let offset = 0; ; offset += pageSize) {
        const { data: pageRows, error: codesError } = await adminSupabase
            .from('fiscal_ncm_entries')
            .select('code')
            .eq('version_id', selectedVersion.id)
            .filter('code', 'match', '^\\d{8}$')
            .order('code', { ascending: true })
            .range(offset, offset + pageSize - 1)

        if (codesError) throw codesError

        const rows = (pageRows || []) as Array<{ code?: string | null }>
        codes.push(...rows.map((row) => String(row.code || '')).filter((code) => /^\d{8}$/.test(code)))

        if (rows.length < pageSize) break
    }

    return {
        versionId: selectedVersion.id,
        versionLabel: selectedVersion.version_label,
        isActive: selectedVersion.is_active === true,
        importedAt: selectedVersion.imported_at,
        codes: new Set(codes),
        codeList: codes,
    }
}

function sanitizeJsonArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function sanitizeCestLinkPayload(value: unknown, fallbackCodes: unknown): FiscalCestNcmLinkPreview[] {
    if (Array.isArray(value)) {
        const parsed = value
            .map((item) => {
                if (!item || typeof item !== 'object') return null
                const record = item as Record<string, unknown>
                const ncmCode = String(record.ncm_code || '').trim()
                const matchType = record.match_type === 'prefix' ? 'prefix' : 'exact'
                const prefixLength = Number(record.prefix_length || ncmCode.length || 0)
                if (!/^\d{2,8}$/.test(ncmCode)) return null
                return {
                    ncm_code: ncmCode,
                    match_type: matchType,
                    prefix_length: prefixLength,
                } satisfies FiscalCestNcmLinkPreview
            })
            .filter((item): item is FiscalCestNcmLinkPreview => Boolean(item))

        if (parsed.length > 0) return parsed
    }

    return sanitizeJsonArray(fallbackCodes)
        .filter((code) => /^\d{2,8}$/.test(code))
        .map((code) => ({
            ncm_code: code,
            match_type: code.length === 8 ? 'exact' : 'prefix',
            prefix_length: code.length,
        }))
}

function hasMatchingNcmPrefix(prefix: string, codes: string[]) {
    return codes.some((code) => code.startsWith(prefix))
}

export async function validateFiscalPreviewAgainstReferenceBases(
    tableType: FiscalBaseType,
    preview: FiscalImportPreviewSummary
) {
    if (tableType !== 'tipi' && tableType !== 'cest') return preview

    const ncmContext = await resolveLatestNcmValidationContext()

    if (!ncmContext) {
        preview.referenceValidation = {
            referenceTableType: 'ncm',
            versionId: null,
            versionLabel: null,
            isActive: false,
            sourceMode: 'unavailable',
            message: 'Nenhuma versao NCM confirmada foi encontrada para validacao cruzada.',
        }

        preview.items.forEach((item) => {
            if (item.validationStatus === 'valid') {
                item.validationWarnings.push(
                    'Nenhuma versao NCM confirmada foi encontrada para validacao cruzada. A importacao podera prosseguir, mas a conferencia referencial ficou pendente.'
                )
            }
        })
        preview.warningRows = preview.items.filter((item) => item.validationWarnings.length > 0).length
        return preview
    }

    preview.referenceValidation = {
        referenceTableType: 'ncm',
        versionId: ncmContext.versionId,
        versionLabel: ncmContext.versionLabel,
        isActive: ncmContext.isActive,
        sourceMode: 'latest_available',
        message: ncmContext.isActive
            ? `Validacao cruzada realizada com a versao NCM ativa ${ncmContext.versionLabel || ncmContext.versionId}.`
            : `Validacao cruzada realizada com a versao NCM mais recente ${ncmContext.versionLabel || ncmContext.versionId}, que ainda esta inativa.`,
    }

    preview.items.forEach((item) => {
        if (item.validationStatus !== 'valid') return

        if (tableType === 'tipi') {
            const ncmCode = String(item.normalizedPayload.ncm_code || '')
            const rowType = String(item.normalizedPayload.row_type || 'final')
            if (rowType !== 'structural' && ncmCode && !ncmContext.codes.has(ncmCode)) {
                item.validationErrors.push(
                    `NCM ${ncmCode} nao encontrado na versao NCM de referencia (${ncmContext.versionLabel || ncmContext.versionId}).`
                )
                item.validationStatus = 'invalid'
            }
        }

        if (tableType === 'cest') {
            const ncmLinks = sanitizeCestLinkPayload(
                item.normalizedPayload.ncm_links,
                item.normalizedPayload.ncm_codes
            )

            const invalidMessages = ncmLinks
                .map((link) => {
                    if (link.match_type === 'exact') {
                        if (!ncmContext.codes.has(link.ncm_code)) {
                            return `NCM ${link.ncm_code} nao encontrado na versao NCM de referencia (${ncmContext.versionLabel || ncmContext.versionId}).`
                        }
                        return null
                    }

                    if (!hasMatchingNcmPrefix(link.ncm_code, ncmContext.codeList)) {
                        return `Nenhum NCM final da versao NCM de referencia (${ncmContext.versionLabel || ncmContext.versionId}) inicia com ${link.ncm_code}.`
                    }

                    return null
                })
                .filter((message): message is string => Boolean(message))

            if (invalidMessages.length > 0) {
                item.validationErrors.push(...invalidMessages)
                item.validationStatus = 'invalid'
            }
        }
    })

    preview.validRows = preview.items.filter((item) => item.validationStatus === 'valid').length
    preview.invalidRows = preview.items.filter((item) => item.validationStatus === 'invalid').length
    preview.warningRows = preview.items.filter((item) => item.validationWarnings.length > 0).length
    return preview
}
