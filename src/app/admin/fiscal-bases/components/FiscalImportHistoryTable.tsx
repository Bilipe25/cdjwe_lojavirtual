'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Eye, FileClock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    cancelFiscalImportBatchAction,
    type FiscalImportBatchListItem,
} from '@/app/admin/actions/fiscal-bases'
import { FISCAL_BASE_LABELS, FISCAL_BASE_TYPES } from '@/lib/fiscal/constants'

interface FiscalImportHistoryTableProps {
    batches: FiscalImportBatchListItem[]
}

function formatStatus(status: FiscalImportBatchListItem['status']) {
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

function statusClassName(status: FiscalImportBatchListItem['status']) {
    switch (status) {
        case 'imported':
            return 'border-emerald-300 bg-emerald-50 text-emerald-700'
        case 'failed':
            return 'border-rose-300 bg-rose-50 text-rose-700'
        case 'draft':
            return 'border-amber-300 bg-amber-50 text-amber-700'
        case 'cancelled':
            return 'border-slate-300 bg-slate-100 text-slate-700'
    }
}

export function FiscalImportHistoryTable({ batches }: FiscalImportHistoryTableProps) {
    const [tableTypeFilter, setTableTypeFilter] = useState<'all' | (typeof FISCAL_BASE_TYPES)[number]>('all')
    const [statusFilter, setStatusFilter] = useState<'all' | FiscalImportBatchListItem['status']>('all')
    const [showDrafts, setShowDrafts] = useState(false)
    const [cancellingId, setCancellingId] = useState<string | null>(null)

    const filteredBatches = useMemo(() => {
        return batches.filter((batch) => {
            if (!showDrafts && batch.status === 'draft') return false
            if (tableTypeFilter !== 'all' && batch.tableType !== tableTypeFilter) return false
            if (statusFilter !== 'all' && batch.status !== statusFilter) return false
            return true
        })
    }, [batches, showDrafts, statusFilter, tableTypeFilter])

    const draftCount = batches.filter((batch) => batch.status === 'draft').length

    const handleCancelDraft = async (batchId: string) => {
        const confirmed = window.confirm(
            'Cancelar este lote em rascunho? O preview continuara disponivel so no historico, sem poder ser confirmado.'
        )
        if (!confirmed) return

        setCancellingId(batchId)
        const result = await cancelFiscalImportBatchAction(batchId)
        if (!result.success) {
            toast.error(result.error || 'Nao foi possivel cancelar o lote em rascunho.')
            setCancellingId(null)
            return
        }

        toast.success('Lote em rascunho cancelado com sucesso.')
        window.location.reload()
    }

    if (batches.length === 0) {
        return (
            <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
                <FileClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhuma importacao fiscal registrada ainda.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={tableTypeFilter === 'all' ? 'default' : 'outline'}
                            onClick={() => setTableTypeFilter('all')}
                        >
                            Todas as bases
                        </Button>
                        {FISCAL_BASE_TYPES.map((type) => (
                            <Button
                                key={type}
                                type="button"
                                size="sm"
                                variant={tableTypeFilter === type ? 'default' : 'outline'}
                                onClick={() => setTableTypeFilter(type)}
                            >
                                {FISCAL_BASE_LABELS[type]}
                            </Button>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(['all', 'imported', 'failed', 'cancelled', 'draft'] as const).map((status) => (
                            <Button
                                key={status}
                                type="button"
                                size="sm"
                                variant={statusFilter === status ? 'default' : 'outline'}
                                onClick={() => setStatusFilter(status)}
                            >
                                {status === 'all' ? 'Todos os status' : formatStatus(status)}
                            </Button>
                        ))}
                        <Button
                            type="button"
                            size="sm"
                            variant={showDrafts ? 'default' : 'outline'}
                            onClick={() => setShowDrafts((current) => !current)}
                        >
                            {showDrafts ? 'Ocultar rascunhos' : `Mostrar rascunhos (${draftCount})`}
                        </Button>
                    </div>
                </div>
            </div>

            {filteredBatches.length === 0 ? (
                <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground shadow-sm">
                    Nenhum lote corresponde aos filtros atuais.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3">Base</th>
                                    <th className="px-4 py-3">Arquivo</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Versao</th>
                                    <th className="px-4 py-3">Importado por</th>
                                    <th className="px-4 py-3">Linhas</th>
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3 text-right">Acoes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBatches.map((batch) => (
                                    <tr key={batch.id} className="border-t align-top">
                                        <td className="px-4 py-3 font-medium text-navy">
                                            {FISCAL_BASE_LABELS[batch.tableType]}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                <p className="font-medium text-slate-700">
                                                    {batch.sourceFileName || 'Importacao manual'}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant="outline" className="bg-white text-slate-700">
                                                        {batch.sourceType.toUpperCase()}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className={statusClassName(batch.status)}>
                                                {formatStatus(batch.status)}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                <p className="text-slate-700">{batch.versionLabel || '-'}</p>
                                                {batch.versionLabel ? (
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            batch.activeVersion
                                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                                : 'bg-white text-slate-700'
                                                        }
                                                    >
                                                        {batch.activeVersion ? 'Versao ativa' : 'Versao inativa'}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Sem versao criada</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {batch.importedByName || 'Usuario removido'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            <span className="font-medium text-emerald-700">{batch.validRows}</span> validas
                                            <span className="mx-1">/</span>
                                            <span className="font-medium text-amber-700">{batch.invalidRows}</span> invalidas
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            {new Date(batch.startedAt).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/admin/fiscal-bases/imports/${batch.id}`}>
                                                        <Eye className="mr-1.5 h-4 w-4" />
                                                        Detalhes
                                                    </Link>
                                                </Button>
                                                {batch.status === 'draft' ? (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void handleCancelDraft(batch.id)}
                                                        disabled={cancellingId === batch.id}
                                                    >
                                                        <Trash2 className="mr-1.5 h-4 w-4" />
                                                        {cancellingId === batch.id ? 'Cancelando...' : 'Cancelar'}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
