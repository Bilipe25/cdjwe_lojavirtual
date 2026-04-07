'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, RefreshCw, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    activateFiscalReferenceVersionAction,
    listFiscalBaseEntriesAction,
    listFiscalReferenceVersionsAction,
    type FiscalBaseEntriesResult,
    type FiscalBaseEntryRecord,
    type FiscalReferenceVersionItem,
} from '@/app/admin/actions/fiscal-bases'
import { FiscalVersionBadge } from './FiscalVersionBadge'
import { FISCAL_BASE_LABELS, type FiscalBaseType } from '@/lib/fiscal/constants'

interface FiscalBaseTablePageProps {
    tableType: FiscalBaseType
    initialEntries: FiscalBaseEntryRecord[]
    initialVersion: FiscalReferenceVersionItem | null
    baseState: FiscalBaseEntriesResult['baseState']
    versions: FiscalReferenceVersionItem[]
}

type VersionFilter = 'all' | 'active' | 'inactive'

function getDetailLabel(entry: FiscalBaseEntryRecord) {
    if (entry.fullDescription) return entry.fullDescription
    if (entry.segment) return entry.segment
    if (entry.exTipi) return `EX TIPI ${entry.exTipi}`
    if (typeof entry.ipiRate === 'number') return `IPI ${entry.ipiRate.toFixed(2)}%`
    if (entry.operationDirection) return `Direção ${entry.operationDirection}`
    if (entry.ncmCodes && entry.ncmCodes.length > 0) return `${entry.ncmCodes.length} NCM(s) vinculados`
    return '-'
}

