import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { importCustomersFromCSV } from '../actions';
import { toast } from 'sonner';

interface CSVRow {
    fullName: string;
    email: string;
    phone?: string;
    companyName: string;
    cnpj: string;
    customerType?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
}

interface CustomerImportModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onImportComplete: () => void;
}

const CSV_HEADERS = ['nome', 'email', 'telefone', 'razao_social', 'cnpj', 'tipo_cliente', 'endereco', 'cidade', 'estado', 'cep'];

function parseCSV(text: string): CSVRow[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    // Parse header to find column indices
    const headerLine = lines[0].toLowerCase();
    const separator = headerLine.includes(';') ? ';' : ',';
    const headers = headerLine.split(separator).map(h => h.trim().replace(/"/g, ''));

    const findCol = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

    const nameIdx = findCol(['nome', 'name', 'responsavel']);
    const emailIdx = findCol(['email', 'e-mail']);
    const phoneIdx = findCol(['telefone', 'phone', 'whatsapp', 'celular']);
    const companyIdx = findCol(['razao', 'company', 'empresa', 'razão']);
    const cnpjIdx = findCol(['cnpj', 'cpf', 'documento']);
    const typeIdx = findCol(['tipo', 'type', 'categoria']);
    const addressIdx = findCol(['endereco', 'endereço', 'address', 'rua']);
    const cityIdx = findCol(['cidade', 'city']);
    const stateIdx = findCol(['estado', 'state', 'uf']);
    const zipIdx = findCol(['cep', 'zip', 'codigo_postal']);

    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));

        const row: CSVRow = {
            fullName: nameIdx >= 0 ? cols[nameIdx] || '' : '',
            email: emailIdx >= 0 ? cols[emailIdx] || '' : '',
            phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
            companyName: companyIdx >= 0 ? cols[companyIdx] || '' : '',
            cnpj: cnpjIdx >= 0 ? cols[cnpjIdx] || '' : '',
            customerType: typeIdx >= 0 ? cols[typeIdx] : undefined,
            address: addressIdx >= 0 ? cols[addressIdx] : undefined,
            city: cityIdx >= 0 ? cols[cityIdx] : undefined,
            state: stateIdx >= 0 ? cols[stateIdx] : undefined,
            zipCode: zipIdx >= 0 ? cols[zipIdx] : undefined,
        };

        // Only include rows with at least name and email
        if (row.fullName && row.email) {
            rows.push(row);
        }
    }

    return rows;
}

export function CustomerImportModal({ isOpen, onOpenChange, onImportComplete }: CustomerImportModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
    const [importing, setImporting] = useState(false);
    const [importResults, setImportResults] = useState<{ row: number; status: string; message: string }[] | null>(null);
    const [fileName, setFileName] = useState('');

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setImportResults(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const rows = parseCSV(text);
            setParsedRows(rows);

            if (rows.length === 0) {
                toast.error('Nenhuma linha válida encontrada no CSV. Verifique o formato.');
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleImport = async () => {
        if (parsedRows.length === 0) return;
        setImporting(true);

        try {
            const result = await importCustomersFromCSV(parsedRows);
            if (result.error) {
                toast.error(result.error);
            } else {
                setImportResults(result.results || []);
                toast.success(`${result.totalImported} clientes importados com sucesso!`);
                if (result.totalImported && result.totalImported > 0) {
                    onImportComplete();
                }
            }
        } catch {
            toast.error('Erro inesperado ao importar clientes.');
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setParsedRows([]);
        setImportResults(null);
        setFileName('');
        onOpenChange(false);
    };

    const downloadTemplate = () => {
        const headers = CSV_HEADERS.join(';');
        const example = 'João Silva;joao@empresa.com;11999999999;Empresa do João ME;12345678000100;Varejista;Rua das Flores 123;São Paulo;SP;01234567';
        const blob = new Blob([`${headers}\n${example}`], { type: 'text/csv;charset=UTF-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modelo_importacao_clientes.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-heading text-2xl flex items-center gap-2">
                        <FileSpreadsheet className="h-6 w-6 text-bronze" />
                        Importar Clientes via CSV
                    </DialogTitle>
                    <DialogDescription>
                        Importe clientes em massa. Eles entrarão com status <strong>"Importado"</strong> e precisarão ser ativados manualmente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Template Download */}
                    <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                        <Download className="h-4 w-4" />
                        Baixar modelo CSV
                    </Button>

                    {/* File Upload */}
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
                            <p className="text-sm font-medium text-navy">{fileName} — {parsedRows.length} linha(s) encontrada(s)</p>
                        ) : (
                            <>
                                <p className="text-sm font-medium">Clique para selecionar o arquivo CSV</p>
                                <p className="text-xs text-muted-foreground mt-1">Formato aceito: .csv separado por ponto-e-vírgula ou vírgula</p>
                            </>
                        )}
                    </div>

                    {/* Preview Table */}
                    {parsedRows.length > 0 && !importResults && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-3 py-2 text-sm font-medium text-navy border-b">
                                Preview — {parsedRows.length} clientes
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left">#</th>
                                            <th className="px-3 py-2 text-left">Nome</th>
                                            <th className="px-3 py-2 text-left">Email</th>
                                            <th className="px-3 py-2 text-left">Razão Social</th>
                                            <th className="px-3 py-2 text-left">CNPJ</th>
                                            <th className="px-3 py-2 text-left">Tipo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedRows.slice(0, 20).map((row, i) => (
                                            <tr key={i} className="border-t hover:bg-slate-50/50">
                                                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                                                <td className="px-3 py-1.5 truncate max-w-[120px]">{row.fullName}</td>
                                                <td className="px-3 py-1.5 truncate max-w-[150px]">{row.email}</td>
                                                <td className="px-3 py-1.5 truncate max-w-[120px]">{row.companyName}</td>
                                                <td className="px-3 py-1.5">{row.cnpj}</td>
                                                <td className="px-3 py-1.5">{row.customerType || '—'}</td>
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

                    {/* Import Results */}
                    {importResults && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-3 py-2 text-sm font-medium text-navy border-b">
                                Resultado da Importação
                            </div>
                            <div className="max-h-60 overflow-y-auto p-3 space-y-1.5">
                                {importResults.map((r, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        {r.status === 'success' ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                        )}
                                        <span>Linha {r.row}:</span>
                                        <Badge variant={r.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                                            {r.message}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
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
    );
}
