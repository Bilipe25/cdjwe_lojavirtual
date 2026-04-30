import { CalendarCheck2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getReadyDeliveryClosings } from '../actions'
import { formatDateTime, formatMoney, getRelation, ReadyDeliveryHeader, ReadyDeliveryStat } from '../_components'

function getClosingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: 'Aberto',
    submitted: 'Enviado',
    approved: 'Aprovado',
    reopened: 'Reaberto',
    cancelled: 'Cancelado',
  }

  return labels[status] || status
}

export default async function ReadyDeliveryClosingsPage() {
  const rows = await getReadyDeliveryClosings()
  const totalGross = rows.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0)
  const submittedCount = rows.filter((row) => row.status === 'submitted').length

  return (
    <div className="space-y-6">
      <ReadyDeliveryHeader
        title="Fechamento por representante"
        description="Concilie pedidos de pronta entrega por dia, quantidade de itens, valor recebido e status do fechamento."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <ReadyDeliveryStat label="Fechamentos registrados" value={rows.length} />
        <ReadyDeliveryStat label="Valor fechado" value={formatMoney(totalGross)} />
        <ReadyDeliveryStat label="Pendentes de aprovacao" value={submittedCount} />
      </div>

      <div className="rounded-lg border border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Fechamentos</h2>
            <p className="text-xs text-muted-foreground">Resumo diario enviado pelos representantes.</p>
          </div>
          <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Representante</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Envio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum fechamento de pronta entrega enviado.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const representative = getRelation(row.representative)

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.closing_number}</TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{representative?.full_name || '-'}</p>
                      <p className="text-xs text-muted-foreground">{row.route_label || 'Sem rota informada'}</p>
                    </TableCell>
                    <TableCell>{new Date(row.business_date).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">{row.orders_count}</TableCell>
                    <TableCell className="text-right">{row.items_count}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(row.gross_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'approved' ? 'secondary' : 'outline'}>
                        {getClosingStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.submitted_at)}</TableCell>
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
