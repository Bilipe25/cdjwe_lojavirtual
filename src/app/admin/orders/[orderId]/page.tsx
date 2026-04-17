'use client'

import { useEffect, useMemo, useState, type ElementType } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion } from 'framer-motion'
import {
    AlertCircle,
    ArrowLeft,
    Building,
    Clock,
    CreditCard,
    FileText,
    Hash,
    History,
    MapPin,
    Package,
    Receipt,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { buildOrderStatusAuditNote } from '@/lib/orders/order-communication'
import { canTransitionOrderStatus } from '@/lib/orders/order-status-transition'
import type { OrderItem, OrderStatus, SystemSettings } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { statusConfig } from '@/app/admin/orders/components/OrderFilters'
import { FiscalSection } from '@/app/admin/orders/components/FiscalSection'
import { AdminOrderActionBar } from '@/app/admin/orders/components/AdminOrderActionBar'
import { InvoiceOrderModal } from '@/app/admin/financeiro/contas-a-receber/components/InvoiceOrderModal'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { deleteOrderAction } from '@/app/admin/orders/actions'
import { useAdminOrderDetail } from '@/app/admin/orders/hooks/use-admin-order-detail'

function formatCurrency(value: number | null | undefined) {
    return (Number(value || 0)).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    })
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return 'Nao informado'
    return format(new Date(value), "dd 'de' MMMM, yyyy 'as' HH:mm", { locale: ptBR })
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: ElementType
    label: string
    value: string
    tone: string
}) {
    return (
        <Card className="glass-card border-0">
            <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="truncate text-sm font-bold text-foreground">{value}</p>
                </div>
            </CardContent>
        </Card>
    )
}

function DetailRow({
    label,
    value,
    allowWrap = false,
}: {
    label: string
    value: string
    allowWrap?: boolean
}) {
    return (
        <div className="flex items-start justify-between gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">{label}:</span>
            <span
                className={`font-medium text-right ${
                    allowWrap ? 'whitespace-pre-wrap break-words' : 'truncate'
                }`}
            >
                {value}
            </span>
        </div>
    )
}

function ItemDescriptor({ item }: { item: OrderItem }) {
    const descriptors = [item.fabric_name, item.color_name, item.size || item.size_name].filter(Boolean)

    return (
        <div className="space-y-1">
            <p className="font-semibold text-slate-900">{item.product_name}</p>
            <p className="text-xs text-muted-foreground">{descriptors.join(' • ') || 'Sem variacoes registradas'}</p>
        </div>
    )
}

