import { Boxes, PackageOpen, ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRepresentativeStockStatus } from '@/lib/representative-stock'
import { getReadyDeliveryStockOverview } from '../actions'
import {
  formatDateTime,
  getRelation,
  getVariantLabel,
  ReadyDeliveryHeader,
  ReadyDeliveryStat,
} from '../_components'

export default async function ReadyDeliveryStockPage() {
  const rows = await getReadyDeliveryStockOverview()
  const totalAvailable = rows.reduce((sum, row) => sum + Number(row.quantity_available || 0), 0)
  const totalReserved = rows.reduce((sum, row) => sum + Number(row.quantity_reserved || 0), 0)
  const totalSold = rows.reduce((sum, row) => sum + Number(row.quantity_sold || 0), 0)

  return (
    <div className="space-y-6">
      <ReadyDeliveryHeader
        title="Estoque por representante"
        description="Visao operacional do estoque fisico disponivel para pedidos de pronta entrega, separado do estoque geral da empresa."
        actionHref="/admin/orders/pronta-entrega/transferir"
        actionLabel="Transferir estoque"
      />

      <div className="grid gap-3 md:grid-cols-3">
        <ReadyDeliveryStat label="Disponivel com representantes" value={totalAvailable} helper="Saldo pronto para venda presencial" />
        <ReadyDeliveryStat label="Reservado online" value={totalReserved} helper="Reservas temporarias em builders ativos" />
        <ReadyDeliveryStat label="Vendido em pronta entrega" value={totalSold} helper="Baixa automatica acumulada" />
      </div>

      <div className="rounded-lg border border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Saldos por representante</h2>
            <p className="text-xs text-muted-foreground">Controle por variacao e tamanho.</p>
          </div>
          <Boxes className="h-4 w-4 text-muted-foreground" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Representante</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Disponivel</TableHead>
              <TableHead className="text-right">Reservado</TableHead>
              <TableHead className="text-right">Vendido</TableHead>
              <TableHead>Atualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  <PackageOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  Nenhum estoque de pronta entrega transferido ainda.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const representative = getRelation(row.representative)
                const variant = getVariantLabel(row)
                const status = getRepresentativeStockStatus(Number(row.quantity_available || 0))

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{representative?.full_name || 'Sem representante'}</p>
                      <p className="text-xs text-muted-foreground">{representative?.email || '-'}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{variant.title}</p>
                      <p className="text-xs text-muted-foreground">{variant.subtitle || '-'}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={status.tone === 'danger' ? 'destructive' : status.tone === 'warning' ? 'outline' : 'secondary'}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.quantity_reserved}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                        {row.quantity_sold}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.updated_at)}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
