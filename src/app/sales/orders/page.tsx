import Link from 'next/link'
import { getRepresentativeOrdersData } from '@/app/sales/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesOrdersPage() {
  const orders = await getRepresentativeOrdersData()

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id} className="rounded-3xl border border-slate-200 bg-white/95 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2"><p className="text-lg font-semibold text-slate-950">{order.order_number}</p><Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">{order.status}</Badge></div>
              <p className="text-sm text-slate-600">{order.store?.company_name}</p>
              <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('pt-BR')} • {formatCurrency(order.total)}</p>
            </div>
            <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white"><Link href={`/sales/orders/${order.id}`}>Abrir pedido</Link></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
