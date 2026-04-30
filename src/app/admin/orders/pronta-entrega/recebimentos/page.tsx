import Link from 'next/link'
import { ReceiptText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getReadyDeliveryReceipts } from '../actions'
import { formatDateTime, formatMoney, getRelation, ReadyDeliveryHeader, ReadyDeliveryStat } from '../_components'

export default async function ReadyDeliveryReceiptsPage() {
  const rows = await getReadyDeliveryReceipts()
  const total = rows.reduce((sum, row) => {
    const order = getRelation(row.order)
    return sum + Number(order?.total || 0)
  }, 0)
  const paidCount = rows.filter((row) => getRelation(row.order)?.payment_status === 'paid').length

  return (
    <div className="space-y-6">
      <ReadyDeliveryHeader
        title="Relatorio de recebimentos"
        description="Acompanhe recibos emitidos em pedidos de pronta entrega, valores e status financeiro do pedido."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <ReadyDeliveryStat label="Recibos emitidos" value={rows.length} />
        <ReadyDeliveryStat label="Valor em pronta entrega" value={formatMoney(total)} />
        <ReadyDeliveryStat label="Pedidos pagos" value={paidCount} helper="Baseado no status financeiro do pedido" />
      </div>

      <div className="rounded-lg border border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recibos</h2>
            <p className="text-xs text-muted-foreground">Comprovantes gerados automaticamente para pronta entrega.</p>
          </div>
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recibo</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Representante</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Emissao</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum recibo de pronta entrega emitido.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const order = getRelation(row.order)
                const store = getRelation(order?.store)
                const representative = getRelation(row.representative)

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold text-foreground">{row.receipt_number}</TableCell>
                    <TableCell>
                      {order?.id ? (
                        <Link href={`/admin/orders/${order.id}`} className="font-medium text-primary hover:underline">
                          {order.order_number}
                        </Link>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{store?.trade_name || store?.company_name || '-'}</TableCell>
                    <TableCell>{representative?.full_name || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(order?.total)}</TableCell>
                    <TableCell>
                      <Badge variant={order?.payment_status === 'paid' ? 'secondary' : 'outline'}>
                        {order?.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.issued_at)}</TableCell>
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
