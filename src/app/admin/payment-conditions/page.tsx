import { CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { PaymentCondition, PaymentMethod, PaymentMethodCondition } from '@/lib/types'
import { PaymentConditionsClient } from './ClientPage'

export const dynamic = 'force-dynamic'

type MethodLinkRow = PaymentMethodCondition & {
    payment_condition?: PaymentCondition | PaymentCondition[] | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

export default async function PaymentConditionsPage() {
    const supabase = await createClient()

    const [conditionsResponse, methodsResponse, methodLinksResponse, ordersResponse] = await Promise.all([
        supabase.from('payment_conditions').select('*').order('sort_order', { ascending: true }),
        supabase.from('payment_methods').select('*').order('sort_order', { ascending: true }),
        supabase
            .from('payment_method_conditions')
            .select(`
                *,
                payment_condition:payment_conditions(*)
            `)
            .order('sort_order', { ascending: true }),
        supabase.from('orders').select('payment_condition_id, payment_method_id, payment_method_condition_id'),
    ])

    const conditions = (conditionsResponse.data || []) as PaymentCondition[]
    const schemaReady = !methodsResponse.error && !methodLinksResponse.error

    const methodsMap = new Map<string, PaymentMethod>()
    ;((methodsResponse.data || []) as PaymentMethod[]).forEach((method) => {
        methodsMap.set(method.id, {
            ...method,
            conditions: [],
        })
    })

    if (schemaReady) {
        ;((methodLinksResponse.data || []) as MethodLinkRow[]).forEach((link) => {
            const method = methodsMap.get(link.payment_method_id)
            if (!method) return

            const paymentCondition = unwrapRelation(link.payment_condition)
            method.conditions = [
                ...(method.conditions || []),
                {
                    ...link,
                    payment_condition: paymentCondition,
                },
            ]
        })
    }

    const methods = Array.from(methodsMap.values()).sort((a, b) => a.sort_order - b.sort_order)

    methods.forEach((method) => {
        method.conditions = (method.conditions || []).sort((a, b) => a.sort_order - b.sort_order)
    })

    const conditionUsageCounts = (ordersResponse.data || []).reduce((acc: Record<string, number>, order) => {
        if (order.payment_condition_id) {
            acc[order.payment_condition_id] = (acc[order.payment_condition_id] || 0) + 1
        }
        return acc
    }, {})

    const methodUsageCounts = (ordersResponse.data || []).reduce((acc: Record<string, number>, order) => {
        if (order.payment_method_id) {
            acc[order.payment_method_id] = (acc[order.payment_method_id] || 0) + 1
        }
        return acc
    }, {})

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="hidden md:block">
                    <h1 className="flex items-center gap-2 font-heading text-3xl font-bold text-gradient-navy">
                        <CreditCard className="h-8 w-8 text-bronze" />
                        Meios de Pagamento
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        Estruture meios, vínculos comerciais e a experiência de pagamento do checkout B2B.
                    </p>
                </div>
            </div>

            <PaymentConditionsClient
                initialMethods={methods}
                initialConditions={conditions}
                conditionUsageCounts={conditionUsageCounts}
                methodUsageCounts={methodUsageCounts}
                schemaReady={schemaReady}
            />
        </div>
    )
}
