import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { FiscalImportPreviewSummary } from '@/lib/fiscal/import-utils'

interface FiscalImportPreviewProps {
    preview: FiscalImportPreviewSummary
}

export function FiscalImportPreview({ preview }: FiscalImportPreviewProps) {
    return (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap gap-2">
                <Badge className="bg-emerald-600 text-white">Validas: {preview.validRows}</Badge>
                <Badge variant="outline" className="bg-white">
                    Lidas: {preview.readRows}
                </Badge>
                {preview.structuralRows > 0 ? (
                    <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                        Estruturais detectadas: {preview.structuralRows}
                    </Badge>
                ) : null}
                {Number(preview.exactLinkCount || 0) > 0 ? (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                        Vinculos NCM exatos: {Number(preview.exactLinkCount || 0)}
                    </Badge>
                ) : null}
                {Number(preview.prefixLinkCount || 0) > 0 ? (
                    <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                        NCMs abrangentes: {Number(preview.prefixLinkCount || 0)}
                    </Badge>
                ) : null}
                <Badge variant="outline" className="bg-white text-slate-700">
                    Formato: {preview.sourceType.toUpperCase()}
                </Badge>
                {preview.sheetName ? (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                        <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
                        Aba: {preview.sheetName}
                    </Badge>
                ) : null}
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                    Avisos: {preview.warningRows}
                </Badge>
                <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
                    Invalidas: {preview.invalidRows}
                </Badge>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
                Revise erros e avisos antes de confirmar. O lote so cria uma nova versao quando voce concluir a
                importacao no passo final.
                {preview.referenceValidation ? (
                    <p className="mt-2 text-xs text-slate-600">{preview.referenceValidation.message}</p>
                ) : null}
                {Number(preview.prefixLinkCount || 0) > 0 ? (
                    <p className="mt-2 text-xs text-slate-600">
                        Prefixos NCM com 2 a 7 digitos serao tratados como vinculos abrangentes. Exemplo: `9401`
                        cobre todos os NCMs finais iniciados por `9401`, como `94014100` e `94017100`.
                    </p>
                ) : null}
                {preview.structuralRows > 0 ? (
                    <p className="mt-2 text-xs text-slate-600">
                        {preview.structuralRows} linha(s) estruturais da tabela oficial foram reconhecidas e serao
                        importadas para consulta e navegacao hierarquica da base selecionada. O uso fiscal final
                        continua restrito aos codigos finais aplicaveis em perfis tributarios.
                    </p>
                ) : null}
            </div>

            <div className="overflow-hidden rounded-xl border">
                <div className="max-h-[55vh] overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2">Linha</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Dados normalizados</th>
                                <th className="px-3 py-2">Mensagens</th>
                            </tr>
                        </thead>
                        <tbody>
                            {preview.items.map((item) => {
                                const hasWarnings = item.validationWarnings.length > 0
                                const isValid = item.validationStatus === 'valid'

                                return (
                                    <tr key={item.rowNumber} className="border-t align-top">
                                        <td className="px-3 py-2 text-navy">{item.rowNumber}</td>
                                        <td className="px-3 py-2">
                                            {isValid && !hasWarnings ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    Pronta
                                                </span>
                                            ) : null}
                                            {isValid && hasWarnings ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                                                    <Info className="h-3.5 w-3.5" />
                                                    Pronta com aviso
                                                </span>
                                            ) : null}
                                            {!isValid ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-700">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    Revisar
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            <pre className="whitespace-pre-wrap break-words">
                                                {JSON.stringify(item.normalizedPayload, null, 2)}
                                            </pre>
                                        </td>
                                        <td className="px-3 py-2 text-xs">
                                            <div className="space-y-2">
                                                {item.validationErrors.length > 0 ? (
                                                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
                                                        <p className="mb-1 font-medium">Erros</p>
                                                        <ul className="space-y-1">
                                                            {item.validationErrors.map((message) => (
                                                                <li key={message}>{message}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : null}
                                                {item.validationWarnings.length > 0 ? (
                                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700">
                                                        <p className="mb-1 font-medium">Avisos</p>
                                                        <ul className="space-y-1">
                                                            {item.validationWarnings.map((message) => (
                                                                <li key={message}>{message}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : null}
                                                {item.validationErrors.length === 0 &&
                                                item.validationWarnings.length === 0 ? (
                                                    <span className="text-muted-foreground">Sem erros ou avisos.</span>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
