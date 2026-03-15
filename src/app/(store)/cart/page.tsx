'use client'

import { type ComponentType, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Image from 'next/image'
import {
    AlertCircle,
    ArrowLeft,
    Check,
    CreditCard,
    Loader2,
    MessageSquare,
    Minus,
    Package,
    Plus,
    Receipt,
    ShieldCheck,
    ShoppingBag,
    Trash2,
    Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddressForm } from '@/components/store/AddressForm'
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useSettings } from '@/components/providers/settings-provider'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/lib/stores/cart-store'
import { createClient } from '@/lib/supabase/client'
import type { CartItem, PaymentCondition, PriceTablePaymentRule, StoreAddress } from '@/lib/types'
import { toast } from 'sonner'
import {
    checkoutAction,
    getAvailablePaymentRules,
    getAvailableStoreAddresses,
    getCurrentVariantPricing,
} from './actions'

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function getRuleLabel(rule: PriceTablePaymentRule) {
    return `${rule.number_of_installments}x${rule.installment_days ? ` (${rule.installment_days})` : ''}${rule.discount_percentage > 0 ? ` -${rule.discount_percentage}%` : ''}`
}

function getConditionLabel(condition: PaymentCondition) {
    return `${condition.name}${condition.discount_percentage > 0 ? ` -${condition.discount_percentage}%` : ''}`
}

