import * as XLSX from 'xlsx'
import {
    FISCAL_BASE_LABELS,
    type FiscalBaseType,
    type FiscalImportSourceType,
} from '@/lib/fiscal/constants'

export interface FiscalCsvRow {
    rowNumber: number
    raw: Record<string, string>
}

export interface FiscalParsedImportFile {
    headers: string[]
    rows: FiscalCsvRow[]
    sourceType: FiscalImportSourceType
    sheetName?: string | null
}

export interface FiscalImportPreviewItem {
    rowNumber: number
    validationStatus: 'valid' | 'invalid'
    rawPayload: Record<string, string>
    normalizedPayload: Record<string, unknown>
    validationErrors: string[]
    validationWarnings: string[]
}

export interface FiscalImportPreviewSummary {
    tableType: FiscalBaseType
    sourceType: FiscalImportSourceType
    sheetName?: string | null
    totalRows: number
    validRows: number
    invalidRows: number
    warningRows: number
    items: FiscalImportPreviewItem[]
}

export interface FiscalImportTemplateConfig {
    requiredColumns: string[]
    optionalColumns: string[]
    exampleRows: string[][]
}

export interface BuildFiscalImportPreviewInput {
    sourceType: FiscalImportSourceType
    textContent?: string | null
    fileBase64?: string | null
}

export const FISCAL_IMPORT_TEMPLATES: Record<FiscalBaseType, FiscalImportTemplateConfig> = {
    ncm: {
        requiredColumns: ['code', 'description'],
        optionalColumns: ['full_description'],
        exampleRows: [
            [
                '94016100',
                'Assentos estofados com estrutura de madeira',
                'Assentos estofados, com armacao de madeira, exceto os transformaveis em camas',
            ],
        ],
    },
    tipi: {
        requiredColumns: ['ncm_code', 'description', 'ipi_rate'],
        optionalColumns: ['ex_tipi'],
        exampleRows: [['94016100', 'Assentos estofados com estrutura de madeira', '5.00', '']],
    },
    cest: {
        requiredColumns: ['code', 'description'],
        optionalColumns: ['segment', 'ncm_codes'],
        exampleRows: [['1000100', 'Moveis e artigos correlatos', 'Moveis', '94016100,94016900']],
    },
    cfop: {
        requiredColumns: ['code', 'description'],
        optionalColumns: ['operation_direction'],
        exampleRows: [['5102', 'Venda de mercadoria adquirida ou recebida de terceiros', 'outbound']],
    },
}

function normalizeHeader(header: string) {
    return header
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/"/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
}

function normalizeCellValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return value.toISOString()
    return String(value).trim()
}

function detectSeparator(line: string) {
    let commaCount = 0
    let semicolonCount = 0
    let insideQuotes = false

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index]
        if (char === '"') {
            if (insideQuotes && line[index + 1] === '"') {
                index += 1
                continue
            }
            insideQuotes = !insideQuotes
            continue
        }

        if (!insideQuotes && char === ',') commaCount += 1
        if (!insideQuotes && char === ';') semicolonCount += 1
    }

    return semicolonCount > commaCount ? ';' : ','
}

function parseCsvToMatrix(text: string): string[][] {
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const firstLine = normalized.split('\n').find((line) => line.trim().length > 0) || ''
    const separator = detectSeparator(firstLine)

    const rows: string[][] = []
    let row: string[] = []
    let current = ''
    let insideQuotes = false

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized[index]

        if (char === '"') {
            if (insideQuotes && normalized[index + 1] === '"') {
                current += '"'
                index += 1
            } else {
                insideQuotes = !insideQuotes
            }
            continue
        }

        if (!insideQuotes && char === separator) {
            row.push(current.trim())
            current = ''
            continue
        }

        if (!insideQuotes && char === '\n') {
            row.push(current.trim())
            if (row.some((cell) => cell.length > 0)) rows.push(row)
            row = []
            current = ''
            continue
        }

        current += char
    }

    row.push(current.trim())
    if (row.some((cell) => cell.length > 0)) rows.push(row)

    return rows
}

