import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
    FISCAL_BASE_LABELS,
    isFiscalBaseType,
    isFiscalImportSourceType,
    type FiscalBaseType,
    type FiscalImportSourceType,
} from '@/lib/fiscal/constants'
import {
    buildFiscalImportPreview,
    type BuildFiscalImportPreviewInput,
    type FiscalImportPreviewSummary,
} from '@/lib/fiscal/import-utils'
import { validateFiscalPreviewAgainstReferenceBases } from '@/lib/fiscal/cross-validation'

export const runtime = 'nodejs'

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

function normalizeOperationalErrorMessage(error: unknown, fallback: string) {
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

function normalizeMojibakeText(value?: string | null) {
    const trimmed = (value || '').trim()
    if (!trimmed) return null
    if (!/[ÃƒÆ’Ãƒâ€šÃƒÂ¢Ã¯Â¿Â½]/.test(trimmed)) return trimmed

    try {
        const decoded = Buffer.from(trimmed, 'latin1').toString('utf8').trim()
        if (decoded && !/[ÃƒÆ’Ãƒâ€šÃ¯Â¿Â½]/.test(decoded)) {
            return decoded
        }
    } catch {
        return trimmed
    }

    return trimmed
}

function sanitizeText(value?: string | null) {
    const normalized = normalizeMojibakeText(value)
    return normalized && normalized.length > 0 ? normalized : null
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

function sanitizeJsonArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
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

async function loadActiveNcmCodes() {
    const adminSupabase = createServiceRoleClient()
    const { data: activeVersion, error: versionError } = await adminSupabase
        .from('fiscal_reference_versions')
        .select('id')
        .eq('table_type', 'ncm')
        .eq('is_active', true)
        .single()

    if (versionError || !activeVersion) return null

    const { data, error } = await adminSupabase
        .from('fiscal_ncm_entries')
        .select('code')
        .eq('version_id', activeVersion.id)

    if (error) throw error
    return new Set(((data || []) as Array<Record<string, unknown>>).map((row) => String(row.code || '')))
}

async function validatePreviewAgainstCurrentBases(
    tableType: FiscalBaseType,
    preview: FiscalImportPreviewSummary
) {
    return validateFiscalPreviewAgainstReferenceBases(tableType, preview)
}

export async function POST(request: Request) {
    try {
        const actorId = await ensureAdminAccess()
        const formData = await request.formData()
        const tableType = String(formData.get('tableType') || '')
        const sourceType = String(formData.get('sourceType') || '')
        const file = formData.get('file')

        if (!isFiscalBaseType(tableType)) {
            return NextResponse.json({ success: false, error: 'Tipo de base fiscal invalido.' }, { status: 400 })
        }

        if (!isFiscalImportSourceType(sourceType)) {
            return NextResponse.json({ success: false, error: 'Formato de importacao invalido.' }, { status: 400 })
        }

        if (!(file instanceof File)) {
            return NextResponse.json({ success: false, error: 'Arquivo de importacao invalido.' }, { status: 400 })
        }

        const fileName = sanitizeText(file.name)
        if (!fileName) {
            return NextResponse.json({ success: false, error: 'Arquivo de importacao invalido.' }, { status: 400 })
        }

        const importInput: BuildFiscalImportPreviewInput =
            sourceType === 'xlsx'
                ? {
                      sourceType: 'xlsx',
                      fileBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
                  }
                : {
                      sourceType: 'csv',
                      textContent: await file.text(),
                  }

        const preview = await validatePreviewAgainstCurrentBases(
            tableType,
            buildFiscalImportPreview(tableType, importInput)
        )

        if (preview.totalRows === 0) {
            throw new Error(`Nenhuma linha utilizavel foi encontrada para ${FISCAL_BASE_LABELS[tableType]}.`)
        }

        const adminSupabase = createServiceRoleClient()
        const { data: batch, error: batchError } = await adminSupabase
            .from('fiscal_import_batches')
            .insert({
                table_type: tableType,
                status: 'draft',
                source_file_name: fileName,
                source_type: sourceType,
                imported_by: actorId,
                total_rows: preview.totalRows,
                valid_rows: preview.validRows,
                invalid_rows: preview.invalidRows,
                error_summary_jsonb: {
                    preview_invalid_rows: preview.invalidRows,
                    preview_valid_rows: preview.validRows,
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

        return NextResponse.json({
            success: true,
            data: {
                ...preview,
                batchId: String(batch.id),
                suggestedVersionLabel: buildSuggestedVersionLabel(tableType),
            },
        })
    } catch (error: unknown) {
        return NextResponse.json(
            {
                success: false,
                error: normalizeOperationalErrorMessage(error, 'Erro ao gerar preview da importacao fiscal.'),
            },
            { status: 500 }
        )
    }
}




