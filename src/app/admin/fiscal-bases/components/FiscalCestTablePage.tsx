'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Database,
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
    type FiscalCestLinkMode,
    type FiscalCestSegmentMode,
    type FiscalCestSortBy,
    type FiscalReferenceVersionItem,
} from '@/app/admin/actions/fiscal-bases'
import { FiscalVersionBadge } from './FiscalVersionBadge'

interface FiscalCestTablePageProps {
    initialResult: FiscalBaseEntriesResult
    initialVersions: FiscalReferenceVersionItem[]
}

type VersionFilter = 'all' | 'active' | 'inactive'
type SortOrder = 'asc' | 'desc'

interface CestQueryState {
    versionId: string | null
    search: string
    page: number
    pageSize: number
    sortBy: FiscalCestSortBy
    sortOrder: SortOrder
    filterLinkMode: FiscalCestLinkMode
    filterSegmentMode: FiscalCestSegmentMode
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]

function formatDate(value?: string | null) {
    if (!value) return 'Nao informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('pt-BR')
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Nao informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString('pt-BR')
}

function formatDateRange(validFrom?: string | null, validTo?: string | null) {
    if (!validFrom && !validTo) return 'Vigencia nao informada'
    return `${formatDate(validFrom)} ate ${formatDate(validTo)}`
}

function getRangeLabel(page: number, pageSize: number, totalCount: number) {
    if (totalCount === 0) return 'Nenhum registro'
    const from = (page - 1) * pageSize + 1
    const to = Math.min(totalCount, from + pageSize - 1)
    return `${from}-${to} de ${totalCount.toLocaleString('pt-BR')}`
}

function getSortLabel(sortBy: FiscalCestSortBy) {
    switch (sortBy) {
        case 'code':
            return 'Codigo CEST'
        case 'description':
            return 'Descricao'
        case 'segment':
            return 'Segmento'
        case 'linked_ncm_count':
            return 'Quantidade de NCMs vinculados'
        default:
            return 'Codigo CEST'
    }
}

function hasSegment(entry: FiscalBaseEntryRecord) {
    return Boolean(entry.segment && entry.segment.trim().length > 0)
}

function hasLinkedNcm(entry: FiscalBaseEntryRecord) {
    return Boolean(entry.ncmCodes && entry.ncmCodes.length > 0)
}

function getExactLinkCount(entry: FiscalBaseEntryRecord) {
    const value = entry.metadata?.exact_link_count
    return typeof value === 'number' ? value : 0
}

function getPrefixLinkCount(entry: FiscalBaseEntryRecord) {
    const value = entry.metadata?.prefix_link_count
    return typeof value === 'number' ? value : 0
}

function getLinkDetails(entry: FiscalBaseEntryRecord) {
    const value = entry.metadata?.ncm_link_details
    if (!Array.isArray(value)) return []
    return value
        .map((item) => {
            if (!item || typeof item !== 'object') return null
            const record = item as Record<string, unknown>
            return {
                ncmCode: String(record.ncm_code || ''),
                matchType: record.match_type === 'prefix' ? 'prefix' : 'exact',
                prefixLength: Number(record.prefix_length || 0),
            }
        })
        .filter((item): item is { ncmCode: string; matchType: 'exact' | 'prefix'; prefixLength: number } => Boolean(item?.ncmCode))
}

