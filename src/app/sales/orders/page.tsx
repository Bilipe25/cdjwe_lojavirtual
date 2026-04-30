import Link from 'next/link'
import { getRepresentativeOrdersPageData } from '@/app/sales/actions'
import {
  SalesEmptyState,
  SalesPagination,
  SalesPanel,
  SalesRecordLink,
  SalesStatusBadge,
} from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'
import { getOrderTypeLabel } from '@/lib/orders/order-type'

type OrdersSearchParams = {
  page?: string
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function normalizePage(value?: string) {
  const parsed = Number(value || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.floor(parsed))
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrdersSearchParams>
}) {
  const params = await searchParams
  const page = normalizePage(params.page)
  const ordersPage = await getRepresentativeOrdersPageData({ page, pageSize: 20 })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{ordersPage.total} pedido(s)</span>
        <span>
          Página {ordersPage.page} de {ordersPage.totalPages}
        </span>
      </div>

      {ordersPage.total === 0 ? (
        <SalesEmptyState
          title="Nenhum pedido criado"
          description="Os pedidos gerados pelo representante aparecem aqui."
          action={
            <Button asChild size="sm" className="h-8 rounded-xl border-0 text-xs font-semibold gradient-bronze text-white hover:opacity-90">
              <Link href="/sales/orders/new">Criar pedido</Link>
            </Button>
          }
        />
      ) : (
        <>
          <SalesPanel>
            <div className="divide-y divide-border/30">
              {ordersPage.items.map((order) => (
                <SalesRecordLink
                  key={order.id}
                  href={`/sales/orders/${order.id}`}
                  title={order.order_number}
                  subtitle={order.store?.company_name || 'Cliente nao informado'}
                  meta={new Date(order.created_at).toLocaleDateString('pt-BR')}
                  amount={formatCurrency(order.total)}
                  badges={
                    <>
                      <SalesStatusBadge>{order.status}</SalesStatusBadge>
                      <SalesStatusBadge tone={order.order_type === 'PRONTA_ENTREGA' ? 'success' : 'neutral'}>
                        {getOrderTypeLabel(order.order_type)}
                      </SalesStatusBadge>
                    </>
                  }
                />
              ))}
            </div>
          </SalesPanel>

          <SalesPagination
            page={ordersPage.page}
            totalPages={ordersPage.totalPages}
            previousHref={`/sales/orders?page=${Math.max(1, ordersPage.page - 1)}`}
            nextHref={`/sales/orders?page=${Math.min(ordersPage.totalPages, ordersPage.page + 1)}`}
            label={`${ordersPage.items.length} de ${ordersPage.total}`}
          />
        </>
      )}
    </div>
  )
}
