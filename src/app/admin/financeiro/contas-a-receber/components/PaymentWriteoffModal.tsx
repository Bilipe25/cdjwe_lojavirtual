'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
    Banknote,
    Calendar,
    Loader2,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateBR, daysOverdue } from '@/lib/financial/installment-calculator'
import { recordInstallmentPayment } from '../actions'

// ==================== Types ====================

export interface InstallmentForPayment {
    id: string
    installment_number: number
    due_date: string
    amount: number
    paid_amount: number
    status: string
    invoice_id: string
    invoice_number: string
    invoice_total: number
    client_name: string
    company_name: string
}

interface PaymentWriteoffModalProps {
    installment: InstallmentForPayment | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
}

// ==================== Component ====================

export function PaymentWriteoffModal({
    installment,
    open,
    onOpenChange,
    onSuccess,
}: PaymentWriteoffModalProps) {
    const today = new Date().toISOString().split('T')[0]
    const [paymentAmount, setPaymentAmount] = useState('')
    const [paidDate, setPaidDate] = useState(today)
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        if (open && installment) {
            const remaining = installment.amount - installment.paid_amount
            setPaymentAmount(remaining.toFixed(2))
            setPaidDate(new Date().toISOString().split('T')[0])
            setNotes('')
            setSuccess(false)
            setLoading(false)
        }
    }, [open, installment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const fmt = (v: number) =>
        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    if (!installment) return null

    const remaining = installment.amount - installment.paid_amount
    const parsedAmount = parseFloat(paymentAmount) || 0
    const isValid = parsedAmount > 0 && parsedAmount <= remaining && paidDate
    const overdueDays = daysOverdue(installment.due_date)
    const isOverdue = overdueDays > 0

    const handleSubmit = async () => {
        if (!isValid) return
        setLoading(true)
        try {
            const result = await recordInstallmentPayment({
                installmentId: installment.id,
                amount: parsedAmount,
                paidDate,
                notes: notes || null,
            })

            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                setSuccess(true)
                toast.success('Pagamento registrado com sucesso!')
                onSuccess?.()
            }
        } catch {
            toast.error('Erro inesperado ao registrar pagamento.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md! w-full max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
                <DialogHeader className="p-5 pb-4 border-b bg-linear-to-r from-emerald-500/5 to-navy/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
                            <Banknote className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold font-heading text-navy">
                                Baixar Pagamento
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Fatura {installment.invoice_number} • Parcela {installment.installment_number}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">
                                Pagamento Registrado!
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                                {fmt(parsedAmount)} registrado na parcela {installment.installment_number} da fatura {installment.invoice_number}.
                            </p>
                            <Button className="mt-6 gap-2" onClick={() => onOpenChange(false)}>
                                <CheckCircle2 className="h-4 w-4" />
                                Fechar
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Installment Info */}
                            <div className={cn(
                                'rounded-xl border p-4',
                                isOverdue ? 'border-red-200 bg-red-50/50' : 'border-navy/10 bg-navy/[0.03]'
                            )}>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground">{installment.company_name}</p>
                                        <p className="text-sm font-semibold text-foreground">{installment.client_name}</p>
                                    </div>
                                    <Badge variant="outline" className={cn(
                                        'text-[10px] font-bold',
                                        isOverdue ? 'text-red-700 bg-red-50 border-red-200' : 'text-blue-700 bg-blue-50 border-blue-200'
                                    )}>
                                        {isOverdue ? `${overdueDays}d atraso` : 'Em dia'}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                                    <div>
                                        <span className="text-muted-foreground">Valor</span>
                                        <p className="font-bold text-sm">{fmt(installment.amount)}</p>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Pago</span>
                                        <p className="font-bold text-sm text-emerald-600">{fmt(installment.paid_amount)}</p>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Restante</span>
                                        <p className="font-black text-sm text-gradient-bronze">{fmt(remaining)}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Vencimento: {formatDateBR(installment.due_date)}
                                </p>
                            </div>

                            {/* Form */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                                        Valor do Pagamento
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min={0.01}
                                        max={remaining}
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        className="h-10 rounded-lg text-lg font-bold"
                                        placeholder="0,00"
                                    />
                                    {parsedAmount > remaining && (
                                        <p className="text-xs text-red-600 flex items-center gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            Valor excede o saldo restante de {fmt(remaining)}.
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentAmount(remaining.toFixed(2))}
                                            className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition"
                                        >
                                            Valor total
                                        </button>
                                        {remaining !== installment.amount && (
                                            <button
                                                type="button"
                                                onClick={() => setPaymentAmount((installment.amount / 2).toFixed(2))}
                                                className="text-xs px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 font-medium hover:bg-slate-100 transition"
                                            >
                                                50%
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                                        <Calendar className="h-3.5 w-3.5 text-navy" />
                                        Data do Pagamento
                                    </Label>
                                    <Input
                                        type="date"
                                        value={paidDate}
                                        onChange={(e) => setPaidDate(e.target.value)}
                                        className="h-10 rounded-lg"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        Observação (opcional)
                                    </Label>
                                    <Textarea
                                        placeholder="Ex: Depósito bancário, PIX, etc."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={2}
                                        className="resize-none rounded-lg"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {!success && (
                    <div className="border-t p-4 bg-muted/20 shrink-0">
                        <div className="flex gap-3 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                className="rounded-lg"
                                disabled={loading}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={loading || !isValid}
                                className="gap-2 rounded-lg font-bold shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                )}
                                Confirmar Baixa
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