function getLinkModeLabel(entry: FiscalBaseEntryRecord) {
    const exact = getExactLinkCount(entry)
    const prefix = getPrefixLinkCount(entry)
    if (exact > 0 && prefix > 0) return 'Misto'
    if (exact > 0) return 'Exato'
    if (prefix > 0) return 'Abrangente por prefixo'
    return 'Sem vinculo'
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

function CestGridSkeleton() {
    return (
        <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[140px_1.9fr_180px_120px_1.6fr_180px] gap-3">
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
    const linked = hasLinkedNcm(entry)
    const segmented = hasSegment(entry)
    const exact = getExactLinkCount(entry)
    const prefix = getPrefixLinkCount(entry)

    return (
        <div className="flex flex-wrap gap-1.5">
            {linked ? (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                    Com NCM
                </Badge>
            ) : (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                    Sem vinculo NCM
                </Badge>
            )}
            {exact > 0 ? (
                <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-700">
                    {exact.toLocaleString('pt-BR')} exato(s)
                </Badge>
            ) : null}
            {prefix > 0 ? (
                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                    {prefix.toLocaleString('pt-BR')} abrangente(s)
                </Badge>
            ) : null}
            {segmented ? (
                <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                    Com segmento
                </Badge>
            ) : (
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                    Sem segmento
                </Badge>
            )}
        </div>
    )
}

function NcmPreviewCell({ entry }: { entry: FiscalBaseEntryRecord }) {
    const links = getLinkDetails(entry)
    const codes = entry.ncmCodes

    if (links.length > 0) {
        const visibleLinks = links.slice(0, 3)
        const remaining = links.length - visibleLinks.length

        return (
            <div className="space-y-1">
                {visibleLinks.map((link) => (
                    <div key={`${entry.id}-${link.ncmCode}-${link.matchType}`} className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{link.ncmCode}</span>
                        <Badge
                            variant="outline"
                            className={
                                link.matchType === 'exact'
                                    ? 'border-cyan-300 bg-cyan-50 px-2 py-0 text-[10px] text-cyan-700'
                                    : 'border-sky-300 bg-sky-50 px-2 py-0 text-[10px] text-sky-700'
                            }
                        >
                            {link.matchType === 'exact' ? 'Exato' : 'Prefixo'}
                        </Badge>
                    </div>
                ))}
                {remaining > 0 ? (
                    <p className="text-xs text-slate-500">+{remaining.toLocaleString('pt-BR')} vinculo(s)</p>
                ) : null}
            </div>
        )
    }

    if (!codes || codes.length === 0) {
        return <span className="text-sm text-slate-400">Sem vinculo</span>
    }

    const visibleCodes = codes.slice(0, 3)
    const remaining = codes.length - visibleCodes.length

    return (
        <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">{visibleCodes.join(', ')}</p>
            {remaining > 0 ? (
                <p className="text-xs text-slate-500">+{remaining.toLocaleString('pt-BR')} NCM(s)</p>
            ) : null}
        </div>
    )
}

export function FiscalCestTablePage({ initialResult, initialVersions }: FiscalCestTablePageProps) {
    const [result, setResult] = useState(initialResult)
    const [versions, setVersions] = useState(initialVersions)
    const [versionFilter, setVersionFilter] = useState<VersionFilter>('all')
    const [selectedEntry, setSelectedEntry] = useState<FiscalBaseEntryRecord | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [loadingGrid, setLoadingGrid] = useState(false)
    const [refreshingVersions, setRefreshingVersions] = useState(false)
    const [searchInput, setSearchInput] = useState('')
    const requestIdRef = useRef(0)
    const queryRef = useRef<CestQueryState>({
        versionId: initialResult.version?.id || null,
        search: '',
        page: initialResult.page || 1,
        pageSize: initialResult.pageSize || 50,
        sortBy: (initialResult.sortBy as FiscalCestSortBy) || 'code',
        sortOrder: initialResult.sortOrder === 'desc' ? 'desc' : 'asc',
        filterLinkMode: 'all',
        filterSegmentMode: 'all',
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
        const response = await listFiscalReferenceVersionsAction('cest')
        if (!response.success || !response.data) {
            toast.error(response.error || 'Nao foi possivel atualizar as versoes da base CEST.')
            setRefreshingVersions(false)
            return
        }
        setVersions(response.data)
        setRefreshingVersions(false)
    }

    const loadEntries = async (overrides: Partial<CestQueryState> = {}) => {
        const nextQuery: CestQueryState = {
            ...queryRef.current,
            ...overrides,
        }

        queryRef.current = nextQuery
        const requestId = ++requestIdRef.current
        setLoadingGrid(true)

        const response = await listFiscalBaseEntriesAction({
            tableType: 'cest',
            versionId: nextQuery.versionId,
            search: nextQuery.search,
            page: nextQuery.page,
            pageSize: nextQuery.pageSize,
            sortBy: nextQuery.sortBy,
            sortOrder: nextQuery.sortOrder,
            filterLinkMode: nextQuery.filterLinkMode,
            filterSegmentMode: nextQuery.filterSegmentMode,
        })

        if (requestId !== requestIdRef.current) return

        if (!response.success || !response.data) {
            toast.error(response.error || 'Nao foi possivel carregar a base CEST.')
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

    const handleSort = (field: FiscalCestSortBy) => {
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
            `Ativar a versao ${selectedVersion.versionLabel}? A versao ativa atual sera substituida.`
        )
        if (!confirmed) return

        const response = await activateFiscalReferenceVersionAction(selectedVersion.id)
        if (!response.success) {
            toast.error(response.error || 'Nao foi possivel ativar a versao selecionada.')
            return
        }

        toast.success('Versao da base CEST ativada com sucesso.')
        await Promise.all([refreshVersions(), loadEntries()])
    }

    const openDetail = (entry: FiscalBaseEntryRecord) => {
        setSelectedEntry(entry)
        setDetailOpen(true)
    }

    const showNoVersions = versions.length === 0
    const showNoResults = !loadingGrid && result.items.length === 0
    const selectedVersionLabel = selectedVersion ? selectedVersion.versionLabel : 'Sem versao'

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                            Governanca CEST
                        </Badge>
                        {selectedVersion ? <FiscalVersionBadge version={selectedVersion} stale={staleSelection} compact /> : null}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-heading text-gradient-navy">Base CEST</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Consulte a base versionada do CEST com paginacao, vinculos NCM, segmentacao e leitura operacional para revisao fiscal.
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
                        <Link href="/admin/fiscal-bases/imports/new?type=cest">
                            <Upload className="mr-1.5 h-4 w-4" />
                            Nova importacao
                        </Link>
                    </Button>
                    {selectedVersion && !selectedVersion.isActive ? (
                        <Button type="button" variant="outline" onClick={() => void handleActivateVersion()}>
                            Ativar versao
                        </Button>
                    ) : null}
                </div>
            </div>

            {showNoVersions ? (
                <div className="rounded-3xl border border-dashed bg-white p-10 text-center shadow-sm">
                    <Database className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                    <h2 className="text-lg font-semibold text-navy">Nenhuma versao CEST importada ainda</h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
                        Importe a primeira versao do CEST para habilitar consulta operacional, revisao de segmentos e auditoria dos vinculos com NCM.
                    </p>
                    <Button asChild className="mt-6 gradient-navy border-0 text-white">
                        <Link href="/admin/fiscal-bases/imports/new?type=cest">
                            <Upload className="mr-1.5 h-4 w-4" />
                            Importar primeira versao
                        </Link>
                    </Button>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                        <ToolbarMetric
                            label="Versao selecionada"
                            value={selectedVersionLabel}
                            helper={selectedVersion ? `${selectedVersion.rowCount.toLocaleString('pt-BR')} linhas persistidas` : 'Nenhuma versao selecionada'}
                        />
                        <ToolbarMetric
                            label="Versao ativa atual"
                            value={activeVersion?.versionLabel || 'Sem ativa'}
                            helper={activeVersion ? `Importada em ${formatDate(activeVersion.importedAt)}` : 'Ative uma versao para operacao'}
                        />
                        <ToolbarMetric
                            label="CESTs cadastrados"
                            value={result.finalRowCount.toLocaleString('pt-BR')}
                            helper="Registros finais disponiveis para consulta"
                        />
                        <ToolbarMetric
                            label="Vinculos exatos"
                            value={Number(result.exactLinkCount || 0).toLocaleString('pt-BR')}
                            helper="NCMs finais associados de forma direta"
                        />
                        <ToolbarMetric
                            label="NCMs abrangentes"
                            value={Number(result.prefixLinkCount || 0).toLocaleString('pt-BR')}
                            helper="Prefixos de 2 a 7 digitos com alcance fiscal"
                        />
                        <ToolbarMetric
                            label="Sem vinculo NCM"
                            value={Number(result.withoutNcmCount || 0).toLocaleString('pt-BR')}
                            helper="Pontos de revisao na base fiscal"
                        />
                    </div>

                    <div className="rounded-3xl border bg-white shadow-sm">
                        <div className="sticky top-0 z-10 rounded-t-3xl border-b bg-white/95 px-5 py-4 backdrop-blur">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                                {selectedVersion ? (selectedVersion.isActive ? 'Versao ativa' : 'Versao inativa') : 'Sem versao'}
                                            </Badge>
                                            {staleSelection ? (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                    Ha uma versao ativa mais recente
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterLinkMode === 'with_ncm' ? (
                                                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                                                    Filtro: com NCM vinculado
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterLinkMode === 'without_ncm' ? (
                                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                                    Filtro: sem vinculo NCM
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterSegmentMode === 'with_segment' ? (
                                                <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                                                    Filtro: com segmento
                                                </Badge>
                                            ) : null}
                                            {currentQuery.filterSegmentMode === 'without_segment' ? (
                                                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                                                    Filtro: sem segmento
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <h2 className="text-lg font-semibold text-navy">Consulta operacional da versao</h2>
                                        <p className="text-sm text-slate-600">
                                            {selectedVersion
                                                ? `${selectedVersion.versionLabel} · importada em ${formatDateTime(selectedVersion.importedAt)} · ${formatDateRange(selectedVersion.validFrom, selectedVersion.validTo)}`
                                                : 'Selecione uma versao para revisar a base.'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                        <p className="font-medium text-slate-800">Escopo atual</p>
                                        <p className="mt-1">
                                            {getRangeLabel(result.page, result.pageSize, result.totalCount)} · ordenado por {getSortLabel(currentQuery.sortBy)} ({currentQuery.sortOrder === 'asc' ? 'crescente' : 'decrescente'})
                                        </p>
                                    </div>
                                </div>

                                <div className="grid gap-3 xl:grid-cols-[minmax(280px,1.3fr)_190px_250px_140px_200px_200px_auto]">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            value={searchInput}
                                            onChange={(event) => setSearchInput(event.target.value)}
                                            placeholder="Buscar por codigo, descricao, segmento ou NCM vinculado"
                                            className="h-11 rounded-2xl border-slate-200 pl-9"
                                        />
                                    </div>

                                    <Select
                                        value={versionFilter}
                                        onValueChange={(value) => setVersionFilter((value as VersionFilter) || 'all')}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Status das versoes" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas as versoes</SelectItem>
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
                                            <SelectValue placeholder="Selecione uma versao" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {filteredVersions.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-slate-500">Nenhuma versao nesse recorte</div>
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
                                            void loadEntries({ pageSize: nextPageSize, page: 1 })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Itens por pagina" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PAGE_SIZE_OPTIONS.map((option) => (
                                                <SelectItem key={option} value={String(option)}>
                                                    {option} por pagina
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={currentQuery.filterLinkMode}
                                        onValueChange={(value) => {
                                            const nextValue = (value as FiscalCestLinkMode) || 'all'
                                            void loadEntries({ filterLinkMode: nextValue, page: 1 })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Vinculo NCM" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os vinculos</SelectItem>
                                            <SelectItem value="with_ncm">Somente com NCM</SelectItem>
                                            <SelectItem value="without_ncm">Somente sem NCM</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={currentQuery.filterSegmentMode}
                                        onValueChange={(value) => {
                                            const nextValue = (value as FiscalCestSegmentMode) || 'all'
                                            void loadEntries({ filterSegmentMode: nextValue, page: 1 })
                                        }}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-white">
                                            <SelectValue placeholder="Segmentacao" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os segmentos</SelectItem>
                                            <SelectItem value="with_segment">Somente com segmento</SelectItem>
                                            <SelectItem value="without_segment">Somente sem segmento</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 rounded-2xl border-slate-200"
                                        onClick={() => {
                                            setSearchInput('')
                                            void loadEntries({
                                                search: '',
                                                page: 1,
                                                sortBy: 'code',
                                                sortOrder: 'asc',
                                                filterLinkMode: 'all',
                                                filterSegmentMode: 'all',
                                            })
                                        }}
                                    >
                                        Limpar filtros
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {staleSelection ? (
                            <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>
                                        <p className="font-medium">Voce esta consultando uma versao inativa.</p>
                                        <p className="mt-1 text-amber-800">
                                            Revise a base selecionada e ative a versao desejada quando a validacao fiscal estiver concluida.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {loadingGrid ? (
                            <CestGridSkeleton />
                        ) : showNoResults ? (
                            <div className="px-6 py-14 text-center">
                                <Database className="mx-auto mb-3 h-9 w-9 text-slate-400" />
                                <h3 className="text-base font-semibold text-navy">Nenhum registro encontrado</h3>
                                <p className="mt-2 text-sm text-slate-600">
                                    Ajuste a busca ou os filtros para localizar registros do CEST nesta versao.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                                            <TableRow className="hover:bg-slate-50/95">
                                                {[
                                                    { key: 'code', label: 'Codigo CEST' },
                                                    { key: 'description', label: 'Descricao' },
                                                    { key: 'segment', label: 'Segmento' },
                                                    { key: 'linked_ncm_count', label: 'NCMs vinculados' },
                                                    { key: 'sample', label: 'Amostra NCM' },
                                                    { key: 'marker', label: 'Marcador' },
                                                ].map((column) => {
                                                    const sortable =
                                                        column.key === 'code' ||
                                                        column.key === 'description' ||
                                                        column.key === 'segment' ||
                                                        column.key === 'linked_ncm_count'
                                                    const field = column.key as FiscalCestSortBy

                                                    return (
                                                        <TableHead key={column.key} className="bg-slate-50/95">
                                                            {sortable ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSort(field)}
                                                                    className="inline-flex items-center gap-1 font-semibold text-slate-700 transition hover:text-navy"
                                                                >
                                                                    {column.label}
                                                                    <SortIcon
                                                                        active={currentQuery.sortBy === field}
                                                                        order={currentQuery.sortOrder}
                                                                    />
                                                                </button>
                                                            ) : (
                                                                column.label
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
                                                    className="cursor-pointer transition hover:bg-slate-50/80"
                                                    onClick={() => openDetail(entry)}
                                                >
                                                    <TableCell className="font-semibold text-navy">{entry.code}</TableCell>
                                                    <TableCell>
                                                        <div className="space-y-1">
                                                            <p className="font-medium text-slate-900">{entry.description}</p>
                                                            {entry.rowType === 'structural' ? (
                                                                <p className="text-xs text-sky-700">Linha estrutural da hierarquia oficial</p>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-slate-700">
                                                        {hasSegment(entry) ? entry.segment : <span className="text-slate-400">Sem segmento</span>}
                                                    </TableCell>
                                                    <TableCell className="text-slate-700">
                                                        {(entry.ncmCodes?.length || 0).toLocaleString('pt-BR')}
                                                    </TableCell>
                                                    <TableCell>
                                                        <NcmPreviewCell entry={entry} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <MarkerCell entry={entry} />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="flex flex-col gap-3 border-t px-5 py-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                                    <p>
                                        Mostrando {getRangeLabel(result.page, result.pageSize, result.totalCount)}.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void loadEntries({ page: Math.max(1, result.page - 1) })}
                                            disabled={result.page <= 1}
                                        >
                                            Anterior
                                        </Button>
                                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                            Pagina {result.totalPages === 0 ? 0 : result.page} de {result.totalPages}
                                        </Badge>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void loadEntries({ page: Math.min(result.totalPages, result.page + 1) })}
                                            disabled={result.totalPages === 0 || result.page >= result.totalPages}
                                        >
                                            Proxima
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
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
                                            hasLinkedNcm(selectedEntry)
                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                : 'border-amber-300 bg-amber-50 text-amber-700'
                                        }
                                    >
                                        {hasLinkedNcm(selectedEntry) ? 'Com NCM vinculado' : 'Sem vinculo NCM'}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={
                                            hasSegment(selectedEntry)
                                                ? 'border-violet-300 bg-violet-50 text-violet-700'
                                                : 'border-slate-300 bg-slate-50 text-slate-700'
                                        }
                                    >
                                        {hasSegment(selectedEntry) ? 'Com segmento' : 'Sem segmento'}
                                    </Badge>
                                </div>
                                <SheetTitle className="mt-3 text-xl font-heading text-navy">
                                    {selectedEntry.description}
                                </SheetTitle>
                                <SheetDescription className="mt-1 text-sm text-slate-600">
                                    {selectedEntry.rowType === 'structural'
                                        ? 'Linha de navegacao e classificacao da tabela oficial. Ela apoia consulta e hierarquia, mas nao deve ser usada diretamente como item final em perfil tributario.'
                                        : 'Registro final do CEST pronto para consulta operacional, auditoria dos vinculos NCM e suporte aos perfis tributarios.'}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                                <section className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Dados principais
                                        </p>
                                        <dl className="mt-4 space-y-3 text-sm">
                                            <div>
                                                <dt className="text-slate-500">Codigo CEST</dt>
                                                <dd className="font-medium text-slate-900">{selectedEntry.code}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Segmento</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {hasSegment(selectedEntry) ? selectedEntry.segment : 'Nao informado'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Tipo de linha</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {selectedEntry.rowType === 'structural' ? 'Estrutural' : 'Final'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">NCMs vinculados</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {(selectedEntry.ncmCodes?.length || 0).toLocaleString('pt-BR')}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Vinculos exatos</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {getExactLinkCount(selectedEntry).toLocaleString('pt-BR')}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Vinculos abrangentes</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {getPrefixLinkCount(selectedEntry).toLocaleString('pt-BR')}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Semantica de vinculo</dt>
                                                <dd className="font-medium text-slate-900">{getLinkModeLabel(selectedEntry)}</dd>
                                            </div>
                                        </dl>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Governanca da versao
                                        </p>
                                        <dl className="mt-4 space-y-3 text-sm">
                                            <div>
                                                <dt className="text-slate-500">Versao</dt>
                                                <dd className="font-medium text-slate-900">{selectedVersion?.versionLabel || selectedEntry.versionLabel}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Status</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {selectedVersion?.isActive ? 'Ativa' : 'Inativa'}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Importada em</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {formatDateTime(selectedVersion?.importedAt || null)}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-slate-500">Arquivo de origem</dt>
                                                <dd className="font-medium text-slate-900">
                                                    {selectedVersion?.sourceFileName || 'Nao informado'}
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>
                                </section>

                                {!hasLinkedNcm(selectedEntry) ? (
                                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                            <div>
                                                <p className="font-medium">Este CEST esta sem vinculo NCM.</p>
                                                <p className="mt-1 text-amber-800">
                                                    Revise a base importada antes de usar este registro como referencia operacional no fluxo fiscal.
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                ) : null}

                                {getPrefixLinkCount(selectedEntry) > 0 ? (
                                    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                            <div>
                                                <p className="font-medium">Este CEST possui vinculo abrangente por prefixo.</p>
                                                <p className="mt-1 text-sky-800">
                                                    Prefixos como <span className="font-semibold">{getLinkDetails(selectedEntry).find((link) => link.matchType === 'prefix')?.ncmCode || '9401'}</span> cobrem todos os NCMs finais iniciados por esse grupo. Isso e fiscalmente valido e sera respeitado nas sugestoes e validacoes futuras.
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                ) : null}

                                {selectedEntry.rowType === 'structural' ? (
                                    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                            <div>
                                                <p className="font-medium">Linha estrutural da tabela oficial.</p>
                                                <p className="mt-1 text-sky-800">
                                                    Use este registro para consulta e navegacao hierarquica. Para perfis tributarios, prefira sempre o registro final aplicavel.
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                ) : null}

                                <section className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        NCMs vinculados
                                    </p>
                                    {selectedEntry.ncmCodes && selectedEntry.ncmCodes.length > 0 ? (
                                        <div className="mt-4 grid gap-3">
                                            {getLinkDetails(selectedEntry).length > 0
                                                ? getLinkDetails(selectedEntry).map((link) => (
                                                    <div
                                                        key={`${selectedEntry.id}-${link.ncmCode}-${link.matchType}`}
                                                        className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                                                    >
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge
                                                                variant="outline"
                                                                className="border-slate-300 bg-white text-slate-800"
                                                            >
                                                                {link.ncmCode}
                                                            </Badge>
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    link.matchType === 'exact'
                                                                        ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                                                                        : 'border-sky-300 bg-sky-50 text-sky-700'
                                                                }
                                                            >
                                                                {link.matchType === 'exact' ? 'Exato' : 'Abrangente por prefixo'}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-2 text-xs text-slate-600">
                                                            {link.matchType === 'exact'
                                                                ? `Aplica-se diretamente ao NCM final ${link.ncmCode}.`
                                                                : `Abrange todos os NCMs finais iniciados por ${link.ncmCode}.`}
                                                        </p>
                                                    </div>
                                                ))
                                                : selectedEntry.ncmCodes.map((code) => (
                                                    <Badge
                                                        key={`${selectedEntry.id}-${code}`}
                                                        variant="outline"
                                                        className="border-slate-200 bg-slate-50 text-slate-700"
                                                    >
                                                        {code}
                                                    </Badge>
                                                ))}
                                        </div>
                                    ) : (
                                        <p className="mt-4 text-sm text-slate-500">
                                            Nenhum NCM vinculado foi encontrado para este CEST nesta versao.
                                        </p>
                                    )}
                                </section>
                            </div>
                        </>
                    ) : null}
                </SheetContent>
            </Sheet>
        </div>
    )
}
