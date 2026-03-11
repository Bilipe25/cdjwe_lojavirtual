import { createClient } from '@/lib/supabase/server'
import { CreditCard } from 'lucide-react'
import { PaymentConditionsClient } from './ClientPage'
import type { PaymentCondition } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PaymentConditionsPage() {
    const supabase = await createClient()
    const { data: conditions } = await supabase
        .from('payment_conditions')
        .select('*')
        .order('sort_order', { ascending: true })

    const { data: orders } = await supabase
        .from('orders')
        .select('payment_condition_id')

    const usageCounts = (orders || []).reduce((acc: Record<string, number>, order) => {
        if (order.payment_condition_id) {
            acc[order.payment_condition_id] = (acc[order.payment_condition_id] || 0) + 1
        }
        return acc
    }, {})

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <CreditCard className="h-8 w-8 text-bronze" />
                        Formas de Pagamento
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie as condições de pagamento exibidas no checkout
                    </p>
                </div>
            </div>

            <PaymentConditionsClient 
                initialConditions={(conditions || []) as PaymentCondition[]} 
                usageCounts={usageCounts}
            />
        </div>
    )
}
