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
    Truck,
} from 'lucide-react'
import { Check, PlusCircle } from 'lucide-react'
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
    DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCartStore } from '@/lib/stores/cart-store'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useSettings } from '@/components/providers/settings-provider'
import type { PaymentCondition, SystemSettings, PriceTablePaymentRule, StoreAddress } from '@/lib/types'
import Image from 'next/image'
import { checkoutAction, getAvailablePaymentRules, getAvailableStoreAddresses } from './actions'

export default function CartPage() {
    const router = useRouter()
    const { items, removeItem, updateQuantity, subtotal, totalItems, clearCart } = useCartStore()
    const { settings } = useSettings()
    const [loading, setLoading] = useState(false)
    const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([])
    const [priceTableRules, setPriceTableRules] = useState<PriceTablePaymentRule[]>([])
    const [isTableRule, setIsTableRule] = useState(false)
    const [selectedPayment, setSelectedPayment] = useState<string>('')
    const [storeAddresses, setStoreAddresses] = useState<StoreAddress[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>('')
    const [addressesLoading, setAddressesLoading] = useState(true)
    const [addressError, setAddressError] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false)
    const [nextOrderNumber, setNextOrderNumber] = useState('')
    const [newAddressDialogOpen, setNewAddressDialogOpen] = useState(false)

    const total = subtotal()
    const count = totalItems()

    useEffect(() => {
        const loadConditions = async () => {
            const supabase = createClient()
            // Load addresses separately with error catching
            try {
                const addressesRes = await getAvailableStoreAddresses()
                setStoreAddresses(addressesRes || [])
                const mainAddress = addressesRes?.find(a => a.is_main)
                if (mainAddress) {
                    setSelectedAddressId(mainAddress.id)
                } else if (addressesRes && addressesRes.length > 0) {
                    setSelectedAddressId(addressesRes[0].id)
                }
            } catch (err: any) {
                console.error('[CART] Failed to load addresses:', err)
                setAddressError(err?.message || 'Erro ao carregar endereços')
            } finally {
                setAddressesLoading(false)
            }

            const [rulesRes, orderRes] = await Promise.all([
                getAvailablePaymentRules(total),
                supabase.from('orders').select('order_number').order('created_at', { ascending: false }).limit(1).single(),
            ])
            
            const hasTableRules = rulesRes.priceTableRules && rulesRes.priceTableRules.length > 0;
            const hasGlobals = rulesRes.globalConditions && rulesRes.globalConditions.length > 0;

            setPriceTableRules(rulesRes.priceTableRules || [])
            setPaymentConditions(rulesRes.globalConditions || [])

            // PRIORITY LOGIC:
            // 1. If we have Table Rules, they take precedence in the selection.
            // 2. We only fall back to Global Conditions if NO Table Rules exist for this value range.
            
            if (hasTableRules) {
                setIsTableRule(true)
                // Auto-select first rule if nothing valid selected
                if (!rulesRes.priceTableRules.find(r => r.id === selectedPayment)) {
                    setSelectedPayment(rulesRes.priceTableRules[0].id)
                }
            } else if (hasGlobals) {
                setIsTableRule(false)
                // Auto-select first global if nothing valid selected
                if (!rulesRes.globalConditions.find(c => c.id === selectedPayment)) {
                    setSelectedPayment(rulesRes.globalConditions[0].id)
                }
            } else {
                setSelectedPayment('')
            }
            
            // Calculate next order number
            const lastNumStr = orderRes.data?.order_number || 'PED000000'
            const lastNum = parseInt(lastNumStr.replace(/\D/g, '')) || 0
            const nextNum = (lastNum + 1).toString().padStart(6, '0')
            setNextOrderNumber(`Pedido${nextNum}`)
        }
        loadConditions()
    }, [total])

    const selectedRule = isTableRule ? priceTableRules.find(r => r.id === selectedPayment) : null
    const selectedCondition = !isTableRule ? paymentConditions.find(p => p.id === selectedPayment) : null

    const discountPercentage = selectedRule ? selectedRule.discount_percentage : (selectedCondition ? selectedCondition.discount_percentage : 0)
    const surchargePercentage = selectedCondition ? (selectedCondition.surcharge_percentage || 0) : 0

    const paymentDiscount = (total * discountPercentage / 100)
    const discountedTotal = total - paymentDiscount
    const paymentSurcharge = (discountedTotal * surchargePercentage / 100)
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

        setConfirmCheckoutOpen(true)
    }

    const processOrder = async () => {
        setLoading(true)
        setConfirmCheckoutOpen(false)
        try {
            const result = await checkoutAction(items, selectedPayment, notes, isTableRule, selectedAddressId)

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
                    <h1 className="text-2xl font-bold font-[--font-heading]">
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


            {/* Desktop Header */}
            <div className="hidden md:flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold font-[--font-heading] text-gradient-navy">
                            {nextOrderNumber || 'Carrinho'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {count} {count === 1 ? 'item' : 'itens'}
                        </p>
                    </div>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                            >
                                <Trash2 className="h-4 w-4" />
                                Limpar
                            </Button>
                        }
                    />
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Esvaziar carrinho</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja remover todos os itens do seu carrinho? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={clearCart}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Sim, esvaziar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            {/* Min order progress bar (Sticky on Mobile) */}
            {settings && settings.min_order_amount > 0 && total < settings.min_order_amount && (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-sm">
                    <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-amber-800 font-bold flex items-center gap-1.5 uppercase tracking-tight text-[10px] sm:text-xs">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Pedido mínimo: R$ {settings.min_order_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-amber-600 text-[10px] font-medium">
                            Faltam R$ {(settings.min_order_amount - total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-amber-200 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, (total / settings.min_order_amount) * 100)}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Items */}
                <div className="lg:col-span-2 space-y-4">
                    {items.map((item, i) => (
                        <motion.div
                            key={item.variantId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            layout
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
                            <CardTitle className="text-lg font-[--font-heading]">
                                Resumo do Pedido
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Address Selection */}
                            <div className="space-y-2 pb-2 border-b">
                                <Label className="flex items-center gap-2">
                                    <Truck className="h-4 w-4 text-bronze" />
                                    Endereço de Entrega
                                </Label>
                                {addressesLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Carregando endereços...
                                    </div>
                                ) : addressError ? (
                                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>Não foi possível carregar os endereços. Verifique com o administrador.</span>
                                    </div>
                                ) : storeAddresses.length === 0 ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-slate-50 border border-dashed rounded-lg p-3">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>Nenhum endereço cadastrado. O pedido será feito sem endereço de entrega.</span>
                                    </div>
                                 ) : (
                                    <div className="space-y-3">
                                        <Select 
                                            value={selectedAddressId} 
                                            onValueChange={(val: string | null) => {
                                                if (val === 'add_new') {
                                                    setNewAddressDialogOpen(true)
                                                } else if (val) {
                                                    setSelectedAddressId(val)
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="bg-white/60 min-h-11 h-auto py-2">
                                                <SelectValue placeholder="Selecione o Endereço de Entrega">
                                                    {selectedAddressId && storeAddresses.find(a => a.id === selectedAddressId) ? (
                                                        <div className="flex flex-col items-start text-left">
                                                            <span className="font-bold text-xs uppercase tracking-tight text-primary">
                                                                {storeAddresses.find(a => a.id === selectedAddressId)?.title}
                                                            </span>
                                                            <span className="text-sm truncate max-w-[200px] sm:max-w-[300px]">
                                                                {storeAddresses.find(a => a.id === selectedAddressId)?.address}, {storeAddresses.find(a => a.id === selectedAddressId)?.number}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        "Selecione o Endereço de Entrega"
                                                    )}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase bg-slate-50/50">Meus Endereços</div>
                                                {storeAddresses.map(addr => (
                                                    <SelectItem key={addr.id} value={addr.id} className="py-3">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="font-bold flex items-center gap-1.5">
                                                                {addr.is_main && <Check className="h-3 w-3 text-green-600" />}
                                                                {addr.title}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {addr.address}, {addr.number} — {addr.city}/{addr.state}
                                                            </span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                                <Separator className="my-1" />
                                                <SelectItem value="add_new" className="py-3 text-primary font-bold focus:bg-primary/5">
                                                    <div className="flex items-center gap-2">
                                                        <PlusCircle className="h-4 w-4" />
                                                        + Adicionar novo endereço
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {selectedAddressId && storeAddresses.find(a => a.id === selectedAddressId) && (
                                            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-1">
                                                <p className="text-xs font-bold text-primary uppercase tracking-wider">Endereço Selecionado</p>
                                                <p className="text-sm font-medium">
                                                    {storeAddresses.find(a => a.id === selectedAddressId)?.address}, {storeAddresses.find(a => a.id === selectedAddressId)?.number}
                                                    {storeAddresses.find(a => a.id === selectedAddressId)?.complement && ` — ${storeAddresses.find(a => a.id === selectedAddressId)?.complement}`}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {storeAddresses.find(a => a.id === selectedAddressId)?.neighborhood} — {storeAddresses.find(a => a.id === selectedAddressId)?.city} / {storeAddresses.find(a => a.id === selectedAddressId)?.state}
                                                    <br />
                                                    CEP: {storeAddresses.find(a => a.id === selectedAddressId)?.zip_code}
                                                </p>
                                            </div>
                                        )}

                                        <Dialog open={newAddressDialogOpen} onOpenChange={setNewAddressDialogOpen}>
                                            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle className="text-xl font-bold font-heading">
                                                        Novo Endereço de Entrega
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        Adicione um novo local para entrega deste pedido.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="py-4">
                                                    <AddressForm 
                                                        onCancel={() => setNewAddressDialogOpen(false)}
                                                        onSuccess={(newAddr) => {
                                                            setStoreAddresses(prev => [...prev, newAddr])
                                                            setSelectedAddressId(newAddr.id)
                                                            setNewAddressDialogOpen(false)
                                                        }}
                                                    />
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                )}
                            </div>
                            {/* Payment Condition */}
                            <div className="space-y-2">
                                <Label>Condição de Pagamento</Label>
                                <Select 
                                    value={selectedPayment} 
                                    onValueChange={(v: string | null) => {
                                        if (!v) return;
                                        setSelectedPayment(v);
                                        // Update isTableRule based on which list the ID belongs to
                                        const isInTable = priceTableRules.some(r => r.id === v);
                                        setIsTableRule(isInTable);
                                    }}
                                >
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione">
                                            {isTableRule && selectedRule ? (
                                                `${selectedRule.number_of_installments}x ${selectedRule.installment_days ? `(${selectedRule.installment_days})` : ''}${selectedRule.discount_percentage > 0 ? ` (-${selectedRule.discount_percentage}%)` : ''}`
                                            ) : selectedCondition ? (
                                                `${selectedCondition.name}${selectedCondition.discount_percentage > 0 ? ` (-${selectedCondition.discount_percentage}%)` : ''}`
                                            ) : (
                                                "Selecione"
                                            )}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {priceTableRules.length > 0 && (
                                            <>
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase bg-slate-50/50">Condições de Tabela</div>
                                                {priceTableRules.map((rule) => (
                                                    <SelectItem key={rule.id} value={rule.id}>
                                                        {rule.number_of_installments}x {rule.installment_days && `(${rule.installment_days})`}
                                                        {rule.discount_percentage > 0 && ` (-${rule.discount_percentage}%)`}
                                                    </SelectItem>
                                                ))}
                                                <Separator className="my-1" />
                                            </>
                                        )}
                                        
                                        {paymentConditions.length > 0 && (
                                            <>
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase bg-slate-50/50">Condições Gerais</div>
                                                {paymentConditions.map((pc) => (
                                                    <SelectItem key={pc.id} value={pc.id}>
                                                        {pc.name}
                                                        {pc.discount_percentage > 0 && ` (-${pc.discount_percentage}%)`}
                                                    </SelectItem>
                                                ))}
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                                {selectedCondition?.description && (
                                    <p className="text-xs text-muted-foreground">{selectedCondition.description}</p>
                                )}
                                {isTableRule && (
                                    <p className="text-[10px] text-amber-600 font-medium">Condições exclusivas da sua rede aplicadas.</p>
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
                                        <span>Desconto de Pagamento ({discountPercentage}%)</span>
                                        <span>- R$ {paymentDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                {paymentSurcharge > 0 && (
                                    <div className="flex justify-between text-sm text-amber-600">
                                        <span>Acréscimo de Pagamento ({surchargePercentage}%)</span>
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

                            {/* Delivery Estimate */}
                            {settings?.default_delivery_days && settings.default_delivery_days > 0 && (
                                <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                                    <Truck className="h-4 w-4 shrink-0" />
                                    <p>
                                        Prazo estimado de entrega: <strong>{settings.default_delivery_days} dias úteis</strong>
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

            {/* Configuração do Dialog de Confirmação */}
            <Dialog open={confirmCheckoutOpen} onOpenChange={setConfirmCheckoutOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold font-heading">Confirmar Pedido</DialogTitle>
                        <DialogDescription>
                            Revise o resumo do seu pedido antes de finalizar.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-lg bg-muted p-4 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Itens ({count})</span>
                                <span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>

                             <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Pagamento</span>
                                <span className="font-medium text-right max-w-[150px] truncate">
                                    {isTableRule && selectedRule ? (
                                        `${selectedRule.number_of_installments}x ${selectedRule.installment_days ? `(${selectedRule.installment_days})` : ''}`
                                    ) : (
                                        selectedCondition?.name
                                    )}
                                </span>
                            </div>

                            {(paymentDiscount > 0 || paymentSurcharge > 0) && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Ajuste de Pagamento</span>
                                    {paymentDiscount > 0 ? (
                                        <span className="text-green-600">- R$ {paymentDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    ) : (
                                        <span className="text-amber-600">+ R$ {paymentSurcharge.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    )}
                                </div>
                            )}

                            <Separator />

                            <div className="flex justify-between items-center">
                                <span className="font-bold">Total a Pagar</span>
                                <span className="text-xl font-bold text-gradient-bronze">
                                    R$ {finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setConfirmCheckoutOpen(false)} className="w-full sm:w-auto">
                            Revisar Carrinho
                        </Button>
                        <Button onClick={processOrder} className="w-full sm:w-auto gradient-bronze border-0 text-white gap-2">
                            <Check className="h-4 w-4" />
                            Confirmar e Enviar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
