import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const orderStatusLabels: Record<string, string> = {
    pending: 'Em análise',
    approved: 'Aprovado',
    in_production: 'Em produção',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
}

interface CustomerOrdersTabProps {
    orders: any[]
    loading: boolean
}

export function CustomerOrdersTab({ orders, loading }: CustomerOrdersTabProps) {
    if (loading) {
        return <div className="text-center py-10 text-muted-foreground text-sm">Carregando pedidos...</div>
    }

    if (orders.length === 0) {
        return (
            <div className="text-center py-10">
                <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum pedido encontrado</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-lg p-3 border text-sm flex items-center justify-between">
                    <div>
                        <p className="font-semibold text-navy">{order.order_number}</p>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(order.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="font-medium">R$ {Number(order.total).toFixed(2)}</p>
                        <Badge variant="outline" className="text-[10px]">
                            {orderStatusLabels[order.status] || order.status}
                        </Badge>
                    </div>
                </div>
            ))}
        </div>
    )
}
