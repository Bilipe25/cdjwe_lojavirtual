'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Database,
    Layers3,
    RefreshCw,
    Search,
    Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    activateFiscalReferenceVersionAction,
    listFiscalBaseEntriesAction,
    listFiscalReferenceVersionsAction,
    type FiscalBaseEntriesResult,
    type FiscalBaseEntryRecord,
    type FiscalTipiExFilter,
    type FiscalTipiRateMode,
    type FiscalTipiSortBy,
    type FiscalReferenceVersionItem,
} from '@/app/admin/actions/fiscal-bases'
import { FiscalVersionBadge } from './FiscalVersionBadge'

interface FiscalTipiTablePageProps {
    initialResult: FiscalBaseEntriesResult
    initialVersions: FiscalReferenceVersionItem[]
}

type VersionFilter = 'all' | 'active' | 'inactive'
type SortOrder = 'asc' | 'desc'

interface TipiQueryState {
    versionId: string | null
    search: string
    includeStructuralRows: boolean
    page: number
    pageSize: number
    sortBy: FiscalTipiSortBy
    sortOrder: SortOrder
    filterRateMode: FiscalTipiRateMode
    filterExTipi: FiscalTipiExFilter
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]

function formatDate(value?: string | null) {
    if (!value) return 'Não informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('pt-BR')
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Não informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString('pt-BR')
}

function formatDateRange(validFrom?: string | null, validTo?: string | null) {
    if (!validFrom && !validTo) return 'Vigência não informada'
    return `${formatDate(validFrom)} até ${formatDate(validTo)}`
}

function formatIpiRate(value?: number | null) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'Não informado'
    return `${value.toLocaleString('pt-BR', {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
    })}%`
}

function getTipiRateLabel(entry: FiscalBaseEntryRecord) {
    if (!entry.metadata || typeof entry.metadata.ipi_rate_label !== 'string') return null
    const normalized = entry.metadata.ipi_rate_label.trim()
    return normalized.length > 0 ? normalized : null
}

function isNtEntry(entry: FiscalBaseEntryRecord) {
    return getTipiRateLabel(entry)?.toUpperCase() === 'NT'
}

function hasExTipi(entry: FiscalBaseEntryRecord) {
    return Boolean(entry.exTipi && entry.exTipi.trim().length > 0)
}

function getSortLabel(sortBy: FiscalTipiSortBy) {
    switch (sortBy) {
        case 'ncm_code':
            return 'Código TIPI'
        case 'description':
            return 'Descrição'
        case 'ipi_rate':
            return 'Alíquota'
        case 'ex_tipi':
            return 'EX TIPI'
        case 'source_ncm_code':
            return 'Código origem'
        default:
            return 'Código TIPI'
    }
}

function getRangeLabel(page: number, pageSize: number, totalCount: number) {
    if (totalCount === 0) return 'Nenhum registro'
    const from = (page - 1) * pageSize + 1
    const to = Math.min(totalCount, from + pageSize - 1)
    return `${from}-${to} de ${totalCount.toLocaleString('pt-BR')}`
}

function isRowStale(selectedVersion: FiscalReferenceVersionItem | null, activeVersion: FiscalReferenceVersionItem | null) {
    if (!selectedVersion || !activeVersion) return false
    return selectedVersion.id !== activeVersion.id
}

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
    if (!active) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
    return order === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-navy" /> : <ArrowDown className="h-3.5 w-3.5 text-navy" />
}

function ToolbarMetric({
    label,
    value,
    helper,
}: {
    label: string
    value: string
    helper?: string
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
            {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
        </div>
    )
}

function TipiGridSkeleton() {
    return (
        <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[120px_120px_1.8fr_90px_120px_150px_130px] gap-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                </div>
            ))}
        </div>
    )
}

