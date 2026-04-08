'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database, Pencil, Plus, Power, RefreshCw, Search } from 'lucide-react'
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
import {
    listIcmsBasesAction,
    toggleIcmsBaseStatusAction,
    type IcmsBaseListItem,
} from '@/app/admin/actions/icms-bases'

function MetricCard({
    label,
    value,
    helper,
}: {
    label: string
    value: string
    helper: string
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
    )
}

function formatDate(value?: string | null) {
    if (!value) return 'Nao informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString('pt-BR')
}

export function IcmsBaseListPage() {
    const [items, setItems] = useState<IcmsBaseListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [searchInput, setSearchInput] = useState('')
    const [togglingId, setTogglingId] = useState<string | null>(null)
    const hasBootstrappedRef = useRef(false)

    const loadBases = useCallback(async (search?: string) => {
        setLoading(true)
        const result = await listIcmsBasesAction({ search, includeInactive: true })
        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel carregar as bases de ICMS.')
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

    const totalActive = useMemo(() => items.filter((item) => item.isActive).length, [items])
    const totalWithSt = useMemo(() => items.filter((item) => item.hasStConfigured).length, [items])
    const totalWithUf = useMemo(() => items.filter((item) => item.ufCount > 0).length, [items])
    const totalWithInterstate = useMemo(() => items.filter((item) => item.hasInterstateRule).length, [items])

    const handleToggleStatus = async (item: IcmsBaseListItem) => {
        setTogglingId(item.id)
        const result = await toggleIcmsBaseStatusAction(item.id, !item.isActive)
        if (!result.success) {
            toast.error(result.error || 'Nao foi possivel atualizar o status da base.')
            setTogglingId(null)
            return
        }

        toast.success(item.isActive ? 'Base de ICMS inativada.' : 'Base de ICMS ativada.')
        await loadBases(searchInput.trim() || undefined)
        setTogglingId(null)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            Bases Fiscais
                        </Badge>
                        <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                            Configuracao interna
                        </Badge>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-heading text-gradient-navy">Bases de ICMS</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Governanca interna de ICMS para regra nacional, excecoes por UF, interestadual e estrutura preparada para ST / MVA.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void loadBases(searchInput.trim() || undefined)} disabled={loading}>
                        <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button asChild className="gradient-navy border-0 text-white">
                        <Link href="/admin/fiscal-bases/icms/novo">
                            <Plus className="mr-1.5 h-4 w-4" />
                            Nova base
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Bases cadastradas" value={items.length.toLocaleString('pt-BR')} helper="Configuracoes internas reutilizaveis" />
                <MetricCard label="Ativas para novos perfis" value={totalActive.toLocaleString('pt-BR')} helper="Apenas bases ativas devem receber novos vinculos" />
                <MetricCard label="Com excecoes por UF" value={totalWithUf.toLocaleString('pt-BR')} helper="Bases com granularidade estadual" />
                <MetricCard label="Com interestadual / ST" value={`${totalWithInterstate.toLocaleString('pt-BR')} / ${totalWithSt.toLocaleString('pt-BR')}`} helper="Camadas avancadas configuradas" />
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
                                placeholder="Buscar por nome, codigo ou descricao da base"
                            />
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <p className="font-medium text-slate-800">Leitura operacional</p>
                            <p className="mt-1">
                                {items.length.toLocaleString('pt-BR')} base(s) encontradas para administracao interna.
                            </p>
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
                        <Database className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                        <h2 className="text-lg font-semibold text-navy">Nenhuma base de ICMS cadastrada</h2>
                        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
                            Crie a primeira base para organizar CST, aliquotas, FCP, excecoes por UF, interestadual e a preparacao futura do calculo fiscal.
                        </p>
                        <Button asChild className="mt-6 gradient-navy border-0 text-white">
                            <Link href="/admin/fiscal-bases/icms/novo">
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
                                    <TableHead>Status operacional</TableHead>
                                    <TableHead>Regras</TableHead>
                                    <TableHead>Interestadual</TableHead>
                                    <TableHead>ST / MVA</TableHead>
                                    <TableHead>Atualizacao</TableHead>
                                    <TableHead className="text-right">Acoes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <p className="font-semibold text-navy">{item.name}</p>
                                                <p className="text-xs text-slate-500">
                                                    {item.code} - versao {item.version}
                                                </p>
                                                {item.description ? (
                                                    <p className="text-xs text-slate-500">{item.description}</p>
                                                ) : null}
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
                                                {item.isActive ? 'Ativa para novos perfis' : 'Inativa para novos vinculos'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Badge variant="outline" className="bg-white text-slate-700">
                                                    Nacional: {item.nationalRuleCount}
                                                </Badge>
                                                <Badge variant="outline" className="bg-white text-slate-700">
                                                    UFs: {item.ufCount}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {item.hasInterstateRule ? (
                                                <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-700">
                                                    Configurado
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                                                    Pendente
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.hasStConfigured ? (
                                                    <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700">
                                                        ST preparada
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                                                        Sem ST
                                                    </Badge>
                                                )}
                                                {item.stUfCount > 0 ? (
                                                    <Badge variant="outline" className="bg-white text-slate-700">
                                                        UFs ST: {item.stUfCount}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600">{formatDate(item.updatedAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/admin/fiscal-bases/icms/${item.id}/editar`}>
                                                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                                        Editar
                                                    </Link>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={togglingId === item.id}
                                                    onClick={() => void handleToggleStatus(item)}
                                                >
                                                    <Power className="mr-1.5 h-3.5 w-3.5" />
                                                    {item.isActive ? 'Inativar' : 'Ativar'}
                                                </Button>
                                            </div>
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

