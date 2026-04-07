import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { FiscalBaseType } from '@/lib/fiscal/constants'
import type { FiscalImportPreviewSummary } from '@/lib/fiscal/import-utils'

interface NcmValidationVersionRow {
    id: string
    version_label: string | null
    is_active: boolean
    imported_at: string | null
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

async function resolveLatestNcmValidationContext() {
    const adminSupabase = createServiceRoleClient()
    const { data, error } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('id, version_label, is_active, imported_at')
        .eq('table_type', 'ncm')
        .order('imported_at', { ascending: false })
        .limit(1)

    if (error) throw error

    const latest = ((data || []) as NcmValidationVersionRow[])[0]
    if (!latest?.id) return null

    const codes: Array<{ code?: string | null }> = []
    const pageSize = 1000

    for (let offset = 0; ; offset += pageSize) {
        const { data: pageRows, error: codesError } = await adminSupabase
            .from('fiscal_ncm_entries')
            .select('code')
            .eq('version_id', latest.id)
            .filter('code', 'match', '^\\d{8}$')
            .order('code', { ascending: true })
            .range(offset, offset + pageSize - 1)

        if (codesError) throw codesError

        const rows = (pageRows || []) as Array<{ code?: string | null }>
        codes.push(...rows)

        if (rows.length < pageSize) break
    }

    return {
        versionId: latest.id,
        versionLabel: latest.version_label,
        isActive: latest.is_active === true,
        importedAt: latest.imported_at,
        codes: new Set(((codes || []) as Array<{ code?: string | null }>).map((row) => String(row.code || ''))),
    }
}

function sanitizeJsonArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
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
            message: 'Nenhuma versão NCM confirmada foi encontrada para validação cruzada.',
        }

        preview.items.forEach((item) => {
            if (item.validationStatus === 'valid') {
                item.validationWarnings.push(
                    'Nenhuma versão NCM confirmada foi encontrada para validação cruzada. A importação poderá prosseguir, mas a conferência referencial ficou pendente.'
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
            ? `Validação cruzada realizada com a versão NCM ativa ${ncmContext.versionLabel || ncmContext.versionId}.`
            : `Validação cruzada realizada com a versão NCM mais recente ${ncmContext.versionLabel || ncmContext.versionId}, que ainda está inativa.`,
    }

    preview.items.forEach((item) => {
        if (item.validationStatus !== 'valid') return

        if (tableType === 'tipi') {
            const ncmCode = String(item.normalizedPayload.ncm_code || '')
            const rowType = String(item.normalizedPayload.row_type || 'final')
            if (rowType !== 'structural' && ncmCode && !ncmContext.codes.has(ncmCode)) {
                item.validationErrors.push(
                    `NCM ${ncmCode} não encontrado na versão NCM de referência (${ncmContext.versionLabel || ncmContext.versionId}).`
                )
                item.validationStatus = 'invalid'
            }
        }

        if (tableType === 'cest') {
            const ncmCodes = sanitizeJsonArray(item.normalizedPayload.ncm_codes)
            const missing = ncmCodes.filter((code) => !ncmContext.codes.has(code))
            if (missing.length > 0) {
                item.validationErrors.push(
                    `NCM(s) não encontrados na versão NCM de referência (${ncmContext.versionLabel || ncmContext.versionId}): ${missing.join(', ')}.`
                )
                item.validationStatus = 'invalid'
            }
        }
    })

    preview.validRows = preview.items.filter((item) => item.validationStatus === 'valid').length
    preview.invalidRows = preview.items.filter((item) => item.validationStatus === 'invalid').length
    preview.warningRows = preview.items.filter((item) => item.validationWarnings.length > 0).length
    return preview
}
