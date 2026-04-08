'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookMarked, CalendarRange, Plus, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { listIbscbsBasesAction, type IbscbsBaseListItem } from '@/app/admin/actions/ibscbs-bases'

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
    )
}

function formatDate(value?: string | null) {
    if (!value) return 'Nao definida'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('pt-BR')
}

export function IbscbsBaseListPage() {
    const [items, setItems] = useState<IbscbsBaseListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchInput, setSearchInput] = useState('')
    const hasBootstrappedRef = useRef(false)

    const loadBases = useCallback(async (search?: string) => {
        setLoading(true)
        const result = await listIbscbsBasesAction({ search, includeInactive: true })
        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel carregar as bases de IBS/CBS.')
            setLoading(false)
            return
        }
        setItems(result.data)
        setLoading(false)
    }, [])

    useEffect(() => {
        void loadBases()
    }, [loadBases])

    useEffect(() => {
        if (!hasBootstrappedRef.current) {
            hasBootstrappedRef.current = true
            return
        }

        const timer = window.setTimeout(() => {
            void loadBases(searchInput.trim() || undefined)
        }, 250)

        return () => window.clearTimeout(timer)
    }, [loadBases, searchInput])

    const activeBaseCount = useMemo(() => items.filter((item) => item.isActive).length, [items])
    const activeVersionCount = useMemo(() => items.filter((item) => item.activeVersionId).length, [items])
    const withUfCount = useMemo(() => items.filter((item) => item.ufCount > 0).length, [items])
    const withDraftCount = useMemo(() => items.filter((item) => item.hasDraft).length, [items])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            Bases Fiscais
                        </Badge>
                        <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                            Reforma tributaria
                        </Badge>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-heading text-gradient-navy">Bases de IBS/CBS</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Configuracao interna versionada para CST, classificacao tributaria, vigencia e excecoes por UF de IBS/CBS, pronta para integracao com Perfis Tributarios e preview fiscal futuro.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void loadBases(searchInput.trim() || undefined)} disabled={loading}>
                        <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button asChild className="gradient-navy border-0 text-white">
                        <Link href="/admin/fiscal-bases/ibscbs/novo">
                            <Plus className="mr-1.5 h-4 w-4" />
                            Nova base
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Bases cadastradas" value={items.length.toLocaleString('pt-BR')} helper="Configuracoes versionadas para a reforma tributaria" />
                <MetricCard label="Bases ativas" value={activeBaseCount.toLocaleString('pt-BR')} helper="Bases habilitadas para novos vinculos administrativos" />
                <MetricCard label="Versoes ativas" value={activeVersionCount.toLocaleString('pt-BR')} helper="Apenas versoes ativas podem ser herdadas por novos perfis" />
                <MetricCard label="Excecoes / rascunhos" value={`${withUfCount.toLocaleString('pt-BR')} / ${withDraftCount.toLocaleString('pt-BR')}`} helper="Bases com granularidade por UF e evolucao em draft" />
            </div>

            <div className="rounded-3xl border bg-white shadow-sm">
                <div className="border-b px-5 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="relative w-full max-w-xl">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                className="pl-9"
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                placeholder="Buscar por nome, codigo ou descricao da base IBS/CBS"
                            />
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <p className="font-medium text-slate-800">Governanca da reforma</p>
                            <p className="mt-1">{items.length.toLocaleString('pt-BR')} base(s) encontradas para administracao interna versionada.</p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-3 p-5">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton key={index} className="h-16 w-full" />
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-10 text-center">
                        <BookMarked className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                        <h2 className="text-lg font-semibold text-navy">Nenhuma base de IBS/CBS cadastrada</h2>
                        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
                            Crie a primeira base para organizar CST, classificacao tributaria, vigencia e excecoes por UF da reforma tributaria em um fluxo auditavel.
                        </p>
                        <Button asChild className="mt-6 gradient-navy border-0 text-white">
                            <Link href="/admin/fiscal-bases/ibscbs/novo">
                                <Plus className="mr-1.5 h-4 w-4" />
                                Criar primeira base
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Base</TableHead>
                                    <TableHead>Versao ativa</TableHead>
                                    <TableHead>Vigencia</TableHead>
                                    <TableHead>Regras</TableHead>
                                    <TableHead>Governanca</TableHead>
                                    <TableHead className="text-right">Acoes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <p className="font-semibold text-navy">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.code}</p>
                                                {item.description ? <p className="text-xs text-slate-500">{item.description}</p> : null}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        item.activeVersionId
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                            : 'border-amber-300 bg-amber-50 text-amber-700'
                                                    }
                                                >
                                                    {item.activeVersionLabel || 'Sem versao ativa'}
                                                </Badge>
                                                {item.hasDraft ? (
                                                    <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                                                        Draft em andamento
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1 text-sm text-slate-600">
                                                <div className="flex items-center gap-1.5">
                                                    <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
                                                    <span>
                                                        {formatDate(item.activeValidFrom)} ate {formatDate(item.activeValidTo)}
                                                    </span>
                                                </div>
                                                {item.hasFutureVersion ? <p className="text-xs text-sky-700">Com vigencia futura planejada</p> : null}
                                                {item.hasExpiredVersion ? <p className="text-xs text-amber-700">Possui historico encerrado</p> : null}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Badge variant="outline" className="bg-white text-slate-700">
                                                    Total: {item.totalRuleCount}
                                                </Badge>
                                                <Badge variant="outline" className="bg-white text-slate-700">
                                                    UFs: {item.ufCount}
                                                </Badge>
                                                <Badge variant="outline" className="bg-white text-slate-700">
                                                    Versoes: {item.totalVersions}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    item.isActive
                                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                        : 'border-amber-300 bg-amber-50 text-amber-700'
                                                }
                                            >
                                                {item.isActive ? 'Base ativa para novos vinculos' : 'Base inativa para novos vinculos'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/admin/fiscal-bases/ibscbs/${item.id}/editar`}>Administrar</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    )
}
