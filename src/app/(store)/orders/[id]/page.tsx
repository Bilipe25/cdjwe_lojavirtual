'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    ArrowLeft, Package, Clock, CheckCircle2, Truck,
    CreditCard, Loader2,
    XCircle, Printer
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderItem, OrderStatusHistory, OrderStatus, SystemSettings } from '@/lib/types'
import { cancelOrderAction } from './actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { OrderItemPriceDetails } from '@/components/orders/order-item-price-details'
import { getOrderPaymentDisplay } from '@/lib/orders/order-payment-display'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'
import { getOrderDeliverySummary, getOrderTypeLabel, isReadyDeliveryOrderType } from '@/lib/orders/order-type'

type OrderDetailRecord = Order & {
    store?: Record<string, unknown> | null
    profile?: Record<string, unknown> | null
    payment_condition?: {
        name: string
        description?: string | null
        installments?: number | null
        discount_percentage?: number | null
        surcharge_percentage?: number | null
    } | null
}

type OrderHistoryEntry = OrderStatusHistory & {
    changed_by_profile?: {
        role?: string | null
        full_name?: string | null
    } | null
}

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Em Análise', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
    approved: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle2 },
    in_production: { label: 'Em Produção', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Package },
    shipped: { label: 'Enviado', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: Truck },
    delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200', icon: Clock },
}

const statusOrder: OrderStatus[] = ['pending', 'approved', 'in_production', 'shipped', 'delivered']