function CheckoutSection({
    icon: Icon,
    eyebrow,
    title,
    description,
    children,
    className,
    headerClassName,
    contentClassName,
    iconWrapperClassName,
    eyebrowClassName,
    titleClassName,
}: {
    icon: ComponentType<{ className?: string }>
    eyebrow: string
    title: string
    description?: string
    children: ReactNode
    className?: string
    headerClassName?: string
    contentClassName?: string
    iconWrapperClassName?: string
    eyebrowClassName?: string
    titleClassName?: string
}) {
    return (
        <Card
            className={cn(
                'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
                className
            )}
        >
            <CardHeader
                className={cn('border-b border-slate-100 px-4 py-4 sm:px-5', headerClassName)}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700',
                            iconWrapperClassName
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p
                            className={cn(
                                'text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400',
                                eyebrowClassName
                            )}
                        >
                            {eyebrow}
                        </p>
                        <CardTitle
                            className={cn('mt-0.5 text-base font-semibold text-slate-950', titleClassName)}
                        >
                            {title}
                        </CardTitle>
                        {description && (
                            <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className={cn('px-4 py-4 sm:px-5', contentClassName)}>{children}</CardContent>
        </Card>
    )
}

function CheckoutHeader({
    nextOrderNumber,
    count,
    total,
    onBack,
    onClear,
}: {
    nextOrderNumber: string
    count: number
    total: number
    onBack: () => void
    onClear: () => void
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        className="mt-0.5 h-9 w-9 rounded-xl border-slate-200"
                        onClick={onBack}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="font-[family-name:var(--font-heading)] text-xl font-bold text-slate-950 sm:text-2xl">
                            {nextOrderNumber || 'Finalizar pedido'}
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Revise, escolha entrega e confirme o pedido.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-950">{count}</span>{' '}
                        {count === 1 ? 'item' : 'itens'}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        Total parcial
                        <span className="ml-1 font-semibold text-slate-950">
                            R$ {formatCurrency(total)}
                        </span>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 rounded-xl px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Limpar
                                </Button>
                            }
                        />
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Esvaziar carrinho</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Tem certeza que deseja remover todos os itens do seu carrinho?
                                    Esta acao nao pode ser desfeita.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={onClear}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    Sim, esvaziar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </div>
    )
}

function EmptyCartState({ onCatalog }: { onCatalog: () => void }) {
    return (
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
            <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm"
            >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
                    <ShoppingBag className="h-8 w-8 text-slate-500" />
                </div>
                <h1 className="mt-5 text-2xl font-bold text-slate-950">Carrinho vazio</h1>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Adicione produtos para iniciar um novo pedido.
                </p>
                <Button
                    className="mt-6 h-10 rounded-xl gradient-bronze border-0 px-5 text-white"
                    onClick={onCatalog}
                >
                    Ver catalogo
                </Button>
            </motion.div>
        </div>
    )
}

function CheckoutItemRow({
    item,
    onRemove,
    onDecrease,
    onIncrease,
}: {
    item: CartItem
    onRemove: () => void
    onDecrease: () => void
    onIncrease: () => void
}) {
    const subtotal = item.unitPrice * item.quantity
    const variantSummary = [item.fabricName, item.colorName, item.size].filter(Boolean).join(' / ')

    return (
        <div className="py-3 first:pt-0 last:pb-0">
            <div className="sm:hidden">
                <div className="flex items-start gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        {item.imageUrl ? (
                            <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                                <Package className="h-4 w-4" />
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="line-clamp-2 text-sm font-medium leading-5 text-slate-950">
                                    {item.quantity}x {item.productName}
                                </h3>
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                    {variantSummary}
                                </p>
                            </div>

                            <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold text-slate-950">
                                    R$ {formatCurrency(subtotal)}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                    Unit. R$ {formatCurrency(item.unitPrice)}
                                </p>
                            </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-slate-50/80 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded-full text-slate-500 hover:bg-white hover:text-slate-950"
                                    onClick={onDecrease}
                                >
                                    <Minus className="h-3 w-3" strokeWidth={2.2} />
                                </Button>
                                <span className="min-w-7 px-1 text-center text-[12px] font-semibold tracking-tight text-slate-950">
                                    {item.quantity}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded-full text-slate-500 hover:bg-white hover:text-slate-950"
                                    onClick={onIncrease}
                                >
                                    <Plus className="h-3 w-3" strokeWidth={2.2} />
                                </Button>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-2.5 text-[11px] font-medium text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                                onClick={onRemove}
                            >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Remover
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="hidden sm:grid sm:gap-3 sm:grid-cols-[72px_minmax(0,1fr)] xl:grid-cols-[72px_minmax(0,1fr)_160px] xl:items-center">
                <div className="relative h-[72px] w-[72px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <Package className="h-7 w-7" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-slate-950">
                                {item.productName}
                            </h3>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {item.fabricName}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {item.colorName}
                                </span>
                                {item.size && (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                        {item.size}
                                    </span>
                                )}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 rounded-lg text-slate-400 hover:bg-destructive/10 hover:text-destructive xl:hidden"
                            onClick={onRemove}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 xl:hidden">
                        <div className="text-sm text-slate-500">
                            <span>R$ {formatCurrency(item.unitPrice)}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            <span className="font-semibold text-slate-950">
                                R$ {formatCurrency(subtotal)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onDecrease}>
                                <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-7 text-center text-sm font-semibold text-slate-950">
                                {item.quantity}
                            </span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onIncrease}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="hidden xl:flex xl:items-center xl:justify-end xl:gap-3">
                    <div className="text-right">
                        <p className="text-xs text-slate-500">Unitario</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-950">
                            R$ {formatCurrency(item.unitPrice)}
                        </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onDecrease}>
                            <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-7 text-center text-sm font-semibold text-slate-950">
                            {item.quantity}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onIncrease}>
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <div className="min-w-[96px] text-right">
                        <p className="text-xs text-slate-500">Subtotal</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-950">
                            R$ {formatCurrency(subtotal)}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 rounded-xl px-2.5 text-xs font-medium text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                        onClick={onRemove}
                    >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Excluir
                    </Button>
                </div>
            </div>
        </div>
    )
}
function SummaryRow({
    label,
    value,
    emphasis = 'default',
}: {
    label: string
    value: string
    emphasis?: 'default' | 'success' | 'warning' | 'strong'
}) {
    const colorClass =
        emphasis === 'success'
            ? 'text-emerald-600'
            : emphasis === 'warning'
              ? 'text-amber-600'
              : emphasis === 'strong'
                ? 'text-slate-950'
                : 'text-slate-600'

    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className={cn('text-right font-medium', colorClass)}>{value}</span>
        </div>
    )
}

