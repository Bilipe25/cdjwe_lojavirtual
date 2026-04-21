import React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
    MoreHorizontal,
    Eye,
    XCircle,
    CheckSquare,
    Square,
    ClipboardList,
    Trash2,
    AlertCircle,
    Loader2,
    FileText,
    ShieldCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { statusConfig } from './OrderFilters'
import type { OrderStatus } from '@/lib/types'
import { getAvailableOrderStatusTransitions } from '@/lib/orders/order-status-transition'

export interface OrderWithDetails {
    id: string
    order_number: string
    status: OrderStatus
    total: number
    subtotal: number
    discount_amount: number
    created_at: string
    notes: string | null
    store?: { company_name: string; cnpj: string }
    profile?: { full_name: string }
    customer_profile?: { full_name: string } | null
    created_by_profile?: { full_name: string; role?: string } | null
    payment_condition?: { name: string }
    item_count?: number
    sales_channel?: 'customer_portal' | 'representative'
    fiscal_status?: string | null
    has_invoice?: boolean
    archived_at?: string | null
    archive_reason?: string | null
}

interface OrderListProps {
    orders: OrderWithDetails[]
    loading: boolean
    deletingOrderIds: string[]
    hardDeletingOrderIds: string[]
    selectedOrders: string[]
    onToggleSelect: (id: string) => void
    onViewDetail?: (order: OrderWithDetails) => void
    onUpdateStatus: (id: string, newStatus: OrderStatus) => void
    onDelete?: (id: string) => Promise<boolean> | boolean
    onHardDeleteArchived?: (id: string) => Promise<boolean> | boolean
}

