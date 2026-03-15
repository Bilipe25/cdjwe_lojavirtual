import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { importCustomersFromCSVTx } from '../actions'
import { toast } from 'sonner'

interface CSVRow {
    fullName: string
    email: string
    phone?: string
    companyName: string
    cnpj: string
    customerType?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
}

interface CustomerImportModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onImportComplete: () => void
}

const CSV_HEADERS = ['nome', 'email', 'telefone', 'razao_social', 'cnpj', 'tipo_cliente', 'endereco', 'cidade', 'estado', 'cep']

function normalizeHeader(header: string) {
    return header
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/"/g, '')
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
            if (row.some((cell) => cell.length > 0)) {
                rows.push(row)
            }
            row = []
            current = ''
            continue
        }

        current += char
    }

    row.push(current.trim())
    if (row.some((cell) => cell.length > 0)) {
        rows.push(row)
    }

    return rows
}

function parseCSV(text: string): CSVRow[] {
    const matrix = parseCsvToMatrix(text)
    if (matrix.length < 2) return []

    const headers = matrix[0].map(normalizeHeader)
    const findColumnIndex = (aliases: string[]) => headers.findIndex((header) => aliases.some((alias) => header.includes(alias)))

    const nameIndex = findColumnIndex(['nome', 'name', 'responsavel'])
    const emailIndex = findColumnIndex(['email', 'e-mail'])
    const phoneIndex = findColumnIndex(['telefone', 'phone', 'whatsapp', 'celular'])
    const companyIndex = findColumnIndex(['razao', 'company', 'empresa'])
    const cnpjIndex = findColumnIndex(['cnpj', 'cpf', 'documento'])
    const typeIndex = findColumnIndex(['tipo', 'type', 'categoria'])
    const addressIndex = findColumnIndex(['endereco', 'address', 'rua'])
    const cityIndex = findColumnIndex(['cidade', 'city'])
    const stateIndex = findColumnIndex(['estado', 'state', 'uf'])
    const zipIndex = findColumnIndex(['cep', 'zip', 'codigo_postal'])

    const rows: CSVRow[] = []

    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const columns = matrix[rowIndex]
        const getCell = (index: number) => (index >= 0 ? columns[index]?.trim() : '') || ''

        const parsed: CSVRow = {
            fullName: getCell(nameIndex),
            email: getCell(emailIndex),
            phone: getCell(phoneIndex) || undefined,
            companyName: getCell(companyIndex),
            cnpj: getCell(cnpjIndex),
            customerType: getCell(typeIndex) || undefined,
            address: getCell(addressIndex) || undefined,
            city: getCell(cityIndex) || undefined,
            state: getCell(stateIndex) || undefined,
            zipCode: getCell(zipIndex) || undefined,
        }

        if (parsed.fullName && parsed.email) {
            rows.push(parsed)
        }
    }

    return rows
}

