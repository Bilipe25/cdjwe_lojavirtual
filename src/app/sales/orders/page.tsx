import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getRepresentativeOrdersPageData } from '@/app/sales/actions'
import { SalesEmptyState } from '@/components/sales/sales-ui'
import { Button } from '@/components/ui/button'

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
          <div className="divide-y divide-border/30 rounded-2xl border border-border/40 bg-card">
            {ordersPage.items.map((order) => (
              <Link
                key={order.id}
                href={`/sales/orders/${order.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{order.order_number}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {order.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{order.store?.company_name}</span>
                    <span>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                <span className="shrink-0 text-sm font-bold font-heading text-foreground">{formatCurrency(order.total)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card p-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-border px-3 text-xs"
              disabled={ordersPage.page <= 1}
            >
              <Link href={`/sales/orders?page=${Math.max(1, ordersPage.page - 1)}`} aria-disabled={ordersPage.page <= 1}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Anterior
              </Link>
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              {ordersPage.items.length} de {ordersPage.total}
            </span>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-border px-3 text-xs"
              disabled={ordersPage.page >= ordersPage.totalPages}
            >
              <Link href={`/sales/orders?page=${Math.min(ordersPage.totalPages, ordersPage.page + 1)}`} aria-disabled={ordersPage.page >= ordersPage.totalPages}>
                Próxima
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
