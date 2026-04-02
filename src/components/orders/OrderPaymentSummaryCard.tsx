import { CreditCard, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getOrderPaymentDisplay, type OrderPaymentDisplayLike } from '@/lib/orders/order-payment-display'

type OrderPaymentSummaryCardProps = {
    order: OrderPaymentDisplayLike
    title?: string
    variant?: 'card' | 'panel'
    className?: string
}

function PaymentSummaryContent({ order }: { order: OrderPaymentDisplayLike }) {
    const paymentDisplay = getOrderPaymentDisplay(order)
    const detailItems =
        paymentDisplay.methodName &&
        paymentDisplay.conditionName &&
        paymentDisplay.methodName !== paymentDisplay.conditionName
            ? [
                  { label: 'Meio', value: paymentDisplay.methodName },
                  { label: 'Condicao', value: paymentDisplay.conditionName },
              ]
            : []

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Confirmado no checkout
                    </p>
                    <p className="text-sm font-semibold text-slate-950">
                        {paymentDisplay.combinedLabel}
                    </p>
                </div>
                <div className="rounded-full border border-emerald-200 bg-emerald-50 p-2 text-emerald-600">
                    <ShieldCheck className="h-4 w-4" />
                </div>
            </div>

            {detailItems.length > 0 && (
                <div className={`grid gap-2 ${detailItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {detailItems.map((item) => (
                        <div key={`${item.label}-${item.value}`} className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                {item.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {paymentDisplay.hasCouponSnapshot && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Cupom Aplicado
                    </p>
                    <p className="mt-1 text-sm font-semibold text-amber-900">
                        {paymentDisplay.couponCode || 'Cupom registrado'}
                    </p>
                    <div className="mt-1 text-xs text-amber-800">
                        {paymentDisplay.couponConfiguredLabel ? (
                            <p>Regra: {paymentDisplay.couponConfiguredLabel}</p>
                        ) : null}
                        {paymentDisplay.couponDiscountAmount > 0 ? (
                            <p>
                                Desconto concedido: R$ {paymentDisplay.couponDiscountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        ) : null}
                    </div>
                </div>
            )}

            {paymentDisplay.adjustments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {paymentDisplay.adjustments.map((adjustment) => (
                        <Badge
                            key={adjustment}
                            variant="outline"
                            className="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                        >
                            {adjustment}
                        </Badge>
                    ))}
                </div>
            )}

            {paymentDisplay.totalDiscountAmount > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">
                        Descontos do pedido: R$ {paymentDisplay.totalDiscountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {paymentDisplay.couponDiscountAmount > 0 && (
                        <p className="mt-1">
                            Cupom: -R$ {paymentDisplay.couponDiscountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    )}
                    {paymentDisplay.paymentDiscountAmount > 0 && (
                        <p>
                            Pagamento: -R$ {paymentDisplay.paymentDiscountAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    )}
                </div>
            )}

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-slate-600">
                    {paymentDisplay.description || 'Meio, condicao e ajustes comerciais preservados no fechamento do pedido.'}
                </p>
            </div>
        </div>
    )
}

export function OrderPaymentSummaryCard({
    order,
    title = 'Pagamento',
    variant = 'card',
    className,
}: OrderPaymentSummaryCardProps) {
    const paymentDisplay = getOrderPaymentDisplay(order)

    if (!paymentDisplay.hasSnapshot) {
        return null
    }

    if (variant === 'panel') {
        return (
            <div className={`rounded-xl border border-border/60 bg-linear-to-br from-white via-slate-50 to-emerald-50/60 p-4 shadow-sm ${className ?? ''}`}>
                <div className="mb-3 flex items-center gap-2 text-navy">
                    <div className="rounded-full bg-white p-2 shadow-sm ring-1 ring-slate-200">
                        <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold">{title}</h4>
                        <p className="text-xs text-muted-foreground">Visao comercial consolidada do pedido</p>
                    </div>
                </div>
                <PaymentSummaryContent order={order} />
            </div>
        )
    }

    return (
        <Card className={`glass-card border-0 ${className ?? ''}`}>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-bronze" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <PaymentSummaryContent order={order} />
            </CardContent>
        </Card>
    )
}
