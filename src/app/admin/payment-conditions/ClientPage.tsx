'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Layers, Link2, Plus, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PaymentCondition, PaymentMethod } from '@/lib/types'
import { PaymentConditionForm } from './components/PaymentConditionForm'
import { PaymentConditionList } from './components/PaymentConditionList'
import { PaymentMethodForm } from './components/PaymentMethodForm'
import { PaymentMethodList } from './components/PaymentMethodList'

interface ClientPageProps {
    initialMethods: PaymentMethod[]
    initialConditions: PaymentCondition[]
    conditionUsageCounts: Record<string, number>
    methodUsageCounts: Record<string, number>
    schemaReady: boolean
}

export function PaymentConditionsClient({
    initialMethods,
    initialConditions,
    conditionUsageCounts,
    methodUsageCounts,
    schemaReady,
}: ClientPageProps) {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState('methods')
    const [isMethodFormOpen, setIsMethodFormOpen] = useState(false)
    const [isConditionFormOpen, setIsConditionFormOpen] = useState(false)
    const [editingCondition, setEditingCondition] = useState<PaymentCondition | null>(null)

    const activeMethodsCount = useMemo(
        () => initialMethods.filter((method) => method.is_active).length,
        [initialMethods]
    )
    const activeConditionsCount = useMemo(
        () => initialConditions.filter((condition) => condition.is_active).length,
        [initialConditions]
    )
    const activeLinksCount = useMemo(
        () =>
            initialMethods.reduce(
                (total, method) => total + (method.conditions?.filter((link) => link.is_active).length || 0),
                0
            ),
        [initialMethods]
    )
    const methodsInUseCount = useMemo(
        () => Object.values(methodUsageCounts).filter((value) => value > 0).length,
        [methodUsageCounts]
    )

    const handleOpenCreateCondition = () => {
        setEditingCondition(null)
        setIsConditionFormOpen(true)
    }

    const handleOpenEditCondition = (condition: PaymentCondition) => {
        setEditingCondition(condition)
        setIsConditionFormOpen(true)
    }

    const handleOpenCloneCondition = (condition: PaymentCondition) => {
        const rest = Object.fromEntries(
            Object.entries(condition).filter(([key]) => key !== 'id')
        ) as Omit<PaymentCondition, 'id'>
        const cloned: PaymentCondition = {
            ...rest,
            id: '',
            name: `${condition.name} (Cópia)`,
        }
        setEditingCondition(cloned)
        setIsConditionFormOpen(true)
    }

    return (
        <div className="space-y-5">
            {!schemaReady && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-900">
                    <p className="font-semibold">Estrutura de meios de pagamento ainda não disponível.</p>
                    <p className="mt-1 text-amber-800">
                        Aplique as migrations `027` e `028` no Supabase para habilitar a gestão enterprise de meios, vínculos e snapshots de pagamento.
                    </p>
                </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Operação de pagamento</p>
                        <p className="mt-1 text-sm text-slate-500">
                            Trabalhe com meios e condições em formato enxuto, com governança central e navegação dedicada por meio.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                            {activeMethodsCount} meios ativos
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            <Layers className="mr-1.5 h-3.5 w-3.5" />
                            {activeConditionsCount} condições ativas
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                            {activeLinksCount} vínculos ativos
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                            {methodsInUseCount} meios em uso
                        </Badge>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <TabsList className="h-10 rounded-xl bg-white p-1 shadow-sm">
                        <TabsTrigger value="methods" className="rounded-lg px-4 data-[state=active]:bg-slate-100">
                            Meios de pagamento
                        </TabsTrigger>
                        <TabsTrigger value="conditions" className="rounded-lg px-4 data-[state=active]:bg-slate-100">
                            Condições comerciais
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex flex-wrap items-center gap-2">
                        {activeTab === 'methods' ? (
                            <>
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                    {initialMethods.length} meio{initialMethods.length === 1 ? '' : 's'} cadastrados
                                </Badge>
                                <Button onClick={() => setIsMethodFormOpen(true)} className="h-10 gap-2 gradient-navy border-0 text-white">
                                    <Plus className="h-4 w-4" />
                                    Novo meio
                                </Button>
                            </>
                        ) : (
                            <>
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                    {initialConditions.length} condição{initialConditions.length === 1 ? '' : 'ões'} cadastrada{initialConditions.length === 1 ? '' : 's'}
                                </Badge>
                                <Button onClick={handleOpenCreateCondition} className="h-10 gap-2 gradient-navy border-0 text-white">
                                    <Plus className="h-4 w-4" />
                                    Nova condição
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <TabsContent value="methods" className="space-y-4">
                    <PaymentMethodList
                        methods={initialMethods}
                        usageCounts={methodUsageCounts}
                        onOpenMethod={(method) => router.push(`/admin/payment-conditions/${method.id}`)}
                    />
                </TabsContent>

                <TabsContent value="conditions" className="space-y-4">
                    <PaymentConditionList
                        conditions={initialConditions}
                        usageCounts={conditionUsageCounts}
                        loading={false}
                        onEdit={handleOpenEditCondition}
                        onClone={handleOpenCloneCondition}
                    />
                </TabsContent>
            </Tabs>

            <PaymentMethodForm
                isOpen={isMethodFormOpen}
                onClose={() => setIsMethodFormOpen(false)}
                method={null}
            />

            <PaymentConditionForm
                isOpen={isConditionFormOpen}
                onClose={() => setIsConditionFormOpen(false)}
                condition={editingCondition}
            />
        </div>
    )
}