export function CustomerImportModal({ isOpen, onOpenChange, onImportComplete }: CustomerImportModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [parsedRows, setParsedRows] = useState<CSVRow[]>([])
    const [importing, setImporting] = useState(false)
    const [importResults, setImportResults] = useState<{ row: number; status: string; message: string }[] | null>(null)
    const [fileName, setFileName] = useState('')

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setImportResults(null)

        const reader = new FileReader()
        reader.onload = (loadEvent) => {
            const text = (loadEvent.target?.result as string) || ''
            const rows = parseCSV(text)
            setParsedRows(rows)

            if (rows.length === 0) {
                toast.error('Nenhuma linha valida encontrada no CSV. Verifique o formato.')
            }
        }
        reader.readAsText(file, 'UTF-8')
    }

    const handleImport = async () => {
        if (parsedRows.length === 0) return
        setImporting(true)

        try {
            const result = await importCustomersFromCSVTx(parsedRows)
            if (result.error) {
                toast.error(result.error)
                return
            }

            setImportResults(result.results || [])
            toast.success(`${result.totalImported} clientes importados com sucesso!`)
            if (result.totalImported && result.totalImported > 0) {
                onImportComplete()
            }
        } catch {
            toast.error('Erro inesperado ao importar clientes.')
        } finally {
            setImporting(false)
        }
    }

    const handleClose = () => {
        setParsedRows([])
        setImportResults(null)
        setFileName('')
        onOpenChange(false)
    }

    const downloadTemplate = () => {
        const headers = CSV_HEADERS.join(';')
        const example = 'Joao Silva;joao@empresa.com;11999999999;Empresa do Joao ME;12345678000100;Varejista;Rua das Flores 123;Sao Paulo;SP;01234567'
        const blob = new Blob([`${headers}\n${example}`], { type: 'text/csv;charset=UTF-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'modelo_importacao_clientes.csv'
        anchor.click()
        URL.revokeObjectURL(url)
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-heading text-2xl flex items-center gap-2">
                        <FileSpreadsheet className="h-6 w-6 text-bronze" />
                        Importar Clientes via CSV
                    </DialogTitle>
                    <DialogDescription>
                        Importe clientes em massa. Eles entrarao com status <strong>&quot;Importado&quot;</strong> e precisarao ser ativados manualmente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                        <Download className="h-4 w-4" />
                        Baixar modelo CSV
                    </Button>

                    <div
                        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-bronze/50 hover:bg-bronze/5 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        {fileName ? (
                            <p className="text-sm font-medium text-navy">
                                {fileName} - {parsedRows.length} linha(s) encontrada(s)
                            </p>
                        ) : (
                            <>
                                <p className="text-sm font-medium">Clique para selecionar o arquivo CSV</p>
                                <p className="text-xs text-muted-foreground mt-1">Formato aceito: CSV separado por ponto-e-virgula ou virgula</p>
                            </>
                        )}
                    </div>

                    {parsedRows.length > 0 && !importResults && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-3 py-2 text-sm font-medium text-navy border-b">
                                Preview - {parsedRows.length} clientes
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left">#</th>
                                            <th className="px-3 py-2 text-left">Nome</th>
                                            <th className="px-3 py-2 text-left">Email</th>
                                            <th className="px-3 py-2 text-left">Razao Social</th>
                                            <th className="px-3 py-2 text-left">CNPJ</th>
                                            <th className="px-3 py-2 text-left">Tipo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.slice(0, 20).map((row, index) => (
                                            <tr key={`${row.email}-${index}`} className="border-t hover:bg-slate-50/50">
                                                <td className="px-3 py-1.5 text-muted-foreground">{index + 1}</td>
                                                <td className="px-3 py-1.5 truncate max-w-[120px]">{row.fullName}</td>
                                                <td className="px-3 py-1.5 truncate max-w-[150px]">{row.email}</td>
                                                <td className="px-3 py-1.5 truncate max-w-[120px]">{row.companyName}</td>
                                                <td className="px-3 py-1.5">{row.cnpj}</td>
                                                <td className="px-3 py-1.5">{row.customerType || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {parsedRows.length > 20 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                                        ...e mais {parsedRows.length - 20} linhas
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {importResults && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-3 py-2 text-sm font-medium text-navy border-b">Resultado da Importacao</div>
                            <div className="max-h-60 overflow-y-auto p-3 space-y-1.5">
                                {importResults.map((result, index) => (
                                    <div key={`${result.row}-${index}`} className="flex items-center gap-2 text-xs">
                                        {result.status === 'success' ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                        )}
                                        <span>Linha {result.row}:</span>
                                        <Badge variant={result.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                                            {result.message}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                    <Button variant="outline" onClick={handleClose} disabled={importing}>
                        {importResults ? 'Fechar' : 'Cancelar'}
                    </Button>
                    {!importResults && (
                        <Button
                            onClick={handleImport}
                            disabled={importing || parsedRows.length === 0}
                            className="gradient-navy border-0 text-white min-w-[160px]"
                        >
                            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Importar {parsedRows.length} Cliente{parsedRows.length !== 1 ? 's' : ''}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
