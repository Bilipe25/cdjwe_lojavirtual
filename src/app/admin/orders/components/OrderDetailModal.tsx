import React, { useCallback, useEffect, useState } from 'react'
import { FiscalSection } from './FiscalSection'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Building, User, Clock, History, Printer, Loader2, Trash2, AlertCircle, Receipt, CheckCircle2 } from 'lucide-react'
import { statusConfig } from './OrderFilters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { OrderItemPriceDetails } from '@/components/orders/order-item-price-details'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'
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
import type { OrderStatus, OrderItem, SystemSettings } from '@/lib/types'
import { InvoiceOrderModal } from '@/app/admin/financeiro/contas-a-receber/components/InvoiceOrderModal'

type AdminOrderHistoryRecord = {
    id: string
    status: string
    created_at: string
    changed_by: string
    notes?: string | null
    profile?: {
        full_name?: string | null
    } | null
}

export interface AdminOrderDetailRecord {
    id: string
    order_number: string
    status: OrderStatus
    total: number
    subtotal: number
    discount_amount: number
    coupon_code?: string | null
    coupon_discount_type?: 'percentage' | 'fixed' | null
    coupon_discount_value?: number | null
    coupon_discount_amount?: number | null
    created_at: string
    notes: string | null
    store?: {
        company_name?: string | null
        cnpj?: string | null
    } | null
    sales_channel?: 'customer_portal' | 'representative' | null
    profile?: {
        full_name?: string | null
    } | null
    customer_profile?: {
        full_name?: string | null
        role?: string | null
    } | null
    created_by_profile?: {
        full_name?: string | null
        role?: string | null
    } | null
    payment_method_name?: string | null
    payment_method_code?: string | null
    payment_condition_name?: string | null
    payment_condition_description?: string | null
    payment_installments?: number | null
    payment_discount_percentage?: number | null
    payment_surcharge_percentage?: number | null
    payment_condition?: {
        name?: string | null
        description?: string | null
        installments?: number | null
        discount_percentage?: number | null
        surcharge_percentage?: number | null
    } | null
    items?: OrderItem[]
    archived_at?: string | null
    archive_reason?: string | null
    fiscal_status?: string | null
}

interface OrderDetailModalProps {
    order: AdminOrderDetailRecord | null
    open: boolean
    onOpenChange: (open: boolean) => void
    deletingOrderIds: string[]
    onDelete?: (id: string) => Promise<boolean> | boolean
}

type OrderRouteAssignmentRecord = {
    id: string
    route_id: string
    route?: {
        route_number?: string | null
        status?: string | null
        is_deleted?: boolean | null
    } | null
}

