import { AlertCircle, CalendarCheck2, PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getRepresentativeStockData,
  submitRepresentativeDayClosingFormAction,
} from '@/app/sales/actions'
import { getRepresentativeStockStatus } from '@/lib/representative-stock'

function getRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function getProductLabel(row: {
  product_variant?: {
    sku?: string | null
    product?: { name?: string | null } | { name?: string | null }[] | null
    fabric?: { name?: string | null } | { name?: string | null }[] | null
    fabric_color?: { name?: string | null } | { name?: string | null }[] | null
  } | {
    sku?: string | null
    product?: { name?: string | null } | { name?: string | null }[] | null
    fabric?: { name?: string | null } | { name?: string | null }[] | null
    fabric_color?: { name?: string | null } | { name?: string | null }[] | null
  }[] | null
  size_option?: { name?: string | null } | { name?: string | null }[] | null
}) {
  const variant = getRelation(row.product_variant)
  const product = getRelation(variant?.product)
  const fabric = getRelation(variant?.fabric)
  const color = getRelation(variant?.fabric_color)
  const size = getRelation(row.size_option)

  return {
    title: product?.name || variant?.sku || 'Produto',
    subtitle: [fabric?.name, color?.name, size?.name].filter(Boolean).join(' / '),
  }
}

export default async function SalesRepresentativeStockPage({
  searchParams,
}: {
  searchParams: Promise<{ closingSuccess?: string; closingError?: string }>
}) {
  const params = await searchParams
  const response = await getRepresentativeStockData()
  const items = response.success ? response.items : []
  const totalAvailable = items.reduce((sum, item) => sum + Number(item.quantity_available || 0), 0)
  const totalReserved = items.reduce((sum, item) => sum + Number(item.quantity_reserved || 0), 0)
  const totalSold = items.reduce((sum, item) => sum + Number(item.quantity_sold || 0), 0)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-700" />
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                Pronta Entrega
              </Badge>
            </div>
            <h1 className="text-xl font-bold font-heading text-foreground">Meu estoque</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Produtos disponiveis para venda presencial. Pedidos pre-venda continuam usando o fluxo normal.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border/50 px-3 py-2">
              <p className="text-lg font-bold">{totalAvailable}</p>
              <p className="text-[10px] text-muted-foreground">Disponivel</p>
            </div>
            <div className="rounded-lg border border-border/50 px-3 py-2">
              <p className="text-lg font-bold">{totalReserved}</p>
              <p className="text-[10px] text-muted-foreground">Reservado</p>
            </div>
            <div className="rounded-lg border border-border/50 px-3 py-2">
              <p className="text-lg font-bold">{totalSold}</p>
              <p className="text-[10px] text-muted-foreground">Vendido</p>
            </div>
          </div>
        </div>
      </div>

      {params.closingSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Fechamento enviado com sucesso.
        </div>
      ) : null}

      {params.closingError ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {decodeURIComponent(params.closingError)}
        </div>
      ) : null}

      <form action={submitRepresentativeDayClosingFormAction} className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Fechamento do dia</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <Input name="businessDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <Input name="routeLabel" placeholder="Rota ou observacao do fechamento" />
          <Button type="submit" className="h-10 rounded-lg">Enviar fechamento</Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border/40 bg-card">
        {items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhum produto transferido para seu estoque ainda.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {items.map((item) => {
              const label = getProductLabel(item)
              const status = getRepresentativeStockStatus(Number(item.quantity_available || 0))

              return (
                <div key={item.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{label.title}</p>
                    <p className="text-xs text-muted-foreground">{label.subtitle || 'Sem variacao informada'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={status.tone === 'danger' ? 'destructive' : status.tone === 'warning' ? 'outline' : 'secondary'}>
                      {status.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Reservado {item.quantity_reserved}</span>
                    <span className="text-xs text-muted-foreground">Vendido {item.quantity_sold}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
