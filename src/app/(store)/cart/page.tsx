'use client'

import { type ComponentType, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
    ShieldCheck,
    ShoppingBag,
    TicketPercent,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useSettings } from '@/components/providers/settings-provider'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/lib/stores/cart-store'
import type {
    CartItem,
    PaymentCondition,
    PaymentMethod,
    PaymentMethodCondition,
    PriceTablePaymentRule,
    StoreAddress,
} from '@/lib/types'
import { toast } from 'sonner'
import {
    checkoutAction,
    getCheckoutBootstrap,
    previewCouponForOrder,
} from './actions'
import type { CheckoutBootstrapPayload, CheckoutCouponPreview } from './actions'

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function getCartItemKey(item: CartItem) {
    return item.cartKey || `${item.variantId}::${item.sizeOptionId || 'legacy'}`
}

function getRuleLabel(rule: PriceTablePaymentRule) {
    return `${rule.number_of_installments}x${rule.installment_days ? ` (${rule.installment_days})` : ''}${rule.discount_percentage > 0 ? ` -${rule.discount_percentage}%` : ''}`
}

function getConditionLabel(condition: PaymentCondition) {
    return `${condition.name}${condition.discount_percentage > 0 ? ` -${condition.discount_percentage}%` : ''}`
}

function getFriendlyCouponErrorMessage(message: string) {
    const normalized = message.toLowerCase()
    if (normalized.includes('expir')) return 'Este cupom nao esta mais vigente.'
    if (normalized.includes('inativ')) return 'Este cupom nao esta disponivel no momento.'
    if (normalized.includes('minimo')) return 'Este pedido ainda nao atingiu o valor minimo para este cupom.'
    if (normalized.includes('limite')) return 'Este cupom atingiu o limite de uso.'
    if (normalized.includes('nao encontrado')) return 'Nao encontramos esse cupom. Confira o codigo e tente novamente.'
    if (normalized.includes('nao se aplica')) return 'Este cupom nao se aplica aos itens do seu carrinho.'
    if (normalized.includes('ainda nao esta vigente')) return 'Este cupom ainda nao esta vigente.'
    if (normalized.includes('loja nao pertence ao perfil informado')) {
        return 'Este cupom nao pode ser aplicado no modo de visualizacao atual. Entre com a conta do cliente para validar.'
    }
    if (normalized.includes('subtotal invalido')) return 'Nao foi possivel validar os itens do carrinho para aplicar o cupom.'
    if (normalized.includes('itens do pedido sao obrigatorios')) return 'Adicione itens no carrinho para aplicar este cupom.'
    if (normalized.includes('acesso negado')) return 'Sua sessao nao tem permissao para validar este cupom.'
    if (normalized.includes('escopo') || normalized.includes('cliente') || normalized.includes('tabela')) {
        return 'Este cupom nao se aplica a este pedido.'
    }
    const cleaned = message
        .replace(/^falha ao validar cupom:\s*/i, '')
        .replace(/^erro ao validar cupom:\s*/i, '')
        .trim()
    if (
        cleaned &&
        cleaned.length <= 180 &&
        !cleaned.toLowerCase().includes('function public.') &&
        !cleaned.toLowerCase().includes('sqlstate') &&
        !cleaned.toLowerCase().includes('stack')
    ) {
        return cleaned
    }
    return 'Nao foi possivel aplicar este cupom agora. Tente novamente.'
}

type CheckoutPaymentMethodGroup = {
    method: PaymentMethod
    conditions: PaymentMethodCondition[]
    rules: PriceTablePaymentRule[]
}

type CheckoutPaymentOption = {
    id: string
    label: string
    description: string | null
    discountPercentage: number
    surchargePercentage: number
    isTableRule: boolean
    methodId: string | null
}

type CouponInlineFeedback = {
    tone: 'info' | 'error'
    message: string
}

function buildPaymentOptionsFromMethodGroup(group: CheckoutPaymentMethodGroup): CheckoutPaymentOption[] {
    const conditionOptions = group.conditions
        .filter((link) => link.is_active && link.payment_condition?.is_active)
        .map((link) => ({
            id: link.payment_condition_id,
            label: link.payment_condition ? getConditionLabel(link.payment_condition) : 'Condição comercial',
            description: link.payment_condition?.description || group.method.description || null,
            discountPercentage: link.payment_condition?.discount_percentage || 0,
            surchargePercentage: link.payment_condition?.surcharge_percentage || 0,
            isTableRule: false,
            methodId: group.method.id,
        }))

    const ruleOptions = group.rules.map((rule) => ({
        id: rule.id,
        label:
            rule.payment_method_condition?.payment_condition?.name ||
            getRuleLabel(rule),
        description:
            rule.payment_method_condition?.payment_condition?.description ||
            'Regra comercial exclusiva da sua tabela B2B.',
        discountPercentage: rule.discount_percentage,
        surchargePercentage: rule.surcharge_percentage || 0,
        isTableRule: true,
        methodId: group.method.id,
    }))

    return [...ruleOptions, ...conditionOptions]
}

