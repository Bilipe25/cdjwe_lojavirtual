'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    Minus,
    Plus,
    Trash2,
    ShoppingBag,
    ArrowLeft,
    CreditCard,
    Loader2,
    Package,
    AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCartStore } from '@/lib/stores/cart-store'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PaymentCondition, SystemSettings } from '@/lib/types'
import Image from 'next/image'
import { checkoutAction } from './actions'

export default function CartPage() {
    const router = useRouter()
    const { items, removeItem, updateQuantity, subtotal, totalItems, clearCart } = useCartStore()
    const [loading, setLoading] = useState(false)
    const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([])
    const [selectedPayment, setSelectedPayment] = useState<string>('')
    const [notes, setNotes] = useState('')
    const [settings, setSettings] = useState<SystemSettings | null>(null)

    const total = subtotal()
    const count = totalItems()

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const supabase = createClient()
        const [payRes, settingsRes] = await Promise.all([
            supabase.from('payment_conditions').select('*').eq('is_active', true).order('sort_order'),
            supabase.from('system_settings').select('*').limit(1).single(),
        ])
        if (payRes.data) {
            setPaymentConditions(payRes.data)
            if (payRes.data.length > 0) setSelectedPayment(payRes.data[0].id)
        }
        if (settingsRes.data) setSettings(settingsRes.data)
    }

    const selectedCondition = paymentConditions.find(p => p.id === selectedPayment)
    const paymentDiscount = selectedCondition ? (total * selectedCondition.discount_percentage / 100) : 0
    const discountedTotal = total - paymentDiscount
    const paymentSurcharge = selectedCondition ? (discountedTotal * (selectedCondition.surcharge_percentage || 0) / 100) : 0
    const finalTotal = discountedTotal + paymentSurcharge

    const minOrderMet = !settings?.min_order_amount || total >= settings.min_order_amount

    const handlePlaceOrder = async () => {
        if (items.length === 0) {
            toast.error('Seu carrinho está vazio')
            return
        }
        if (!minOrderMet) {
            toast.error(`Pedido mínimo: R$ ${settings?.min_order_amount?.toFixed(2)}`)
            return
        }
        if (!selectedPayment) {
            toast.error('Selecione uma condição de pagamento')
            return
        }

        setLoading(true)
        try {
            const result = await checkoutAction(items, selectedPayment, notes)

            if (result.error) {
                toast.error(result.error)
                setLoading(false)
                return
            }

            clearCart()
            toast.success('Pedido realizado com sucesso!')
            router.push(`/orders/${result.orderId}`)
        } catch (err) {
            console.error(err)
            toast.error('Ocorreu um erro interno de conexão.')
        } finally {
            setLoading(false)
        }
    }

    if (items.length === 0) {
        return (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                >
                    <div className="mx-auto h-24 w-24 rounded-full bg-muted flex items-center justify-center mb-4">
                        <ShoppingBag className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)]">
                        Carrinho Vazio
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Adicione produtos do catálogo para fazer seu pedido
                    </p>
                    <Button
                        className="mt-6 gradient-bronze border-0 text-white"
                        onClick={() => router.push('/catalog')}
                    >
                        Ver Catálogo
                    </Button>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                        Carrinho
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {count} {count === 1 ? 'item' : 'itens'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Items */}
                <div className="lg:col-span-2 space-y-4">
                    {items.map((item, i) => (
                        <motion.div
                            key={item.variantId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <Card className="glass-card border-0">
                                <CardContent className="p-4">
                                    <div className="flex gap-4">
                                        <div className="h-24 w-24 rounded-lg bg-muted shrink-0 overflow-hidden relative">
                                            {item.imageUrl ? (
                                                <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center">
                                                    <Package className="h-8 w-8 text-muted-foreground/30" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold truncate">{item.productName}</h3>
                                            <p className="text-sm text-muted-foreground">
                                                {item.fabricName} — {item.colorName}
                                            </p>
                                            {item.size && (
                                                <p className="text-xs text-muted-foreground">{item.size}</p>
                                            )}
                                            <p className="text-sm font-medium mt-1">
                                                R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / un.
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end justify-between shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive"
                                                onClick={() => removeItem(item.variantId)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                            </div>
                                            <p className="text-sm font-semibold text-gradient-bronze">
                                                R$ {(item.unitPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Order Summary */}
                <div className="space-y-4">
                    <Card className="glass-card border-0 sticky top-24">
                        <CardHeader>
                            <CardTitle className="text-lg font-[family-name:var(--font-heading)]">
                                Resumo do Pedido
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Payment Condition */}
                            <div className="space-y-2">
                                <Label>Condição de Pagamento</Label>
                                <Select value={selectedPayment} onValueChange={(v: any) => setSelectedPayment(v)}>
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {paymentConditions.map((pc) => (
                                            <SelectItem key={pc.id} value={pc.id}>
                                                {pc.name}
                                                {pc.discount_percentage > 0 && ` (-${pc.discount_percentage}%)`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedCondition?.description && (
                                    <p className="text-xs text-muted-foreground">{selectedCondition.description}</p>
                                )}
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <Label>Observações</Label>
                                <Textarea
                                    placeholder="Alguma observação sobre o pedido?"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="bg-white/60 resize-none"
                                    rows={3}
                                />
                            </div>

                            <Separator />

                            {/* Totals */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {paymentDiscount > 0 && (
                                    <div className="flex justify-between text-sm text-green-600">
                                        <span>Desconto ({selectedCondition?.discount_percentage}%)</span>
                                        <span>- R$ {paymentDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                {paymentSurcharge > 0 && (
                                    <div className="flex justify-between text-sm text-amber-600">
                                        <span>Acréscimo ({selectedCondition?.surcharge_percentage}%)</span>
                                        <span>+ R$ {paymentSurcharge.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                <Separator />
                                <div className="flex justify-between font-semibold text-lg">
                                    <span>Total</span>
                                    <span className="text-gradient-bronze">
                                        R$ {finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            {/* Min Order Warning */}
                            {!minOrderMet && settings?.min_order_amount && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <p>
                                        Pedido mínimo: R$ {settings.min_order_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
                                        Faltam R$ {(settings.min_order_amount - total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
                                    </p>
                                </div>
                            )}

                            <Button
                                className="w-full h-12 text-base gradient-navy border-0 text-white"
                                onClick={handlePlaceOrder}
                                disabled={loading || !minOrderMet}
                            >
                                {loading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <>
                                        <CreditCard className="h-5 w-5 mr-2" />
                                        Finalizar Pedido
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
