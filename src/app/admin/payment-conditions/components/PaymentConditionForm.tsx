'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Banknote, CreditCard, MonitorSmartphone, QrCodeIcon, Wallet } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { PaymentCondition } from '@/lib/types'
import { savePaymentCondition } from '../actions'

const formSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'O nome é obrigatório').max(100, 'Nome muito longo'),
    description: z.string().nullable().optional(),
    installments: z.number().int().min(1, 'Mínimo 1 parcela').max(36, 'Máximo 36 parcelas'),
    discount_percentage: z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%'),
    surcharge_percentage: z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%'),
    min_installment_value: z.number().min(0, 'Mínimo 0'),
    min_order_value: z.number().min(0, 'Mínimo 0'),
    max_order_value: z.number().min(0, 'Mínimo 0').nullable().optional(),
    icon: z.string().nullable().optional(),
    is_active: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

interface PaymentConditionFormProps {
    isOpen: boolean
    onClose: () => void
    condition: PaymentCondition | null
}

const ICONS = [
    { id: 'credit-card', icon: CreditCard, label: 'Cartão' },
    { id: 'banknote', icon: Banknote, label: 'Dinheiro / boleto' },
    { id: 'qr-code', icon: QrCodeIcon, label: 'Pix' },
    { id: 'smartphone', icon: MonitorSmartphone, label: 'Transferência' },
    { id: 'wallet', icon: Wallet, label: 'Carteira' },
]

export function PaymentConditionForm({ isOpen, onClose, condition }: PaymentConditionFormProps) {
    const [isSaving, setIsSaving] = useState(false)
    const router = useRouter()

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            id: condition?.id,
            name: condition?.name || '',
            description: condition?.description || '',
            installments: condition?.installments || 1,
            discount_percentage: condition?.discount_percentage || 0,
            surcharge_percentage: condition?.surcharge_percentage || 0,
            min_installment_value: condition?.min_installment_value || 0,
            min_order_value: condition?.min_order_value || 0,
            max_order_value: condition?.max_order_value || null,
            icon: condition?.icon || 'credit-card',
            is_active: condition ? condition.is_active : true,
        },
    })

    useEffect(() => {
        form.reset({
            id: condition?.id,
            name: condition?.name || '',
            description: condition?.description || '',
            installments: condition?.installments || 1,
            discount_percentage: condition?.discount_percentage || 0,
            surcharge_percentage: condition?.surcharge_percentage || 0,
            min_installment_value: condition?.min_installment_value || 0,
            min_order_value: condition?.min_order_value || 0,
            max_order_value: condition?.max_order_value || null,
            icon: condition?.icon || 'credit-card',
            is_active: condition ? condition.is_active : true,
        })
    }, [condition, form])

    const onSubmit = async (values: FormValues) => {
        setIsSaving(true)
        try {
            const result = await savePaymentCondition(values)
            if (result.error) {
                toast.error(result.error)
                return
            }

            toast.success(condition ? 'Condição atualizada com sucesso!' : 'Condição criada com sucesso!')
            router.refresh()
            onClose()
        } catch (error: unknown) {
            toast.error(
                `Erro inesperado: ${error instanceof Error ? error.message : 'Falha ao salvar condição.'}`
            )
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="font-heading text-xl text-navy">
                        {condition ? 'Editar Condição' : 'Nova Condição Comercial'}
                    </DialogTitle>
                    <DialogDescription>
                        Configure a regra comercial que poderá ser vinculada aos meios de pagamento.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome da Condição *</Label>
                        <Input
                            id="name"
                            {...form.register('name')}
                            placeholder="Ex: 30/60/90 dias"
                            className="bg-white/60"
                        />
                        {form.formState.errors.name && (
                            <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Ícone</Label>
                        <div className="flex flex-wrap gap-2">
                            {ICONS.map((item) => {
                                const IconComp = item.icon
                                const isSelected = form.watch('icon') === item.id

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => form.setValue('icon', item.id)}
                                        className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-3 transition-all ${
                                            isSelected
                                                ? 'border-navy bg-navy/10 text-navy'
                                                : 'bg-white/60 text-muted-foreground hover:bg-slate-50'
                                        }`}
                                        title={item.label}
                                    >
                                        <IconComp className="h-5 w-5" />
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="installments">Parcelas *</Label>
                            <Input
                                id="installments"
                                type="number"
                                {...form.register('installments', { valueAsNumber: true })}
                                className="bg-white/60"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="discount">Desconto (%)</Label>
                            <div className="relative">
                                <Input
                                    id="discount"
                                    type="number"
                                    step="0.01"
                                    {...form.register('discount_percentage', { valueAsNumber: true })}
                                    className="bg-white/60 pl-2 pr-7 text-right"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    %
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="surcharge">Acréscimo (%)</Label>
                            <div className="relative">
                                <Input
                                    id="surcharge"
                                    type="number"
                                    step="0.01"
                                    {...form.register('surcharge_percentage', { valueAsNumber: true })}
                                    className="bg-white/60 pl-2 pr-7 text-right"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    %
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="min_val">Mín. da Parcela (R$)</Label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    R$
                                </span>
                                <Input
                                    id="min_val"
                                    type="number"
                                    step="0.01"
                                    {...form.register('min_installment_value', { valueAsNumber: true })}
                                    className="bg-white/60 pl-8 pr-2 text-right"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="min_order">Valor Mínimo do Pedido (R$)</Label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    R$
                                </span>
                                <Input
                                    id="min_order"
                                    type="number"
                                    step="0.01"
                                    {...form.register('min_order_value', { valueAsNumber: true })}
                                    className="bg-white/60 pl-8 pr-2 text-right"
                                    placeholder="0,00"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="max_order">Valor Máximo do Pedido (R$)</Label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                                    R$
                                </span>
                                <Input
                                    id="max_order"
                                    type="number"
                                    step="0.01"
                                    {...form.register('max_order_value', {
                                        valueAsNumber: true,
                                        setValueAs: (value) =>
                                            value === '' || value === null || Number.isNaN(value)
                                                ? null
                                                : Number(value),
                                    })}
                                    className="bg-white/60 pl-8 pr-2 text-right"
                                    placeholder="Sem limite"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                            id="description"
                            {...form.register('description')}
                            placeholder="Ex: Pagamento à vista com desconto comercial."
                            className="resize-none bg-white/60"
                            rows={2}
                        />
                    </div>

                    <div className="mb-4 flex items-center justify-between rounded-lg border bg-white/40 p-3">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Status ativo</Label>
                            <p className="text-[11px] text-muted-foreground">
                                Exibir esta condição no checkout
                            </p>
                        </div>
                        <Switch
                            checked={form.watch('is_active')}
                            onCheckedChange={(value) => form.setValue('is_active', value)}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
                            {isSaving ? 'Salvando...' : 'Salvar condição'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
