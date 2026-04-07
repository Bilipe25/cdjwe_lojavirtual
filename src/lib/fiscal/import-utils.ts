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
    readRows: number
    totalRows: number
    validRows: number
    invalidRows: number
    warningRows: number
    skippedRows: number
    structuralRows: number
    items: FiscalImportPreviewItem[]
}

export interface FiscalImportTemplateConfig {
    requiredColumns: string[]
    optionalColumns: string[]
    exampleRows: string[][]
}

interface FiscalHeaderConfig {
    requiredColumns: string[]
    aliases?: Record<string, string[]>
}

export interface BuildFiscalImportPreviewInput {
    sourceType: FiscalImportSourceType
    textContent?: string | null
    fileBase64?: string | null
}

export const FISCAL_IMPORT_TEMPLATES: Record<FiscalBaseType, FiscalImportTemplateConfig> = {
    ncm: {
        requiredColumns: ['code', 'description'],
        optionalColumns: ['full_description', 'start_date', 'end_date', 'legal_act', 'legal_number', 'legal_year'],
        exampleRows: [
            [
                '94016100',
                'Assentos estofados com estrutura de madeira',
                'Assentos estofados, com armacao de madeira, exceto os transformaveis em camas',
                '2022-04-01',
                '9999-12-31',
                'Res Camex',
                '272',
                '2021',
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

const FISCAL_IMPORT_HEADER_ALIASES: Record<FiscalBaseType, Record<string, string[]>> = {
    ncm: {
        code: ['code', 'codigo'],
        description: ['description', 'descricao'],
        full_description: ['full_description', 'descricao_completa', 'descricao_detalhada'],
        start_date: ['start_date', 'data_inicio', 'inicio_vigencia', 'vigencia_inicio'],
        end_date: ['end_date', 'data_fim', 'fim_vigencia', 'vigencia_fim'],
        legal_act: ['legal_act', 'ato_legal', 'ato_legal_inicio'],
        legal_number: ['legal_number', 'numero', 'numero_ato'],
        legal_year: ['legal_year', 'ano', 'ano_ato'],
    },
    tipi: {
        ncm_code: ['ncm_code', 'ncm', 'codigo_ncm'],
        description: ['description', 'descricao'],
        ipi_rate: ['ipi_rate', 'aliquota_ipi', 'aliquota'],
        ex_tipi: ['ex_tipi', 'ex', 'extipi'],
    },
    cest: {
        code: ['code', 'codigo'],
        description: ['description', 'descricao'],
        segment: ['segment', 'segmento'],
        ncm_codes: ['ncm_codes', 'ncms', 'ncm'],
    },
    cfop: {
        code: ['code', 'codigo'],
        description: ['description', 'descricao'],
        operation_direction: ['operation_direction', 'direcao_operacao', 'tipo_operacao'],
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

function mapHeaderToCanonical(header: string, aliases?: Record<string, string[]>) {
    if (!aliases) return header

    for (const [canonical, acceptedHeaders] of Object.entries(aliases)) {
        if (acceptedHeaders.includes(header)) return canonical
    }

    return header
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

function findHeaderRowIndex(matrix: string[][], config?: FiscalHeaderConfig) {
    if (!config) return 0

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
        const normalizedHeaders = matrix[rowIndex].map((cell) => mapHeaderToCanonical(normalizeHeader(cell), config.aliases))
        if (config.requiredColumns.every((column) => normalizedHeaders.includes(column))) {
            return rowIndex
        }
    }

    return 0
}

function parseMatrixToRows(matrix: string[][], config?: FiscalHeaderConfig): { rows: FiscalCsvRow[]; headers: string[] } {
    if (matrix.length === 0) return { rows: [], headers: [] }

    const headerRowIndex = findHeaderRowIndex(matrix, config)
    const headers = matrix[headerRowIndex].map((cell) =>
        mapHeaderToCanonical(normalizeHeader(cell), config?.aliases)
    )
    const rows: FiscalCsvRow[] = []

    for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
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

export function parseFiscalWorkbook(fileBase64: string, config?: FiscalHeaderConfig): FiscalParsedImportFile {
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

        const headerRowIndex = findHeaderRowIndex(matrix, config)

        const firstDataRowIndex = headerRowIndex + 1

        if (
            Array.isArray(worksheet['!merges']) &&
            worksheet['!merges'].some((merge) => (merge?.e?.r ?? -1) >= firstDataRowIndex)
        ) {
            throw new Error(
                `A aba "${sheetName}" possui celulas mescladas na area de dados. Reorganize a planilha e exporte novamente em XLSX limpo.`
            )
        }

        const parsed = parseMatrixToRows(matrix, config)
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

function normalizeOfficialNcmCode(value: string) {
    const trimmed = (value || '').trim()
    if (!trimmed) return ''

    const rawSegments = trimmed
        .split('.')
        .map((segment) => segment.replace(/\D/g, ''))
        .filter((segment) => segment.length > 0)

    if (rawSegments.length === 0) {
        return trimmed.replace(/\D/g, '')
    }

    const segments = [...rawSegments]

    if (segments.length === 1) {
        if (segments[0].length === 1) segments[0] = segments[0].padStart(2, '0')
        return segments.join('')
    }

    if (segments.length === 2) {
        const targetFirstLength =
            segments[1].length === 2 && segments[0].length <= 2
                ? 2
                : 4

        segments[0] = segments[0].padStart(targetFirstLength, '0')
        return segments.join('')
    }

    segments[0] = segments[0].padStart(4, '0')
    if (segments[1]) segments[1] = segments[1].padStart(2, '0')
    return segments.join('')
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

function normalizeDate(value: string) {
    const trimmed = (value || '').trim()
    if (!trimmed) return null

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (match) {
        const [, day, month, year] = match
        return `${year}-${month}-${day}`
    }

    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().slice(0, 10)
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
    const sourceCode = (row.raw.code || '').trim()
    const code = normalizeOfficialNcmCode(sourceCode)
    const isStructural = code.length >= 2 && code.length < 8
    const description = (row.raw.description || '').trim()
    const fullDescription = (row.raw.full_description || '').trim()
    const startDate = normalizeDate(row.raw.start_date || '')
    const endDate = normalizeDate(row.raw.end_date || '')
    const legalAct = (row.raw.legal_act || '').trim()
    const legalNumber = (row.raw.legal_number || '').trim()
    const legalYear = (row.raw.legal_year || '').trim()
    const validationErrors: string[] = []
    const validationWarnings: string[] = []

    if (!/^\d{8}$/.test(code) && !isStructural) {
        validationErrors.push('Codigo NCM deve ter entre 2 e 8 digitos numericos.')
    }
    if (!description) validationErrors.push('Descricao do NCM e obrigatoria.')
    if ((row.raw.start_date || '').trim() && !startDate) validationErrors.push('Data Inicio invalida.')
    if ((row.raw.end_date || '').trim() && !endDate) validationErrors.push('Data Fim invalida.')
    if (startDate && endDate && endDate < startDate) validationErrors.push('Data Fim nao pode ser anterior a Data Inicio.')
    if (legalYear && !/^\d{4}$/.test(legalYear)) validationErrors.push('Ano do ato legal deve ter 4 digitos.')
    if (!startDate) validationWarnings.push('Data Inicio nao informada.')
    if (isStructural) {
        validationWarnings.push('Linha estrutural da NCM detectada. Ela sera importada apenas para consulta e navegacao, nao para uso fiscal final em perfis tributarios.')
    }

    return {
        rowNumber: row.rowNumber,
        validationStatus: validationErrors.length === 0 ? 'valid' : 'invalid',
        rawPayload: row.raw,
        normalizedPayload: {
            code,
            description,
            full_description: fullDescription || null,
            start_date: startDate,
            end_date: endDate,
            legal_act: legalAct || null,
            legal_number: legalNumber || null,
            legal_year: legalYear || null,
            source_code: sourceCode || null,
        },
        validationErrors,
        validationWarnings,
    }
}

function isStructuralNcmRow(row: FiscalCsvRow) {
    const sourceCode = (row.raw.code || '').trim()
    const numericCode = normalizeOfficialNcmCode(sourceCode)
    const description = (row.raw.description || '').trim()

    if (!sourceCode || !description) return false
    return numericCode.length > 0 && numericCode.length < 8
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
    const parsed = (() => {
        const config: FiscalHeaderConfig = {
            requiredColumns: FISCAL_IMPORT_TEMPLATES[tableType].requiredColumns,
            aliases: FISCAL_IMPORT_HEADER_ALIASES[tableType],
        }

        if (input.sourceType === 'xlsx') {
            if (!input.fileBase64?.trim()) throw new Error('Conteudo do arquivo XLSX vazio.')
            return parseFiscalWorkbook(input.fileBase64, config)
        }

        if (!input.textContent?.trim()) throw new Error('Conteudo do arquivo CSV vazio.')
        const matrix = parseCsvToMatrix(input.textContent)
        const parsedCsv = parseMatrixToRows(matrix, config)
        return {
            ...parsedCsv,
            sourceType: 'csv' as const,
            sheetName: null,
        }
    })()
    const missingColumns = validateRequiredColumns(tableType, parsed.headers)

    if (missingColumns.length > 0) {
        throw new Error(
            `Colunas obrigatorias ausentes para ${FISCAL_BASE_LABELS[tableType]}: ${missingColumns.join(', ')}.`
        )
    }

    const readRows = parsed.rows.length
    const structuralRows =
        tableType === 'ncm' ? parsed.rows.filter((row) => isStructuralNcmRow(row)).length : 0
    const candidateRows = parsed.rows

    const items = candidateRows.map((row) => {
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
        readRows,
        totalRows: items.length,
        validRows: items.filter((item) => item.validationStatus === 'valid').length,
        invalidRows: items.filter((item) => item.validationStatus === 'invalid').length,
        warningRows: items.filter((item) => item.validationWarnings.length > 0).length,
        skippedRows: 0,
        structuralRows,
        items,
    }
}

export function buildFiscalTemplateCsv(tableType: FiscalBaseType) {
    const template = FISCAL_IMPORT_TEMPLATES[tableType]
    const headers = [...template.requiredColumns, ...template.optionalColumns]
    const lines = [headers.join(';'), ...template.exampleRows.map((row) => row.join(';'))]
    return lines.join('\n')
}
