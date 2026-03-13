'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Banknote, CreditCard, MonitorSmartphone, QrCodeIcon, Wallet } from 'lucide-react'
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

export function PaymentConditionForm({ isOpen, onClose, condition }: PaymentConditionFormProps) {
  const [isSaving, setIsSaving] = useState(false)

  // Initialize form with react-hook-form
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

  // Also update form when condition prop changes (e.g. from null to editing)
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
      toast.success(condition ? 'Condição atualizada com sucesso!' : ' Condição criada com sucesso!')
      onClose()
    } catch (error: any) {
      toast.error('Erro inesperado: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }


  const ICONS = [
    { id: 'credit-card', icon: CreditCard, label: 'Cartão' },
    { id: 'banknote', icon: Banknote, label: 'Dinheiro/Boleto' },
    { id: 'qr-code', icon: QrCodeIcon, label: 'PIX' },
    { id: 'smartphone', icon: MonitorSmartphone, label: 'Transferência' },
    { id: 'wallet', icon: Wallet, label: 'Carteira' },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-navy">
            {condition ? 'Editar Condição' : 'Nova Condição de Pagamento'}
          </DialogTitle>
          <DialogDescription>
            Configure os prazos que aparecerão para os clientes no checkout.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome / Prazo *</Label>
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
            <div className="flex gap-2">
              {ICONS.map(ic => {
                const IconComp = ic.icon
                const isSelected = form.watch('icon') === ic.id
                return (
                  <button
                    key={ic.id}
                    type="button"
                    onClick={() => form.setValue('icon', ic.id)}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                      isSelected ? 'bg-navy/10 border-navy text-navy' : 'bg-white/60 hover:bg-slate-50 text-muted-foreground'
                    }`}
                    title={ic.label}
                  >
                    <IconComp className="h-5 w-5" />
                  </button>
                )
              })}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="installments">Parcelas *</Label>
              <Input
                id="installments"
                type="number"
                {...form.register('installments', { valueAsNumber: true })}
                className="bg-white/60"
              />
              {form.formState.errors.installments && (
                <p className="text-sm text-red-500">{form.formState.errors.installments.message}</p>
              )}
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
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">%</span>
              </div>
              {form.formState.errors.discount_percentage && (
                <p className="text-sm text-red-500">{form.formState.errors.discount_percentage.message}</p>
              )}
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
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">%</span>
              </div>
              {form.formState.errors.surcharge_percentage && (
                <p className="text-sm text-red-500">{form.formState.errors.surcharge_percentage.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_val">Mín. da Parcela (R$)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">R$</span>
                <Input
                  id="min_val"
                  type="number"
                  step="0.01"
                  {...form.register('min_installment_value', { valueAsNumber: true })}
                  className="bg-white/60 pl-8 pr-2 text-right"
                />
              </div>
              {form.formState.errors.min_installment_value && (
                <p className="text-sm text-red-500">{form.formState.errors.min_installment_value.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="min_order">Valor Mínimo do Pedido (R$)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">R$</span>
                <Input
                  id="min_order"
                  type="number"
                  step="0.01"
                  {...form.register('min_order_value', { valueAsNumber: true })}
                  className="bg-white/60 pl-8 pr-2 text-right"
                  placeholder="0,00"
                />
              </div>
              {form.formState.errors.min_order_value && (
                <p className="text-sm text-red-500">{form.formState.errors.min_order_value.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_order">Valor Máximo do Pedido (R$)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">R$</span>
                <Input
                  id="max_order"
                  type="number"
                  step="0.01"
                  {...form.register('max_order_value', { valueAsNumber: true, setValueAs: (v) => v === "" ? null : parseFloat(v) })}
                  className="bg-white/60 pl-8 pr-2 text-right"
                  placeholder="Sem limite"
                />
              </div>
              {form.formState.errors.max_order_value && (
                <p className="text-sm text-red-500">{form.formState.errors.max_order_value.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (Visível ao cliente)</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder="Desconto especial para pagamento à vista no PIX"
              className="bg-white/60 resize-none"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mb-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Status Ativo</Label>
              <p className="text-[11px] text-muted-foreground">
                Exibir esta opção no carrinho de compras
              </p>
            </div>
            <Switch
              checked={form.watch('is_active')}
              onCheckedChange={(val) => form.setValue('is_active', val)}
            />
          </div>


          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
              {isSaving ? 'Salvando...' : 'Salvar Condição'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
