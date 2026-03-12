'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    ArrowLeft, Package, Clock, CheckCircle2, Truck,
    MapPin, CreditCard, FileText, Loader2,
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
import type { Order, OrderItem, OrderStatusHistory, OrderStatus } from '@/lib/types'
import { cancelOrderAction } from './actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Image from 'next/image'

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
    const [order, setOrder] = useState<Order | null>(null)
    const [items, setItems] = useState<OrderItem[]>([])
    const [history, setHistory] = useState<OrderStatusHistory[]>([])
    const [loading, setLoading] = useState(true)
    const [cancelling, setCancelling] = useState(false)
    const [currentUser, setCurrentUser] = useState<any>(null)

    useEffect(() => {
        loadOrder()
    }, [params.id])

    const loadOrder = async () => {
        setLoading(true)
        const supabase = createClient()

        // Verify user can access this order
        // Verify user can access this order
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }
        setCurrentUser(user)

        const { data: orderData } = await supabase
            .from('orders')
            .select(`
                *,
                payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage)
            `)
            .eq('id', params.id)
            .eq('profile_id', user.id)
            .single()

        if (!orderData) {
            router.push('/orders')
            return
        }
        setOrder(orderData as Order)

        // Load items
        const { data: itemsData } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', params.id)
            .order('created_at')
        if (itemsData) setItems(itemsData)

        // Load status history
        const { data: historyData } = await supabase
            .from('order_status_history')
            .select('*, changed_by_profile:profiles(role, full_name)')
            .eq('order_id', params.id)
            .order('created_at', { ascending: true })
        if (historyData) setHistory(historyData)

        setLoading(false)
    }

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

    return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Back Button (Hidden on Print and Mobile) */}
            <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between mb-4 print:hidden gap-4">
                <Button variant="ghost" className="gap-2 w-fit" onClick={() => router.push('/orders')}>
                    <ArrowLeft className="h-4 w-4" /> Meus Pedidos
                </Button>
                
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" /> Imprimir Comprovante
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
                <Button variant="outline" size="sm" className="h-8 text-[11px] px-3 gap-1.5 rounded-lg border-border/40" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Imprimir
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
                    <Badge className={`text-xs border ${config.color} w-fit`}>
                        <StatusIcon className="h-3.5 w-3.5 mr-1" />
                        {config.label}
                    </Badge>
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
                                                            {(entry as any).changed_by_profile?.role === 'admin' 
                                                                ? 'CDJWE (Sistema)' 
                                                                : ((entry as any).changed_by_profile?.role === 'client' && currentUser?.id === entry.changed_by) 
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
                            {order.discount_amount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Desconto</span>
                                    <span>- R$ {order.discount_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between font-semibold text-lg">
                                <span>Total</span>
                                <span className="text-gradient-bronze">
                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment */}
                    {order.payment_condition && (
                        <Card className="glass-card border-0">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-bronze" />
                                    Pagamento
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="font-medium text-sm">
                                    {(order.payment_condition as any).name}
                                </p>
                                {(order.payment_condition as any).description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {(order.payment_condition as any).description}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

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