function parseMatrixToRows(matrix: string[][]): { rows: FiscalCsvRow[]; headers: string[] } {
    if (matrix.length === 0) return { rows: [], headers: [] }

    const headers = matrix[0].map((cell) => normalizeHeader(cell))
    const rows: FiscalCsvRow[] = []

    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const columns = matrix[rowIndex]
        const raw = headers.reduce<Record<string, string>>((acc, header, index) => {
            acc[header] = normalizeCellValue(columns[index] || '')
            return acc
        }, {})

        if (Object.values(raw).some((value) => value.length > 0)) {
            rows.push({
                rowNumber: rowIndex + 1,
                raw,
            })
        }
    }

    return { rows, headers }
}

export function parseFiscalCsv(text: string): FiscalParsedImportFile {
    const matrix = parseCsvToMatrix(text)
    const parsed = parseMatrixToRows(matrix)
    return {
        ...parsed,
        sourceType: 'csv',
        sheetName: null,
    }
}

export function parseFiscalWorkbook(fileBase64: string): FiscalParsedImportFile {
    const normalizedBase64 = fileBase64.trim()
    if (!normalizedBase64) throw new Error('Arquivo XLSX vazio ou invalido.')

    let workbook: XLSX.WorkBook
    try {
        const buffer = Buffer.from(normalizedBase64, 'base64')
        workbook = XLSX.read(buffer, {
            type: 'buffer',
            raw: false,
            cellText: true,
            cellDates: false,
        })
    } catch {
        throw new Error('Nao foi possivel ler o arquivo XLSX informado.')
    }

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        if (!worksheet) continue

        const matrix = (XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            defval: '',
            blankrows: false,
        }) as unknown[][]).map((row) => row.map((cell) => normalizeCellValue(cell)))

        if (!matrix.some((row) => row.some((cell) => cell.length > 0))) continue

        if (Array.isArray(worksheet['!merges']) && worksheet['!merges'].length > 0) {
            throw new Error(
                `A aba "${sheetName}" possui celulas mescladas. Reorganize a planilha e exporte novamente em XLSX limpo.`
            )
        }

        const parsed = parseMatrixToRows(matrix)
        return {
            ...parsed,
            sourceType: 'xlsx',
            sheetName,
        }
    }

    throw new Error('Nenhuma aba preenchida foi encontrada no arquivo XLSX.')
}

export function parseFiscalImportFile(input: BuildFiscalImportPreviewInput): FiscalParsedImportFile {
    if (input.sourceType === 'xlsx') {
        if (!input.fileBase64?.trim()) throw new Error('Conteudo do arquivo XLSX vazio.')
        return parseFiscalWorkbook(input.fileBase64)
    }

    if (!input.textContent?.trim()) throw new Error('Conteudo do arquivo CSV vazio.')
    return parseFiscalCsv(input.textContent)
}

function normalizeDocumentCode(value: string, digits: number) {
    const normalized = (value || '').replace(/\D/g, '')
    return normalized.length === digits ? normalized : normalized
}

function normalizeDecimal(value: string) {
    const trimmed = (value || '').trim()
    if (!trimmed) return null

    const sanitized =
        trimmed.includes(',') && trimmed.includes('.')
            ? trimmed.replace(/\./g, '').replace(',', '.')
            : trimmed.replace(',', '.')
    if (!sanitized) return null
    const numeric = Number(sanitized)
    return Number.isFinite(numeric) ? numeric : null
}

function normalizeOperationDirection(value: string) {
    const normalized = (value || '').trim().toLowerCase()
    if (!normalized) return 'both'
    if (['outbound', 'saida', 'saída', 'output', 'sale'].includes(normalized)) return 'outbound'
    if (['inbound', 'entrada', 'input', 'purchase'].includes(normalized)) return 'inbound'
    if (['both', 'ambos', 'ambas', 'todos'].includes(normalized)) return 'both'
    return normalized
}

