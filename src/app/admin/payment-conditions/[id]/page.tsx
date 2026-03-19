import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { PaymentCondition, PaymentMethod, PaymentMethodCondition } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MethodDetailClient } from './MethodDetailClient'

export const dynamic = 'force-dynamic'

type MethodLinkRow = PaymentMethodCondition & {
    payment_condition?: PaymentCondition | PaymentCondition[] | null
}

type MethodRow = PaymentMethod & {
    conditions?: MethodLinkRow[] | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

export default async function PaymentMethodDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    const [methodResponse, conditionsResponse, ordersResponse] = await Promise.all([
        supabase
            .from('payment_methods')
            .select(`
                *,
                conditions:payment_method_conditions(
                    *,
                    payment_condition:payment_conditions(*)
                )
            `)
            .eq('id', id)
            .single(),
        supabase.from('payment_conditions').select('*').order('sort_order', { ascending: true }),
        supabase.from('orders').select('payment_method_id, payment_condition_id, payment_method_condition_id'),
    ])

    if (methodResponse.error || !methodResponse.data) {
        notFound()
    }

    const methodRow = methodResponse.data as MethodRow
    const method: PaymentMethod = {
        ...methodRow,
        conditions: (methodRow.conditions || [])
            .map((link) => ({
                ...link,
                payment_condition: unwrapRelation(link.payment_condition),
            }))
            .sort((a, b) => a.sort_order - b.sort_order),
    }

    const conditions = (conditionsResponse.data || []) as PaymentCondition[]
    const conditionUsageCounts = (ordersResponse.data || []).reduce((acc: Record<string, number>, order) => {
        if (order.payment_condition_id) {
            acc[order.payment_condition_id] = (acc[order.payment_condition_id] || 0) + 1
        }
        return acc
    }, {})

    const methodUsageCount = (ordersResponse.data || []).filter((order) => order.payment_method_id === method.id).length

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                        <Link href="/admin/payment-conditions">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para meios de pagamento
                        </Link>
                    </Button>
                    <h1 className="flex items-center gap-2 font-heading text-3xl font-bold text-gradient-navy">
                        <CreditCard className="h-7 w-7 text-bronze" />
                        {method.name}
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        Ajuste o meio e as condições comerciais exibidas no checkout de forma centralizada e segura.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                        Cód. {method.code}
                    </Badge>
                    {!method.is_active && <Badge variant="secondary">Meio inativo</Badge>}
                </div>
            </div>

            <MethodDetailClient
                method={method}
                conditions={conditions}
                conditionUsageCounts={conditionUsageCounts}
                methodUsageCount={methodUsageCount}
            />
        </div>
    )
}