function resolvePaymentSelection(
    payload: Pick<CheckoutBootstrapPayload, 'paymentMethods' | 'priceTableRules' | 'globalConditions'>,
    currentMethodId: string,
    currentPaymentId: string
) {
    const groupedMethods = payload.paymentMethods.filter(
        (group) => group.rules.length > 0 || group.conditions.length > 0
    )

    if (groupedMethods.length > 0) {
        const nextMethodId = groupedMethods.some((group) => group.method.id === currentMethodId)
            ? currentMethodId
            : groupedMethods[0].method.id
        const nextGroup =
            groupedMethods.find((group) => group.method.id === nextMethodId) || groupedMethods[0]
        const nextOptions = buildPaymentOptionsFromMethodGroup(nextGroup)

        return {
            selectedPaymentMethod: nextMethodId,
            selectedPayment: nextOptions.some((option) => option.id === currentPaymentId)
                ? currentPaymentId
                : nextOptions[0]?.id || '',
        }
    }

    if (payload.priceTableRules.length > 0) {
        return {
            selectedPaymentMethod: '',
            selectedPayment: payload.priceTableRules.some((rule) => rule.id === currentPaymentId)
                ? currentPaymentId
                : payload.priceTableRules[0].id,
        }
    }

    if (payload.globalConditions.length > 0) {
        return {
            selectedPaymentMethod: '',
            selectedPayment: payload.globalConditions.some(
                (condition) => condition.id === currentPaymentId
            )
                ? currentPaymentId
                : payload.globalConditions[0].id,
        }
    }

    return {
        selectedPaymentMethod: '',
        selectedPayment: '',
    }
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
                'overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
                className
            )}
        >
            <CardHeader
                className={cn('border-b border-border px-4 py-4 sm:px-5', headerClassName)}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground',
                            iconWrapperClassName
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p
                            className={cn(
                                'text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
                                eyebrowClassName
                            )}
                        >
                            {eyebrow}
                        </p>
                        <CardTitle
                            className={cn('mt-0.5 text-base font-semibold text-foreground', titleClassName)}
                        >
                            {title}
                        </CardTitle>
                        {description && (
                            <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className={cn('px-4 py-4 sm:px-5', contentClassName)}>{children}</CardContent>
        </Card>
    )
}

function CheckoutHeader({
    title,
    count,
    total,
    onBack,
    onClear,
}: {
    title: string
    count: number
    total: number
    onBack: () => void
    onClear: () => void
}) {
    return (
        <div className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        className="mt-0.5 h-9 w-9 rounded-xl border-border"
                        onClick={onBack}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="font-[family-name:var(--font-heading)] text-xl font-bold text-foreground sm:text-2xl">
                            {title}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Revise, escolha entrega e confirme o pedido.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <div className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{count}</span>{' '}
                        {count === 1 ? 'item' : 'itens'}
                    </div>
                    <div className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        Total parcial
                        <span className="ml-1 font-semibold text-foreground">
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
                className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-sm"
            >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                </div>
                <h1 className="mt-5 text-2xl font-bold text-foreground">Carrinho vazio</h1>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
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
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                        {item.imageUrl ? (
                            <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <Package className="h-4 w-4" />
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                                    {item.quantity}x {item.productName}
                                </h3>
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                    {variantSummary}
                                </p>
                            </div>

                            <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold text-foreground">
                                    R$ {formatCurrency(subtotal)}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Unit. R$ {formatCurrency(item.unitPrice)}
                                </p>
                            </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
                                    onClick={onDecrease}
                                >
                                    <Minus className="h-3 w-3" strokeWidth={2.2} />
                                </Button>
                                <span className="min-w-7 px-1 text-center text-[12px] font-semibold tracking-tight text-foreground">
                                    {item.quantity}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
                                    onClick={onIncrease}
                                >
                                    <Plus className="h-3 w-3" strokeWidth={2.2} />
                                </Button>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                <div className="relative h-[72px] w-[72px] overflow-hidden rounded-xl border border-border bg-muted">
                    {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Package className="h-7 w-7" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                                {item.productName}
                            </h3>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    {item.fabricName}
                                </span>
                                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                    {item.colorName}
                                </span>
                                {item.size && (
                                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                        {item.size}
                                    </span>
                                )}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive xl:hidden"
                            onClick={onRemove}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 xl:hidden">
                        <div className="text-sm text-muted-foreground">
                            <span>R$ {formatCurrency(item.unitPrice)}</span>
                            <span className="mx-2 text-muted-foreground">/</span>
                            <span className="font-semibold text-foreground">
                                R$ {formatCurrency(subtotal)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onDecrease}>
                                <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-7 text-center text-sm font-semibold text-foreground">
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
                        <p className="text-xs text-muted-foreground">Unitario</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                            R$ {formatCurrency(item.unitPrice)}
                        </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onDecrease}>
                            <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-7 text-center text-sm font-semibold text-foreground">
                            {item.quantity}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onIncrease}>
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <div className="min-w-[96px] text-right">
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                            R$ {formatCurrency(subtotal)}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 rounded-xl px-2.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
            ? 'text-emerald-600 dark:text-emerald-500'
            : emphasis === 'warning'
              ? 'text-amber-600 dark:text-amber-500'
              : emphasis === 'strong'
                ? 'text-foreground'
                : 'text-muted-foreground'

    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn('text-right font-medium', colorClass)}>{value}</span>
        </div>
    )
}

function CartPageSkeleton() {
    return (
        <div className="mx-auto max-w-[1280px] px-4 py-4 pb-44 sm:px-6 sm:pb-28 lg:px-8 lg:py-6 lg:pb-8">
            <div className="space-y-5">
                <div className="hidden animate-pulse md:block">
                    <div className="h-28 rounded-[28px] bg-muted/60" />
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
                    <div className="space-y-5">
                        <div className="h-[420px] animate-pulse rounded-[28px] bg-muted/50" />
                        <div className="h-[220px] animate-pulse rounded-[28px] bg-muted/40" />
                    </div>
                    <div className="h-[540px] animate-pulse rounded-[28px] bg-muted/50" />
                </div>
            </div>
        </div>
    )
}