export default function CartPage() {
    const router = useRouter()
    const { items, removeItem, updateQuantity, subtotal, totalItems, clearCart, setItems } =
        useCartStore()
    const { settings } = useSettings()

    const [loading, setLoading] = useState(false)
    const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([])
    const [priceTableRules, setPriceTableRules] = useState<PriceTablePaymentRule[]>([])
    const [isTableRule, setIsTableRule] = useState(false)
    const [selectedPayment, setSelectedPayment] = useState('')
    const [storeAddresses, setStoreAddresses] = useState<StoreAddress[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState('')
    const [addressesLoading, setAddressesLoading] = useState(true)
    const [addressError, setAddressError] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false)
    const [nextOrderNumber, setNextOrderNumber] = useState('')
    const [newAddressDialogOpen, setNewAddressDialogOpen] = useState(false)
    const [priceValidationPending, setPriceValidationPending] = useState(false)
    const [lastValidatedKey, setLastValidatedKey] = useState('')

    const total = subtotal()
    const count = totalItems()
    const itemsKey = useMemo(() => items.map((item) => item.variantId).sort().join('|'), [items])

    const selectedAddress = useMemo(
        () => storeAddresses.find((address) => address.id === selectedAddressId) || null,
        [selectedAddressId, storeAddresses]
    )

    const selectedRule = useMemo(
        () =>
            isTableRule
                ? priceTableRules.find((rule) => rule.id === selectedPayment) || null
                : null,
        [isTableRule, priceTableRules, selectedPayment]
    )

    const selectedCondition = useMemo(
        () =>
            !isTableRule
                ? paymentConditions.find((condition) => condition.id === selectedPayment) || null
                : null,
        [isTableRule, paymentConditions, selectedPayment]
    )

    const mobilePaymentOptions = useMemo(
        () => [
            ...priceTableRules.map((rule) => ({
                id: rule.id,
                label: getRuleLabel(rule),
                description: 'Regra comercial exclusiva da sua tabela B2B.',
                discountPercentage: rule.discount_percentage,
                isTableRule: true,
            })),
            ...paymentConditions.map((condition) => ({
                id: condition.id,
                label: getConditionLabel(condition),
                description: condition.description || null,
                discountPercentage: condition.discount_percentage,
                isTableRule: false,
            })),
        ],
        [paymentConditions, priceTableRules]
    )

    const discountPercentage =
        selectedRule?.discount_percentage || selectedCondition?.discount_percentage || 0
    const surchargePercentage = selectedCondition?.surcharge_percentage || 0
    const paymentDiscount = total * (discountPercentage / 100)
    const discountedTotal = total - paymentDiscount
    const paymentSurcharge = discountedTotal * (surchargePercentage / 100)
    const finalTotal = discountedTotal + paymentSurcharge
    const minOrderMet = !settings?.min_order_amount || total >= settings.min_order_amount

    const selectedPaymentLabel = selectedRule
        ? getRuleLabel(selectedRule)
        : selectedCondition
          ? getConditionLabel(selectedCondition)
          : 'Selecione uma condicao'

    const deliveryMessage =
        settings?.default_delivery_days && settings.default_delivery_days > 0
            ? `${settings.default_delivery_days} dias uteis estimados`
            : null

    useEffect(() => {
        const validatePrices = async () => {
            if (!itemsKey || itemsKey === lastValidatedKey) return

            setPriceValidationPending(true)
            try {
                const result = await getCurrentVariantPricing(items.map((item) => item.variantId))
                if (!result) return

                if ('error' in result) {
                    toast.warning(
                        'Nao foi possivel validar os precos agora. Tentaremos novamente em instantes.'
                    )
                    return
                }

                const missingVariantIds = result.missingVariantIds || []
                let updatedItems = items.filter(
                    (item) => !missingVariantIds.includes(item.variantId)
                )
                let priceChanged = false

                updatedItems = updatedItems.map((item) => {
                    const priceInfo = result.prices?.[item.variantId]
                    if (!priceInfo) return item
                    if (priceInfo.unitPrice !== item.unitPrice) {
                        priceChanged = true
                        return { ...item, unitPrice: priceInfo.unitPrice }
                    }
                    return item
                })

                if (missingVariantIds.length > 0) {
                    toast.error(
                        'Alguns itens nao estao mais disponiveis e foram removidos do carrinho.'
                    )
                }

                if (priceChanged) {
                    toast.message('Precos atualizados conforme tabela comercial e variacoes.')
                }

                if (missingVariantIds.length > 0 || priceChanged) {
                    setItems(updatedItems)
                    setLastValidatedKey(
                        updatedItems.map((item) => item.variantId).sort().join('|')
                    )
                } else {
                    setLastValidatedKey(itemsKey)
                }
            } finally {
                setPriceValidationPending(false)
            }
        }

        void validatePrices()
    }, [items, itemsKey, lastValidatedKey, setItems])

    useEffect(() => {
        const loadAddresses = async () => {
            setAddressesLoading(true)
            try {
                const addresses = await getAvailableStoreAddresses()
                setStoreAddresses(addresses || [])

                const mainAddress = addresses?.find((address) => address.is_main)
                if (mainAddress) {
                    setSelectedAddressId(mainAddress.id)
                } else if (addresses && addresses.length > 0) {
                    setSelectedAddressId(addresses[0].id)
                }
            } catch (err: unknown) {
                console.error('[CHECKOUT] Failed to load addresses:', err)
                setAddressError(
                    err instanceof Error ? err.message : 'Erro ao carregar enderecos'
                )
            } finally {
                setAddressesLoading(false)
            }
        }

        void loadAddresses()
    }, [])

    useEffect(() => {
        const loadPaymentRules = async () => {
            const rulesResponse = await getAvailablePaymentRules(total)
            const nextTableRules = rulesResponse.priceTableRules || []
            const nextConditions = rulesResponse.globalConditions || []

            setPriceTableRules(nextTableRules)
            setPaymentConditions(nextConditions)

            if (nextTableRules.length > 0) {
                setIsTableRule(true)
                setSelectedPayment((previous) =>
                    nextTableRules.some((rule) => rule.id === previous)
                        ? previous
                        : nextTableRules[0].id
                )
                return
            }

            if (nextConditions.length > 0) {
                setIsTableRule(false)
                setSelectedPayment((previous) =>
                    nextConditions.some((condition) => condition.id === previous)
                        ? previous
                        : nextConditions[0].id
                )
                return
            }

            setSelectedPayment('')
        }

        void loadPaymentRules()
    }, [total])

    useEffect(() => {
        const loadNextOrderNumber = async () => {
            const supabase = createClient()
            const orderResponse = await supabase
                .from('orders')
                .select('order_number')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            const lastNumStr = orderResponse.data?.order_number || 'PED000000'
            const lastNum = parseInt(lastNumStr.replace(/\D/g, ''), 10) || 0
            const nextNum = (lastNum + 1).toString().padStart(6, '0')
            setNextOrderNumber(`Pedido${nextNum}`)
        }

        void loadNextOrderNumber()
    }, [])

    const handlePlaceOrder = useCallback(() => {
        if (items.length === 0) {
            toast.error('Seu carrinho esta vazio.')
            return
        }

        if (!minOrderMet) {
            toast.error(`Pedido minimo: R$ ${settings?.min_order_amount?.toFixed(2)}`)
            return
        }

        if (!selectedPayment) {
            toast.error('Selecione uma condicao de pagamento.')
            return
        }

        setConfirmCheckoutOpen(true)
    }, [items.length, minOrderMet, selectedPayment, settings?.min_order_amount])

    const processOrder = useCallback(async () => {
        setLoading(true)
        setConfirmCheckoutOpen(false)

        try {
            const result = await checkoutAction(
                items,
                selectedPayment,
                notes,
                isTableRule,
                selectedAddressId
            )

            if ('error' in result && result.error) {
                toast.error(result.error)
                setLoading(false)
                return
            }

            if (!('orderId' in result) || !result.orderId) {
                toast.error(
                    'Pedido criado, mas nao foi possivel redirecionar. Verifique seus pedidos.'
                )
                clearCart()
                setLoading(false)
                router.push('/orders')
                return
            }

            const confirmationPath = `/order-confirmation/${result.orderId}`

            toast.success('Pedido realizado com sucesso!', { duration: 2500 })
            clearCart()
            router.replace(confirmationPath)

            // Fallback defensivo: garante abertura da confirmacao mesmo se a transicao
            // do App Router atrasar ou falhar em alguns dispositivos/mobile browsers.
            if (typeof window !== 'undefined') {
                window.setTimeout(() => {
                    if (window.location.pathname === '/cart') {
                        window.location.assign(confirmationPath)
                    }
                }, 250)
            }
        } catch (err) {
            console.error('[CHECKOUT] Unexpected error:', err)
            toast.error('Ocorreu um erro interno de conexao.')
            setLoading(false)
        }
    }, [clearCart, isTableRule, items, notes, router, selectedAddressId, selectedPayment])

    if (items.length === 0) {
        return <EmptyCartState onCatalog={() => router.push('/catalog')} />
    }

    return (
        <div className="mx-auto max-w-[1280px] px-4 py-4 pb-28 sm:px-6 lg:px-8 lg:py-6 lg:pb-8">
            <div className="space-y-4 lg:space-y-5">
                <div className="hidden md:block">
                    <CheckoutHeader
                        nextOrderNumber={nextOrderNumber}
                        count={count}
                        total={total}
                        onBack={() => router.back()}
                        onClear={clearCart}
                    />
                </div>

                {settings && settings.min_order_amount > 0 && total < settings.min_order_amount && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                    <AlertCircle className="h-4 w-4" />
                                    Pedido minimo
                                </p>
                                <p className="mt-1 text-sm text-amber-900">
                                    Faltam{' '}
                                    <strong>
                                        R$ {formatCurrency(settings.min_order_amount - total)}
                                    </strong>{' '}
                                    para atingir o minimo de R${' '}
                                    {formatCurrency(settings.min_order_amount)}.
                                </p>
                            </div>
                            <div className="min-w-[160px]">
                                <div className="h-2 overflow-hidden rounded-full bg-amber-200">
                                    <div
                                        className="h-full rounded-full bg-amber-500 transition-all duration-500"
                                        style={{
                                            width: `${Math.min(
                                                100,
                                                (total / settings.min_order_amount) * 100
                                            )}%`,
                                        }}
                                    />
                                </div>
                                <p className="mt-2 text-right text-xs text-amber-700">
                                    {Math.min(
                                        100,
                                        (total / settings.min_order_amount) * 100
                                    ).toFixed(0)}
                                    % do minimo atingido
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
                    <div className="space-y-5">
                        <CheckoutSection
                            icon={ShoppingBag}
                            eyebrow="Pedido"
                            title={`Produtos selecionados (${count})`}
                            className="-mx-4 rounded-none border-0 bg-transparent shadow-none sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:shadow-sm"
                            headerClassName="hidden sm:block sm:px-5 sm:py-4"
                            contentClassName="px-4 py-2 sm:px-5 sm:py-4"
                            iconWrapperClassName="h-7 w-7 rounded-lg sm:h-8 sm:w-8 sm:rounded-xl"
                            eyebrowClassName="hidden sm:block"
                            titleClassName="mt-0 text-[15px] sm:mt-0.5 sm:text-base"
                        >
                            <div className="mb-2 hidden items-center justify-between gap-3 sm:flex">
                                <p className="text-sm text-slate-500">
                                    Revise os itens e ajuste as quantidades.
                                </p>
                                <Button
                                    variant="ghost"
                                    className="h-8 rounded-lg px-2 text-sm text-slate-600"
                                    onClick={() => router.push('/catalog')}
                                >
                                    Continuar comprando
                                </Button>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {items.map((item, index) => (
                                    <motion.div
                                        key={item.variantId}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.04 }}
                                        layout
                                    >
                                        <CheckoutItemRow
                                            item={item}
                                            onRemove={() => removeItem(item.variantId)}
                                            onDecrease={() =>
                                                updateQuantity(item.variantId, item.quantity - 1)
                                            }
                                            onIncrease={() =>
                                                updateQuantity(item.variantId, item.quantity + 1)
                                            }
                                        />
                                    </motion.div>
                                ))}
                            </div>

                            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 sm:hidden">
                                <div className="flex items-center justify-between text-base text-slate-700">
                                    <span className="font-medium">Subtotal</span>
                                    <span className="text-lg font-semibold text-slate-950">
                                        R$ {formatCurrency(total)}
                                    </span>
                                </div>

                                <Button
                                    variant="outline"
                                    className="h-11 w-full rounded-xl border-slate-300 bg-transparent text-sm font-medium text-slate-700 shadow-none"
                                    onClick={() => router.push('/catalog')}
                                >
                                    Adicionar mais itens
                                </Button>
                            </div>
                        </CheckoutSection>

                        <section className="space-y-4 border-t border-slate-200 pt-4 sm:hidden">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-xl font-semibold text-slate-950">Entrega</h2>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Escolha o endereco de recebimento.
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 rounded-xl px-3 text-sm text-slate-600"
                                        onClick={() => setNewAddressDialogOpen(true)}
                                    >
                                        Adicionar
                                    </Button>
                                </div>

                                {addressesLoading ? (
                                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Carregando enderecos...
                                    </div>
                                ) : addressError ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                                        {addressError}
                                    </div>
                                ) : storeAddresses.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                                        Nenhum endereco cadastrado.
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-2xl bg-slate-50/70 ring-1 ring-slate-200/80">
                                        {storeAddresses.map((address, index) => {
                                            const isSelected = address.id === selectedAddressId

                                            return (
                                                <button
                                                    key={address.id}
                                                    type="button"
                                                    onClick={() => setSelectedAddressId(address.id)}
                                                    className={cn(
                                                        'w-full px-3 py-3 text-left transition-colors',
                                                        isSelected
                                                            ? 'bg-white'
                                                            : 'bg-transparent'
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span
                                                            className={cn(
                                                                'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                                                isSelected
                                                                    ? 'border-slate-950 bg-slate-950 text-white'
                                                                    : 'border-slate-300 bg-white'
                                                            )}
                                                        >
                                                            {isSelected && <Check className="h-3 w-3" />}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <p className="text-sm font-semibold text-slate-950">
                                                                    {address.title}
                                                                </p>
                                                                {address.is_main && (
                                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                                                        Principal
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-1 text-sm leading-5 text-slate-500">
                                                                {address.address}, {address.number}
                                                            </p>
                                                            <p className="text-sm leading-5 text-slate-500">
                                                                {address.city}/{address.state} - CEP{' '}
                                                                {address.zip_code}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {index < storeAddresses.length - 1 && (
                                                        <div className="mt-3 border-t border-slate-200/80" />
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                {deliveryMessage && (
                                    <p className="text-sm text-slate-500">{deliveryMessage}</p>
                                )}
                            </div>

                            <div className="space-y-3 border-t border-slate-200 pt-4">
                                <div>
                                    <h2 className="text-xl font-semibold text-slate-950">Pagamento</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Escolha a condicao comercial deste pedido.
                                    </p>
                                </div>

                                {mobilePaymentOptions.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                                        Nenhuma condicao de pagamento disponivel.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <Select
                                            value={selectedPayment}
                                            onValueChange={(value: string | null) => {
                                                if (!value) return
                                                setSelectedPayment(value)
                                                setIsTableRule(
                                                    priceTableRules.some((rule) => rule.id === value)
                                                )
                                            }}
                                        >
                                            <SelectTrigger className="min-h-11 rounded-2xl border-slate-200 bg-slate-50 px-3 text-left shadow-none">
                                                <SelectValue placeholder="Selecione a condicao">
                                                    {selectedPaymentLabel}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {priceTableRules.length > 0 && (
                                                    <>
                                                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                                                            Tabela
                                                        </div>
                                                        {priceTableRules.map((rule) => (
                                                            <SelectItem key={rule.id} value={rule.id}>
                                                                {getRuleLabel(rule)}
                                                            </SelectItem>
                                                        ))}
                                                        <Separator className="my-1" />
                                                    </>
                                                )}
                                                {paymentConditions.map((condition) => (
                                                    <SelectItem key={condition.id} value={condition.id}>
                                                        {getConditionLabel(condition)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {(selectedCondition?.description || isTableRule) && (
                                            <div className="rounded-2xl bg-slate-50/80 px-3 py-3 ring-1 ring-slate-200/70">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-slate-950">
                                                        {selectedPaymentLabel}
                                                    </p>
                                                    {discountPercentage > 0 && (
                                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                                            {discountPercentage.toFixed(0)}% off
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-sm leading-5 text-slate-500">
                                                    {selectedCondition?.description ||
                                                        'Regra comercial exclusiva da sua tabela B2B.'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>

                        <CheckoutSection
                            icon={MessageSquare}
                            eyebrow="Contexto"
                            title="Observacoes"
                            className="-mx-4 rounded-none border-0 bg-transparent shadow-none sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:shadow-sm"
                            headerClassName="hidden sm:block sm:px-5 sm:py-4"
                            contentClassName="px-4 py-0 sm:px-5 sm:py-4"
                        >
                            <div className="space-y-3">
                                <div className="sm:hidden">
                                    <h2 className="text-xl font-semibold text-slate-950">Observacoes</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Inclua detalhes importantes para este pedido.
                                    </p>
                                </div>
                                <Textarea
                                    placeholder="Inclua aqui informacoes importantes para este pedido."
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    rows={4}
                                    className="min-h-[120px] rounded-2xl border-slate-200 bg-white resize-none"
                                />
                            </div>
                        </CheckoutSection>
                    </div>

                    <div className="hidden space-y-4 xl:sticky xl:top-24 xl:block">
                        <CheckoutSection
                            icon={Receipt}
                            eyebrow="Resumo"
                            title="Resumo e envio"
                            className="border-slate-200/90 bg-white/95 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.28)]"
                            headerClassName="px-5 py-4"
                            contentClassName="px-5 py-4"
                        >
                            <div className="space-y-4">
                                {priceValidationPending && (
                                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-500">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Revalidando precos, variacoes e regras comerciais do pedido.
                                    </div>
                                )}

                                <div className="space-y-4 rounded-2xl bg-slate-50/80 px-4 py-4 ring-1 ring-slate-200/80">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                Endereco
                                            </Label>
                                            {selectedAddress?.is_main && (
                                                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                                                    Principal
                                                </span>
                                            )}
                                        </div>
                                        {addressesLoading ? (
                                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Carregando enderecos...
                                            </div>
                                        ) : addressError ? (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                                                {addressError}
                                            </div>
                                        ) : storeAddresses.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                                                Nenhum endereco cadastrado.
                                            </div>
                                        ) : (
                                            <Select
                                                value={selectedAddressId}
                                                onValueChange={(value: string | null) => {
                                                    if (value === 'add_new') {
                                                        setNewAddressDialogOpen(true)
                                                        return
                                                    }
                                                    if (value) {
                                                        setSelectedAddressId(value)
                                                    }
                                                }}
                                            >
                                            <SelectTrigger className="min-h-10 rounded-xl border-slate-200 bg-white px-3 shadow-none">
                                                <SelectValue placeholder="Selecione o endereco">
                                                    {selectedAddress
                                                        ? selectedAddress.title
                                                        : 'Selecione o endereco'}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storeAddresses.map((address) => (
                                                        <SelectItem
                                                            key={address.id}
                                                            value={address.id}
                                                        >
                                                            {address.title}
                                                            {address.is_main ? ' - principal' : ''}
                                                        </SelectItem>
                                                    ))}
                                                    <Separator className="my-1" />
                                                    <SelectItem value="add_new">
                                                        Adicionar novo endereco
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                        {selectedAddress && (
                                            <div className="rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-slate-500 ring-1 ring-slate-200/70">
                                                <p className="font-medium text-slate-800">
                                                    {selectedAddress.address}, {selectedAddress.number}
                                                </p>
                                                <p>
                                                    {selectedAddress.city}/{selectedAddress.state}
                                                    {' - '}CEP {selectedAddress.zip_code}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                Pagamento
                                            </Label>
                                            {discountPercentage > 0 && (
                                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                                    {discountPercentage.toFixed(0)}% off
                                                </span>
                                            )}
                                        </div>
                                        <Select
                                            value={selectedPayment}
                                            onValueChange={(value: string | null) => {
                                                if (!value) return
                                                setSelectedPayment(value)
                                                setIsTableRule(
                                                    priceTableRules.some(
                                                        (rule) => rule.id === value
                                                    )
                                                )
                                            }}
                                        >
                                            <SelectTrigger className="min-h-10 rounded-xl border-slate-200 bg-white px-3 shadow-none">
                                                <SelectValue placeholder="Selecione">
                                                    {selectedPaymentLabel}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {priceTableRules.length > 0 && (
                                                    <>
                                                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                                                            Tabela
                                                        </div>
                                                        {priceTableRules.map((rule) => (
                                                            <SelectItem
                                                                key={rule.id}
                                                                value={rule.id}
                                                            >
                                                                {getRuleLabel(rule)}
                                                            </SelectItem>
                                                        ))}
                                                        <Separator className="my-1" />
                                                    </>
                                                )}
                                                {paymentConditions.map((condition) => (
                                                    <SelectItem
                                                        key={condition.id}
                                                        value={condition.id}
                                                    >
                                                        {getConditionLabel(condition)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {(selectedCondition?.description || isTableRule) && (
                                        <p className="rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-slate-500 ring-1 ring-slate-200/70">
                                            {selectedCondition?.description ||
                                                'Regra comercial exclusiva da sua tabela B2B.'}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-3 rounded-2xl bg-slate-50/80 px-4 py-4 ring-1 ring-slate-200/80">
                                    <SummaryRow
                                        label={`Itens (${count})`}
                                        value={`R$ ${formatCurrency(total)}`}
                                    />
                                    {paymentDiscount > 0 && (
                                        <SummaryRow
                                            label={`Desconto de pagamento (${discountPercentage}%)`}
                                            value={`- R$ ${formatCurrency(paymentDiscount)}`}
                                            emphasis="success"
                                        />
                                    )}
                                    {paymentSurcharge > 0 && (
                                        <SummaryRow
                                            label={`Acrescimo de pagamento (${surchargePercentage}%)`}
                                            value={`+ R$ ${formatCurrency(paymentSurcharge)}`}
                                            emphasis="warning"
                                        />
                                    )}
                                    <Separator />
                                    <div className="flex items-end justify-between gap-4">
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                Total final
                                            </p>
                                            <p className="text-[1.9rem] font-bold tracking-tight text-slate-950">
                                                R$ {formatCurrency(finalTotal)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-white px-3 py-2.5 text-right ring-1 ring-slate-200/80">
                                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                                Pedido
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-slate-950">
                                                {nextOrderNumber || 'Em preparacao'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {!minOrderMet && settings?.min_order_amount && (
                                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-3 text-sm leading-6 text-amber-800">
                                        Pedido minimo de R$ {formatCurrency(settings.min_order_amount)}{' '}
                                        ainda nao atingido. Faltam R${' '}
                                        {formatCurrency(settings.min_order_amount - total)} para
                                        liberar o envio.
                                    </div>
                                )}

                                {deliveryMessage && (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/60 px-3 py-3 text-sm text-blue-800">
                                        <Truck className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div>
                                            <p className="font-medium">Prazo estimado</p>
                                            <p className="mt-0.5">{deliveryMessage}</p>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-3 text-sm text-emerald-800">
                                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>
                                        <p className="font-medium">Validacao automatica</p>
                                        <p className="mt-0.5">Precos revalidados antes do envio.</p>
                                    </div>
                                </div>

                                <Button
                                    className="hidden h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-900 md:inline-flex"
                                    onClick={handlePlaceOrder}
                                    disabled={loading || !minOrderMet}
                                >
                                    {loading ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <>
                                            <CreditCard className="mr-2 h-5 w-5" />
                                            Finalizar pedido
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CheckoutSection>
                    </div>
                </div>
            </div>

            <div
                className="fixed inset-x-3 z-40 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur md:hidden"
                style={{
                    bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
                }}
            >
                <div className="mx-auto flex max-w-7xl items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Total final
                        </p>
                        <p className="truncate text-lg font-bold text-slate-950">
                            R$ {formatCurrency(finalTotal)}
                        </p>
                    </div>
                    <Button
                        className="h-11 min-w-[168px] rounded-xl bg-slate-950 px-5 text-white shadow-sm transition-colors hover:bg-slate-900"
                        onClick={handlePlaceOrder}
                        disabled={loading || !minOrderMet}
                    >
                        {loading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <>
                                <CreditCard className="mr-2 h-5 w-5" />
                                Finalizar
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <Dialog open={newAddressDialogOpen} onOpenChange={setNewAddressDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">
                            Novo endereco de entrega
                        </DialogTitle>
                        <DialogDescription>
                            Cadastre um novo local para este pedido.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <AddressForm
                            onCancel={() => setNewAddressDialogOpen(false)}
                            onSuccess={(newAddress) => {
                                setStoreAddresses((previous) => [...previous, newAddress])
                                setSelectedAddressId(newAddress.id)
                                setNewAddressDialogOpen(false)
                            }}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmCheckoutOpen} onOpenChange={setConfirmCheckoutOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">
                            Confirmar pedido
                        </DialogTitle>
                        <DialogDescription>
                            Revise o resumo do seu pedido antes de enviar para analise.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <SummaryRow
                                label={`Itens (${count})`}
                                value={`R$ ${formatCurrency(total)}`}
                            />
                            <SummaryRow label="Pagamento" value={selectedPaymentLabel} />
                            {selectedAddress && (
                                <SummaryRow label="Entrega" value={selectedAddress.title} />
                            )}
                            {(paymentDiscount > 0 || paymentSurcharge > 0) && (
                                <SummaryRow
                                    label="Ajuste de pagamento"
                                    value={
                                        paymentDiscount > 0
                                            ? `- R$ ${formatCurrency(paymentDiscount)}`
                                            : `+ R$ ${formatCurrency(paymentSurcharge)}`
                                    }
                                    emphasis={
                                        paymentDiscount > 0 ? 'success' : 'warning'
                                    }
                                />
                            )}
                            <Separator />
                            <SummaryRow
                                label="Total a pagar"
                                value={`R$ ${formatCurrency(finalTotal)}`}
                                emphasis="strong"
                            />
                        </div>
                    </div>

                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                        <Button
                            variant="outline"
                            onClick={() => setConfirmCheckoutOpen(false)}
                            className="w-full sm:w-auto"
                        >
                            Revisar checkout
                        </Button>
                        <Button
                            onClick={processOrder}
                            className="w-full gap-2 gradient-bronze border-0 text-white sm:w-auto"
                        >
                            <Check className="h-4 w-4" />
                            Confirmar e enviar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}