function validateRequiredColumns(tableType: FiscalBaseType, headers: string[]) {
    const template = FISCAL_IMPORT_TEMPLATES[tableType]
    return template.requiredColumns.filter((column) => !headers.includes(column))
}

function buildNcmPreviewItem(row: FiscalCsvRow): FiscalImportPreviewItem {
    const code = normalizeDocumentCode(row.raw.code || '', 8)
    const description = (row.raw.description || '').trim()
    const fullDescription = (row.raw.full_description || '').trim()
    const validationErrors: string[] = []

    if (!/^\d{8}$/.test(code)) validationErrors.push('Codigo NCM deve ter 8 digitos.')
    if (!description) validationErrors.push('Descricao do NCM e obrigatoria.')

    return {
        rowNumber: row.rowNumber,
        validationStatus: validationErrors.length === 0 ? 'valid' : 'invalid',
        rawPayload: row.raw,
        normalizedPayload: {
            code,
            description,
            full_description: fullDescription || null,
        },
        validationErrors,
        validationWarnings: [],
    }
}

function buildTipiPreviewItem(row: FiscalCsvRow): FiscalImportPreviewItem {
    const ncmCode = normalizeDocumentCode(row.raw.ncm_code || '', 8)
    const exTipi = (row.raw.ex_tipi || '').trim()
    const description = (row.raw.description || '').trim()
    const ipiRate = normalizeDecimal(row.raw.ipi_rate || '')
    const validationErrors: string[] = []

    if (!/^\d{8}$/.test(ncmCode)) validationErrors.push('NCM vinculado deve ter 8 digitos.')
    if (!description) validationErrors.push('Descricao TIPI e obrigatoria.')
    if (ipiRate === null || ipiRate < 0) {
        validationErrors.push('Aliquota IPI deve ser numerica e maior ou igual a zero.')
    }

    return {
        rowNumber: row.rowNumber,
        validationStatus: validationErrors.length === 0 ? 'valid' : 'invalid',
        rawPayload: row.raw,
        normalizedPayload: {
            ncm_code: ncmCode,
            ex_tipi: exTipi || null,
            description,
            ipi_rate: ipiRate,
        },
        validationErrors,
        validationWarnings: [],
    }
}

function buildCestPreviewItem(row: FiscalCsvRow): FiscalImportPreviewItem {
    const code = normalizeDocumentCode(row.raw.code || '', 7)
    const description = (row.raw.description || '').trim()
    const segment = (row.raw.segment || '').trim()
    const ncmCodes = (row.raw.ncm_codes || '')
        .split(/[,\|/]/)
        .map((value) => value.replace(/\D/g, ''))
        .filter((value) => value.length > 0)
    const validationErrors: string[] = []

    if (!/^\d{7}$/.test(code)) validationErrors.push('Codigo CEST deve ter 7 digitos.')
    if (!description) validationErrors.push('Descricao do CEST e obrigatoria.')
    if (ncmCodes.some((value) => !/^\d{8}$/.test(value))) {
        validationErrors.push('Todos os NCMs associados ao CEST devem ter 8 digitos.')
    }

    return {
        rowNumber: row.rowNumber,
        validationStatus: validationErrors.length === 0 ? 'valid' : 'invalid',
        rawPayload: row.raw,
        normalizedPayload: {
            code,
            description,
            segment: segment || null,
            ncm_codes: Array.from(new Set(ncmCodes)),
        },
        validationErrors,
        validationWarnings: [],
    }
}