export default function CartPage() {
    const router = useRouter()
    const { items, removeItem, updateQuantity, subtotal, totalItems, clearCart, setItems } =
        useCartStore()
    const persistApi = 'persist' in useCartStore ? useCartStore.persist : undefined
    const { settings } = useSettings()

    const [loading, setLoading] = useState(false)
    const [paymentMethodGroups, setPaymentMethodGroups] = useState<CheckoutPaymentMethodGroup[]>([])
    const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([])
    const [priceTableRules, setPriceTableRules] = useState<PriceTablePaymentRule[]>([])
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
    const [selectedPayment, setSelectedPayment] = useState('')
    const [storeAddresses, setStoreAddresses] = useState<StoreAddress[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState('')
    const [addressesLoading, setAddressesLoading] = useState(true)
    const [addressError, setAddressError] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false)
    const [newAddressDialogOpen, setNewAddressDialogOpen] = useState(false)
    const [couponInput, setCouponInput] = useState('')
    const [appliedCoupon, setAppliedCoupon] = useState<CheckoutCouponPreview | null>(null)
    const [couponApplying, setCouponApplying] = useState(false)
    const [couponInlineFeedback, setCouponInlineFeedback] = useState<CouponInlineFeedback | null>(null)
    const [priceValidationPending, setPriceValidationPending] = useState(false)
    const [checkoutBlockedByPolicy, setCheckoutBlockedByPolicy] = useState(false)
    const [paymentRestrictionMessage, setPaymentRestrictionMessage] = useState<string | null>(null)
    const selectedPaymentMethodRef = useRef(selectedPaymentMethod)
    const selectedPaymentRef = useRef(selectedPayment)
    const checkoutBootstrapRequestRef = useRef(0)
    const [isCartHydrated, setIsCartHydrated] = useState(() => persistApi?.hasHydrated?.() ?? false)

    const total = subtotal()
    const count = totalItems()
    const checkoutBootstrapKey = useMemo(
        () =>
            items
                .map((item) => `${getCartItemKey(item)}:${item.quantity}:${item.unitPrice}`)
                .sort()
                .join('|'),
        [items]
    )
    const couponValidationKey = checkoutBootstrapKey
    const lastCouponValidationKeyRef = useRef('')

    const selectedAddress = useMemo(
        () => storeAddresses.find((address) => address.id === selectedAddressId) || null,
        [selectedAddressId, storeAddresses]
    )

    const selectedMethodGroup = useMemo(
        () =>
            paymentMethodGroups.find((group) => group.method.id === selectedPaymentMethod) || null,
        [paymentMethodGroups, selectedPaymentMethod]
    )

    const selectedMethodOptions = useMemo(
        () => (selectedMethodGroup ? buildPaymentOptionsFromMethodGroup(selectedMethodGroup) : []),
        [selectedMethodGroup]
    )

    const fallbackPaymentOptions = useMemo(
        () => [
            ...priceTableRules.map((rule) => ({
                id: rule.id,
                label: getRuleLabel(rule),
                description: 'Regra comercial exclusiva da sua tabela B2B.',
                discountPercentage: rule.discount_percentage,
                surchargePercentage: rule.surcharge_percentage || 0,
                isTableRule: true,
                methodId: null,
            })),
            ...paymentConditions.map((condition) => ({
                id: condition.id,
                label: getConditionLabel(condition),
                description: condition.description || null,
                discountPercentage: condition.discount_percentage,
                surchargePercentage: condition.surcharge_percentage || 0,
                isTableRule: false,
                methodId: null,
            })),
        ],
        [paymentConditions, priceTableRules]
    )

    const paymentOptions = selectedMethodOptions.length > 0 ? selectedMethodOptions : fallbackPaymentOptions

    const selectedPaymentOption = useMemo(
        () => paymentOptions.find((option) => option.id === selectedPayment) || null,
        [paymentOptions, selectedPayment]
    )

    const isTableRule = Boolean(selectedPaymentOption?.isTableRule)

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

    const discountPercentage =
        selectedRule?.discount_percentage || selectedCondition?.discount_percentage || 0
    const surchargePercentage =
        selectedRule?.surcharge_percentage ||
        selectedCondition?.surcharge_percentage ||
        selectedPaymentOption?.surchargePercentage ||
        0
    const couponDiscount = appliedCoupon?.discountAmount || 0
    const paymentDiscountBlockedByCoupon = Boolean(appliedCoupon?.paymentDiscountBlocked)
    const paymentDiscountPercentageEffective = paymentDiscountBlockedByCoupon ? 0 : discountPercentage
    const baseAfterCoupon = Math.max(0, total - couponDiscount)
    const paymentDiscount = baseAfterCoupon * (paymentDiscountPercentageEffective / 100)
    const discountedTotal = Math.max(0, baseAfterCoupon - paymentDiscount)
    const paymentSurcharge = discountedTotal * (surchargePercentage / 100)
    const finalTotal = discountedTotal + paymentSurcharge
    const minOrderMet = !settings?.min_order_amount || total >= settings.min_order_amount
    const canCheckout = minOrderMet && !checkoutBlockedByPolicy && !couponApplying

    const selectedPaymentLabel = selectedPaymentOption
        ? `${selectedMethodGroup?.method.name ? `${selectedMethodGroup.method.name} · ` : ''}${selectedPaymentOption.label}`
        : 'Selecione uma condição'

    const selectedPaymentDescription =
        selectedPaymentOption?.description ||
        (isTableRule ? 'Regra comercial exclusiva da sua tabela B2B.' : null)

    useEffect(() => {
        if (!persistApi) {
            setIsCartHydrated(true)
            return
        }

        setIsCartHydrated(persistApi.hasHydrated?.() ?? false)

        const unsubscribeHydrate = persistApi.onHydrate?.(() => setIsCartHydrated(false))
        const unsubscribeFinishHydration = persistApi.onFinishHydration?.(() => setIsCartHydrated(true))

        return () => {
            unsubscribeHydrate?.()
            unsubscribeFinishHydration?.()
        }
    }, [persistApi])

    const applyCouponCode = useCallback(async (rawCode: string, options?: { silent?: boolean }) => {
        const normalizedCode = rawCode.trim().toUpperCase()
        if (!normalizedCode) {
            if (!options?.silent) {
                setCouponInlineFeedback({
                    tone: 'error',
                    message: 'Digite um cupom para aplicar.',
                })
            }
            return false
        }

        setCouponApplying(true)
        try {
            const result = await previewCouponForOrder(items, normalizedCode)
            if ('error' in result && result.error) {
                if (options?.silent) {
                    setAppliedCoupon(null)
                    setCouponInput('')
                    setCouponInlineFeedback({
                        tone: 'info',
                        message: 'Seu cupom foi removido porque os itens do carrinho mudaram.',
                    })
                    toast.message('Cupom removido apos atualizacao do carrinho.')
                } else {
                    setCouponInlineFeedback({
                        tone: 'error',
                        message: getFriendlyCouponErrorMessage(result.error),
                    })
                }
                return false
            }

            if (!('data' in result) || !result.data) {
                const fallbackMessage = 'Nao conseguimos validar esse cupom agora. Tente novamente.'
                if (options?.silent) {
                    setAppliedCoupon(null)
                    setCouponInput('')
                    setCouponInlineFeedback({
                        tone: 'info',
                        message: 'Seu cupom foi removido porque os itens do carrinho mudaram.',
                    })
                    toast.message('Cupom removido apos atualizacao do carrinho.')
                } else {
                    setCouponInlineFeedback({
                        tone: 'error',
                        message: fallbackMessage,
                    })
                }
                return false
            }

            setAppliedCoupon(result.data)
            setCouponInput(result.data.couponCode)
            setCouponInlineFeedback(null)
            lastCouponValidationKeyRef.current = `${result.data.couponCode}::${couponValidationKey}`
            return true
        } finally {
            setCouponApplying(false)
        }
    }, [couponValidationKey, items])

    const handleApplyCoupon = useCallback(() => {
        void applyCouponCode(couponInput, { silent: false })
    }, [applyCouponCode, couponInput])

    const handleRemoveCoupon = useCallback(() => {
        setAppliedCoupon(null)
        setCouponInput('')
        setCouponInlineFeedback({
            tone: 'info',
            message: 'Cupom removido.',
        })
        lastCouponValidationKeyRef.current = ''
    }, [])

    const handleCouponInputChange = useCallback((value: string) => {
        setCouponInput(value.toUpperCase())
        if (couponInlineFeedback?.tone === 'error') {
            setCouponInlineFeedback(null)
        }
    }, [couponInlineFeedback?.tone])

    useEffect(() => {
        selectedPaymentMethodRef.current = selectedPaymentMethod
    }, [selectedPaymentMethod])

    useEffect(() => {
        selectedPaymentRef.current = selectedPayment
    }, [selectedPayment])

    useEffect(() => {
        if (!appliedCoupon?.couponCode) return

        const nextValidationKey = `${appliedCoupon.couponCode}::${couponValidationKey}`
        if (nextValidationKey === lastCouponValidationKeyRef.current) return

        lastCouponValidationKeyRef.current = nextValidationKey
        void applyCouponCode(appliedCoupon.couponCode, { silent: true })
    }, [appliedCoupon?.couponCode, applyCouponCode, couponValidationKey])

    useEffect(() => {
        if (!selectedMethodGroup) return

        const nextOptions = buildPaymentOptionsFromMethodGroup(selectedMethodGroup)
        setSelectedPayment((previous) =>
            nextOptions.some((option) => option.id === previous) ? previous : nextOptions[0]?.id || ''
        )
    }, [selectedMethodGroup])

    const deliveryMessage =
        settings?.default_delivery_days && settings.default_delivery_days > 0
            ? `${settings.default_delivery_days} dias uteis estimados`
            : null

    const renderCouponSection = (className?: string) => (
        <CheckoutSection
            icon={TicketPercent}
            eyebrow="Cupom"
            title="Cupom de desconto"
            description="Aplique um cupom e acompanhe sua economia em tempo real."
            className={cn('border-border', className)}
        >
            <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        value={couponInput}
                        onChange={(event) => handleCouponInputChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                if (!couponApplying && couponInput.trim()) {
                                    handleApplyCoupon()
                                }
                            }
                        }}
                        placeholder="Tem cupom? Digite aqui"
                        className="h-11 rounded-xl border-border"
                        disabled={couponApplying}
                    />
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="h-11 rounded-xl border-border"
                            onClick={handleApplyCoupon}
                            disabled={couponApplying || !couponInput.trim()}
                        >
                            {couponApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Aplicar
                        </Button>
                        {appliedCoupon && (
                            <Button
                                variant="ghost"
                                className="h-11 rounded-xl text-muted-foreground hover:text-foreground"
                                onClick={handleRemoveCoupon}
                                disabled={couponApplying}
                            >
                                Remover
                            </Button>
                        )}
                    </div>
                </div>

                {couponApplying ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validando cupom...
                    </div>
                ) : appliedCoupon ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-emerald-200 bg-card px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-500">
                                Cupom aplicado
                            </span>
                            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">
                                {appliedCoupon.couponCode}
                            </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
                            Voce economizou R$ {formatCurrency(appliedCoupon.discountAmount)}.
                        </p>
                    </div>
                ) : couponInlineFeedback ? (
                    <div
                        className={cn(
                            'rounded-xl border px-3 py-3 text-sm',
                            couponInlineFeedback.tone === 'error'
                                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10'
                                : 'border-border bg-muted text-muted-foreground'
                        )}
                    >
                        {couponInlineFeedback.message}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Digite seu codigo e clique em aplicar para calcular sua economia.
                    </p>
                )}
            </div>
        </CheckoutSection>
    )

    useEffect(() => {
        if (!isCartHydrated || items.length === 0) {
            setAddressesLoading(false)
            setPriceValidationPending(false)
            return
        }

        const requestId = ++checkoutBootstrapRequestRef.current
        const timeoutId = window.setTimeout(() => {
            setAddressesLoading(true)
            setPriceValidationPending(true)
            setAddressError(null)

            void getCheckoutBootstrap(items)
                .then((result) => {
                    if (requestId !== checkoutBootstrapRequestRef.current) return
                    if (!result || ('error' in result && result.error)) {
                        const message =
                            ('error' in result && result.error) ||
                            'Nao foi possivel atualizar o checkout agora.'
                        toast.warning(message)
                        setAddressError(message)
                        return
                    }

                    if (!('data' in result) || !result.data) {
                        const message = 'Nao foi possivel carregar o checkout agora.'
                        toast.warning(message)
                        setAddressError(message)
                        return
                    }

                    const payload = result.data
                    setStoreAddresses(payload.addresses)
                    setSelectedAddressId((previous) =>
                        payload.addresses.some((address) => address.id === previous)
                            ? previous
                            : payload.defaultAddressId
                    )

                    setPaymentMethodGroups(payload.paymentMethods)
                    setPriceTableRules(payload.priceTableRules)
                    setPaymentConditions(payload.globalConditions)
                    setCheckoutBlockedByPolicy(payload.checkoutBlocked)
                    setPaymentRestrictionMessage(payload.paymentRestrictionMessage)

                    const nextSelection = resolvePaymentSelection(
                        payload,
                        selectedPaymentMethodRef.current,
                        selectedPaymentRef.current
                    )
                    setSelectedPaymentMethod(nextSelection.selectedPaymentMethod)
                    setSelectedPayment(nextSelection.selectedPayment)

                    if (payload.missingKeys.length > 0) {
                        toast.error(
                            'Alguns itens nao estao mais disponiveis e foram removidos do carrinho.'
                        )
                    }

                    if (payload.priceChanged) {
                        toast.message('Precos atualizados conforme tabela comercial e variacoes.')
                    }

                    if (payload.missingKeys.length > 0 || payload.priceChanged) {
                        setItems(payload.reconciledItems)
                    }
                })
                .catch((err: unknown) => {
                    if (requestId !== checkoutBootstrapRequestRef.current) return
                    console.error('[CHECKOUT] Failed to bootstrap checkout:', err)
                    const message =
                        err instanceof Error
                            ? err.message
                            : 'Erro ao atualizar checkout.'
                    toast.warning(message)
                    setAddressError(message)
                })
                .finally(() => {
                    if (requestId !== checkoutBootstrapRequestRef.current) return
                    setAddressesLoading(false)
                    setPriceValidationPending(false)
                })
        }, 180)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [checkoutBootstrapKey, isCartHydrated, items, setItems])

    const handlePlaceOrder = useCallback(() => {
        if (items.length === 0) {
            toast.error('Seu carrinho esta vazio.')
            return
        }

        if (checkoutBlockedByPolicy) {
            toast.error(
                paymentRestrictionMessage ||
                    'Checkout indisponivel para o perfil financeiro deste cliente.'
            )
            return
        }

        if (!minOrderMet) {
            toast.error(`Pedido minimo: R$ ${settings?.min_order_amount?.toFixed(2)}`)
            return
        }

        if (!selectedPayment) {
            toast.error('Selecione um meio e uma condição de pagamento.')
            return
        }

        if (couponApplying) {
            toast.message('Aguarde a validacao do cupom antes de finalizar.')
            return
        }

        setConfirmCheckoutOpen(true)
    }, [
        couponApplying,
        checkoutBlockedByPolicy,
        items.length,
        minOrderMet,
        paymentRestrictionMessage,
        selectedPayment,
        settings?.min_order_amount,
    ])

    const processOrder = useCallback(async () => {
        if (couponApplying) {
            toast.message('Aguarde a validacao do cupom antes de confirmar.')
            return
        }

        if (checkoutBlockedByPolicy) {
            toast.error(
                paymentRestrictionMessage ||
                    'Checkout indisponivel para o perfil financeiro deste cliente.'
            )
            return
        }

        setLoading(true)
        setConfirmCheckoutOpen(false)

        try {
            const result = await checkoutAction(
                items,
                selectedPayment,
                notes,
                isTableRule,
                selectedAddressId,
                appliedCoupon?.couponCode || null
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
    }, [
        couponApplying,
        checkoutBlockedByPolicy,
        clearCart,
        isTableRule,
        items,
        notes,
        paymentRestrictionMessage,
        router,
        appliedCoupon?.couponCode,
        selectedAddressId,
        selectedPayment,
    ])

    if (!isCartHydrated) {
        return <CartPageSkeleton />
    }

    if (items.length === 0) {
        return <EmptyCartState onCatalog={() => router.push('/catalog')} />
    }

    return (
        <div className="mx-auto max-w-[1280px] px-4 py-4 pb-44 sm:px-6 sm:pb-28 lg:px-8 lg:py-6 lg:pb-8">
            <div className="space-y-4 lg:space-y-5">
                <div className="hidden md:block">
                    <CheckoutHeader
                        title="Finalizar pedido"
                        count={count}
                        total={total}
                        onBack={() => router.back()}
                        onClear={clearCart}
                    />
                </div>

                {settings && settings.min_order_amount > 0 && total < settings.min_order_amount && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-500">
                                    <AlertCircle className="h-4 w-4" />
                                    Pedido minimo
                                </p>
                                <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
                                    Faltam{' '}
                                    <strong>
                                        R$ {formatCurrency(settings.min_order_amount - total)}
                                    </strong>{' '}
                                    para atingir o minimo de R${' '}
                                    {formatCurrency(settings.min_order_amount)}.
                                </p>
                            </div>
                            <div className="min-w-[160px]">
                                <div className="h-2 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-500/20">
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
                                <p className="mt-2 text-right text-xs text-amber-700 dark:text-amber-500">
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
                            className="-mx-4 rounded-none border-0 bg-transparent shadow-none sm:mx-0 sm:rounded-2xl sm:border sm:bg-card sm:shadow-sm"
                            headerClassName="hidden sm:block sm:px-5 sm:py-4"
                            contentClassName="px-4 py-2 sm:px-5 sm:py-4"
                            iconWrapperClassName="h-7 w-7 rounded-lg sm:h-8 sm:w-8 sm:rounded-xl"
                            eyebrowClassName="hidden sm:block"
                            titleClassName="mt-0 text-[15px] sm:mt-0.5 sm:text-base"
                        >
                            <div className="mb-2 hidden items-center justify-between gap-3 sm:flex">
                                <p className="text-sm text-muted-foreground">
                                    Revise os itens e ajuste as quantidades.
                                </p>
                                <Button
                                    variant="ghost"
                                    className="group h-9 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground flex items-center gap-2"
                                    onClick={() => router.push('/catalog')}
                                >
                                    <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    Continuar comprando
                                </Button>
                            </div>

                            <div className="divide-y divide-border">
                                {items.map((item, index) => (
                                    <motion.div
                                        key={getCartItemKey(item)}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.04 }}
                                        layout
                                    >
                                        <CheckoutItemRow
                                            item={item}
                                            onRemove={() => removeItem(getCartItemKey(item))}
                                            onDecrease={() =>
                                                updateQuantity(
                                                    getCartItemKey(item),
                                                    item.quantity - 1
                                                )
                                            }
                                            onIncrease={() =>
                                                updateQuantity(
                                                    getCartItemKey(item),
                                                    item.quantity + 1
                                                )
                                            }
                                        />
                                    </motion.div>
                                ))}
                            </div>

                            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
                                <Button
                                    variant="outline"
                                    className="order-2 h-11 w-full rounded-xl border-border bg-card text-sm font-medium text-muted-foreground shadow-none hover:bg-muted sm:order-1 sm:h-10 sm:w-auto"
                                    onClick={() => router.push('/catalog')}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar mais itens
                                </Button>
                                <div className="order-1 flex items-center justify-between text-base sm:order-2 sm:justify-end sm:gap-4">
                                    <span className="text-sm font-medium text-muted-foreground">Subtotal dos itens</span>
                                    <span className="text-lg font-bold tracking-tight text-foreground">
                                        R$ {formatCurrency(total)}
                                    </span>
                                </div>
                            </div>
                        </CheckoutSection>

                        {/* -- Mobile: Pagamento Card ------------------ */}
                        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:hidden mb-4">
                            <div className="border-b border-border px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500">
                                        <CreditCard className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-1 items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Condicao</p>
                                            <h2 className="text-[15px] font-semibold text-foreground">Pagamento</h2>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="px-4 py-4 space-y-4">
                                {paymentRestrictionMessage && (
                                    <div
                                        className={cn(
                                            'rounded-xl border px-3 py-3 text-sm',
                                            checkoutBlockedByPolicy
                                                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10'
                                                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10'
                                        )}
                                    >
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                            <p>{paymentRestrictionMessage}</p>
                                        </div>
                                    </div>
                                )}
                                {paymentOptions.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                                        Nenhum meio de pagamento disponível.
                                    </div>
                                ) : (
                                    <>
                                        {paymentMethodGroups.length > 0 && (
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-foreground">
                                                    Forma de Pagamento
                                                </Label>
                                                <Select
                                                    value={selectedPaymentMethod}
                                                    onValueChange={(value: string | null) => {
                                                        if (value) setSelectedPaymentMethod(value)
                                                    }}
                                                >
                                                    <SelectTrigger className="min-h-11 rounded-xl border-border bg-muted/50 px-3 shadow-none">
                                                        <SelectValue placeholder="Selecione...">
                                                            {selectedMethodGroup?.method.name || 'Selecione...'}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {paymentMethodGroups.map((group) => {
                                                            const hasOptions = group.rules.length > 0 || group.conditions.length > 0
                                                            return (
                                                                <SelectItem
                                                                    key={group.method.id}
                                                                    value={group.method.id}
                                                                    disabled={!hasOptions}
                                                                >
                                                                    {group.method.name}
                                                                    {!hasOptions && ' (indisponível)'}
                                                                </SelectItem>
                                                            )
                                                        })}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Label className="text-sm font-semibold text-foreground">
                                                    Tipo de Pagamento
                                                </Label>
                                                {paymentDiscountPercentageEffective > 0 && (
                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-500 dark:border-emerald-500/20">
                                                        {paymentDiscountPercentageEffective.toFixed(0)}% off
                                                    </span>
                                                )}
                                            </div>
                                            <Select
                                                value={selectedPayment}
                                                onValueChange={(value: string | null) => {
                                                    if (!value) return
                                                    setSelectedPayment(value)
                                                }}
                                            >
                                                <SelectTrigger className="min-h-11 rounded-xl border-border bg-muted/50 px-3 shadow-none">
                                                    <SelectValue placeholder="Selecione...">
                                                        {selectedPaymentOption?.label || 'Selecione...'}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {paymentOptions.map((option) => (
                                                        <SelectItem
                                                            key={option.id}
                                                            value={option.id}
                                                        >
                                                            {option.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectedPaymentDescription && (
                                                <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground border border-border">
                                                    {selectedPaymentDescription}
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* -- Mobile: Entrega Card -------------------- */}
                        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:hidden">
                            <div className="border-b border-border px-4 py-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500">
                                            <Truck className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Endereco</p>
                                            <h2 className="text-[15px] font-semibold text-foreground">Entrega</h2>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 rounded-xl px-2.5 text-xs font-medium text-muted-foreground"
                                        onClick={() => setNewAddressDialogOpen(true)}
                                    >
                                        + Novo
                                    </Button>
                                </div>
                            </div>
                            <div className="px-4 py-3.5 space-y-3">
                                {addressesLoading ? (
                                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Carregando enderecos...
                                    </div>
                                ) : addressError ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10">
                                        {addressError}
                                    </div>
                                ) : storeAddresses.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                                        Nenhum endereco cadastrado.
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-xl bg-muted/30 ring-1 ring-border">
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
                                                            ? 'bg-card'
                                                            : 'bg-transparent'
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span
                                                            className={cn(
                                                                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                                                isSelected
                                                                    ? 'border-foreground bg-foreground text-background'
                                                                    : 'border-muted-foreground/30 bg-card'
                                                            )}
                                                        >
                                                            {isSelected && <Check className="h-3 w-3" />}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <p className="text-sm font-semibold text-foreground">
                                                                    {address.title}
                                                                </p>
                                                                {address.is_main && (
                                                                    <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-500">
                                                                        Principal
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                                                                {address.address}, {address.number}
                                                            </p>
                                                            <p className="text-[13px] leading-5 text-muted-foreground">
                                                                {address.city}/{address.state} - CEP{' '}
                                                                {address.zip_code}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {index < storeAddresses.length - 1 && (
                                                        <div className="mt-3 border-t border-border" />
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                {deliveryMessage && (
                                    <div className="flex items-center gap-2 rounded-xl bg-blue-50/60 px-3 py-2.5 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:ring-blue-500/20">
                                        <Truck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                        <p className="text-[13px] font-medium text-blue-700 dark:text-blue-400">{deliveryMessage}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {renderCouponSection('sm:hidden')}

                        {/* -- Mobile: Observações Card ---------------- */}
                        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:hidden">
                            <div className="border-b border-border px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500">
                                        <MessageSquare className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Contexto</p>
                                        <h2 className="text-[15px] font-semibold text-foreground">Observacoes</h2>
                                    </div>
                                </div>
                            </div>
                            <div className="px-4 py-3.5">
                                <Textarea
                                    placeholder="Inclua aqui informacoes importantes para este pedido."
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    rows={3}
                                    className="min-h-[100px] rounded-xl border-border bg-muted/30 resize-none text-sm"
                                />
                            </div>
                        </div>

                        {/* -- Desktop: Endereço de entrega ----------- */}
                        <CheckoutSection
                            icon={Truck}
                            eyebrow="Endereco"
                            title="Endereco de entrega"
                            className="hidden sm:block sm:rounded-2xl sm:border sm:bg-card sm:shadow-sm"
                            headerClassName="sm:px-5 sm:py-4"
                            contentClassName="sm:px-5 sm:py-4"
                        >
                            <div className="space-y-3">
                                {addressesLoading ? (
                                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Carregando enderecos...
                                    </div>
                                ) : addressError ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10">
                                        {addressError}
                                    </div>
                                ) : storeAddresses.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
                                        Nenhum endereco cadastrado.
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between gap-2">
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
                                                <SelectTrigger className="min-h-10 flex-1 rounded-xl border-border bg-muted/50 px-3 shadow-none">
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
                                            {selectedAddress?.is_main && (
                                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                                                    Principal
                                                </span>
                                            )}
                                        </div>
                                        {selectedAddress && (
                                            <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs leading-5 text-muted-foreground border border-border">
                                                <p className="font-medium text-foreground">
                                                    {selectedAddress.address}, {selectedAddress.number}
                                                </p>
                                                <p>
                                                    {selectedAddress.city}/{selectedAddress.state}
                                                    {' - '}CEP {selectedAddress.zip_code}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {deliveryMessage && (
                                    <div className="flex items-center gap-2 rounded-xl bg-blue-50/60 px-3 py-2.5 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:ring-blue-500/20">
                                        <Truck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                        <p className="text-[13px] font-medium text-blue-700 dark:text-blue-400">{deliveryMessage}</p>
                                    </div>
                                )}
                            </div>
                        </CheckoutSection>

                        {renderCouponSection('hidden sm:block sm:rounded-2xl sm:border sm:bg-card sm:shadow-sm')}

                        {/* -- Desktop: Observações -------------------- */}
                        <CheckoutSection
                            icon={MessageSquare}
                            eyebrow="Contexto"
                            title="Observacoes"
                            className="hidden sm:block sm:rounded-2xl sm:border sm:bg-card sm:shadow-sm"
                            headerClassName="sm:px-5 sm:py-4"
                            contentClassName="sm:px-5 sm:py-4"
                        >
                            <Textarea
                                placeholder="Inclua aqui informacoes importantes para este pedido."
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                rows={4}
                                className="min-h-[120px] rounded-2xl border-border bg-card resize-none"
                            />
                        </CheckoutSection>
                    </div>

                    <div className="hidden space-y-4 xl:sticky xl:top-24 xl:block">
                        <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)]">
                            <CardHeader className="border-b border-border px-5 py-4">
                                <CardTitle className="font-[family-name:var(--font-heading)] text-lg font-bold text-foreground">
                                    Resumo
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-5 pb-5 pt-4">
                                <div className="space-y-4">
                                    {priceValidationPending && (
                                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Revalidando precos e regras comerciais.
                                        </div>
                                    )}

                                    {paymentRestrictionMessage && (
                                        <div
                                            className={cn(
                                                'rounded-xl border px-3 py-3 text-sm',
                                                checkoutBlockedByPolicy
                                                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10'
                                                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10'
                                            )}
                                        >
                                            <div className="flex items-start gap-2">
                                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                                <p>{paymentRestrictionMessage}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* -- Forma de Pagamento ---------------- */}
                                    {paymentMethodGroups.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold text-foreground">
                                                Forma de Pagamento
                                            </Label>
                                            <Select
                                                value={selectedPaymentMethod}
                                                onValueChange={(value: string | null) => {
                                                    if (value) setSelectedPaymentMethod(value)
                                                }}
                                            >
                                                <SelectTrigger className="min-h-11 rounded-xl border-border bg-muted/50 px-3 shadow-none">
                                                    <SelectValue placeholder="Selecione...">
                                                        {selectedMethodGroup?.method.name || 'Selecione...'}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {paymentMethodGroups.map((group) => {
                                                        const hasOptions = group.rules.length > 0 || group.conditions.length > 0
                                                        return (
                                                            <SelectItem
                                                                key={group.method.id}
                                                                value={group.method.id}
                                                                disabled={!hasOptions}
                                                            >
                                                                {group.method.name}
                                                                {!hasOptions && ' (indisponível)'}
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* -- Tipo / Condição de Pagamento ------ */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label className="text-sm font-semibold text-foreground">
                                                Tipo de Pagamento
                                            </Label>
                                            {paymentDiscountPercentageEffective > 0 && (
                                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-500 dark:border-emerald-500/20">
                                                    {paymentDiscountPercentageEffective.toFixed(0)}% off
                                                </span>
                                            )}
                                        </div>
                                        <Select
                                            value={selectedPayment}
                                            onValueChange={(value: string | null) => {
                                                if (!value) return
                                                setSelectedPayment(value)
                                            }}
                                        >
                                            <SelectTrigger className="min-h-11 rounded-xl border-border bg-muted/50 px-3 shadow-none">
                                                <SelectValue placeholder="Selecione...">
                                                    {selectedPaymentOption?.label || 'Selecione...'}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {paymentOptions.map((option) => (
                                                    <SelectItem
                                                        key={option.id}
                                                        value={option.id}
                                                    >
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {selectedPaymentDescription && (
                                            <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground border border-border">
                                                {selectedPaymentDescription}
                                            </p>
                                        )}
                                    </div>

                                    <Separator />

                                    {/* -- Resumo financeiro --------------- */}
                                    <div className="space-y-2.5">
                                        <SummaryRow
                                            label={`Itens (${count})`}
                                            value={`R$ ${formatCurrency(total)}`}
                                        />
                                        {couponDiscount > 0 && (
                                            <SummaryRow
                                                label={`Cupom (${appliedCoupon?.couponCode || 'aplicado'})`}
                                                value={`- R$ ${formatCurrency(couponDiscount)}`}
                                                emphasis="success"
                                            />
                                        )}
                                        {paymentDiscount > 0 && (
                                            <SummaryRow
                                                label={`Desconto de pagamento (${paymentDiscountPercentageEffective}%)`}
                                                value={`- R$ ${formatCurrency(paymentDiscount)}`}
                                                emphasis="success"
                                            />
                                        )}
                                        {paymentSurcharge > 0 && (
                                            <SummaryRow
                                                label={`Acréscimo de pagamento (${surchargePercentage}%)`}
                                                value={`+ R$ ${formatCurrency(paymentSurcharge)}`}
                                                emphasis="warning"
                                            />
                                        )}
                                        {paymentDiscountBlockedByCoupon && discountPercentage > 0 && (
                                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                                                Este cupom ja contempla o melhor beneficio para este pedido.
                                            </p>
                                        )}
                                    </div>

                                    {/* -- Total Final -------------------- */}
                                    <div className="rounded-2xl gradient-navy px-4 py-4">
                                        <div className="flex items-end justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                                    Total final
                                                </p>
                                                <p className="text-2xl font-bold tracking-tight text-white">
                                                    R$ {formatCurrency(finalTotal)}
                                                </p>
                                            </div>
                                            <div className="rounded-xl bg-card/10 px-3 py-2 text-right backdrop-blur-sm">
                                                <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                                    Pedido
                                                </p>
                                                <p className="mt-0.5 text-sm font-semibold text-white">
                                                    Checkout
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

                                    <Button
                                        className="h-12 w-full rounded-xl gradient-bronze border-0 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
                                        onClick={handlePlaceOrder}
                                        disabled={loading || !canCheckout}
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
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <div
                className="fixed inset-x-3 z-40 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur md:hidden"
                style={{
                    bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
                }}
            >
                <div className="mx-auto flex max-w-7xl items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Total final
                        </p>
                        <p className="truncate text-lg font-bold text-foreground">
                            R$ {formatCurrency(finalTotal)}
                        </p>
                    </div>
                    <Button
                        className="h-11 min-w-[168px] rounded-xl gradient-bronze border-0 px-5 text-white shadow-md transition-all hover:shadow-lg"
                        onClick={handlePlaceOrder}
                        disabled={loading || !canCheckout}
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
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-2 dark:bg-emerald-500/10">
                            <ShieldCheck className="h-6 w-6 text-emerald-600" />
                        </div>
                        <DialogTitle className="text-xl font-bold text-center">
                            Confirmar pedido
                        </DialogTitle>
                        <DialogDescription className="text-center">
                            Revise o resumo antes de enviar para analise.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
                            <SummaryRow
                                label={`Itens (${count})`}
                                value={`R$ ${formatCurrency(total)}`}
                            />
                            {couponDiscount > 0 && (
                                <SummaryRow
                                    label={`Cupom (${appliedCoupon?.couponCode || 'aplicado'})`}
                                    value={`- R$ ${formatCurrency(couponDiscount)}`}
                                    emphasis="success"
                                />
                            )}
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
                            {paymentDiscountBlockedByCoupon && discountPercentage > 0 && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                                    Este cupom ja contempla o melhor beneficio para este pedido.
                                </p>
                            )}
                            <Separator />
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold text-foreground">Total a pagar</span>
                                <span className="text-lg font-bold text-foreground">
                                    R$ {formatCurrency(finalTotal)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                        <Button
                            variant="outline"
                            onClick={() => setConfirmCheckoutOpen(false)}
                            className="w-full rounded-xl sm:w-auto"
                        >
                            Revisar checkout
                        </Button>
                        <Button
                            onClick={processOrder}
                            className="w-full gap-2 rounded-xl gradient-bronze border-0 text-white shadow-md sm:w-auto"
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



