'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
    Receipt,
    Calendar,
    DollarSign,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    calculateInstallments,
    formatDateBR,
    type InstallmentPreview,
} from '@/lib/financial/installment-calculator'
import { invoiceOrderAction } from '../actions'

// ==================== Types ====================

export interface OrderForInvoicing {
    id: string
    order_number: string
    total: number
    payment_method_id?: string | null
    payment_method_name?: string | null
    payment_condition_id?: string | null
    payment_condition_name?: string | null
    payment_installments?: number | null
    store?: { company_name?: string | null; cnpj?: string | null } | null
}

interface InvoiceOrderModalProps {
    order: OrderForInvoicing | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
}

function parseInstallmentDays(raw: string): { values: number[]; invalid: boolean } {
    if (!raw.trim()) return { values: [], invalid: false }

    const parts = raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)

    if (parts.length === 0) return { values: [], invalid: false }

    const values: number[] = []
    for (const part of parts) {
        const n = Number(part)
        if (!Number.isInteger(n) || n <= 0) {
            return { values: [], invalid: true }
        }
        values.push(n)
    }

    for (let i = 1; i < values.length; i++) {
        if (values[i] <= values[i - 1]) {
            return { values, invalid: true }
        }
    }

    return { values, invalid: false }
}

// ==================== Component ====================