export function OrderDetailModal({
    order,
    open,
    onOpenChange,
    deletingOrderIds,
    onDelete
}: OrderDetailModalProps) {
    const [orderData, setOrderData] = useState<AdminOrderDetailRecord | null>(null)
    const [loadingOrder, setLoadingOrder] = useState(false)
    const [history, setHistory] = useState<AdminOrderHistoryRecord[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [isPrinting, setIsPrinting] = useState(false)
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
    const [hasInvoice, setHasInvoice] = useState(false)
    const [checkingInvoice, setCheckingInvoice] = useState(false)
    const [hasFiscalDocument, setHasFiscalDocument] = useState(false)
    const [checkingFiscalDocument, setCheckingFiscalDocument] = useState(false)
    const [routeAssignment, setRouteAssignment] = useState<OrderRouteAssignmentRecord | null>(null)
    const [checkingRouteAssignment, setCheckingRouteAssignment] = useState(false)

    const fetchOrderDetail = useCallback(async (orderId: string) => {
        setLoadingOrder(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                status,
                total,
                subtotal,
                discount_amount,
                coupon_code,
                coupon_discount_type,
                coupon_discount_value,
                coupon_discount_amount,
                created_at,
                notes,
                sales_channel,
                payment_method_name,
                payment_method_code,
                payment_condition_name,
                payment_condition_description,
                payment_installments,
                payment_discount_percentage,
                payment_surcharge_percentage,
                archived_at,
                archive_reason,
                store:stores(company_name, cnpj),
                customer_profile:profiles!orders_profile_id_fkey(full_name, role),
                created_by_profile:profiles!orders_created_by_profile_id_fkey(full_name, role),
                payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage),
                items:order_items(*)
            `)
            .eq('id', orderId)
            .single()

        if (error || !data) {
            console.error('[ADMIN ORDERS] Falha ao carregar detalhes do pedido:', error)
            setOrderData(order)
            setLoadingOrder(false)
            return
        }

        const resolved = data as AdminOrderDetailRecord
        if (!Array.isArray(resolved.items) || resolved.items.length === 0) {
            const { data: fallbackItems, error: fallbackItemsError } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId)
                .order('created_at')

            if (!fallbackItemsError && fallbackItems) {
                resolved.items = fallbackItems as OrderItem[]
            } else if (fallbackItemsError) {
                console.error('[ADMIN ORDERS] Falha ao carregar itens do pedido:', fallbackItemsError)
            }
        }

        setOrderData(resolved)
        setLoadingOrder(false)
    }, [order])

    const fetchSettings = async () => {
        const supabase = createClient()
        const { data } = await supabase.from('system_settings').select('*').limit(1).single()
        if (data) setSettings(data)
    }

    const fetchHistory = async (orderId: string) => {
        setLoadingHistory(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('order_status_history')
            .select(`
                id, 
                status, 
                created_at, 
                changed_by,
                profile:profiles!changed_by(full_name)
            `)
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })

        if (!error && data) {
            setHistory(data as AdminOrderHistoryRecord[])
        }
        setLoadingHistory(false)
    }

    const checkInvoiceExists = useCallback(async (orderId: string) => {
        setCheckingInvoice(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('invoices')
            .select('id')
            .eq('order_id', orderId)
            .limit(1)

        if (error) {
            console.error('[ADMIN ORDERS] Falha ao verificar fatura do pedido:', error)
            setHasInvoice(false)
            setCheckingInvoice(false)
            return
        }

        setHasInvoice((data?.length ?? 0) > 0)
        setCheckingInvoice(false)
    }, [])

    const checkFiscalDocumentExists = useCallback(async (orderId: string) => {
        setCheckingFiscalDocument(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('fiscal_documents')
            .select('id')
            .eq('order_id', orderId)
            .limit(1)
            .maybeSingle()

        if (error) {
            console.error('[ADMIN ORDERS] Falha ao verificar documento fiscal do pedido:', error)
            setHasFiscalDocument(false)
            setCheckingFiscalDocument(false)
            return
        }

        setHasFiscalDocument(Boolean(data?.id))
        setCheckingFiscalDocument(false)
    }, [])

    const checkRouteAssignment = useCallback(async (orderId: string) => {
        setCheckingRouteAssignment(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('delivery_route_stops')
            .select('id, route_id, route:delivery_routes(route_number, status, is_deleted)')
            .eq('order_id', orderId)
            .limit(20)

        if (error) {
            console.error('[ADMIN ORDERS] Falha ao verificar roteirizacao do pedido:', error)
            setRouteAssignment(null)
            setCheckingRouteAssignment(false)
            return
        }

        const assignments = (Array.isArray(data) ? data : []) as OrderRouteAssignmentRecord[]
        const activeAssignment = assignments.find((assignment) => !assignment.route?.is_deleted) || null

        setRouteAssignment(activeAssignment)
        setCheckingRouteAssignment(false)
    }, [])

    useEffect(() => {
        if (open && order?.id) {
            fetchOrderDetail(order.id)
            fetchHistory(order.id)
            fetchSettings()
            checkInvoiceExists(order.id)
            checkFiscalDocumentExists(order.id)
            checkRouteAssignment(order.id)
        } else {
            setOrderData(null)
            setHistory([])
            setHasInvoice(false)
            setCheckingInvoice(false)
            setHasFiscalDocument(false)
            setCheckingFiscalDocument(false)
            setRouteAssignment(null)
            setCheckingRouteAssignment(false)
        }
    }, [open, order?.id, fetchOrderDetail, checkInvoiceExists, checkFiscalDocumentExists, checkRouteAssignment])

    const handlePrint = async () => {
        if (!orderData) return
        setIsPrinting(true)
        try {
            await generateOrderReceiptPDF(orderData, orderData.items || [], settings)
        } finally {
            setIsPrinting(false)
        }
    }

    if (!order) return null;
    const resolvedOrder = orderData || order
    const isRepresentativeOrder = resolvedOrder.sales_channel === 'representative'
    const customerName = resolvedOrder.customer_profile?.full_name || resolvedOrder.profile?.full_name || 'N/A'
    const representativeName = resolvedOrder.created_by_profile?.full_name || (isRepresentativeOrder ? 'Nao informado' : 'Portal do cliente')
    const itemCount = resolvedOrder.items?.length || 0
    const couponDiscountAmount = Number(resolvedOrder.coupon_discount_amount || 0)
    const paymentDiscountAmount = Math.max(0, Number(resolvedOrder.discount_amount || 0) - couponDiscountAmount)
    const isDeleting = deletingOrderIds.includes(resolvedOrder.id)
    const isArchived = Boolean(resolvedOrder.archived_at)
    const cannotDeleteBecauseInvoice = hasInvoice || checkingInvoice
    const cannotDeleteBecauseRoute = Boolean(routeAssignment) || checkingRouteAssignment
    const cannotDelete = cannotDeleteBecauseInvoice || cannotDeleteBecauseRoute || isArchived
    const willArchive = hasFiscalDocument || checkingFiscalDocument

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-full! sm:max-w-[90vw]! md:max-w-3xl! w-full sm:w-[90vw]! h-dvh sm:h-[85vh] md:max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-0 sm:border rounded-none sm:rounded-xl">
                <DialogHeader className="p-4 md:p-6 pb-4 border-b bg-muted/20 sticky top-0 z-10 backdrop-blur-sm shrink-0">
                    <div className="flex items-center justify-between pr-8 sm:pr-4">
                        <div className="min-w-0 pr-2 flex-1">
                            <DialogTitle className="text-xl md:text-2xl font-(family-name:--font-heading) flex flex-wrap items-center gap-2 sm:gap-3">
                                <span className="truncate">Pedido {resolvedOrder.order_number}</span>
                                <Badge className={`${statusConfig[resolvedOrder.status as keyof typeof statusConfig]?.color} border text-[10px] sm:text-xs`}>
                                    {statusConfig[resolvedOrder.status as keyof typeof statusConfig]?.label}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] sm:text-xs ${isRepresentativeOrder ? 'border-primary/30 bg-primary/5 text-primary' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}
                                >
                                    {isRepresentativeOrder ? 'Representante' : 'Cliente'}
                                </Badge>
                            </DialogTitle>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                                {format(new Date(resolvedOrder.created_at), "dd 'de' MMMM, yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {/* Fatura button - shows status or lets admin generate */}
                            {resolvedOrder.status !== 'pending' && resolvedOrder.status !== 'cancelled' && (
                                checkingInvoice ? (
                                    <Badge
                                        variant="outline"
                                        className="h-9 px-3 gap-1.5 rounded-lg text-slate-600 bg-slate-50 border-slate-200 font-bold text-xs cursor-default"
                                    >
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span className="hidden sm:inline">Validando fatura</span>
                                    </Badge>
                                ) : hasInvoice ? (
                                    <Badge
                                        variant="outline"
                                        className="h-9 px-3 gap-1.5 rounded-lg text-emerald-700 bg-emerald-50 border-emerald-200 font-bold text-xs cursor-default"
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Faturado</span>
                                    </Badge>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 w-9 sm:w-auto px-0 sm:px-3 text-bronze hover:bg-bronze/5 border-bronze/20 gap-2 shrink-0 rounded-lg font-bold"
                                        onClick={() => setIsInvoiceModalOpen(true)}
                                        disabled={isArchived}
                                    >
                                        <Receipt className="h-4 w-4" />
                                        <span className="hidden sm:inline">Gerar Fatura</span>
                                    </Button>
                                )
                            )}

                            {onDelete && (
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-9 w-9 sm:w-auto px-0 sm:px-3 text-destructive hover:bg-destructive/5 border-destructive/20 gap-2 shrink-0 rounded-lg"
                                    disabled={isDeleting || cannotDelete}
                                    onClick={() => setIsDeleteDialogOpen(true)}
                                >
                                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    <span className="hidden sm:inline">
                                        {isArchived
                                            ? 'Pedido arquivado'
                                            : hasInvoice
                                              ? 'Pedido faturado'
                                              : routeAssignment
                                                ? 'Pedido em rota'
                                                : willArchive
                                                  ? 'Arquivar'
                                                  : 'Excluir'}
                                    </span>
                                </Button>
                            )}

                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="shrink-0 gap-2 h-9 rounded-lg border-navy/20 text-navy hover:bg-navy/5 font-bold shadow-xs transition-all"
                                onClick={handlePrint}
                                disabled={isPrinting}
                            >
                                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin text-bronze" /> : <Printer className="h-4 w-4" />}
                                <span className="hidden sm:inline">Imprimir Comprovante</span>
                                <span className="sm:hidden">Imprimir</span>
                            </Button>
                        </div>
                    </div>

                    {hasInvoice && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Este pedido possui fatura vinculada no financeiro e nao pode ser excluido. Cancele ou exclua a fatura primeiro.
                        </div>
                    )}
                    {routeAssignment && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                            Este pedido esta vinculado a rota {routeAssignment.route?.route_number || routeAssignment.route_id} e nao pode ser excluido. Remova a parada da rota na logistica antes de continuar.
                        </div>
                    )}
                    {isArchived && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                            Este pedido esta arquivado para preservar a NF-e e o historico fiscal. Motivo: {resolvedOrder.archive_reason || 'Arquivamento administrativo.'}
                        </div>
                    )}
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8">
                    {loadingOrder && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Atualizando detalhes do pedido...
                        </div>
                    )}
                    {/* General Information Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-muted/30 p-4 rounded-xl space-y-3 border border-border/50">
                            <h4 className="font-semibold text-sm flex items-center gap-2 text-navy">
                                <Building className="h-4 w-4" /> Dados do Lojista
                            </h4>
                            <div className="space-y-1 text-sm">
                                <p><span className="text-muted-foreground">Razão Social:</span> <span className="font-medium">{resolvedOrder.store?.company_name || 'N/A'}</span></p>
                                <p><span className="text-muted-foreground">CNPJ:</span> <span className="font-medium">{resolvedOrder.store?.cnpj || 'N/A'}</span></p>
                                <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{customerName}</span></p>
                                <p><span className="text-muted-foreground">Origem:</span> <span className="font-medium">{isRepresentativeOrder ? 'Pedido de representante' : 'Pedido portal cliente'}</span></p>
                                <p><span className="text-muted-foreground">Representante:</span> <span className="font-medium">{representativeName}</span></p>
                            </div>
                        </div>

                        <OrderPaymentSummaryCard
                            order={resolvedOrder}
                            title="Dados de Pagamento"
                            variant="panel"
                        />
                    </div>

                    <Separator />

                    {/* Fiscal Section — NF-e */}
                    <FiscalSection orderId={resolvedOrder.id} orderStatus={resolvedOrder.status} />

                    <Separator />

                    {/* Order Items */}
                    <div>
                        <h4 className="font-bold text-lg mb-4 text-navy">Itens Solicitados ({itemCount})</h4>
                        <div className="space-y-3">
                            {itemCount === 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                                    Nenhum item encontrado neste pedido. Verifique o fluxo de criacao ou recarregue os dados.
                                </div>
                            )}
                            {(resolvedOrder.items || []).map((item) => (
                                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border/50 hover:border-bronze/30 transition-colors bg-white">
                                    <div className="min-w-0 pr-4 mb-2 sm:mb-0">
                                        <p className="font-semibold text-base text-navy">{item.product_name}</p>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                            <Badge variant="secondary" className="font-normal">{item.fabric_name}</Badge>
                                            <span className="text-muted-foreground text-xs">•</span>
                                            <span className="text-sm text-muted-foreground">{item.color_name}</span>
                                            {item.size && (
                                                <>
                                                    <span className="text-muted-foreground text-xs">•</span>
                                                    <span className="text-sm text-muted-foreground font-medium">Tam: {item.size}</span>
                                                </>
                                            )}
                                        </div>
                                        <OrderItemPriceDetails item={item} className="mt-2" />
                                    </div>
                                    <div className="text-left sm:text-right shrink-0 bg-muted/20 sm:bg-transparent p-2 sm:p-0 rounded-md">
                                        <p className="text-sm text-muted-foreground mb-0.5">
                                            {item.quantity}x de R$ {item.unit_price.toFixed(2)}
                                        </p>
                                        <p className="font-bold text-lg text-gradient-bronze">
                                            R$ {item.subtotal.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 rounded-xl border border-border/60 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                            O admin e o cliente agora consultam o mesmo snapshot financeiro do pedido para auditoria e atendimento.
                        </div>
                    </div>

                    {/* Order Notes & Totals */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="order-2 md:order-1">
                            <h4 className="font-semibold text-sm mb-2 text-navy">Observações do Pedido</h4>
                            <div className="bg-amber-50/50 text-amber-900 rounded-xl p-4 border border-amber-100 min-h-[100px] text-sm">
                                {resolvedOrder.notes ? <p>{resolvedOrder.notes}</p> : <p className="text-amber-700/50 italic">Nenhuma observação informada pelo lojista neste pedido.</p>}
                            </div>
                        </div>
                        
                        <div className="order-1 md:order-2 bg-navy/5 p-6 rounded-xl border border-navy/10 space-y-2 text-sm flex flex-col justify-center">
                            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal dos Produtos</span><span className="font-medium">R$ {resolvedOrder.subtotal?.toFixed(2) || '0.00'}</span></div>
                            {couponDiscountAmount > 0 && (
                                <div className="flex justify-between text-green-600 font-medium"><span>Cupom ({resolvedOrder.coupon_code || 'aplicado'})</span><span>- R$ {couponDiscountAmount.toFixed(2)}</span></div>
                            )}
                            {paymentDiscountAmount > 0 && (
                                <div className="flex justify-between text-green-600 font-medium"><span>Desconto de pagamento</span><span>- R$ {paymentDiscountAmount.toFixed(2)}</span></div>
                            )}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center pt-1">
                                <span className="font-bold text-base text-navy">Total do Pedido</span>
                                <span className="font-black text-2xl text-gradient-bronze">R$ {resolvedOrder.total?.toFixed(2) || '0.00'}</span>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                Valores unitários e totais permanecem congelados mesmo após alterações futuras em produto, cor ou tabela comercial.
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Brand New: Audit Trail / Status History */}
                    <div>
                        <h4 className="font-bold text-lg mb-4 text-navy flex items-center gap-2">
                            <History className="h-5 w-5" /> Trilha de Auditoria
                        </h4>
                        
                        {loadingHistory ? (
                            <div className="space-y-4">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : history.length === 0 ? (
                            <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">Não há transições de status registradas ainda.</p>
                        ) : (
                            <div className="relative border-l-2 border-muted ml-4 pl-6 space-y-6">
                                {history.map((record) => {
                                    const cnf = statusConfig[record.status as keyof typeof statusConfig];
                                    return (
                                        <div key={record.id} className="relative">
                                            {/* Timeline dot */}
                                            <div className={`absolute -left-[35px] h-4 w-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${cnf?.color || 'bg-gray-200'}`}>
                                            </div>
                                            
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border rounded-lg p-3 shadow-sm">
                                                <div className="mb-1 sm:mb-0">
                                                    <p className="font-medium text-sm flex items-center gap-2">
                                                        Status alterado para <Badge variant="outline" className={cnf?.color}>{cnf?.label}</Badge>
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <User className="h-3 w-3" />
                                                        Por {record.profile?.full_name || 'Sistema/Admin'}
                                                    </p>
                                                </div>
                                                <p className="text-xs font-mono text-muted-foreground flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                                                    <Clock className="h-3 w-3" />
                                                    {format(new Date(record.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                </p>
                                            </div>
                                            {record.notes && (
                                                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                                                    {record.notes}
                                                </p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    {/* Padding bottom buffer */}
                    <div className="h-4"></div>
                </div>
            </DialogContent>


            <InvoiceOrderModal
                order={orderData ? {
                    id: orderData.id,
                    order_number: orderData.order_number,
                    total: orderData.total,
                    payment_method_id: undefined,
                    payment_method_name: orderData.payment_method_name,
                    payment_condition_id: undefined,
                    payment_condition_name: orderData.payment_condition_name,
                    payment_installments: orderData.payment_installments,
                    store: orderData.store,
                } : null}
                open={isInvoiceModalOpen}
                onOpenChange={setIsInvoiceModalOpen}
                onSuccess={() => {
                    if (order?.id) {
                        fetchOrderDetail(order.id)
                        checkInvoiceExists(order.id)
                    }
                }}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="w-[95vw] max-w-md rounded-2xl border-0 shadow-2xl">
                    <AlertDialogHeader>
                        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <AlertDialogTitle className="text-center text-xl">
                            {isArchived ? 'Pedido arquivado' : willArchive ? 'Arquivar pedido?' : 'Excluir Pedido?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center text-balance">
                            Você está prestes a excluir permanentemente o pedido <strong>{resolvedOrder.order_number}</strong>. Esta ação removerá todos os itens e históricos e não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row gap-3 sm:gap-0 mt-4">
                        <AlertDialogCancel className="flex-1 mt-0 rounded-xl border-navy/10 hover:bg-navy/5">Voltar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={async () => {
                                if (onDelete && resolvedOrder) {
                                    const success = await onDelete(resolvedOrder.id)
                                    if (success) {
                                        onOpenChange(false)
                                    }
                                    setIsDeleteDialogOpen(false)
                                }
                            }}
                            disabled={isDeleting || cannotDelete}
                            className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl shadow-lg shadow-destructive/20"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Excluindo...
                                </>
                            ) : cannotDelete ? (
                                'Exclusao bloqueada'
                            ) : (
                                'Confirmar Exclusao'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}



