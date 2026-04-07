import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getFiscalImportBatchDetailAction } from '@/app/admin/actions/fiscal-bases'
import { FISCAL_BASE_LABELS } from '@/lib/fiscal/constants'

interface FiscalImportDetailPageProps {
    params: Promise<{ id: string }>
}

function translateStatus(status: 'draft' | 'imported' | 'failed' | 'cancelled') {
    switch (status) {
        case 'draft':
            return 'Rascunho'
        case 'imported':
            return 'Importado'
        case 'failed':
            return 'Falhou'
        case 'cancelled':
            return 'Cancelado'
    }
}

export default async function FiscalImportDetailPage({ params }: FiscalImportDetailPageProps) {
    const { id } = await params
    const result = await getFiscalImportBatchDetailAction(id)

    if (!result.success || !result.data) {
        return (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
                {result.error || 'Nao foi possivel carregar o lote fiscal.'}
            </div>
        )
    }

    const batch = result.data
    const sourceSheetName =
        batch.errorSummary && typeof batch.errorSummary.source_sheet_name === 'string'
            ? batch.errorSummary.source_sheet_name
            : null

    return (
        <div className="space-y-6">
            <div>
                <Button
                    asChild
                    variant="ghost"
                    className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900"
                >
                    <Link href="/admin/fiscal-bases/imports">
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para o historico
                    </Link>
                </Button>
                <h1 className="text-3xl font-bold font-heading text-gradient-navy">Detalhes da Importacao Fiscal</h1>
                <p className="mt-1 text-muted-foreground">
                    {FISCAL_BASE_LABELS[batch.tableType]} - {batch.sourceFileName || 'Importacao manual'} -{' '}
                    {translateStatus(batch.status)}
                </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-6">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Versao criada</p>
                    <p className="mt-2 text-lg font-semibold text-navy">{batch.versionLabel || '-'}</p>
                    {batch.versionLabel ? (
                        <Badge
                            variant="outline"
                            className={`mt-2 ${batch.activeVersion ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'bg-white text-slate-700'}`}
                        >
                            {batch.activeVersion ? 'Versao ativa' : 'Versao inativa'}
                        </Badge>
                    ) : null}
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato</p>
                    <p className="mt-2 text-lg font-semibold text-navy">{batch.sourceType.toUpperCase()}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Aba lida</p>
                    <p className="mt-2 text-lg font-semibold text-navy">{sourceSheetName || '-'}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Linhas validas</p>
                    <p className="mt-2 text-lg font-semibold text-emerald-700">{batch.validRows}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Linhas invalidas</p>
                    <p className="mt-2 text-lg font-semibold text-amber-700">{batch.invalidRows}</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Importado por</p>
                    <p className="mt-2 text-lg font-semibold text-navy">{batch.importedByName || 'Usuario removido'}</p>
                </div>
            </div>

            {batch.errorSummary?.message ? (
                <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <p className="font-medium">Motivo registrado para o lote</p>
                    <p className="mt-1">{String(batch.errorSummary.message)}</p>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3">Linha</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Normalizado</th>
                                <th className="px-4 py-3">Mensagens</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batch.items.map((item) => (
                                <tr key={item.id} className="border-t align-top">
                                    <td className="px-4 py-3 text-navy">{item.rowNumber}</td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={
                                                item.validationStatus === 'valid'
                                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                    : 'border-rose-300 bg-rose-50 text-rose-700'
                                            }
                                        >
                                            {item.validationStatus === 'valid' ? 'Valida' : 'Invalida'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        <pre className="whitespace-pre-wrap break-words">
                                            {JSON.stringify(item.normalizedPayload, null, 2)}
                                        </pre>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
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
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