export default function OrderDetailPage() {
    const params = useParams()
    const router = useRouter()
    const orderId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''
    const [order, setOrder] = useState<OrderDetailRecord | null>(null)
    const [items, setItems] = useState<OrderItem[]>([])
    const [history, setHistory] = useState<OrderHistoryEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [cancelling, setCancelling] = useState(false)
    const [isPrinting, setIsPrinting] = useState(false)
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    const loadOrder = useCallback(async () => {
        if (!orderId) {
            router.push('/orders')
            return
        }

        setLoading(true)
        const supabase = createClient()

        // Verify user can access this order
        // Verify user can access this order
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }
        setCurrentUserId(user.id)

        const { data: orderData } = await supabase
            .from('orders')
            .select(`
                *,
                store:stores(*),
                profile:profiles!orders_profile_id_fkey(*),
                created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at),
                payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage)
            `)
            .eq('id', orderId)
            .eq('profile_id', user.id)
            .single()

        if (!orderData) {
            router.push('/orders')
            return
        }
        setOrder(orderData as OrderDetailRecord)

        // Load settings for branding
        const { data: settingsData } = await supabase
            .from('system_settings')
            .select('*')
            .limit(1)
            .single()
        if (settingsData) setSettings(settingsData)

        // Load items
        const { data: itemsData } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at')
        if (itemsData) setItems(itemsData)

        // Load status history
        const { data: historyData } = await supabase
            .from('order_status_history')
            .select('*, changed_by_profile:profiles(role, full_name)')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true })
        if (historyData) setHistory(historyData as OrderHistoryEntry[])

        setLoading(false)
    }, [orderId, router])

    useEffect(() => {
        void loadOrder()
    }, [loadOrder])

    const handleCancelOrder = async () => {
        if (!order) return
        setCancelling(true)
        const res = await cancelOrderAction(order.id)
        setCancelling(false)
        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success('Pedido cancelado com sucesso.')
            loadOrder() // reload fresh state
        }
    }

    const handlePrint = async () => {
        if (!order || items.length === 0) return
        setIsPrinting(true)
        try {
            await generateOrderReceiptPDF(order, items, settings)
        } catch (err) {
            console.error('PDF generation error:', err)
            toast.error('Erro ao gerar comprovante.')
        } finally {
            setIsPrinting(false)
        }
    }

    if (loading) {
        return (
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
                <Skeleton className="h-8 w-48 mb-6" />
                <div className="space-y-6">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-48 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                </div>
            </div>
        )
    }

    if (!order) return null

    const config = statusConfig[order.status as OrderStatus]
    const StatusIcon = config.icon
    const currentStepIndex = statusOrder.indexOf(order.status as OrderStatus)
    const isCancelled = order.status === 'cancelled'
    const paymentDisplay = getOrderPaymentDisplay(order)
    const orderTypeLabel = getOrderTypeLabel(order.order_type)
    const deliverySummary = getOrderDeliverySummary(order.order_type, order.shipping_address)
    const isReadyDelivery = isReadyDeliveryOrderType(order.order_type)
    const couponDiscountAmount = Number(order.coupon_discount_amount || 0)
    const paymentDiscountAmount = Math.max(0, Number(order.discount_amount || 0) - couponDiscountAmount)

    return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Back Button (Hidden on Print and Mobile) */}
            <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between mb-4 print:hidden gap-4">
                <Button variant="ghost" className="gap-2 w-fit" onClick={() => router.push('/orders')}>
                    <ArrowLeft className="h-4 w-4" /> Meus Pedidos
                </Button>
                
                <div className="flex gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2" 
                        onClick={handlePrint}
                        disabled={isPrinting}
                    >
                        {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Imprimir Comprovante
                    </Button>
                    
                    {order.status === 'pending' && (
                        <AlertDialog>
                            <AlertDialogTrigger
                                render={
                                    <Button variant="destructive" size="sm" className="gap-2" disabled={cancelling}>
                                        {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                        Cancelar Pedido
                                    </Button>
                                }
                            />
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Cancelar Pedido?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tem certeza que deseja cancelar o pedido <strong>{order.order_number}</strong>? 
                                        Esta ação não pode ser desfeita e os itens serão perdidos.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleCancelOrder}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Sim, cancelar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>

            {/* Desktop Print/Action bar (Mobile version) */}
            <div className="flex md:hidden items-center justify-end gap-2 mb-4 print:hidden">
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[11px] px-3 gap-1.5 rounded-lg border-border/40" 
                    onClick={handlePrint}
                    disabled={isPrinting}
                >
                    {isPrinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                    Imprimir
                </Button>
                {order.status === 'pending' && (
                    <AlertDialog>
                        <AlertDialogTrigger
                            render={
                                <Button variant="destructive" size="sm" className="h-8 text-[11px] px-3 gap-1.5 rounded-lg" disabled={cancelling}>
                                    {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                    Cancelar
                                </Button>
                            }
                        />
                        <AlertDialogContent className="w-[90vw] rounded-2xl">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Cancelar Pedido?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Deseja cancelar o pedido {order.order_number}?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Voltar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleCancelOrder}
                                    className="bg-destructive text-white rounded-xl"
                                >
                                    Confirmar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold font-heading text-gradient-navy hidden md:block">
                            Pedido {order.order_number}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Realizado em {format(new Date(order.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`text-xs border ${config.color} w-fit`}>
                            <StatusIcon className="h-3.5 w-3.5 mr-1" />
                            {config.label}
                        </Badge>
                        <Badge className={`text-xs border w-fit ${isReadyDelivery ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {orderTypeLabel}
                        </Badge>
                    </div>
                </div>
            </motion.div>

            {/* Status Timeline */}
            {!isCancelled && (
                <Card className="glass-card border-0 mb-6">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between relative">
                            {/* Background line */}
                            <div className="absolute top-5 left-6 right-6 h-0.5 bg-muted" />
                            <div
                                className="absolute top-5 left-6 h-0.5 bg-primary transition-all duration-500"
                                style={{ width: `${Math.max(0, (currentStepIndex / (statusOrder.length - 1)) * 100 - 3)}%` }}
                            />
                            {statusOrder.map((status, i) => {
                                const stepConfig = statusConfig[status]
                                const StepIcon = stepConfig.icon
                                const isCompleted = i <= currentStepIndex
                                const isCurrent = i === currentStepIndex
                                return (
                                    <div key={status} className="relative z-10 flex flex-col items-center gap-1.5">
                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
                                            isCurrent ? 'bg-primary text-white shadow-lg scale-110'
                                            : isCompleted ? 'bg-primary/80 text-white'
                                            : 'bg-muted text-muted-foreground'
                                        }`}>
                                            <StepIcon className="h-4 w-4" />
                                        </div>
                                        <span className={`text-[10px] sm:text-xs text-center leading-tight ${
                                            isCurrent ? 'font-semibold text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                                        }`}>
                                            {stepConfig.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Items */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="glass-card border-0">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Package className="h-4 w-4 text-bronze" />
                                Itens do Pedido ({items.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {items.map((item, i) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex gap-3 p-3 rounded-lg bg-muted/30"
                                >
                                    <div className="h-16 w-16 rounded-lg bg-muted shrink-0 overflow-hidden relative flex items-center justify-center">
                                        <Package className="h-6 w-6 text-muted-foreground/30" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-sm truncate">{item.product_name}</h4>
                                        <p className="text-xs text-muted-foreground">
                                            {item.fabric_name} — {item.color_name}
                                        </p>
                                        {item.size && (
                                            <p className="text-xs text-muted-foreground">{item.size}</p>
                                        )}
                                        <OrderItemPriceDetails item={item} compact className="mt-1" />
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs text-muted-foreground">{item.quantity}x</p>
                                        <p className="text-sm font-medium">
                                            R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-sm font-semibold text-gradient-bronze">
                                            R$ {item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                            <div className="rounded-xl border border-border/60 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                                Este pedido preserva o snapshot comercial da compra, incluindo valores, descontos e pagamento aplicados no checkout.
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timeline History */}
                    {history.length > 0 && (
                        <Card className="glass-card border-0">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-bronze" />
                                    Histórico
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="relative pl-6">
                                    <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                                    {history.map((entry, i) => {
                                        const entryConfig = statusConfig[entry.status as OrderStatus]
                                        return (
                                            <div key={entry.id} className="relative pb-4 last:pb-0">
                                                <div className={`absolute -left-4 top-1 h-3 w-3 rounded-full border-2 border-white ${
                                                    i === history.length - 1 ? 'bg-primary' : 'bg-muted-foreground/30'
                                                }`} />
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                    <Badge variant="secondary" className={`text-[10px] w-fit ${entryConfig.color}`}>
                                                        {entryConfig.label}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground flex gap-1 items-center">
                                                        <span>{format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                                                        <span>•</span>
                                                        <span className="font-medium text-foreground">
                                                            {entry.changed_by_profile?.role === 'admin' 
                                                                ? 'CDJWE (Sistema)' 
                                                                : (entry.changed_by_profile?.role === 'client' && currentUserId === entry.changed_by) 
                                                                    ? 'Você' 
                                                                    : 'Cliente'}
                                                        </span>
                                                    </span>
                                                </div>
                                                {entry.notes && (
                                                    <p className="text-xs text-muted-foreground mt-1">{entry.notes}</p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Summary Sidebar */}
                <div className="space-y-4">
                    <Card className="glass-card border-0">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-bronze" />
                                Resumo Financeiro
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>R$ {order.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {couponDiscountAmount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Cupom ({order.coupon_code || 'aplicado'})</span>
                                    <span>- R$ {couponDiscountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {paymentDiscountAmount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Desconto de pagamento</span>
                                    <span>- R$ {paymentDiscountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between font-semibold text-lg">
                                <span>Total</span>
                                <span className="text-gradient-bronze">
                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                O total e a configuracao de pagamento permanecem registrados como foram fechados no momento da compra.
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment */}
                    {paymentDisplay.hasSnapshot && (
                        <OrderPaymentSummaryCard order={order} title="Pagamento" />
                    )}

                    <Card className="glass-card border-0">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4 text-bronze" />
                                Entrega
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Badge className={`mb-3 text-[11px] border ${isReadyDelivery ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                {orderTypeLabel}
                            </Badge>
                            <p className="text-sm leading-6 text-muted-foreground">{deliverySummary}</p>
                        </CardContent>
                    </Card>

                    {/* Notes */}
                    {order.notes && (
                        <Card className="glass-card border-0">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Observações</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">{order.notes}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}