export function FiscalBaseTablePage({
    tableType,
    initialEntries,
    initialVersion,
    baseState: initialBaseState,
    versions,
}: FiscalBaseTablePageProps) {
    const [entries, setEntries] = useState(initialEntries)
    const [versionList, setVersionList] = useState(versions)
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(initialVersion?.id || null)
    const [baseState, setBaseState] = useState<FiscalBaseEntriesResult['baseState']>(initialBaseState)
    const [versionFilter, setVersionFilter] = useState<VersionFilter>('all')
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)

    const filteredVersions = useMemo(() => {
        if (versionFilter === 'all') return versionList
        if (versionFilter === 'active') return versionList.filter((version) => version.isActive)
        return versionList.filter((version) => !version.isActive)
    }, [versionFilter, versionList])

    const selectedVersion = useMemo(
        () => versionList.find((version) => version.id === selectedVersionId) || initialVersion || null,
        [initialVersion, selectedVersionId, versionList]
    )

    const activeVersion = useMemo(
        () => versionList.find((version) => version.isActive) || null,
        [versionList]
    )

    const refresh = async (versionId = selectedVersionId, query = search) => {
        setLoading(true)
        const [entriesResult, versionsResult] = await Promise.all([
            listFiscalBaseEntriesAction({
                tableType,
                versionId,
                search: query,
                limit: 150,
            }),
            listFiscalReferenceVersionsAction(tableType),
        ])

        if (!entriesResult.success || !entriesResult.data) {
            toast.error(entriesResult.error || 'Falha ao carregar a base fiscal.')
            setLoading(false)
            return
        }

        setEntries(entriesResult.data.entries)
        setSelectedVersionId(entriesResult.data.version?.id || null)
        setBaseState(entriesResult.data.baseState)

        if (versionsResult.success && versionsResult.data) {
            setVersionList(versionsResult.data)
        }
        setLoading(false)
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refresh(selectedVersionId, search)
        }, 250)

        return () => window.clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    const handleActivate = async () => {
        if (!selectedVersion) return
        const confirmed = window.confirm(
            `Ativar a versão ${selectedVersion.versionLabel}? A versão ativa atual desta base será substituída.`
        )
        if (!confirmed) return

        const result = await activateFiscalReferenceVersionAction(selectedVersion.id)
        if (!result.success) {
            toast.error(result.error || 'Falha ao ativar a versão fiscal.')
            return
        }
        toast.success('Versão fiscal ativada com sucesso.')
        await refresh(selectedVersion.id, search)
    }

    const hasVersions = versionList.length > 0

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Base Fiscal: {FISCAL_BASE_LABELS[tableType]}
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        Consulte registros versionados, acompanhe a vigência operacional da base e mantenha a trilha
                        fiscal auditável.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void refresh()}>
                        <RefreshCw className="mr-1.5 h-4 w-4" />
                        Atualizar
                    </Button>
                    <Button asChild className="gradient-navy border-0 text-white">
                        <Link href={`/admin/fiscal-bases/imports/new?type=${tableType}`}>
                            <Upload className="mr-1.5 h-4 w-4" />
                            Nova importação
                        </Link>
                    </Button>
                </div>
            </div>

            {!hasVersions ? (
                <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
                    <Database className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                    <h2 className="text-base font-semibold text-navy">Nenhuma versão importada ainda</h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                        Esta base ainda não possui registros disponíveis. Importe um CSV para gerar a primeira versão e,
                        depois, ative-a quando a revisão estiver concluída.
                    </p>
                    <Button asChild className="mt-5 gradient-navy border-0 text-white">
                        <Link href={`/admin/fiscal-bases/imports/new?type=${tableType}`}>
                            <Upload className="mr-1.5 h-4 w-4" />
                            Importar primeira versão
                        </Link>
                    </Button>
                </div>
            ) : (
                <div className="grid gap-4 xl:grid-cols-[1.4fr_2fr]">
                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-navy">Versões disponíveis</h2>
                            {selectedVersion ? <FiscalVersionBadge version={selectedVersion} compact /> : null}
                        </div>

                        <div className="mb-3 flex flex-wrap gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={versionFilter === 'all' ? 'default' : 'outline'}
                                onClick={() => setVersionFilter('all')}
                            >
                                Todas
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={versionFilter === 'active' ? 'default' : 'outline'}
                                onClick={() => setVersionFilter('active')}
                            >
                                Ativas
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={versionFilter === 'inactive' ? 'default' : 'outline'}
                                onClick={() => setVersionFilter('inactive')}
                            >
                                Inativas
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {filteredVersions.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                    Nenhuma versão corresponde ao filtro selecionado.
                                </div>
                            ) : (
                                filteredVersions.map((version) => {
                                    const isSelected = version.id === selectedVersionId
                                    return (
                                        <button
                                            key={version.id}
                                            type="button"
                                            onClick={() => void refresh(version.id, search)}
                                            className={`w-full rounded-xl border p-3 text-left transition-all ${
                                                isSelected ? 'border-navy bg-navy/5' : 'border-slate-200 bg-white'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-navy">
                                                        {version.versionLabel}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Importada em{' '}
                                                        {new Date(version.importedAt).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                                <FiscalVersionBadge version={version} compact />
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                <Badge variant="outline" className="bg-white">
                                                    {version.rowCount.toLocaleString('pt-BR')} registros
                                                </Badge>
                                                {version.validFrom ? (
                                                    <Badge variant="outline" className="bg-white">
                                                        Vigência em{' '}
                                                        {new Date(version.validFrom).toLocaleDateString('pt-BR')}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </button>
                                    )
                                })
                            )}
                        </div>

                        {selectedVersion && !selectedVersion.isActive ? (
                            <Button className="mt-4 w-full" variant="outline" onClick={() => void handleActivate()}>
                                Ativar esta versão
                            </Button>
                        ) : null}
                    </div>

                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="mb-4 space-y-3">
                            {baseState === 'inactive_only' ? (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div>
                                            <p className="font-medium">Sem versão ativa no momento</p>
                                            <p className="text-xs text-amber-700">
                                                Você está consultando a versão importada mais recente. Revise e ative a
                                                versão desejada para torná-la operacional.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-navy">Registros da versão selecionada</h2>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedVersion
                                            ? `${selectedVersion.versionLabel} - ${entries.length.toLocaleString(
                                                  'pt-BR'
                                              )} itens exibidos`
                                            : 'Sem versão selecionada'}
                                    </p>
                                    {activeVersion && selectedVersion && activeVersion.id !== selectedVersion.id ? (
                                        <p className="mt-1 text-xs text-amber-700">
                                            Versão ativa atual: {activeVersion.versionLabel}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="relative w-full md:max-w-sm">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Buscar por código ou descrição"
                                        className="pl-9"
                                        disabled={!selectedVersion}
                                    />
                                </div>
                            </div>
                        </div>

                        {!selectedVersion ? (
                            <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                                Nenhuma versão disponível para consulta nesta base fiscal.
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-xl border">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                            <tr>
                                                <th className="px-3 py-2">Código</th>
                                                <th className="px-3 py-2">Descrição</th>
                                                <th className="px-3 py-2">Detalhe</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {entries.map((entry) => (
                                                <tr key={entry.id} className="border-t align-top">
                                                    <td className="px-3 py-2 font-medium text-navy">{entry.code}</td>
                                                    <td className="px-3 py-2">{entry.description}</td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                                        {getDetailLabel(entry)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {entries.length === 0 ? (
                                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                                        {loading
                                            ? 'Carregando registros...'
                                            : 'Nenhum registro encontrado para os filtros atuais.'}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
