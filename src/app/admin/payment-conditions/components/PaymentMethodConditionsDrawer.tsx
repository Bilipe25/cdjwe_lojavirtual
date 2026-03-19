'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUpDown, CreditCard, Edit2, Plus, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import type { PaymentCondition, PaymentMethod } from '@/lib/types'
import { savePaymentMethodAssignments } from '../actions'

type ConditionEntry = {
    payment_condition_id: string
    condition: PaymentCondition
    is_active: boolean
    sort_order: number
}

interface PaymentMethodConditionsDrawerProps {
    isOpen: boolean
    onClose: () => void
    method: PaymentMethod | null
    conditions: PaymentCondition[]
    onEditCondition: (condition: PaymentCondition) => void
    onCreateCondition: () => void
}

function buildEntries(method: PaymentMethod | null, conditions: PaymentCondition[]): ConditionEntry[] {
    const linkedMap = new Map(
        (method?.conditions || []).map((link) => [link.payment_condition_id, link])
    )

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

export function PaymentMethodConditionsDrawer({
    isOpen,
    onClose,
    method,
    conditions,
    onEditCondition,
    onCreateCondition,
}: PaymentMethodConditionsDrawerProps) {
    const [entries, setEntries] = useState<ConditionEntry[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const router = useRouter()

    useEffect(() => {
        setEntries(buildEntries(method, conditions))
    }, [method, conditions])

    const activeCount = useMemo(() => entries.filter((entry) => entry.is_active).length, [entries])

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
            current.map((entry) =>
                entry.payment_condition_id === paymentConditionId
                    ? {
                          ...entry,
                          sort_order: Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed,
                      }
                    : entry
            )
        )
    }

    const handleSave = async () => {
        if (!method) return

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

        toast.success('Vínculos atualizados com sucesso!')
        router.refresh()
        onClose()
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="w-full p-0 sm:max-w-2xl">
                <SheetHeader className="border-b bg-white px-6 py-5">
                    <SheetTitle className="flex items-center gap-2 text-xl font-heading text-navy">
                        <CreditCard className="h-5 w-5 text-bronze" />
                        {method ? `Condições do meio: ${method.name}` : 'Condições do meio'}
                    </SheetTitle>
                    <SheetDescription>
                        Ative somente as condições que este meio poderá oferecer no checkout do cliente.
                    </SheetDescription>
                </SheetHeader>

                <div className="border-b bg-slate-50/70 px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-slate-200 bg-white text-slate-700" variant="outline">
                            {activeCount} ativa{activeCount === 1 ? '' : 's'}
                        </Badge>
                        <Badge className="border-slate-200 bg-white text-slate-700" variant="outline">
                            {entries.length} condição{entries.length === 1 ? '' : 'ões'} disponíveis
                        </Badge>
                    </div>
                    {method?.description && (
                        <p className="mt-2 text-sm text-slate-500">{method.description}</p>
                    )}
                </div>

                <ScrollArea className="flex-1">
                    <div className="space-y-3 p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Condições comerciais</p>
                                <p className="text-sm text-slate-500">
                                    Ajuste a seleção e a ordem de prioridade exibida dentro deste meio.
                                </p>
                            </div>
                            <Button variant="outline" className="gap-2" onClick={onCreateCondition}>
                                <Plus className="h-4 w-4" />
                                Nova condição
                            </Button>
                        </div>

                        {entries.map((entry) => (
                            <div key={entry.payment_condition_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-base font-semibold text-slate-950">
                                                {entry.condition.name}
                                            </h3>
                                            {!entry.condition.is_active && (
                                                <Badge variant="secondary">Condição inativa</Badge>
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
                                        </div>

                                        <p className="mt-1 text-sm text-slate-500">
                                            {entry.condition.description || 'Sem descrição comercial cadastrada.'}
                                        </p>

                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                            <Badge variant="outline" className="border-slate-200 bg-slate-50">
                                                {entry.condition.installments}x
                                            </Badge>
                                            <Badge variant="outline" className="border-slate-200 bg-slate-50">
                                                Pedido mín. R$ {entry.condition.min_order_value.toFixed(2)}
                                            </Badge>
                                            {entry.condition.max_order_value !== null && (
                                                <Badge variant="outline" className="border-slate-200 bg-slate-50">
                                                    Pedido máx. R$ {entry.condition.max_order_value.toFixed(2)}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 lg:w-64">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <Label className="text-sm font-medium text-slate-700">
                                                    Ativar neste meio
                                                </Label>
                                                <p className="text-[11px] text-slate-500">
                                                    Exibir ao cliente quando este meio for escolhido.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={entry.is_active}
                                                onCheckedChange={(value) => handleToggle(entry.payment_condition_id, value)}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                                Ordem no meio
                                            </Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                value={entry.sort_order}
                                                disabled={!entry.is_active}
                                                onChange={(event) =>
                                                    handleSortOrderChange(
                                                        entry.payment_condition_id,
                                                        event.target.value
                                                    )
                                                }
                                                className="bg-white"
                                            />
                                        </div>

                                        <Button
                                            variant="ghost"
                                            className="justify-start gap-2 px-0 text-navy hover:text-navy"
                                            onClick={() => onEditCondition(entry.condition)}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                            Editar condição
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <SheetFooter className="border-t bg-white px-6 py-4 sm:flex-row sm:justify-between">
                    <p className="text-sm text-slate-500">
                        As alterações serão usadas no checkout e em futuras regras comerciais.
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving} className="gap-2 gradient-navy border-0 text-white">
                            <Save className="h-4 w-4" />
                            {isSaving ? 'Salvando...' : 'Salvar vínculos'}
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
