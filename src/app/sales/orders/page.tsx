import Link from 'next/link'
import { getRepresentativeOrdersData } from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default async function SalesOrdersPage() {
  const orders = await getRepresentativeOrdersData()

  return (
    <div className="space-y-4">
      <span className="text-xs font-medium text-slate-500">{orders.length} pedido(s)</span>

      {orders.length === 0 ? (
        <SalesEmptyState
          title="Nenhum pedido criado"
          description="Os pedidos gerados pelo representante aparecem aqui."
          action={
            <Button asChild size="sm" className="h-8 rounded-xl border-0 bg-slate-950 text-xs text-white hover:bg-slate-800">
              <Link href="/sales/orders/new">Criar pedido</Link>
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/sales/orders/${order.id}`}
              className="flex flex-col gap-2 px-4 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-950">{order.order_number}</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    {order.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span>{order.store?.company_name}</span>
                  <span>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                  <span>{order.payment_method_name || 'Pgto pendente'}</span>
                </div>
              </div>

              <span className="shrink-0 text-sm font-bold text-slate-950">{formatCurrency(order.total)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
