import Link from 'next/link'
import { Activity, ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRepresentativeStockMovementLabel } from '@/lib/representative-stock'
import { getReadyDeliveryMovements } from '../actions'
import { formatDateTime, getRelation, getVariantLabel, ReadyDeliveryHeader } from '../_components'

export default async function ReadyDeliveryMovementsPage() {
  const rows = await getReadyDeliveryMovements()

  return (
    <div className="space-y-6">
      <ReadyDeliveryHeader
        title="Movimentacoes de estoque"
        description="Historico append-only de transferencias, reservas, vendas, expiracoes e estornos de pronta entrega."
      />

      <div className="rounded-lg border border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Livro de movimentacoes</h2>
            <p className="text-xs text-muted-foreground">Auditoria operacional por representante, pedido e produto.</p>
          </div>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Representante</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Mov.</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Referencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <ArrowUpDown className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  Nenhuma movimentacao registrada.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const representative = getRelation(row.representative)
                const order = getRelation(row.order)
                const variant = getVariantLabel(row)
                const quantity = Number(row.quantity_delta || 0)

                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getRepresentativeStockMovementLabel(row.movement_type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{representative?.full_name || '-'}</p>
                      <p className="text-xs text-muted-foreground">{representative?.email || ''}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{variant.title}</p>
                      <p className="text-xs text-muted-foreground">{variant.subtitle || '-'}</p>
                    </TableCell>
                    <TableCell className={quantity < 0 ? 'text-right font-semibold text-destructive' : 'text-right font-semibold text-emerald-700'}>
                      {quantity > 0 ? '+' : ''}
                      {quantity}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      Disp. {row.quantity_available_after} / Res. {row.quantity_reserved_after} / Vend. {row.quantity_sold_after}
                    </TableCell>
                    <TableCell>
                      {order?.id ? (
                        <Link href={`/admin/orders/${order.id}`} className="text-sm font-medium text-primary hover:underline">
                          {order.order_number}
                        </Link>
                      ) : row.transfer_id ? (
                        <span className="text-sm text-muted-foreground">Transferencia</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
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