export function OrderList({
    orders,
    loading,
    deletingOrderIds,
    hardDeletingOrderIds,
    selectedOrders,
    onToggleSelect,
    onUpdateStatus,
    onDelete,
    onHardDeleteArchived,
}: OrderListProps) {
    const router = useRouter()
    const [orderToDelete, setOrderToDelete] = React.useState<string | null>(null)
    const [orderToHardDelete, setOrderToHardDelete] = React.useState<string | null>(null)
    const [hardDeleteConfirmed, setHardDeleteConfirmed] = React.useState(false)
    const pendingRemovalOrder = orders.find((order) => order.id === orderToDelete) || null
    const pendingHardDeleteOrder = orders.find((order) => order.id === orderToHardDelete) || null

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="glass-card border-0">
                        <CardContent className="flex items-center gap-4 p-4">
                            <Skeleton className="h-6 w-6 rounded" />
                            <Skeleton className="h-10 w-10 rounded-lg" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-1/3" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                            <Skeleton className="h-8 w-24" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (orders.length === 0) {
        return (
            <div className="rounded-xl border border-white/20 bg-white/40 py-16 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <ClipboardList className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Nao existem pedidos que correspondam aos filtros atuais.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {orders.map((order, i) => {
                const config = statusConfig[order.status]
                const isSelected = selectedOrders.includes(order.id)
                const nextTransitions = getAvailableOrderStatusTransitions(order.status)
                const itemCount = Number(order.item_count || 0)
                const isRepresentativeOrder = order.sales_channel === 'representative'
                const customerName =
                    order.customer_profile?.full_name || order.profile?.full_name || 'Cliente nao informado'
                const representativeName =
                    order.created_by_profile?.full_name || 'Representante nao informado'
                const isDeleting = deletingOrderIds.includes(order.id)
                const isHardDeleting = hardDeletingOrderIds.includes(order.id)
                const isArchived = Boolean(order.archived_at)
                const hasFiscalDocument = Boolean(order.fiscal_status && order.fiscal_status !== 'none')
                const removalLabel = isArchived ? 'Pedido arquivado' : hasFiscalDocument ? 'Arquivar pedido' : 'Excluir pedido'

                return (
                    <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    >
                        <Card
                            className={`glass-card cursor-pointer border-0 transition-all hover:shadow-md ${
                                isSelected ? 'bg-bronze/5 ring-2 ring-bronze' : ''
                            } ${order.status === 'cancelled' ? 'grayscale-[0.5] opacity-70' : ''} ${isArchived ? 'border border-slate-200/70 bg-slate-50/80 opacity-85' : ''}`}
                            onClick={() => router.push(`/admin/orders/${order.id}`)}
                        >
                            <CardContent className="p-0">
                                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                                    <div className="flex shrink-0 items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onToggleSelect(order.id)
                                            }}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm transition-colors hover:bg-gray-50"
                                        >
                                            {isSelected ? (
                                                <CheckSquare className="h-5 w-5 text-bronze" />
                                            ) : (
                                                <Square className="h-5 w-5 text-muted-foreground/50" />
                                            )}
                                        </button>
                                        <div
                                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${config.color}`}
                                        >
                                            <config.icon className="h-5 w-5" />
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                            <h3
                                                className="truncate font-bold text-navy"
                                                title={order.order_number}
                                            >
                                                {order.order_number}
                                            </h3>
                                            <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                                                {config.label}
                                            </Badge>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ${
                                                    isRepresentativeOrder
                                                        ? 'border-primary/30 bg-primary/5 text-primary'
                                                        : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                }`}
                                            >
                                                {isRepresentativeOrder ? 'Canal: Representante' : 'Canal: Cliente'}
                                            </Badge>
                                            {order.has_invoice ? (
                                                <Badge
                                                    variant="outline"
                                                    className="gap-1 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700"
                                                >
                                                    <FileText className="h-3 w-3" />
                                                    Faturado
                                                </Badge>
                                            ) : null}
                                            {isArchived ? (
                                                <Badge
                                                    variant="outline"
                                                    className="gap-1 border-slate-300 bg-slate-100 text-[10px] text-slate-700"
                                                >
                                                    Arquivado
                                                </Badge>
                                            ) : null}
                                            {order.fiscal_status && order.fiscal_status !== 'none' ? (
                                                <Badge
                                                    variant="outline"
                                                    className={`gap-1 text-[10px] ${
                                                        order.fiscal_status === 'authorized'
                                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                            : order.fiscal_status === 'denied' ||
                                                                order.fiscal_status === 'error'
                                                              ? 'border-red-300 bg-red-50 text-red-700'
                                                              : order.fiscal_status === 'cancelled'
                                                                ? 'border-slate-300 bg-slate-100 text-slate-500'
                                                                : order.fiscal_status === 'correction'
                                                                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                                                                  : 'border-blue-300 bg-blue-50 text-blue-700'
                                                    }`}
                                                >
                                                    {order.fiscal_status === 'authorized' ? (
                                                        <ShieldCheck className="h-3 w-3" />
                                                    ) : null}
                                                    {order.fiscal_status === 'authorized'
                                                        ? 'NF-e'
                                                        : order.fiscal_status === 'denied'
                                                          ? 'NF-e Rejeitada'
                                                          : order.fiscal_status === 'cancelled'
                                                            ? 'NF-e Cancelada'
                                                            : order.fiscal_status === 'correction'
                                                              ? 'CC-e'
                                                              : order.fiscal_status === 'pending' ||
                                                                  order.fiscal_status === 'processing'
                                                                ? 'NF-e Pendente'
                                                                : 'NF-e'}
                                                </Badge>
                                            ) : null}
                                        </div>

                                        <div className="flex flex-col gap-1 truncate text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                                            <span
                                                className="max-w-[200px] truncate font-medium text-slate-700"
                                                title={order.store?.company_name}
                                            >
                                                {order.store?.company_name || 'Sem empresa'}
                                            </span>
                                            <span className="hidden sm:inline">•</span>
                                            <span className="max-w-[180px] truncate" title={customerName}>
                                                Cliente: {customerName}
                                            </span>
                                            {isRepresentativeOrder ? (
                                                <>
                                                    <span className="hidden sm:inline">•</span>
                                                    <span className="max-w-[180px] truncate" title={representativeName}>
                                                        Rep: {representativeName}
                                                    </span>
                                                </>
                                            ) : null}
                                            <span className="hidden sm:inline">•</span>
                                            <span>
                                                {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', {
                                                    locale: ptBR,
                                                })}
                                            </span>
                                        </div>

                                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="max-w-[150px] truncate rounded bg-muted px-1.5 py-0.5">
                                                {order.payment_condition?.name || 'Condicao N/A'}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                                            </span>
                                            {itemCount === 0 ? (
                                                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                                                    sem itens
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-2 flex shrink-0 items-center justify-between gap-4 border-t pt-2 sm:mt-0 sm:justify-end sm:border-0 sm:pt-0">
                                        <span className="text-lg font-bold text-gradient-bronze">
                                            R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-navy"
                                                        />
                                                    }
                                                >
                                                    <MoreHorizontal className="h-5 w-5" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onClick={() => router.push(`/admin/orders/${order.id}`)}>
                                                        <Eye className="mr-2 h-4 w-4" />
                                                        Ver detalhes
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            window.open(`/admin/fiscal-review/${order.id}`, '_blank')
                                                        }
                                                    >
                                                        <FileText className="mr-2 h-4 w-4" />
                                                        Revisao fiscal
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />

                                                    {nextTransitions.map((status) => {
                                                        if (status === 'cancelled') return null
                                                        const FlowIcon = statusConfig[status].icon
                                                        return (
                                                            <DropdownMenuItem
                                                                key={status}
                                                                onClick={() => onUpdateStatus(order.id, status)}
                                                            >
                                                                <FlowIcon className="mr-2 h-4 w-4" />
                                                                Marcar como {statusConfig[status].label}
                                                            </DropdownMenuItem>
                                                        )
                                                    })}

                                                    {nextTransitions.includes('cancelled') ? (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => onUpdateStatus(order.id, 'cancelled')}
                                                                className="text-amber-600 focus:bg-amber-50"
                                                            >
                                                                <XCircle className="mr-2 h-4 w-4" />
                                                                Cancelar pedido
                                                            </DropdownMenuItem>
                                                        </>
                                                    ) : null}

                                                    {onDelete ? (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => setOrderToDelete(order.id)}
                                                                disabled={isDeleting || isArchived}
                                                                className="text-destructive focus:bg-destructive/10"
                                                            >
                                                                {isDeleting ? (
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                )}
                                                                {removalLabel}
                                                            </DropdownMenuItem>
                                                            {isArchived && onHardDeleteArchived ? (
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setHardDeleteConfirmed(false)
                                                                        setOrderToHardDelete(order.id)
                                                                    }}
                                                                    disabled={isHardDeleting}
                                                                    className="text-destructive focus:bg-destructive/10"
                                                                >
                                                                    {isHardDeleting ? (
                                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                                    )}
                                                                    Hard delete definitivo
                                                                </DropdownMenuItem>
                                                            ) : null}
                                                        </>
                                                    ) : null}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )
            })}

            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent className="w-[95vw] max-w-md rounded-2xl border-0 shadow-2xl">
                    <AlertDialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <AlertDialogTitle className="text-center text-xl">
                            {pendingRemovalOrder?.archived_at
                                ? 'Pedido arquivado'
                                : pendingRemovalOrder?.fiscal_status && pendingRemovalOrder.fiscal_status !== 'none'
                                  ? 'Arquivar pedido?'
                                  : 'Excluir pedido?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center text-balance">
                            {pendingRemovalOrder?.archived_at
                                ? 'Este pedido ja esta arquivado para preservar o historico fiscal e nao pode ser excluido novamente por esta tela.'
                                : pendingRemovalOrder?.fiscal_status && pendingRemovalOrder.fiscal_status !== 'none'
                                  ? 'Este pedido possui documento fiscal vinculado. A acao ira arquivar o pedido e preservar a NF-e, os itens e o historico fiscal.'
                                  : 'Esta acao e permanente e removera todos os dados do pedido, itens e historico de status. Deseja continuar?'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4 flex-row gap-3 sm:gap-0">
                        <AlertDialogCancel className="mt-0 flex-1 rounded-xl border-navy/10 hover:bg-navy/5">
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (orderToDelete) {
                                    const success = await onDelete?.(orderToDelete)
                                    if (success) {
                                        setOrderToDelete(null)
                                    }
                                }
                            }}
                            disabled={Boolean(
                                (orderToDelete && deletingOrderIds.includes(orderToDelete)) ||
                                pendingRemovalOrder?.archived_at
                            )}
                            className="flex-1 rounded-xl bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:bg-destructive/90"
                        >
                            {orderToDelete && deletingOrderIds.includes(orderToDelete) ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {pendingRemovalOrder?.fiscal_status && pendingRemovalOrder.fiscal_status !== 'none'
                                        ? 'Arquivando...'
                                        : 'Excluindo...'}
                                </>
                            ) : pendingRemovalOrder?.archived_at ? (
                                'Pedido arquivado'
                            ) : pendingRemovalOrder?.fiscal_status && pendingRemovalOrder.fiscal_status !== 'none' ? (
                                'Arquivar pedido'
                            ) : (
                                'Excluir agora'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={!!orderToHardDelete}
                onOpenChange={(open) => {
                    if (!open) {
                        setOrderToHardDelete(null)
                        setHardDeleteConfirmed(false)
                    }
                }}
            >
                <AlertDialogContent className="w-[95vw] max-w-lg rounded-2xl border-0 shadow-2xl">
                    <AlertDialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <AlertDialogTitle className="text-center text-xl">Hard delete definitivo?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3 text-left text-balance">
                            <p>
                                Esta acao apaga definitivamente o pedido{' '}
                                <strong>{pendingHardDeleteOrder?.order_number || 'selecionado'}</strong>, incluindo NF-e,
                                eventos fiscais e arquivos DANFE/XML do storage.
                            </p>
                            <p>Depois da confirmacao, nao sera possivel recuperar esse conteudo.</p>
                            <label className="mt-2 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-foreground">
                                <Checkbox
                                    checked={hardDeleteConfirmed}
                                    onCheckedChange={(checked) => setHardDeleteConfirmed(checked === true)}
                                    className="mt-0.5"
                                />
                                <span>Entendo que esta acao e irreversivel.</span>
                            </label>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4 flex-row gap-3 sm:gap-0">
                        <AlertDialogCancel className="mt-0 flex-1 rounded-xl border-navy/10 hover:bg-navy/5">
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (orderToHardDelete) {
                                    const success = await onHardDeleteArchived?.(orderToHardDelete)
                                    if (success) {
                                        setOrderToHardDelete(null)
                                        setHardDeleteConfirmed(false)
                                    }
                                }
                            }}
                            disabled={Boolean(
                                !hardDeleteConfirmed ||
                                (orderToHardDelete && hardDeletingOrderIds.includes(orderToHardDelete))
                            )}
                            className="flex-1 rounded-xl bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:bg-destructive/90"
                        >
                            {orderToHardDelete && hardDeletingOrderIds.includes(orderToHardDelete) ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Apagando definitivamente...
                                </>
                            ) : (
                                'Apagar definitivamente'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
