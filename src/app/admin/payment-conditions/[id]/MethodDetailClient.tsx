'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUpDown, Layers, Plus, Save, Settings2, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import type { PaymentCondition, PaymentMethod } from '@/lib/types'
import { PaymentConditionForm } from '../components/PaymentConditionForm'
import { PaymentMethodForm } from '../components/PaymentMethodForm'
import { savePaymentMethodAssignments } from '../actions'

type ConditionEntry = {
    payment_condition_id: string
    condition: PaymentCondition
    is_active: boolean
    sort_order: number
}

interface MethodDetailClientProps {
    method: PaymentMethod
    conditions: PaymentCondition[]
    conditionUsageCounts: Record<string, number>
    methodUsageCount: number
}

function buildEntries(method: PaymentMethod, conditions: PaymentCondition[]): ConditionEntry[] {
    const linkedMap = new Map((method.conditions || []).map((link) => [link.payment_condition_id, link]))

    return [...conditions]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((condition, index) => {
            const existing = linkedMap.get(condition.id)

            return {
                payment_condition_id: condition.id,
                condition,
                is_active: existing?.is_active || false,
                sort_order: existing?.sort_order || index + 1,
            }
        })
        .sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
            return a.condition.sort_order - b.condition.sort_order
        })
}

export function MethodDetailClient({
    method,
    conditions,
    conditionUsageCounts,
    methodUsageCount,
}: MethodDetailClientProps) {
    const router = useRouter()
    const [entries, setEntries] = useState<ConditionEntry[]>([])
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
    const [isSaving, setIsSaving] = useState(false)
    const [isMethodFormOpen, setIsMethodFormOpen] = useState(false)
    const [isConditionFormOpen, setIsConditionFormOpen] = useState(false)
    const [editingCondition, setEditingCondition] = useState<PaymentCondition | null>(null)

    useEffect(() => {
        setEntries(buildEntries(method, conditions))
    }, [method, conditions])

    const activeCount = useMemo(() => entries.filter((entry) => entry.is_active).length, [entries])
    const filteredEntries = useMemo(() => {
        if (filter === 'active') return entries.filter((entry) => entry.is_active)
        if (filter === 'inactive') return entries.filter((entry) => !entry.is_active)
        return entries
    }, [entries, filter])

    const handleToggle = (paymentConditionId: string, value: boolean) => {
        setEntries((current) =>
            current
                .map((entry) =>
                    entry.payment_condition_id === paymentConditionId
                        ? {
                              ...entry,
                              is_active: value,
                              sort_order: value ? entry.sort_order || activeCount + 1 : entry.sort_order,
                          }
                        : entry
                )
                .sort((a, b) => {
                    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
                    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
                    return a.condition.sort_order - b.condition.sort_order
                })
        )
    }

    const handleSortOrderChange = (paymentConditionId: string, rawValue: string) => {
        const parsed = Number(rawValue)
        setEntries((current) =>
            current
                .map((entry) =>
                    entry.payment_condition_id === paymentConditionId
                        ? {
                              ...entry,
                              sort_order: Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed,
                          }
                        : entry
                )
                .sort((a, b) => {
                    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
                    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
                    return a.condition.sort_order - b.condition.sort_order
                })
        )
    }

    const handleSave = async () => {
        setIsSaving(true)
        const result = await savePaymentMethodAssignments({
            methodId: method.id,
            assignments: entries.map((entry, index) => ({
                payment_condition_id: entry.payment_condition_id,
                is_active: entry.is_active,
                sort_order: entry.is_active ? entry.sort_order || index + 1 : entry.sort_order || index + 1,
            })),
        })
        setIsSaving(false)

        if (result.error) {
            toast.error(result.error)
            return
        }

        toast.success('Condições do meio atualizadas com sucesso!')
        router.refresh()
    }

    const openCreateCondition = () => {
        setEditingCondition(null)
        setIsConditionFormOpen(true)
    }

    const openEditCondition = (condition: PaymentCondition) => {
        setEditingCondition(condition)
        setIsConditionFormOpen(true)
    }

    const openCloneCondition = (condition: PaymentCondition) => {
        const rest = Object.fromEntries(Object.entries(condition).filter(([key]) => key !== 'id')) as Omit<PaymentCondition, 'id'>
        setEditingCondition({
            ...rest,
            id: '',
            name: `${condition.name} (Cópia)`,
        })
        setIsConditionFormOpen(true)
    }

    return (
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-slate-950">Resumo do meio</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Meio</p>
                            <p className="mt-1 text-lg font-semibold text-slate-950">{method.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{method.description || 'Sem descrição institucional cadastrada.'}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">Cód. {method.code}</Badge>
                            {!method.is_active && <Badge variant="secondary">Inativo</Badge>}
                            {methodUsageCount > 0 && (
                                <Badge className="border-blue-200 bg-blue-100 text-blue-800">
                                    {methodUsageCount} {methodUsageCount === 1 ? 'pedido' : 'pedidos'}
                                </Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Condições ativas</p>
                                <p className="mt-1 text-xl font-bold text-slate-950">{activeCount}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Disponíveis</p>
                                <p className="mt-1 text-xl font-bold text-slate-950">{conditions.length}</p>
                            </div>
                        </div>

                        <Button variant="outline" className="w-full gap-2" onClick={() => setIsMethodFormOpen(true)}>
                            <Settings2 className="h-4 w-4" />
                            Editar dados do meio
                        </Button>
                    </CardContent>
                </Card>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                        Governança comercial
                    </div>
                    <p className="mt-2 leading-6">
                        Ative somente as condições que devem aparecer dentro deste meio. A ordem define a priorização exibida no checkout.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="space-y-4 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Condições do meio</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Gerencie quais condições comerciais ficam disponíveis quando o cliente selecionar este meio.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" className="gap-2" onClick={openCreateCondition}>
                                    <Plus className="h-4 w-4" />
                                    Nova condição
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving} className="gap-2 gradient-navy border-0 text-white">
                                    <Save className="h-4 w-4" />
                                    {isSaving ? 'Salvando...' : 'Salvar alterações'}
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                                <TabsList className="h-10 rounded-xl bg-slate-50 p-1">
                                    <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white">Todas ({entries.length})</TabsTrigger>
                                    <TabsTrigger value="active" className="rounded-lg data-[state=active]:bg-white">Ativas ({activeCount})</TabsTrigger>
                                    <TabsTrigger value="inactive" className="rounded-lg data-[state=active]:bg-white">Inativas ({entries.length - activeCount})</TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <Badge variant="outline" className="w-fit border-slate-200 bg-white text-slate-600">
                                <Layers className="mr-1.5 h-3.5 w-3.5" />
                                Lista operacional compacta
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden border-slate-200 shadow-sm">
                    <CardContent className="divide-y divide-slate-200 p-0">
                        {filteredEntries.map((entry) => {
                            const usageCount = conditionUsageCounts[entry.condition.id] || 0

                            return (
                                <div key={entry.payment_condition_id} className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-slate-50/70 lg:flex-row lg:items-center">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="truncate text-sm font-semibold text-slate-950">{entry.condition.name}</h3>
                                            {entry.is_active && (
                                                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Ativa no meio</Badge>
                                            )}
                                            {!entry.condition.is_active && (
                                                <Badge variant="secondary">Condição base inativa</Badge>
                                            )}
                                            {entry.condition.discount_percentage > 0 && (
                                                <Badge className="border-green-200 bg-green-100 text-green-800">
                                                    -{entry.condition.discount_percentage}%
                                                </Badge>
                                            )}
                                            {entry.condition.surcharge_percentage > 0 && (
                                                <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                                                    +{entry.condition.surcharge_percentage}%
                                                </Badge>
                                            )}
                                            {usageCount > 0 && (
                                                <Badge className="border-blue-200 bg-blue-100 text-blue-800">
                                                    {usageCount} {usageCount === 1 ? 'uso' : 'usos'}
                                                </Badge>
                                            )}
                                        </div>

                                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                                            {entry.condition.description || 'Sem descrição comercial cadastrada.'}
                                        </p>

                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                            <span>{entry.condition.installments}x</span>
                                            <span>Pedido mín. R$ {entry.condition.min_order_value.toFixed(2)}</span>
                                            {entry.condition.max_order_value !== null && (
                                                <span>Pedido máx. R$ {entry.condition.max_order_value.toFixed(2)}</span>
                                            )}
                                            {entry.condition.min_installment_value > 0 && (
                                                <span>Parcela mín. R$ {entry.condition.min_installment_value.toFixed(2)}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:gap-4 lg:min-w-[310px] lg:justify-end">
                                        <div className="space-y-1 sm:w-24">
                                            <Label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                                Ordem
                                            </Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                value={entry.sort_order}
                                                disabled={!entry.is_active}
                                                onChange={(event) => handleSortOrderChange(entry.payment_condition_id, event.target.value)}
                                                className="h-9 bg-white text-right"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-3 sm:min-w-[112px] sm:justify-start">
                                            <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
                                                <p className="text-xs text-slate-500">Exibir no checkout</p>
                                            </div>
                                            <Switch
                                                checked={entry.is_active}
                                                onCheckedChange={(value) => handleToggle(entry.payment_condition_id, value)}
                                            />
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center self-end rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:self-auto">
                                                <Settings2 className="h-4 w-4" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-44">
                                                <DropdownMenuItem onClick={() => openEditCondition(entry.condition)}>
                                                    Editar condição
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openCloneCondition(entry.condition)}>
                                                    Duplicar condição
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => handleToggle(entry.payment_condition_id, !entry.is_active)}>
                                                    {entry.is_active ? 'Desativar neste meio' : 'Ativar neste meio'}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            )
                        })}

                        {filteredEntries.length === 0 && (
                            <div className="px-4 py-14 text-center">
                                <p className="text-base font-semibold text-slate-900">Nenhuma condição encontrada neste filtro</p>
                                <p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou crie uma nova condição para este meio.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <PaymentMethodForm
                isOpen={isMethodFormOpen}
                onClose={() => setIsMethodFormOpen(false)}
                method={method}
            />

            <PaymentConditionForm
                isOpen={isConditionFormOpen}
                onClose={() => setIsConditionFormOpen(false)}
                condition={editingCondition}
            />
        </div>
    )
}