export function InvoiceOrderModal({
    order,
    open,
    onOpenChange,
    onSuccess,
}: InvoiceOrderModalProps) {
    const today = new Date().toISOString().split('T')[0]
    const [issueDate, setIssueDate] = useState(today)
    const [installmentCount, setInstallmentCount] = useState(1)
    const [installmentDays, setInstallmentDays] = useState('')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        if (open && order) {
            setInstallmentCount(order.payment_installments || 1)
            setIssueDate(new Date().toISOString().split('T')[0])
            setInstallmentDays('')
            setNotes('')
            setSuccess(false)
            setLoading(false)
        }
    }, [open, order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const installments: InstallmentPreview[] = useMemo(() => {
        if (!order || !issueDate) return []
        return calculateInstallments({
            totalAmount: order.total,
            installmentCount,
            issueDate,
            installmentDays: installmentDays || null,
        })
    }, [order, issueDate, installmentCount, installmentDays])

    const parsedInstallmentDays = useMemo(
        () => parseInstallmentDays(installmentDays),
        [installmentDays]
    )

    const expectedInstallments = Math.max(1, Number(order?.payment_installments || 1))
    const hasCustomDayOffsets = parsedInstallmentDays.values.length > 0
    const installmentCountMismatch = !!order?.payment_installments && installmentCount !== expectedInstallments
    const installmentDaysCountMismatch =
        hasCustomDayOffsets && parsedInstallmentDays.values.length !== installmentCount

    const hasNonDefaultDays = parsedInstallmentDays.values.some(
        (day, index) => day !== (index + 1) * 30
    )

    const requiresOverrideJustification =
        installmentCountMismatch || hasNonDefaultDays

    const trimmedNotes = notes.trim()
    const hasOverrideJustification = trimmedNotes.length >= 10

    const canGenerate =
        !loading &&
        !!issueDate &&
        installments.length > 0 &&
        !parsedInstallmentDays.invalid &&
        !installmentDaysCountMismatch &&
        (!requiresOverrideJustification || hasOverrideJustification)

    const fmt = (v: number) =>
        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    const handleGenerate = async () => {
        if (!order) return

        if (parsedInstallmentDays.invalid) {
            toast.error('Dias personalizados inválidos. Use apenas inteiros positivos em ordem crescente.')
            return
        }

        if (installmentDaysCountMismatch) {
            toast.error('Informe exatamente um vencimento (em dias) para cada parcela.')
            return
        }

        if (requiresOverrideJustification && !hasOverrideJustification) {
            toast.error('Override detectado. Informe justificativa com pelo menos 10 caracteres em observações.')
            return
        }

        setLoading(true)
        try {
            const result = await invoiceOrderAction({
                orderId: order.id,
                issueDate,
                paymentMethodId: order.payment_method_id,
                paymentMethodName: order.payment_method_name,
                paymentConditionId: order.payment_condition_id,
                paymentConditionName: order.payment_condition_name,
                installmentCount,
                installmentDays: installmentDays || null,
                notes: trimmedNotes || null,
            })

            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                setSuccess(true)
                toast.success('Fatura gerada com sucesso!')
                onSuccess?.()
            }
        } catch {
            toast.error('Erro inesperado ao gerar fatura.')
        } finally {
            setLoading(false)
        }
    }

    if (!order) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg! sm:max-w-xl! w-full max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
                <DialogHeader className="p-5 pb-4 border-b bg-linear-to-r from-navy/5 to-bronze/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy shadow-sm">
                            <Receipt className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold font-heading text-navy">
                                Gerar Fatura
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Pedido {order.order_number} • {order.store?.company_name || ''}
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
                                Fatura Gerada!
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                                A fatura com {installmentCount} parcela{installmentCount > 1 ? 's' : ''} foi criada
                                e o cliente foi notificado.
                            </p>
                            <Button
                                className="mt-6 gap-2"
                                onClick={() => onOpenChange(false)}
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                Fechar
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border border-navy/10 bg-navy/[0.03] p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                            Valor Total do Pedido
                                        </p>
                                        <p className="text-2xl font-black text-gradient-bronze mt-1">
                                            {fmt(order.total)}
                                        </p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        {order.payment_method_name && (
                                            <Badge variant="outline" className="text-[10px]">
                                                {order.payment_method_name}
                                            </Badge>
                                        )}
                                        {order.payment_condition_name && (
                                            <Badge variant="outline" className="text-[10px] ml-1">
                                                {order.payment_condition_name}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                                        <Calendar className="h-3.5 w-3.5 text-navy" />
                                        Data de Emissão
                                    </Label>
                                    <Input
                                        type="date"
                                        value={issueDate}
                                        onChange={(e) => setIssueDate(e.target.value)}
                                        className="h-10 rounded-lg"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                                        <DollarSign className="h-3.5 w-3.5 text-navy" />
                                        Nº de Parcelas
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={36}
                                        value={installmentCount}
                                        onChange={(e) =>
                                            setInstallmentCount(
                                                Math.max(1, Math.min(36, parseInt(e.target.value) || 1))
                                            )
                                        }
                                        className={cn(
                                            'h-10 rounded-lg',
                                            installmentCountMismatch && 'border-amber-400 focus-visible:ring-amber-300'
                                        )}
                                    />
                                    {!!order.payment_installments && (
                                        <p className="text-xs text-muted-foreground">
                                            Condição padrão do pedido: {expectedInstallments} parcela{expectedInstallments > 1 ? 's' : ''}.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    Dias personalizados (opcional)
                                </Label>
                                <Input
                                    placeholder="Ex: 30, 60, 90"
                                    value={installmentDays}
                                    onChange={(e) => setInstallmentDays(e.target.value)}
                                    className={cn(
                                        'h-10 rounded-lg',
                                        (parsedInstallmentDays.invalid || installmentDaysCountMismatch) &&
                                            'border-red-400 focus-visible:ring-red-300'
                                    )}
                                />
                                {parsedInstallmentDays.invalid ? (
                                    <p className="text-xs text-red-600">
                                        Dias inválidos. Use apenas números inteiros positivos em ordem crescente.
                                    </p>
                                ) : installmentDaysCountMismatch ? (
                                    <p className="text-xs text-red-600">
                                        Informe exatamente {installmentCount} valor(es), um para cada parcela.
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Deixe vazio para intervalos padrão de 30 dias.
                                    </p>
                                )}
                            </div>

                            {requiresOverrideJustification && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold text-amber-800">
                                            Override da condição de pagamento detectado.
                                        </p>
                                        <p className="text-xs text-amber-700">
                                            Para seguir com faturamento fora da condição padrão, informe justificativa em observações.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <Separator />

                            <div>
                                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-navy">
                                    <FileText className="h-4 w-4" />
                                    Prévia das Parcelas
                                </h4>

                                {installments.length > 0 ? (
                                    <div className="rounded-xl border border-border/60 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50 border-b">
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                        Parcela
                                                    </th>
                                                    <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                        Vencimento
                                                    </th>
                                                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                        Valor
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/40">
                                                {installments.map((inst) => (
                                                    <tr key={inst.number} className="hover:bg-slate-50/60">
                                                        <td className="px-3 py-2.5">
                                                            <span className="inline-flex items-center gap-1">
                                                                <span className="font-bold text-navy">
                                                                    {inst.number}
                                                                </span>
                                                                <span className="text-muted-foreground">
                                                                    /{installmentCount}
                                                                </span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center font-medium">
                                                            {formatDateBR(inst.dueDate)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-semibold">
                                                            {fmt(inst.amount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-navy/5 border-t">
                                                    <td colSpan={2} className="px-3 py-2.5 text-right font-bold text-sm text-navy">
                                                        Total
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right font-black text-base text-gradient-bronze">
                                                        {fmt(installments.reduce((s, i) => s + i.amount, 0))}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                        <p className="text-xs text-amber-700">
                                            Preencha a data de emissão e o número de parcelas para visualizar a prévia.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    {requiresOverrideJustification
                                        ? 'Justificativa do override (obrigatória)'
                                        : 'Observações (opcional)'}
                                </Label>
                                <Textarea
                                    placeholder={
                                        requiresOverrideJustification
                                            ? 'Explique o motivo do override da condição de pagamento (mínimo 10 caracteres).'
                                            : 'Informações adicionais sobre esta fatura...'
                                    }
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    className={cn(
                                        'resize-none rounded-lg',
                                        requiresOverrideJustification && !hasOverrideJustification &&
                                            'border-amber-400 focus-visible:ring-amber-300'
                                    )}
                                />
                                {requiresOverrideJustification && !hasOverrideJustification && (
                                    <p className="text-xs text-amber-700">
                                        A justificativa deve ter pelo menos 10 caracteres.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>

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
                                onClick={handleGenerate}
                                disabled={!canGenerate}
                                className={cn(
                                    'gap-2 rounded-lg font-bold shadow-sm transition-all',
                                    'gradient-navy border-0 text-white hover:opacity-90'
                                )}
                            >
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Receipt className="h-4 w-4" />
                                )}
                                Gerar Fatura e Parcelas
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
