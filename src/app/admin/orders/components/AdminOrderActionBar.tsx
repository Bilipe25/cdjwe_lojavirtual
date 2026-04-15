'use client'

import {
    CheckCircle2,
    Clock3,
    FileText,
    Loader2,
    MoreHorizontal,
    Printer,
    Receipt,
    Route,
    ShieldCheck,
    Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { statusConfig } from '@/app/admin/orders/components/OrderFilters'
import { getAvailableOrderStatusTransitions } from '@/lib/orders/order-status-transition'
import type { OrderStatus } from '@/lib/types'
import type {
    AdminOrderDetailRecord,
    AdminOrderFiscalSummary,
    AdminOrderInvoiceRecord,
    AdminOrderRouteAssignmentRecord,
} from '@/app/admin/orders/hooks/use-admin-order-detail'

interface AdminOrderActionBarProps {
    order: AdminOrderDetailRecord
    invoice: AdminOrderInvoiceRecord | null
    routeAssignment: AdminOrderRouteAssignmentRecord | null
    fiscalSummary: AdminOrderFiscalSummary | null
    loadingMeta?: boolean
    updatingStatus?: boolean
    deleting?: boolean
    onOpenInvoice: () => void
    onOpenFiscalReview: () => void
    onPrint: () => void
    onUpdateStatus: (status: OrderStatus) => void
    onDelete?: () => void
}

function getFiscalBadgeLabel(fiscalSummary: AdminOrderFiscalSummary | null) {
    if (!fiscalSummary?.document_status) return null

    switch (fiscalSummary.document_status) {
        case 'authorized':
            return 'NF-e autorizada'
        case 'denied':
            return 'NF-e rejeitada'
        case 'cancelled':
            return 'NF-e cancelada'
        case 'correction':
            return 'Carta de correcao'
        case 'processing':
            return 'Fiscal processando'
        case 'pending':
            return 'Fiscal pendente'
        default:
            return 'Fiscal'
    }
}

export function AdminOrderActionBar({
    order,
    invoice,
    routeAssignment,
    fiscalSummary,
    loadingMeta = false,
    updatingStatus = false,
    deleting = false,
    onOpenInvoice,
    onOpenFiscalReview,
    onPrint,
    onUpdateStatus,
    onDelete,
}: AdminOrderActionBarProps) {
    const nextTransitions = getAvailableOrderStatusTransitions(order.status)
    const canInvoice = order.status !== 'pending' && order.status !== 'cancelled'
    const hasInvoice = Boolean(invoice)
    const fiscalLabel = getFiscalBadgeLabel(fiscalSummary)

    return (
        <div className="glass-card rounded-2xl border-0 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${statusConfig[order.status].color} border text-xs`}>
                        {statusConfig[order.status].label}
                    </Badge>

                    {hasInvoice ? (
                        <Badge
                            variant="outline"
                            className="gap-1 border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
                        >
                            <CheckCircle2 className="h-3 w-3" />
                            Faturado
                        </Badge>
                    ) : loadingMeta ? (
                        <Badge
                            variant="outline"
                            className="gap-1 border-slate-200 bg-slate-50 text-xs text-slate-600"
                        >
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Validando operacao
                        </Badge>
                    ) : null}

                    {routeAssignment ? (
                        <Badge
                            variant="outline"
                            className="gap-1 border-sky-200 bg-sky-50 text-xs text-sky-700"
                        >
                            <Route className="h-3 w-3" />
                            Em rota
                        </Badge>
                    ) : null}

                    {fiscalLabel ? (
                        <Badge
                            variant="outline"
                            className={`gap-1 text-xs ${
                                fiscalSummary?.document_status === 'authorized'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : fiscalSummary?.document_status === 'denied'
                                      ? 'border-red-200 bg-red-50 text-red-700'
                                      : fiscalSummary?.document_status === 'cancelled'
                                        ? 'border-slate-200 bg-slate-100 text-slate-600'
                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                        >
                            <ShieldCheck className="h-3 w-3" />
                            {fiscalLabel}
                        </Badge>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {canInvoice ? (
                        hasInvoice ? (
                            <Badge
                                variant="outline"
                                className="gap-1 border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
                            >
                                <CheckCircle2 className="h-3 w-3" />
                                Fatura gerada
                            </Badge>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2 rounded-xl border-bronze/25 bg-bronze/5 text-bronze-dark hover:bg-bronze/10"
                                onClick={onOpenInvoice}
                            >
                                <Receipt className="h-4 w-4" />
                                Faturar
                            </Button>
                        )
                    ) : (
                        <Badge
                            variant="outline"
                            className="gap-1 border-amber-200 bg-amber-50 text-xs text-amber-700"
                        >
                            <Clock3 className="h-3 w-3" />
                            Faturamento indisponivel neste status
                        </Badge>
                    )}

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-xl"
                        onClick={onOpenFiscalReview}
                    >
                        <FileText className="h-4 w-4" />
                        Revisao fiscal
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-xl"
                        onClick={onPrint}
                    >
                        <Printer className="h-4 w-4" />
                        Comprovante
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button variant="outline" size="sm" className="gap-2 rounded-xl" />
                            }
                        >
                            <MoreHorizontal className="h-4 w-4" />
                            Acoes
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {nextTransitions.length === 0 ? (
                                <DropdownMenuItem disabled>
                                    Nenhuma transicao disponivel
                                </DropdownMenuItem>
                            ) : (
                                nextTransitions.map((status) => {
                                    const TransitionIcon = statusConfig[status].icon

                                    return (
                                        <DropdownMenuItem
                                            key={status}
                                            disabled={updatingStatus}
                                            onClick={() => onUpdateStatus(status)}
                                        >
                                            {updatingStatus ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <TransitionIcon className="mr-2 h-4 w-4" />
                                            )}
                                            Marcar como {statusConfig[status].label}
                                        </DropdownMenuItem>
                                    )
                                })
                            )}

                            {onDelete ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        disabled={deleting || hasInvoice || Boolean(routeAssignment)}
                                        onClick={onDelete}
                                        className="text-destructive focus:bg-destructive/10"
                                    >
                                        {deleting ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="mr-2 h-4 w-4" />
                                        )}
                                        {hasInvoice
                                            ? 'Exclusao bloqueada por fatura'
                                            : routeAssignment
                                              ? 'Exclusao bloqueada por rota'
                                              : 'Excluir pedido'}
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    )
}
