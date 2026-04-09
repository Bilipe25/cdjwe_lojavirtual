'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listCfopConfigsAction, type CfopConfigListResult } from '@/app/admin/actions/cfop-configs'
import type { FiscalReferenceVersionItem } from '@/app/admin/actions/fiscal-bases'
import { FiscalVersionBadge } from './FiscalVersionBadge'
import {
    getCfopConfigurationStatusLabel,
    getCfopOperationGroupLabel,
    getCfopOperationScopeLabel,
} from '@/lib/fiscal/cfop'

function getCfopDirectionLabel(direction: 'outbound' | 'inbound' | 'both') {
    if (direction === 'outbound') return 'Saida'
    if (direction === 'inbound') return 'Entrada'
    return 'Entrada e saida'
}

interface FiscalCfopTablePageProps {
    initialResult: CfopConfigListResult
    initialVersions: FiscalReferenceVersionItem[]
}

export function FiscalCfopTablePage({ initialResult, initialVersions }: FiscalCfopTablePageProps) {
    const [result, setResult] = useState(initialResult)
    const [versions] = useState(initialVersions)
    const [selectedVersionId, setSelectedVersionId] = useState<string>(initialResult.versionId ?? '')
    const [search, setSearch] = useState('')
    const [direction, setDirection] = useState<'all' | 'outbound' | 'inbound' | 'both'>('all')
    const [scope, setScope] = useState<'all' | 'internal' | 'interstate' | 'external'>('all')
    const [status, setStatus] = useState<'all' | 'pending' | 'partial' | 'ready' | 'legacy'>('all')
    const [usageMode, setUsageMode] = useState<'all' | 'used' | 'unused'>('all')
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const activeVersion = useMemo(() => versions.find((version) => version.isActive) || null, [versions])
    const hasVersions = versions.length > 0
    const hasActiveFilters =
        search.trim().length > 0 || direction !== 'all' || scope !== 'all' || status !== 'all' || usageMode !== 'all'

    const refresh = async (
        overrides?: Partial<{
            versionId: string
            search: string
            direction: 'all' | 'outbound' | 'inbound' | 'both'
            scope: 'all' | 'internal' | 'interstate' | 'external'
            status: 'all' | 'pending' | 'partial' | 'ready' | 'legacy'
            usageMode: 'all' | 'used' | 'unused'
        }>
    ) => {
        setLoading(true)
        const nextVersionId = overrides?.versionId ?? selectedVersionId
        const nextSearch = overrides?.search ?? search
        const nextDirection = overrides?.direction ?? direction
        const nextScope = overrides?.scope ?? scope
        const nextStatus = overrides?.status ?? status
        const nextUsageMode = overrides?.usageMode ?? usageMode

        const response = await listCfopConfigsAction({
            versionId: nextVersionId || null,
            search: nextSearch,
            direction: nextDirection,
            scope: nextScope,
            status: nextStatus,
            usageMode: nextUsageMode,
        })

        if (response.success && response.data) {
            setResult(response.data)
            setLoadError(null)
        } else {
            setLoadError(response.error || 'Nao foi possivel carregar a governanca de CFOP agora.')
        }
        setLoading(false)
    }

    const clearFilters = () => {
        setSearch('')
        setDirection('all')
        setScope('all')
        setStatus('all')
        setUsageMode('all')
        void refresh({
            search: '',
            direction: 'all',
            scope: 'all',
            status: 'all',
            usageMode: 'all',
        })
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refresh()
        }, 250)
        return () => window.clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, direction, scope, status, usageMode])

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">Base Fiscal: CFOP</h1>
                    <p className="mt-1 text-muted-foreground">
                        Governe o CFOP oficial com uma camada contextual propria, preparada para perfis tributarios,
                        elegibilidade operacional e crescimento fiscal real.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button asChild>
                        <Link href="/admin/fiscal-bases/cfop/novo">
                            Novo CFOP manual
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={() => void refresh()}>
                        <RefreshCw className="mr-1.5 h-4 w-4" />
                        Atualizar
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Itens na versao</p>
                    <p className="mt-1 text-2xl font-semibold text-navy">{result.totalCount}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Prontos</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700">{result.readyCount}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Parciais</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-700">{result.partialCount}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendentes</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-700">{result.pendingCount}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Em uso</p>
                    <p className="mt-1 text-2xl font-semibold text-sky-700">{result.usedCount}</p>
                </div>
            </div>

            <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {result.versionLabel ? (
                            <Badge variant="outline" className="bg-white text-slate-700">
                                Versao selecionada: {result.versionLabel}
                            </Badge>
                        ) : null}
                        {activeVersion ? <FiscalVersionBadge version={activeVersion} compact /> : null}
                    </div>

                    <div className="relative w-full lg:max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar por codigo, descricao ou grupo"
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                    <Select
                        value={selectedVersionId || '__none__'}
                        onValueChange={(value) => {
                            const next = value && value !== '__none__' ? value : ''
                            setSelectedVersionId(next)
                            void refresh({ versionId: next })
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Versao do CFOP" />
                        </SelectTrigger>
                        <SelectContent>
                            {versions.map((version) => (
                                <SelectItem key={version.id} value={version.id}>
                                    {version.versionLabel}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={direction} onValueChange={(value) => setDirection(value as typeof direction)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Direcao" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as direcoes</SelectItem>
                            <SelectItem value="outbound">Saida</SelectItem>
                            <SelectItem value="inbound">Entrada</SelectItem>
                            <SelectItem value="both">Entrada e saida</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Escopo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os escopos</SelectItem>
                            <SelectItem value="internal">Interna</SelectItem>
                            <SelectItem value="interstate">Interestadual</SelectItem>
                            <SelectItem value="external">Exterior</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os status</SelectItem>
                            <SelectItem value="ready">Pronto</SelectItem>
                            <SelectItem value="partial">Parcial</SelectItem>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="legacy">Legado</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={usageMode} onValueChange={(value) => setUsageMode(value as typeof usageMode)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Uso" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="used">Em uso</SelectItem>
                            <SelectItem value="unused">Sem uso</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="overflow-hidden rounded-xl border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2">Codigo</th>
                                    <th className="px-3 py-2">Descricao</th>
                                    <th className="px-3 py-2">Contexto</th>
                                    <th className="px-3 py-2">Indicadores</th>
                                    <th className="px-3 py-2">Uso</th>
                                    <th className="px-3 py-2 text-right">Acao</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.items.map((item) => (
                                    <tr key={item.entryId} className="border-t align-top">
                                        <td className="px-3 py-3 font-medium text-navy">{item.code}</td>
                                        <td className="px-3 py-3">
                                            <div className="space-y-1">
                                                <p>{item.description}</p>
                                                {item.generalDescription ? (
                                                    <p className="text-xs text-muted-foreground">{item.generalDescription}</p>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge variant="outline" className="bg-white">
                                                    {getCfopDirectionLabel(item.operationDirection)}
                                                </Badge>
                                                <Badge variant="outline" className="bg-white">
                                                    {getCfopOperationScopeLabel(item.operationScope)}
                                                </Badge>
                                                {item.operationGroup ? (
                                                    <Badge variant="outline" className="bg-white">
                                                        {getCfopOperationGroupLabel(item.operationGroup)}
                                                    </Badge>
                                                ) : null}
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        item.configurationStatus === 'ready'
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                            : item.configurationStatus === 'partial'
                                                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                                                              : item.configurationStatus === 'legacy'
                                                                ? 'border-slate-300 bg-slate-100 text-slate-700'
                                                                : 'bg-white'
                                                    }
                                                >
                                                    {getCfopConfigurationStatusLabel(item.configurationStatus)}
                                                </Badge>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-2">
                                                {item.impactsIcms ? <Badge variant="outline" className="bg-white">ICMS</Badge> : null}
                                                {item.impactsIbscbs ? <Badge variant="outline" className="bg-white">IBS/CBS</Badge> : null}
                                                {item.supportsSt ? <Badge variant="outline" className="bg-white">ST</Badge> : null}
                                                {item.appliesToResale ? <Badge variant="outline" className="bg-white">Revenda</Badge> : null}
                                                {item.appliesToOwnManufacture ? <Badge variant="outline" className="bg-white">Fabricacao propria</Badge> : null}
                                                {item.appliesOutsideEstablishment ? <Badge variant="outline" className="bg-white">Fora do estabelecimento</Badge> : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-xs text-muted-foreground">
                                            <div className="space-y-1">
                                                <p>Perfis: {item.usage.totalProfiles}</p>
                                                <p>Regras contextuais: {item.usage.contextualRuleCount}</p>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/admin/fiscal-bases/cfop/${item.entryId}/editar`}>
                                                    Configurar
                                                    <ArrowRight className="ml-1.5 h-4 w-4" />
                                                </Link>
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {result.items.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {loading ? (
                                <div className="space-y-2">
                                    <p>Carregando configuracoes de CFOP...</p>
                                </div>
                            ) : loadError ? (
                                <div className="space-y-3">
                                    <p className="font-medium text-slate-900">Nao foi possivel carregar a base de CFOP agora.</p>
                                    <p>{loadError}</p>
                                    <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                                        Tentar novamente
                                    </Button>
                                </div>
                            ) : !hasVersions ? (
                                <div className="space-y-3">
                                    <p className="font-medium text-slate-900">Nenhuma versao oficial de CFOP esta disponivel.</p>
                                    <p>Importe ou ative uma versao oficial para comecar a governanca contextual do CFOP.</p>
                                </div>
                            ) : hasActiveFilters ? (
                                <div className="space-y-3">
                                    <p className="font-medium text-slate-900">Nenhum CFOP corresponde aos filtros atuais.</p>
                                    <p>Revise os filtros ou volte para a listagem completa para continuar a configuracao.</p>
                                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                                        Limpar filtros
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="font-medium text-slate-900">Nenhum item de CFOP foi encontrado nesta versao.</p>
                                    <p>Selecione outra versao oficial ou atualize a base fiscal para continuar.</p>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
