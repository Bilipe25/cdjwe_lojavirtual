'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CheckCircle2,
    Package,
    MapPin,
    Calendar,
    FileDown,
    MessageCircle,
    Mail,
    ShoppingBag,
    ArrowRight,
    Clock,
    Loader2,
    AlertCircle,
    RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderItem, OrderStatus, SystemSettings } from '@/lib/types'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getWhatsAppLink } from '@/lib/utils'
import { OrderItemPriceDetails } from '@/components/orders/order-item-price-details'
import { getOrderPaymentDisplay } from '@/lib/orders/order-payment-display'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'

type OrderConfirmationRecord = Order & {
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

// ─── Status config ────────────────────────────────────────────────────────────
const statusConfig: Record<OrderStatus, { label: string; color: string }> = {
    pending: { label: 'Em Análise', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    in_production: { label: 'Em Produção', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    shipped: { label: 'Enviado', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200' },
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function PageSkeleton() {
    return (
        <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
            <div className="flex flex-col items-center gap-4 py-8">
                <Skeleton className="h-24 w-24 rounded-full" />
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-80" />
                <Skeleton className="h-10 w-40" />
            </div>
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
            </div>
        </div>
    )
}

// ─── Error state ─────────────────────────────────────────────────────────────
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    const router = useRouter()
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-6">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Ocorreu um problema</h2>
                <p className="text-muted-foreground text-sm">{message}</p>
            </div>
            <div className="flex gap-3">
                <Button variant="outline" onClick={onRetry} className="gap-2">
                    <RotateCcw className="h-4 w-4" /> Tentar Novamente
                </Button>
                <Button onClick={() => router.push('/orders')}>Ver meus pedidos</Button>
            </div>
        </div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrderConfirmationPage() {
    const params = useParams()
    const router = useRouter()
    const orderId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

    const [order, setOrder] = useState<OrderConfirmationRecord | null>(null)
    const [items, setItems] = useState<OrderItem[]>([])
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isPrinting, setIsPrinting] = useState(false)
    const [isSendingEmail, setIsSendingEmail] = useState(false)

    const loadOrder = useCallback(async () => {
        if (!orderId) {
            toast.error('Pedido invalido.')
            router.push('/orders')
            return
        }

        setLoading(true)
        setError(null)
        try {
            const supabase = createClient()

            // 1. Auth check
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            // 2. Fetch order with relations
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .select(`
                    *,
                    store:stores(*),
                    profile:profiles!orders_profile_id_fkey(*),
                    created_by_profile:profiles!orders_created_by_profile_id_fkey(id, full_name, role, email, phone, status, created_at, updated_at),
                    payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage)
                `)
                .eq('id', orderId)
                .single()

            if (orderError || !orderData) {
                toast.error('Pedido não encontrado.')
                router.push('/orders')
                return
            }

            // 3. Access control — only allow the owner
            if (orderData.profile_id !== user.id) {
                toast.error('Acesso negado.')
                router.push('/orders')
                return
            }

            setOrder(orderData as OrderConfirmationRecord)

            // 4. Load items
            const { data: itemsData, error: itemsError } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId)
                .order('created_at')

            if (itemsError) throw itemsError
            setItems(itemsData || [])

            // 5. Load settings for PDF branding
            const { data: settingsData } = await supabase
                .from('system_settings')
                .select('*')
                .limit(1)
                .single()
            if (settingsData) setSettings(settingsData)

        } catch (err: unknown) {
            console.error('[ORDER CONFIRMATION] Load error:', err)
            setError('Não foi possível carregar os detalhes do pedido. Verifique sua conexão.')
        } finally {
            setLoading(false)
        }
    }, [orderId, router])

    useEffect(() => {
        void loadOrder()
    }, [loadOrder])

    const handleDownloadPDF = async () => {
        if (!order || items.length === 0) return
        setIsPrinting(true)
        try {
            await generateOrderReceiptPDF(order, items, settings)
        } catch {
            toast.error('Erro ao gerar comprovante PDF.')
        } finally {
            setIsPrinting(false)
        }
    }

    const handleWhatsApp = () => {
        if (!order) return
        const systemName = settings?.system_name || 'CDJWE'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

        const itemLines = items.map(item =>
            `• *${item.product_name}*\n  Tecido: ${item.fabric_name} | Cor: ${item.color_name}${item.size ? ` | Tam: ${item.size}` : ''}\n  ${item.quantity}x R$ ${item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = *R$ ${item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`
        ).join('\n\n')

        const discountLine = order.discount_amount > 0
            ? `\n🔻 Desconto: - R$ ${order.discount_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            : ''

        const message = [
            `🛒 *PEDIDO #${order.order_number}* — ${systemName}`,
            `📅 ${format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
            `📌 Status: *Em Análise*`,
            ``,
            `━━━━━━━━━━━━━━━━━━━`,
            `*ITENS DO PEDIDO:*`,
            itemLines,
            `━━━━━━━━━━━━━━━━━━━`,
            `💰 Subtotal: R$ ${order.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${discountLine}`,
            `✅ *TOTAL: R$ ${order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`,
            paymentDisplay.combinedLabel !== 'A combinar' ? `💳 Pagamento: ${paymentDisplay.combinedLabel}` : null,
            appUrl ? `\n🔗 Ver pedido: ${appUrl}/order/${order.id}` : null,
        ].filter(Boolean).join('\n')

        // Use shared getWhatsAppLink utility (handles BR 55 prefix automatically)
        const waBase = getWhatsAppLink(settings?.whatsapp)
        const url = waBase
            ? `${waBase}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`
        window.open(url, '_blank')
    }

    const handleSendEmail = async () => {
        if (!order) return
        setIsSendingEmail(true)
        try {
            // Fire server-side email resend via API route
            const res = await fetch('/api/orders/resend-confirmation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order.id })
            })
            if (res.ok) {
                toast.success('Confirmação enviada para seu e-mail com sucesso!')
            } else {
                const body = await res.json()
                toast.error(body.error || 'Erro ao enviar e-mail.')
            }
        } catch {
            toast.error('Não foi possível enviar o e-mail.')
        } finally {
            setIsSendingEmail(false)
        }
    }

    // ── Renders ────────────────────────────────────────────────────────────────
    if (loading) return <PageSkeleton />
    if (error) return <ErrorState message={error} onRetry={loadOrder} />
    if (!order) return null

    const statusCfg = statusConfig[order.status as OrderStatus] ?? statusConfig.pending
    const paymentDisplay = getOrderPaymentDisplay(order)
    const couponDiscountAmount = Number(order.coupon_discount_amount || 0)
    const paymentDiscountAmount = Math.max(0, Number(order.discount_amount || 0) - couponDiscountAmount)

    return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 md:py-10 space-y-6">

            {/* ── Hero Banner ──────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative rounded-3xl overflow-hidden bg-linear-to-br from-primary/10 via-background to-bronze/5 border border-primary/10 p-8 text-center"
            >
                {/* Animated success icon */}
                <div className="flex justify-center mb-5">
                    <div className="relative">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                            className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center shadow-lg"
                        >
                            <CheckCircle2 className="h-10 w-10 text-green-600" />
                        </motion.div>
                        {/* Pulsing ring */}
                        <motion.div
                            className="absolute inset-0 rounded-full border-2 border-green-400/40"
                            animate={{ scale: [1, 1.5, 1.8], opacity: [0.8, 0.3, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                        />
                    </div>
                </div>

                <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-2xl sm:text-3xl font-bold font-heading text-gradient-navy mb-2"
                >
                    Pedido Realizado com Sucesso! 🎉
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto mb-5"
                >
                    Seu pedido foi registrado e já está sendo processado para análise. Em breve nossa equipe irá preparar os itens solicitados.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7 }}
                    className="flex flex-wrap justify-center gap-3"
                >
                    <div className="px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-bold text-primary">
                        #{order.order_number}
                    </div>
                    <Badge className={`text-xs border px-3 py-1.5 ${statusCfg.color}`}>
                        <Clock className="h-3 w-3 mr-1.5" />
                        {statusCfg.label}
                    </Badge>
                </motion.div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left: Items + Summary ─────────────────────────────────── */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Items list */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <Card className="glass-card border-0">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Package className="h-4 w-4 text-bronze" />
                                    Itens do Pedido ({items.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <AnimatePresence>
                                    {items.map((item, i) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.6 + i * 0.07 }}
                                            className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/40"
                                        >
                                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                                <Package className="h-5 w-5 text-primary/50" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-sm">{item.product_name}</h4>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {item.fabric_name} — {item.color_name}
                                                    {item.size && ` — Tam: ${item.size}`}
                                                </p>
                                                <OrderItemPriceDetails item={item} className="mt-1" />
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold text-gradient-bronze">
                                                    R$ {item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                <div className="rounded-xl border border-border/60 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                                    Os valores e condicoes comerciais deste pedido foram preservados no momento da compra para manter o historico financeiro consistente.
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Quick Actions */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                    >
                        <Card className="glass-card border-0">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Ações Rápidas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {/* PDF */}
                                    <Button
                                        variant="outline"
                                        className="h-auto py-3 flex-col gap-1.5 border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all"
                                        onClick={handleDownloadPDF}
                                        disabled={isPrinting}
                                    >
                                        {isPrinting
                                            ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                            : <FileDown className="h-5 w-5 text-primary" />
                                        }
                                        <span className="text-xs font-medium">
                                            {isPrinting ? 'Gerando...' : 'Baixar PDF'}
                                        </span>
                                    </Button>

                                    {/* WhatsApp */}
                                    <Button
                                        variant="outline"
                                        className="h-auto py-3 flex-col gap-1.5 border-border/60 hover:border-green-400/60 hover:bg-green-50 dark:hover:bg-green-950/20 transition-all"
                                        onClick={handleWhatsApp}
                                    >
                                        <MessageCircle className="h-5 w-5 text-green-600" />
                                        <span className="text-xs font-medium">Enviar WhatsApp</span>
                                    </Button>

                                    {/* Email */}
                                    <Button
                                        variant="outline"
                                        className="h-auto py-3 flex-col gap-1.5 border-border/60 hover:border-blue-400/60 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all"
                                        onClick={handleSendEmail}
                                        disabled={isSendingEmail}
                                    >
                                        {isSendingEmail
                                            ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                                            : <Mail className="h-5 w-5 text-blue-600" />
                                        }
                                        <span className="text-xs font-medium">
                                            {isSendingEmail ? 'Enviando...' : 'Enviar por E-mail'}
                                        </span>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Navigation */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.9 }}
                        className="flex flex-col sm:flex-row gap-3"
                    >
                        <Button
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={() => router.push('/orders')}
                        >
                            <Package className="h-4 w-4" />
                            Ver meus pedidos
                        </Button>
                        <Button
                            className="flex-1 gap-2 gradient-bronze border-0 text-white"
                            onClick={() => router.push('/catalog')}
                        >
                            <ShoppingBag className="h-4 w-4" />
                            Continuar comprando
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </motion.div>
                </div>

                {/* ── Right: Order details sidebar ─────────────────────────── */}
                <div className="space-y-4">
                    {/* Order info */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Card className="glass-card border-0">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-bronze" />
                                    Detalhes do Pedido
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-muted-foreground shrink-0">Número</span>
                                    <span className="font-bold text-right">#{order.order_number}</span>
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-muted-foreground shrink-0">Data</span>
                                    <span className="text-right">
                                        {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-muted-foreground shrink-0">Status</span>
                                    <Badge className={`text-xs border ${statusCfg.color}`}>
                                        {statusCfg.label}
                                    </Badge>
                                </div>
                                <Separator />
                                {order.subtotal !== order.total && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>R$ {order.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
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
                                <div className="flex justify-between font-bold text-base">
                                    <span>Total</span>
                                    <span className="text-gradient-bronze">
                                        R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                    Valores, descontos e pagamento permanecem registrados como foram aprovados no checkout, mesmo que o cadastro comercial mude depois.
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Payment */}
                    {paymentDisplay.hasSnapshot && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.7 }}
                        >
                            <OrderPaymentSummaryCard order={order} title="Pagamento" />
                        </motion.div>
                    )}

                    {/* Shipping address */}
                    {order.shipping_address && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.75 }}
                        >
                            <Card className="glass-card border-0">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-bronze" />
                                        Endereço de Entrega
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {order.shipping_address}
                                    </p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}

                    {/* Notes */}
                    {order.notes && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.8 }}
                        >
                            <Card className="glass-card border-0">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Observações</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{order.notes}</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    )
}
