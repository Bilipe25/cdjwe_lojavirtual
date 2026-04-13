'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    CheckCircle2,
    Package,
    FileDown,
    MessageCircle,
    Mail,
    ShoppingBag,
    ArrowRight,
    Clock,
    Loader2,
    AlertCircle,
    RotateCcw,
    Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderItem, OrderStatus, SystemSettings } from '@/lib/types'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getWhatsAppLink } from '@/lib/utils'
import { getOrderPaymentDisplay } from '@/lib/orders/order-payment-display'

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
        <div className="mx-auto max-w-3xl px-4 md:px-6 py-8 md:py-12 space-y-5">
            <div className="flex flex-col items-center gap-3 py-6">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-8 w-36" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
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

// ─── Action Card ──────────────────────────────────────────────────────────────
const actionColorVariants: Record<string, { icon: string; hover: string }> = {
    primary: {
        icon: 'bg-primary/10 text-primary',
        hover: 'hover:border-primary/30 hover:bg-primary/5',
    },
    green: {
        icon: 'bg-green-100 text-green-600',
        hover: 'hover:border-green-400/40 hover:bg-green-50 dark:hover:bg-green-950/20',
    },
    blue: {
        icon: 'bg-blue-100 text-blue-600',
        hover: 'hover:border-blue-400/40 hover:bg-blue-50 dark:hover:bg-blue-950/20',
    },
}

function ActionCard({
    icon,
    label,
    sublabel,
    onClick,
    disabled,
    loading,
    variant = 'primary',
    delay,
}: {
    icon: React.ReactNode
    label: string
    sublabel?: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
    variant?: 'primary' | 'green' | 'blue'
    delay: number
}) {
    const colors = actionColorVariants[variant]

    return (
        <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
            onClick={onClick}
            disabled={disabled}
            className={`
                group relative flex flex-col items-center justify-center gap-2.5 
                rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm
                px-4 py-5 sm:py-6 text-center
                transition-all duration-200 ease-out
                hover:shadow-lg hover:shadow-black/5
                ${colors.hover}
                active:scale-[0.97]
                disabled:opacity-50 disabled:cursor-not-allowed
                cursor-pointer
            `}
        >
            <div className={`
                flex items-center justify-center
                h-11 w-11 rounded-xl
                ${colors.icon}
                transition-transform duration-200
                group-hover:scale-110
            `}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
            </div>
            <div>
                <span className="text-sm font-semibold text-foreground block leading-tight">
                    {loading ? 'Aguarde...' : label}
                </span>
                {sublabel && (
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">
                        {sublabel}
                    </span>
                )}
            </div>
        </motion.button>
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

            // 4. Load items (needed for PDF/WhatsApp)
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
        const paymentDisplay = getOrderPaymentDisplay(order)

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

    return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-12 space-y-5">

            {/* ── Compact Hero Banner ──────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="relative rounded-2xl overflow-hidden bg-linear-to-br from-green-50/80 via-background to-primary/5 border border-green-200/40 px-5 py-6 text-center"
            >
                {/* Success icon — compact */}
                <div className="flex justify-center mb-3">
                    <div className="relative">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 220, delay: 0.15 }}
                            className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center shadow-md shadow-green-200/40"
                        >
                            <CheckCircle2 className="h-7 w-7 text-green-600" />
                        </motion.div>
                        <motion.div
                            className="absolute inset-0 rounded-full border-2 border-green-400/30"
                            animate={{ scale: [1, 1.6, 2], opacity: [0.7, 0.2, 0] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
                        />
                    </div>
                </div>

                <motion.h1
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-xl sm:text-2xl font-bold font-heading text-foreground mb-1"
                >
                    Pedido Realizado! 🎉
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45 }}
                    className="text-muted-foreground text-xs sm:text-sm max-w-sm mx-auto mb-4"
                >
                    Seu pedido foi registrado e está sendo processado.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.55 }}
                    className="flex flex-wrap justify-center gap-2"
                >
                    <div className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
                        #{order.order_number}
                    </div>
                    <Badge className={`text-[11px] border px-2.5 py-1 ${statusCfg.color}`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                    </Badge>
                </motion.div>
            </motion.div>

            {/* ── Quick Actions Grid ──────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <ActionCard
                    icon={<Eye className="h-5 w-5" />}
                    label="Ver Pedido"
                    sublabel="Detalhes completos"
                    onClick={() => router.push(`/order/${order.id}`)}
                    variant="primary"
                    delay={0.5}
                />
                <ActionCard
                    icon={<FileDown className="h-5 w-5" />}
                    label="Baixar PDF"
                    sublabel="Comprovante"
                    onClick={handleDownloadPDF}
                    disabled={isPrinting}
                    loading={isPrinting}
                    variant="primary"
                    delay={0.55}
                />
                <ActionCard
                    icon={<MessageCircle className="h-5 w-5" />}
                    label="WhatsApp"
                    sublabel="Compartilhar pedido"
                    onClick={handleWhatsApp}
                    variant="green"
                    delay={0.6}
                />
                <ActionCard
                    icon={<Mail className="h-5 w-5" />}
                    label="Enviar E-mail"
                    sublabel="Confirmação"
                    onClick={handleSendEmail}
                    disabled={isSendingEmail}
                    loading={isSendingEmail}
                    variant="blue"
                    delay={0.65}
                />
            </div>

            {/* ── Navigation ──────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 }}
                className="flex flex-col sm:flex-row gap-3"
            >
                <Button
                    variant="outline"
                    className="flex-1 gap-2 h-11"
                    onClick={() => router.push('/orders')}
                >
                    <Package className="h-4 w-4" />
                    Meus Pedidos
                </Button>
                <Button
                    className="flex-1 gap-2 h-11 gradient-bronze border-0 text-white"
                    onClick={() => router.push('/catalog')}
                >
                    <ShoppingBag className="h-4 w-4" />
                    Continuar Comprando
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </motion.div>
        </div>
    )
}