function buildCfopPreviewItem(row: FiscalCsvRow): FiscalImportPreviewItem {
    const code = normalizeDocumentCode(row.raw.code || '', 4)
    const description = (row.raw.description || '').trim()
    const operationDirection = normalizeOperationDirection(row.raw.operation_direction || '')
    const validationErrors: string[] = []

    if (!/^\d{4}$/.test(code)) validationErrors.push('Codigo CFOP deve ter 4 digitos.')
    if (!description) validationErrors.push('Descricao do CFOP e obrigatoria.')
    if (!['outbound', 'inbound', 'both'].includes(operationDirection)) {
        validationErrors.push('Direcao da operacao deve ser outbound, inbound ou both.')
    }

    return {
        rowNumber: row.rowNumber,
        validationStatus: validationErrors.length === 0 ? 'valid' : 'invalid',
        rawPayload: row.raw,
        normalizedPayload: {
            code,
            description,
            operation_direction: operationDirection,
        },
        validationErrors,
        validationWarnings: [],
    }
}

export function buildFiscalImportPreview(
    tableType: FiscalBaseType,
    input: BuildFiscalImportPreviewInput
): FiscalImportPreviewSummary {
    const parsed = parseFiscalImportFile(input)
    const missingColumns = validateRequiredColumns(tableType, parsed.headers)

    if (missingColumns.length > 0) {
        throw new Error(
            `Colunas obrigatorias ausentes para ${FISCAL_BASE_LABELS[tableType]}: ${missingColumns.join(', ')}.`
        )
    }

    const items = parsed.rows.map((row) => {
        switch (tableType) {
            case 'ncm':
                return buildNcmPreviewItem(row)
            case 'tipi':
                return buildTipiPreviewItem(row)
            case 'cest':
                return buildCestPreviewItem(row)
            case 'cfop':
                return buildCfopPreviewItem(row)
            default:
                return {
                    rowNumber: row.rowNumber,
                    validationStatus: 'invalid' as const,
                    rawPayload: row.raw,
                    normalizedPayload: {},
                    validationErrors: ['Tipo de tabela fiscal nao suportado.'],
                    validationWarnings: [],
                }
        }
    })

    const duplicates = new Map<string, number[]>()
    items.forEach((item) => {
        const key = (() => {
            switch (tableType) {
                case 'ncm':
                case 'cest':
                case 'cfop':
                    return String(item.normalizedPayload.code || '')
                case 'tipi':
                    return `${String(item.normalizedPayload.ncm_code || '')}:${String(item.normalizedPayload.ex_tipi || '')}`
            }
        })()

        if (!key) return
        const existing = duplicates.get(key) || []
        existing.push(item.rowNumber)
        duplicates.set(key, existing)
    })

    items.forEach((item) => {
        const key = (() => {
            switch (tableType) {
                case 'ncm':
                case 'cest':
                case 'cfop':
                    return String(item.normalizedPayload.code || '')
                case 'tipi':
                    return `${String(item.normalizedPayload.ncm_code || '')}:${String(item.normalizedPayload.ex_tipi || '')}`
            }
        })()

        if (!key) return
        const rowsForKey = duplicates.get(key) || []
        if (rowsForKey.length > 1) {
            item.validationErrors.push(`Duplicidade no arquivo para a chave ${key}.`)
            item.validationStatus = 'invalid'
        }
    })

    return {
        tableType,
        sourceType: parsed.sourceType,
        sheetName: parsed.sheetName,
        totalRows: items.length,
        validRows: items.filter((item) => item.validationStatus === 'valid').length,
        invalidRows: items.filter((item) => item.validationStatus === 'invalid').length,
        warningRows: items.filter((item) => item.validationWarnings.length > 0).length,
        items,
    }
}

export function buildFiscalTemplateCsv(tableType: FiscalBaseType) {
    const template = FISCAL_IMPORT_TEMPLATES[tableType]
    const headers = [...template.requiredColumns, ...template.optionalColumns]
    const lines = [headers.join(';'), ...template.exampleRows.map((row) => row.join(';'))]
    return lines.join('\n')
}