export default function OrderDetailPage() {
    const params = useParams()
    const router = useRouter()
    const orderId = params.orderId as string

    const {
        order,
        history,
        invoice,
        routeAssignment,
        fiscalSummary,
        loading,
        loadingHistory,
        loadingMeta,
        reload,
    } = useAdminOrderDetail({
        orderId,
        enabled: Boolean(orderId),
    })

    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

    useEffect(() => {
        const loadSettings = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('system_settings').select('*').limit(1).single()
            if (data) setSettings(data)
        }

        void loadSettings()
    }, [])

    const customerName =
        order?.customer_profile?.full_name || order?.profile?.full_name || 'Cliente nao informado'
    const representativeName =
        order?.created_by_profile?.full_name ||
        (order?.sales_channel === 'representative'
            ? 'Representante nao informado'
            : 'Portal do cliente')
    const items = order?.items || []
    const couponDiscountAmount = Number(order?.coupon_discount_amount || 0)
    const paymentDiscountAmount = Math.max(0, Number(order?.discount_amount || 0) - couponDiscountAmount)
    const estimatedDeliveryLabel = order?.estimated_delivery
        ? format(new Date(order.estimated_delivery), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        : 'Nao informado'

    const paymentStatusLabel = useMemo(() => {
        switch (order?.payment_status) {
            case 'paid':
                return 'Pago'
            case 'overdue':
                return 'Em atraso'
            case 'cancelled':
                return 'Cancelado'
            case 'pending':
                return 'Pendente'
            default:
                return 'Nao informado'
        }
    }, [order?.payment_status])

    const handlePrint = async () => {
        if (!order) return
        await generateOrderReceiptPDF(order, items, settings)
        toast.success('Comprovante gerado com sucesso.')
    }

    const handleUpdateStatus = async (nextStatus: OrderStatus) => {
        if (!order) return
        if (order.status === nextStatus) return

        if (!canTransitionOrderStatus(order.status, nextStatus)) {
            toast.error('Transicao de status invalida para este pedido.')
            return
        }

        setIsUpdatingStatus(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase.rpc('admin_update_order_status_atomic', {
                p_order_id: order.id,
                p_new_status: nextStatus,
                p_notes: buildOrderStatusAuditNote(nextStatus),
            })

            if (error) {
                toast.error(error.message || 'Erro ao atualizar o pedido.')
                return
            }

            const row = Array.isArray(data) ? data[0] : data

            if (row?.changed && row.client_email) {
                fetch('/api/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'order_status',
                        payload: {
                            orderId: order.id,
                            orderNumber: row.order_number || order.order_number,
                            clientName: row.client_name || customerName,
                            clientEmail: row.client_email,
                            newStatus: nextStatus,
                        },
                    }),
                }).catch(() => {})
            }

            toast.success(`Pedido atualizado para ${statusConfig[nextStatus].label}.`)
            await reload()
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    const handleDelete = async () => {
        if (!order) return
        setIsDeleting(true)
        try {
            const result = await deleteOrderAction(order.id)
            if (result.error) {
                toast.error(result.error)
                return
            }

            toast.success(
                'alreadyDeleted' in result && result.alreadyDeleted
                    ? 'Pedido ja havia sido removido e a tela foi sincronizada.'
                    : 'Pedido excluido com sucesso.'
            )
            router.push('/admin/orders')
        } finally {
            setIsDeleting(false)
            setIsDeleteDialogOpen(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-72" />
                <Skeleton className="h-28 w-full rounded-2xl" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 w-full rounded-2xl" />
                    ))}
                </div>
                <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
        )
    }

    if (!order) {
        return (
            <div className="py-16 text-center">
                <p className="text-muted-foreground">Pedido nao encontrado.</p>
                <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/orders')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar aos pedidos
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6 pb-12">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4"
            >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 rounded-xl hover:bg-navy/5"
                                onClick={() => router.push('/admin/orders')}
                            >
                                <ArrowLeft className="h-5 w-5 text-navy" />
                            </Button>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="truncate font-heading text-2xl font-bold text-gradient-navy md:text-3xl">
                                        {order.order_number}
                                    </h1>
                                    <Badge
                                        variant="outline"
                                        className={`text-xs ${
                                            order.sales_channel === 'representative'
                                                ? 'border-primary/30 bg-primary/5 text-primary'
                                                : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                        }`}
                                    >
                                        {order.sales_channel === 'representative' ? 'Representante' : 'Cliente'}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Criado em {formatDateTime(order.created_at)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <AdminOrderActionBar
                    order={order}
                    invoice={invoice}
                    routeAssignment={routeAssignment}
                    fiscalSummary={fiscalSummary}
                    loadingMeta={loadingMeta}
                    updatingStatus={isUpdatingStatus}
                    deleting={isDeleting}
                    onOpenInvoice={() => setIsInvoiceModalOpen(true)}
                    onOpenFiscalReview={() => {
                        const targetUrl = fiscalSummary?.id
                            ? `/admin/fiscal-review/documentos/${fiscalSummary.id}`
                            : `/admin/fiscal-review/${order.id}`

                        window.open(targetUrl, '_blank', 'noopener,noreferrer')
                    }}
                    onPrint={handlePrint}
                    onUpdateStatus={handleUpdateStatus}
                    onDelete={() => setIsDeleteDialogOpen(true)}
                />

                {invoice ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        Este pedido ja esta faturado na fatura {invoice.invoice_number || invoice.id}. O
                        faturamento financeiro segue no modulo Contas a Receber.
                    </div>
                ) : null}

                {routeAssignment ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                        Este pedido esta vinculado a rota{' '}
                        {routeAssignment.route?.route_number || routeAssignment.route_id}. Operacoes destrutivas
                        devem ser feitas somente apos remover a parada na logistica.
                    </div>
                ) : null}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="grid grid-cols-2 gap-3 md:grid-cols-4"
            >
                <SummaryCard icon={Package} label="Itens" value={String(items.length)} tone="bg-blue-50 text-blue-600" />
                <SummaryCard
                    icon={CreditCard}
                    label="Subtotal"
                    value={formatCurrency(order.subtotal)}
                    tone="bg-emerald-50 text-emerald-600"
                />
                <SummaryCard
                    icon={AlertCircle}
                    label="Desconto"
                    value={formatCurrency(order.discount_amount)}
                    tone="bg-amber-50 text-amber-600"
                />
                <SummaryCard
                    icon={Hash}
                    label="Total"
                    value={formatCurrency(order.total)}
                    tone="bg-navy/5 text-navy"
                />
            </motion.div>

            <Tabs defaultValue="details" className="space-y-4">
                <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="details" className="gap-1.5">
                        <Building className="h-3.5 w-3.5" />
                        Detalhes
                    </TabsTrigger>
                    <TabsTrigger value="items" className="gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        Itens
                    </TabsTrigger>
                    <TabsTrigger value="fiscal" className="gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Fiscal
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-1.5">
                        <History className="h-3.5 w-3.5" />
                        Historico
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-4">
                            <Card className="glass-card border-0">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Building className="h-4 w-4 text-bronze" />
                                        Contexto comercial
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <DetailRow label="Empresa" value={order.store?.company_name || 'Nao informada'} />
                                    <DetailRow label="CNPJ" value={order.store?.cnpj || 'Nao informado'} />
                                    <DetailRow label="Cliente" value={customerName} />
                                    <DetailRow label="Canal" value={order.sales_channel === 'representative' ? 'Representante' : 'Portal do cliente'} />
                                    {order.sales_channel === 'representative' ? (
                                        <DetailRow label="Representante" value={representativeName} />
                                    ) : null}
                                    <DetailRow label="Atualizado em" value={formatDateTime(order.updated_at || order.created_at)} />
                                </CardContent>
                            </Card>

                            <Card className="glass-card border-0">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <MapPin className="h-4 w-4 text-bronze" />
                                        Entrega e observacoes
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <DetailRow label="Entrega estimada" value={estimatedDeliveryLabel} />
                                    <DetailRow label="Endereco" value={order.shipping_address || 'Nao informado'} allowWrap />
                                    <Separator />
                                    <DetailRow label="Observacoes" value={order.notes || 'Sem observacoes registradas'} allowWrap />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-4">
                            <OrderPaymentSummaryCard order={order} />

                            <Card className="glass-card border-0">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Receipt className="h-4 w-4 text-bronze" />
                                        Visao financeira
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <DetailRow label="Status do pagamento" value={paymentStatusLabel} />
                                    <DetailRow label="Meio" value={order.payment_method_name || 'Nao informado'} />
                                    <DetailRow label="Condicao" value={order.payment_condition_name || order.payment_condition?.name || 'Nao informada'} />
                                    <DetailRow label="Parcelas" value={String(order.payment_installments || order.payment_condition?.installments || 1)} />
                                    <Separator />
                                    <DetailRow label="Subtotal" value={formatCurrency(order.subtotal)} />
                                    <DetailRow label="Desconto via cupom" value={formatCurrency(couponDiscountAmount)} />
                                    <DetailRow label="Desconto por pagamento" value={formatCurrency(paymentDiscountAmount)} />
                                    <DetailRow label="Desconto total" value={formatCurrency(order.discount_amount)} />
                                    <DetailRow label="Total final" value={formatCurrency(order.total)} />
                                </CardContent>
                            </Card>

                            <Card className="glass-card border-0">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Clock className="h-4 w-4 text-bronze" />
                                        Estado operacional
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3 text-sm">
                                    <DetailRow label="Status do pedido" value={statusConfig[order.status].label} />
                                    <DetailRow label="Faturamento" value={invoice ? `Fatura ${invoice.invoice_number || invoice.id}` : 'Nao faturado'} />
                                    <DetailRow label="Logistica" value={routeAssignment ? `Em rota ${routeAssignment.route?.route_number || routeAssignment.route_id}` : 'Sem rota ativa'} />
                                    <DetailRow
                                        label="Fiscal"
                                        value={
                                            fiscalSummary?.numero_nf
                                                ? `NF ${fiscalSummary.numero_nf}`
                                                : fiscalSummary?.document_status || 'Sem documento'
                                        }
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="items" className="space-y-4">
                    <Card className="glass-card border-0">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Package className="h-4 w-4 text-bronze" />
                                Itens do pedido
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {items.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center text-sm text-muted-foreground">
                                    Este pedido nao possui itens registrados.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Produto</TableHead>
                                                <TableHead className="text-center">Qtd.</TableHead>
                                                <TableHead className="text-right">Unitario</TableHead>
                                                <TableHead className="text-right">Subtotal</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {items.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <ItemDescriptor item={item} />
                                                    </TableCell>
                                                    <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                                                    <TableCell className="text-right font-semibold">
                                                        {formatCurrency(item.unit_price * item.quantity)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="fiscal" className="space-y-4">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        O faturamento financeiro e a emissao fiscal sao fluxos distintos. Use o botao <strong>Faturar</strong>{' '}
                        no topo para gerar a fatura financeira e esta aba para acompanhar NF-e, DANFE e eventos fiscais.
                    </div>
                    <FiscalSection orderId={order.id} orderStatus={order.status} />
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                    <Card className="glass-card border-0">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <History className="h-4 w-4 text-bronze" />
                                Historico operacional
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingHistory ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 4 }).map((_, index) => (
                                        <Skeleton key={index} className="h-20 rounded-xl" />
                                    ))}
                                </div>
                            ) : history.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center text-sm text-muted-foreground">
                                    Nenhum evento de historico foi encontrado para este pedido.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {history.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="rounded-xl border border-slate-200/70 bg-white/80 p-4"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="space-y-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={`${statusConfig[entry.status as OrderStatus]?.color || 'border-slate-200 bg-slate-50 text-slate-700'} text-xs`}
                                                    >
                                                        {statusConfig[entry.status as OrderStatus]?.label || entry.status}
                                                    </Badge>
                                                    <p className="text-sm text-slate-700">
                                                        {entry.notes || 'Atualizacao de status sem observacoes adicionais.'}
                                                    </p>
                                                </div>
                                                <div className="text-sm text-muted-foreground sm:text-right">
                                                    <p>{entry.profile?.full_name || 'Sistema'}</p>
                                                    <p>{formatDateTime(entry.created_at)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <InvoiceOrderModal
                order={{
                    id: order.id,
                    order_number: order.order_number,
                    total: order.total,
                    payment_method_id: order.payment_method_id,
                    payment_method_name: order.payment_method_name,
                    payment_condition_id: order.payment_condition_id,
                    payment_condition_name: order.payment_condition_name || order.payment_condition?.name || null,
                    payment_installments: order.payment_installments || order.payment_condition?.installments || null,
                    store: order.store || null,
                }}
                open={isInvoiceModalOpen}
                onOpenChange={setIsInvoiceModalOpen}
                onSuccess={() => {
                    setIsInvoiceModalOpen(false)
                    void reload()
                }}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="rounded-2xl border-0 shadow-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acao remove o pedido, seus itens e o historico associado. Se houver fatura
                            vinculada ou rota ativa, a exclusao sera bloqueada automaticamente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Excluindo...' : 'Excluir pedido'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