function MarkerCell({ entry }: { entry: FiscalBaseEntryRecord }) {
    const nt = isNtEntry(entry)
    const ex = hasExTipi(entry)
    const taxed = !nt && entry.rowType === 'final'

    return (
        <div className="flex flex-wrap gap-1.5">
            {nt ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                    NT
                </Badge>
            ) : null}
            {taxed ? (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                    Tributada
                </Badge>
            ) : null}
            {ex ? (
                <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                    EX TIPI
                </Badge>
            ) : null}
            {entry.rowType === 'structural' ? (
                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                    Hierarquia
                </Badge>
            ) : null}
        </div>
    )
}

export function FiscalTipiTablePage({ initialResult, initialVersions }: FiscalTipiTablePageProps) {
    const [result, setResult] = useState(initialResult)
    const [versions, setVersions] = useState(initialVersions)
    const [versionFilter, setVersionFilter] = useState<VersionFilter>('all')
    const [selectedEntry, setSelectedEntry] = useState<FiscalBaseEntryRecord | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [loadingGrid, setLoadingGrid] = useState(false)
    const [refreshingVersions, setRefreshingVersions] = useState(false)
    const [searchInput, setSearchInput] = useState('')
    const requestIdRef = useRef(0)
    const queryRef = useRef<TipiQueryState>({
        versionId: initialResult.version?.id || null,
        search: '',
        includeStructuralRows: initialResult.includeStructuralRows === true,
        page: initialResult.page || 1,
        pageSize: initialResult.pageSize || 50,
        sortBy: (initialResult.sortBy as FiscalTipiSortBy) || 'ncm_code',
        sortOrder: initialResult.sortOrder === 'desc' ? 'desc' : 'asc',
        filterRateMode: 'all',
        filterExTipi: 'all',
    })

    const selectedVersion = useMemo(
        () => versions.find((item) => item.id === queryRef.current.versionId) || result.version || null,
        [result.version, versions]
    )
    const activeVersion = useMemo(() => versions.find((item) => item.isActive) || null, [versions])

    const filteredVersions = useMemo(() => {
        if (versionFilter === 'all') return versions
        if (versionFilter === 'active') return versions.filter((item) => item.isActive)
        return versions.filter((item) => !item.isActive)
    }, [versionFilter, versions])

    const currentQuery = queryRef.current
    const staleSelection = isRowStale(selectedVersion, activeVersion)

    const refreshVersions = async () => {
        setRefreshingVersions(true)
        const response = await listFiscalReferenceVersionsAction('tipi')
        if (!response.success || !response.data) {
            toast.error(response.error || 'Não foi possível atualizar as versões da base TIPI.')
            setRefreshingVersions(false)
            return
        }
        setVersions(response.data)
        setRefreshingVersions(false)
    }

    const loadEntries = async (overrides: Partial<TipiQueryState> = {}) => {
        const nextQuery: TipiQueryState = {
            ...queryRef.current,
            ...overrides,
        }

        queryRef.current = nextQuery
        const requestId = ++requestIdRef.current
        setLoadingGrid(true)

        const response = await listFiscalBaseEntriesAction({
            tableType: 'tipi',
            versionId: nextQuery.versionId,
            search: nextQuery.search,
            page: nextQuery.page,
            pageSize: nextQuery.pageSize,
            sortBy: nextQuery.sortBy,
            sortOrder: nextQuery.sortOrder,
            includeStructuralRows: nextQuery.includeStructuralRows,
            filterRateMode: nextQuery.filterRateMode,
            filterExTipi: nextQuery.filterExTipi,
        })

        if (requestId !== requestIdRef.current) return

        if (!response.success || !response.data) {
            toast.error(response.error || 'Não foi possível carregar a base TIPI.')
            setLoadingGrid(false)
            return
        }

        setResult(response.data)
        setLoadingGrid(false)

        if (selectedEntry) {
            const updatedSelection = response.data.items.find((item) => item.id === selectedEntry.id) || null
            setSelectedEntry(updatedSelection)
            setDetailOpen(Boolean(updatedSelection))
        }
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const normalized = searchInput.trim()
            if (normalized === queryRef.current.search) return
            void loadEntries({ search: normalized, page: 1 })
        }, 300)

        return () => window.clearTimeout(timer)
    }, [searchInput])

    const handleSort = (field: FiscalTipiSortBy) => {
        const nextOrder: SortOrder =
            queryRef.current.sortBy === field && queryRef.current.sortOrder === 'asc' ? 'desc' : 'asc'
        void loadEntries({
            sortBy: field,
            sortOrder: nextOrder,
            page: 1,
        })
    }

    const handleActivateVersion = async () => {
        if (!selectedVersion || selectedVersion.isActive) return

        const confirmed = window.confirm(
            `Ativar a versão ${selectedVersion.versionLabel}? A versão ativa atual será substituída.`
        )
        if (!confirmed) return

        const response = await activateFiscalReferenceVersionAction(selectedVersion.id)
        if (!response.success) {
            toast.error(response.error || 'Não foi possível ativar a versão selecionada.')
            return
        }

        toast.success('Versão da base TIPI ativada com sucesso.')
        await Promise.all([refreshVersions(), loadEntries()])
    }

    const openDetail = (entry: FiscalBaseEntryRecord) => {
        setSelectedEntry(entry)
        setDetailOpen(true)
    }

    const showNoVersions = versions.length === 0
    const showNoResults = !loadingGrid && result.items.length === 0
    const selectedVersionLabel = selectedVersion ? selectedVersion.versionLabel : 'Sem versão'

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                            Governança TIPI
                        </Badge>
                        {selectedVersion ? <FiscalVersionBadge version={selectedVersion} stale={staleSelection} compact /> : null}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-heading text-gradient-navy">Base TIPI / IPI</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Consulte a TIPI versionada com leitura operacional de IPI, rastreabilidade da origem oficial e filtros úteis para revisão fiscal.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            void Promise.all([refreshVersions(), loadEntries()])
                        }}
                        disabled={loadingGrid || refreshingVersions}
                    >
                        <RefreshCw className={`mr-1.5 h-4 w-4 ${loadingGrid || refreshingVersions ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button asChild className="gradient-navy border-0 text-white">
                        <Link href="/admin/fiscal-bases/imports/new?type=tipi">
                            <Upload className="mr-1.5 h-4 w-4" />
                            Nova importação
                        </Link>
                    </Button>
                    {selectedVersion && !selectedVersion.isActive ? (
                        <Button type="button" variant="outline" onClick={() => void handleActivateVersion()}>
                            Ativar versão
                        </Button>
                    ) : null}
                </div>
            </div>

            {showNoVersions ? (
                <div className="rounded-3xl border border-dashed bg-white p-10 text-center shadow-sm">
                    <Database className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                    <h2 className="text-lg font-semibold text-navy">Nenhuma versão TIPI importada ainda</h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
                        Importe a primeira versão da TIPI para habilitar consulta operacional de IPI, leitura de EX TIPI e uso inteligente nos perfis tributários.
                    </p>
                    <Button asChild className="mt-6 gradient-navy border-0 text-white">
                        <Link href="/admin/fiscal-bases/imports/new?type=tipi">
                            <Upload className="mr-1.5 h-4 w-4" />
                            Importar primeira versão
                        </Link>
                    </Button>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                        <ToolbarMetric
                            label="Versão selecionada"
                            value={selectedVersionLabel}
                            helper={selectedVersion ? `${selectedVersion.rowCount.toLocaleString('pt-BR')} linhas persistidas` : 'Nenhuma versão selecionada'}
                        />
                        <ToolbarMetric
                            label="Versão ativa atual"
                            value={activeVersion?.versionLabel || 'Sem ativa'}
                            helper={activeVersion ? `Importada em ${formatDate(activeVersion.importedAt)}` : 'Ative uma versão para operação'}
                        />
                        <ToolbarMetric
                            label="TIPIs finais"
                            value={result.finalRowCount.toLocaleString('pt-BR')}
                            helper="Usáveis em parametrização fiscal"
                        />
                        <ToolbarMetric
                            label="Linhas estruturais"
                            value={result.structuralRowCount.toLocaleString('pt-BR')}
                            helper="Consulta hierárquica da tabela oficial"
                        />
                        <ToolbarMetric
                            label="Marcadas como NT"
                            value={Number(result.ntRowCount || 0).toLocaleString('pt-BR')}
                            helper="Não tributadas na TIPI"
                        />
                        <ToolbarMetric
                            label="Com EX TIPI"
                            value={Number(result.exTipiRowCount || 0).toLocaleString('pt-BR')}
                            helper="Registros com detalhamento EX"
                        />
                    </div>

                    <div className="rounded-3xl border bg-white shadow-sm">
                        <div className="sticky top-0 z-10 rounded-t-3xl border-b bg-white/95 px-5 py-4 backdrop-blur">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                                {selectedVersion ? (selectedVersion.isActive ? 'Versão ativa' : 'Versão inativa') : 'Sem versão'}
                                            </Badge>
                                            {staleSelection ? (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                    Há uma versão ativa mais recente
                                                </Badge>
                                            ) : null}
                                            {result.includeStructuralRows ? (
                                                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                                                    Linhas estruturais visíveis
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterRateMode === 'nt_only' ? (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                    Filtro: somente NT
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterRateMode === 'taxed_only' ? (
                                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                                                    Filtro: alíquota maior que zero
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterExTipi === 'with_ex' ? (
                                                <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                                                    Filtro: com EX TIPI
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterExTipi === 'without_ex' ? (
                                                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                                                    Filtro: sem EX TIPI
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <h2 className="text-lg font-semibold text-navy">Consulta operacional da versão</h2>
                                        <p className="text-sm text-slate-600">
                                            {selectedVersion
                                                ? `${selectedVersion.versionLabel} · importada em ${formatDateTime(selectedVersion.importedAt)} · ${formatDateRange(selectedVersion.validFrom, selectedVersion.validTo)}`
                                                : 'Selecione uma versão para revisar a base.'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                        <p className="font-medium text-slate-800">Escopo atual</p>
                                        <p className="mt-1">
                                            {getRangeLabel(result.page, result.pageSize, result.totalCount)} · ordenado por {getSortLabel(currentQuery.sortBy)} ({currentQuery.sortOrder === 'asc' ? 'crescente' : 'decrescente'})
                                        </p>
                                    </div>
                                </div>

                                <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.2fr)_190px_230px_140px_190px_190px_auto]">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            value={searchInput}
                                            onChange={(event) => setSearchInput(event.target.value)}
                                            placeholder="Buscar por código, origem, descrição ou EX TIPI"
                                            className="h-11 rounded-2xl border-slate-200 pl-9"
                                        />
                                    </div>

                                    <Select
                                        value={versionFilter}
                                        onValueChange={(value) => setVersionFilter((value as VersionFilter) || 'all')}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Status das versões" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas as versões</SelectItem>
                                            <SelectItem value="active">Somente ativas</SelectItem>
                                            <SelectItem value="inactive">Somente inativas</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={currentQuery.versionId || ''}
                                        onValueChange={(value) => {
                                            if (!value) return
                                            void loadEntries({ versionId: value, page: 1 })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Selecione uma versão" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filteredVersions.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-slate-500">Nenhuma versão nesse recorte</div>
                                            ) : (
                                                filteredVersions.map((version) => (
                                                    <SelectItem key={version.id} value={version.id}>
                                                        {version.versionLabel} {version.isActive ? '· ativa' : '· inativa'}
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={String(currentQuery.pageSize)}
                                        onValueChange={(value) => {
                                            const nextPageSize = Number(value || 50)
                                            void loadEntries({
                                                pageSize: nextPageSize,
                                                page: 1,
                                            })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Itens por página" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PAGE_SIZE_OPTIONS.map((option) => (
                                                <SelectItem key={option} value={String(option)}>
                                                    {option} por página
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={currentQuery.filterRateMode}
                                        onValueChange={(value) => {
                                            const nextValue = (value as FiscalTipiRateMode) || 'all'
                                            void loadEntries({ filterRateMode: nextValue, page: 1 })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Regime de alíquota" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas as alíquotas</SelectItem>
                                            <SelectItem value="nt_only">Somente NT</SelectItem>
                                            <SelectItem value="taxed_only">Somente alíquota &gt; 0</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={currentQuery.filterExTipi}
                                        onValueChange={(value) => {
                                            const nextValue = (value as FiscalTipiExFilter) || 'all'
                                            void loadEntries({ filterExTipi: nextValue, page: 1 })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Filtro de EX TIPI" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os registros</SelectItem>
                                            <SelectItem value="with_ex">Somente com EX TIPI</SelectItem>
                                            <SelectItem value="without_ex">Somente sem EX TIPI</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <div className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <Switch
                                                checked={currentQuery.includeStructuralRows}
                                                onCheckedChange={(checked) => {
                                                    void loadEntries({
                                                        includeStructuralRows: Boolean(checked),
                                                        page: 1,
                                                    })
                                                }}
                                            />
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">Mostrar linhas estruturais</p>
                                                <p className="text-xs text-slate-500">Ative para navegar a hierarquia oficial da TIPI</p>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right">
                                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Escopo</p>
                                            <p className="text-lg font-semibold text-navy">{result.totalCount.toLocaleString('pt-BR')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {result.baseState === 'inactive_only' ? (
                            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>
                                        <p className="font-medium">Você está consultando uma versão inativa</p>
                                        <p className="mt-1 text-xs text-amber-700">
                                            Revise a base selecionada e ative a versão desejada quando a validação fiscal estiver concluída.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="overflow-hidden">
                            {loadingGrid ? (
                                <TipiGridSkeleton />
                            ) : showNoResults ? (
                                <div className="px-6 py-16 text-center">
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                                        <Search className="h-6 w-6 text-slate-400" />
                                    </div>
                                    <h3 className="mt-5 text-lg font-semibold text-navy">Nenhum registro TIPI encontrado</h3>
                                    <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
                                        Revise os filtros aplicados, altere a versão consultada ou reative a visualização das linhas estruturais para ampliar o escopo.
                                    </p>
                                    <div className="mt-6 flex justify-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setSearchInput('')
                                                void loadEntries({
                                                    search: '',
                                                    page: 1,
                                                    includeStructuralRows: false,
                                                    filterRateMode: 'all',
                                                    filterExTipi: 'all',
                                                })
                                            }}
                                        >
                                            Limpar filtros
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="max-h-[62vh] overflow-auto">
                                        <Table>
                                            <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                                                <TableRow className="hover:bg-slate-50/95">
                                                    {[
                                                        { key: 'ncm_code', label: 'Código' },
                                                        { key: 'source_ncm_code', label: 'Código origem' },
                                                        { key: 'description', label: 'Descrição' },
                                                        { key: 'ex_tipi', label: 'EX' },
                                                        { key: 'ipi_rate', label: 'Alíquota' },
                                                        { key: 'marker', label: 'Marcador', sortable: false },
                                                        { key: 'rowType', label: 'Tipo da linha', sortable: false },
                                                    ].map((column) => {
                                                        const sortable = column.sortable !== false
                                                        const field = column.key as FiscalTipiSortBy
                                                        const isActiveSort = sortable && currentQuery.sortBy === field
                                                        return (
                                                            <TableHead key={column.key} className="bg-slate-50/95">
                                                                {sortable ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSort(field)}
                                                                        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 transition-colors hover:text-navy"
                                                                    >
                                                                        {column.label}
                                                                        <SortIcon active={isActiveSort} order={currentQuery.sortOrder} />
                                                                    </button>
                                                                ) : (
                                                                    <span className="font-semibold text-slate-700">{column.label}</span>
                                                                )}
                                                            </TableHead>
                                                        )
                                                    })}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {result.items.map((entry) => (
                                                    <TableRow
                                                        key={entry.id}
                                                        className={`cursor-pointer ${entry.rowType === 'structural' ? 'bg-sky-50/35 hover:bg-sky-50' : 'hover:bg-slate-50'}`}
                                                        onClick={() => openDetail(entry)}
                                                    >
                                                        <TableCell className="font-semibold text-navy">{entry.code}</TableCell>
                                                        <TableCell className="font-medium text-slate-600">{entry.sourceCode || '-'}</TableCell>
                                                        <TableCell className="max-w-[420px] whitespace-normal">
                                                            <div className="space-y-1">
                                                                <p className="font-medium text-slate-900">{entry.description}</p>
                                                                {entry.sourceCode && entry.sourceCode !== entry.code ? (
                                                                    <p className="text-xs text-slate-500">Origem oficial: {entry.sourceCode}</p>
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{entry.exTipi || '-'}</TableCell>
                                                        <TableCell>
                                                            {isNtEntry(entry) ? (
                                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                                    NT
                                                                </Badge>
                                                            ) : (
                                                                <span className="font-medium text-slate-700">{formatIpiRate(entry.ipiRate)}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <MarkerCell entry={entry} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    entry.rowType === 'structural'
                                                                        ? 'border-sky-300 bg-sky-50 text-sky-700'
                                                                        : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                                }
                                                            >
                                                                {entry.rowType === 'structural' ? 'Estrutural' : 'Final'}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <div className="flex flex-col gap-3 border-t px-5 py-4 md:flex-row md:items-center md:justify-between">
                                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                            <Layers3 className="h-4 w-4 text-slate-400" />
                                            <span>{getRangeLabel(result.page, result.pageSize, result.totalCount)}</span>
                                            <span className="text-slate-300">•</span>
                                            <span>{result.finalRowCount.toLocaleString('pt-BR')} finais</span>
                                            <span className="text-slate-300">•</span>
                                            <span>{result.structuralRowCount.toLocaleString('pt-BR')} estruturais</span>
                                            <span className="text-slate-300">•</span>
                                            <span>{Number(result.ntRowCount || 0).toLocaleString('pt-BR')} NT</span>
                                            <span className="text-slate-300">•</span>
                                            <span>{Number(result.exTipiRowCount || 0).toLocaleString('pt-BR')} com EX</span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={result.page <= 1 || loadingGrid}
                                                onClick={() => void loadEntries({ page: result.page - 1 })}
                                            >
                                                Página anterior
                                            </Button>
                                            <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                                Página {result.page} de {Math.max(result.totalPages, 1)}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={result.totalPages === 0 || result.page >= result.totalPages || loadingGrid}
                                                onClick={() => void loadEntries({ page: result.page + 1 })}
                                            >
                                                Próxima página
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
                <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
                    {selectedEntry ? (
                        <>
                            <SheetHeader className="border-b bg-white px-6 py-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                        {selectedEntry.code}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={
                                            selectedEntry.rowType === 'structural'
                                                ? 'border-sky-300 bg-sky-50 text-sky-700'
                                                : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                        }
                                    >
                                        {selectedEntry.rowType === 'structural' ? 'Linha estrutural' : 'Registro final'}
                                    </Badge>
                                    {isNtEntry(selectedEntry) ? (
                                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                            NT
                                        </Badge>
                                    ) : null}
                                    {hasExTipi(selectedEntry) ? (
                                        <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                                            EX {selectedEntry.exTipi}
                                        </Badge>
                                    ) : null}
                                </div>
                                <SheetTitle className="mt-3 text-xl font-heading text-navy">
                                    {selectedEntry.description}
                                </SheetTitle>
                                <SheetDescription className="mt-1 text-sm text-slate-600">
                                    {selectedEntry.rowType === 'structural'
                                        ? 'Linha de navegação e classificação da tabela oficial. Ela apoia consulta e hierarquia, mas não deve ser usada diretamente como item final no perfil tributário.'
                                        : 'Registro final da TIPI pronto para consulta operacional de IPI, EX TIPI e integração com perfis tributários.'}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                                <section className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Versão consultada</p>
                                        <p className="mt-2 text-lg font-semibold text-navy">{selectedVersion?.versionLabel || selectedEntry.versionLabel}</p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {selectedVersion ? formatDateTime(selectedVersion.importedAt) : 'Importação não informada'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Arquivo de origem</p>
                                        <p className="mt-2 text-lg font-semibold text-navy">
                                            {selectedVersion?.sourceFileName || 'Não informado'}
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {selectedVersion ? `${selectedVersion.sourceType.toUpperCase()} · ${selectedVersion.isActive ? 'versão ativa' : 'versão inativa'}` : 'Sem rastreabilidade adicional'}
                                        </p>
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Identificação TIPI</h3>
                                    <dl className="mt-4 grid gap-4 md:grid-cols-2">
                                        <div>
                                            <dt className="text-xs font-medium text-slate-500">Código normalizado</dt>
                                            <dd className="mt-1 text-sm font-semibold text-navy">{selectedEntry.code}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs font-medium text-slate-500">Código oficial de origem</dt>
                                            <dd className="mt-1 text-sm text-slate-700">{selectedEntry.sourceCode || 'Igual ao código normalizado'}</dd>
                                        </div>
                                        <div className="md:col-span-2">
                                            <dt className="text-xs font-medium text-slate-500">Descrição</dt>
                                            <dd className="mt-1 text-sm text-slate-700">{selectedEntry.description}</dd>
                                        </div>
                                    </dl>
                                </section>

                                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Classificação IPI</h3>
                                    <dl className="mt-4 grid gap-4 md:grid-cols-2">
                                        <div>
                                            <dt className="text-xs font-medium text-slate-500">Tipo da linha</dt>
                                            <dd className="mt-1 text-sm text-slate-700">{selectedEntry.rowType === 'structural' ? 'Estrutural' : 'Final'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs font-medium text-slate-500">EX TIPI</dt>
                                            <dd className="mt-1 text-sm text-slate-700">{selectedEntry.exTipi || 'Não se aplica'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs font-medium text-slate-500">Alíquota IPI</dt>
                                            <dd className="mt-1 text-sm text-slate-700">
                                                {isNtEntry(selectedEntry) ? 'NT' : formatIpiRate(selectedEntry.ipiRate)}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs font-medium text-slate-500">Marcador fiscal</dt>
                                            <dd className="mt-1 text-sm text-slate-700">{getTipiRateLabel(selectedEntry) || 'Sem marcador específico'}</dd>
                                        </div>
                                    </dl>
                                </section>

                                {selectedEntry.rowType === 'structural' ? (
                                    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-900">
                                        <h3 className="text-sm font-semibold uppercase tracking-[0.16em]">Uso operacional</h3>
                                        <p className="mt-3 text-sm leading-6">
                                            Esta linha existe para navegação hierárquica e leitura da tabela oficial. Para vínculo direto com perfil tributário, utilize registros finais de 8 dígitos.
                                        </p>
                                    </section>
                                ) : null}

                                <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-slate-100">
                                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Metadados técnicos persistidos</h3>
                                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-200">
                                        {JSON.stringify(selectedEntry.metadata || {}, null, 2)}
                                    </pre>
                                </section>
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </div>
    )
}





