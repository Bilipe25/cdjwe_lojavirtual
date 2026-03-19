'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Banknote, CreditCard, Landmark, MonitorSmartphone, QrCodeIcon, Wallet } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { PaymentMethod } from '@/lib/types'
import { savePaymentMethod } from '../actions'

const formSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'O nome é obrigatório').max(80, 'Nome muito longo'),
    description: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    is_active: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

const ICONS = [
    { id: 'pix', icon: QrCodeIcon, label: 'Pix' },
    { id: 'credit-card', icon: CreditCard, label: 'Cartão' },
    { id: 'banknote', icon: Banknote, label: 'Boleto / dinheiro' },
    { id: 'bank-transfer', icon: Landmark, label: 'Transferência' },
    { id: 'smartphone', icon: MonitorSmartphone, label: 'Carteira digital' },
    { id: 'wallet', icon: Wallet, label: 'Carteira / caixa' },
]

interface PaymentMethodFormProps {
    isOpen: boolean
    onClose: () => void
    method: PaymentMethod | null
}

export function PaymentMethodForm({ isOpen, onClose, method }: PaymentMethodFormProps) {
    const [isSaving, setIsSaving] = useState(false)
    const router = useRouter()

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            id: method?.id,
            name: method?.name || '',
            description: method?.description || '',
            icon: method?.icon || 'credit-card',
            is_active: method ? method.is_active : true,
        },
    })

    useEffect(() => {
        form.reset({
            id: method?.id,
            name: method?.name || '',
            description: method?.description || '',
            icon: method?.icon || 'credit-card',
            is_active: method ? method.is_active : true,
        })
    }, [form, method])

    const onSubmit = async (values: FormValues) => {
        setIsSaving(true)
        try {
            const result = await savePaymentMethod(values)
            if (result.error) {
                toast.error(result.error)
                return
            }

            toast.success(method ? 'Meio atualizado com sucesso!' : 'Meio criado com sucesso!')
            router.refresh()
            onClose()
        } catch (error: unknown) {
            toast.error(
                `Erro inesperado: ${error instanceof Error ? error.message : 'Falha ao salvar meio.'}`
            )
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="font-heading text-xl text-navy">
                        {method ? 'Editar Meio de Pagamento' : 'Novo Meio de Pagamento'}
                    </DialogTitle>
                    <DialogDescription>
                        Cadastre o meio principal e depois vincule as condições comerciais disponíveis para ele.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome do Meio *</Label>
                        <Input
                            id="name"
                            {...form.register('name')}
                            placeholder="Ex: Pix, Boleto, Cartão de Crédito"
                            className="bg-white/60"
                        />
                        <p className="text-xs text-muted-foreground">
                            O código técnico é gerado automaticamente no backend para manter consistência.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                            id="description"
                            {...form.register('description')}
                            placeholder="Ex: Liquidação instantânea com confirmação automática."
                            className="resize-none bg-white/60"
                            rows={3}
                        />
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
                                        className={`flex min-w-24 flex-col items-center justify-center gap-1 rounded-lg border p-3 transition-all ${
                                            isSelected
                                                ? 'border-navy bg-navy/10 text-navy'
                                                : 'bg-white/60 text-muted-foreground hover:bg-slate-50'
                                        }`}
                                        title={item.label}
                                    >
                                        <IconComp className="h-5 w-5" />
                                        <span className="text-[11px] font-medium">{item.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border bg-white/40 p-3">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Status ativo</Label>
                            <p className="text-[11px] text-muted-foreground">
                                Exibir este meio no checkout e nas regras comerciais.
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
                            {isSaving ? 'Salvando...' : 'Salvar meio'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
