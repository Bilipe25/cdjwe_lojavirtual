import React, { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CustomerType } from '@/lib/types'

export interface PriceTableData {
    id?: string
    name: string
    description: string | null
    discount_percentage: number
    is_default: boolean
    is_active: boolean
    valid_from: string | null
    valid_until: string | null
    customer_type_id: string | null
}

interface PriceTableFormProps {
    isOpen: boolean
    onClose: () => void
    initialData?: PriceTableData | null
    onSave: (data: Omit<PriceTableData, 'id'>) => Promise<void>
    customerTypes: CustomerType[]
}

export function PriceTableForm({ isOpen, onClose, initialData, onSave, customerTypes }: PriceTableFormProps) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [discount, setDiscount] = useState('0')
    const [isDefault, setIsDefault] = useState(false)
    const [isActive, setIsActive] = useState(true)
    const [validFrom, setValidFrom] = useState('')
    const [validUntil, setValidUntil] = useState('')
    const [customerTypeId, setCustomerTypeId] = useState<string>('none')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name)
                setDescription(initialData.description || '')
                setDiscount(initialData.discount_percentage.toString())
                setIsDefault(initialData.is_default)
                setIsActive(initialData.is_active)
                setCustomerTypeId(initialData.customer_type_id || 'none')
                
                // Cut the ISO string to YYYY-MM-DDTHH:mm to fit datetime-local
                setValidFrom(initialData.valid_from ? initialData.valid_from.substring(0, 16) : '')
                setValidUntil(initialData.valid_until ? initialData.valid_until.substring(0, 16) : '')
            } else {
                setName('')
                setDescription('')
                setDiscount('0')
                setIsDefault(false)
                setIsActive(true)
                setValidFrom('')
                setValidUntil('')
                setCustomerTypeId('none')
            }
        }
    }, [isOpen, initialData])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setIsSaving(true)
        try {
            const parsedDiscount = parseFloat(discount.replace(',', '.')) || 0
            
            // Format to proper ISO if they exist, or null
            const payloadValidFrom = validFrom ? new Date(validFrom).toISOString() : null
            const payloadValidUntil = validUntil ? new Date(validUntil).toISOString() : null
            
            await onSave({
                name,
                description,
                discount_percentage: parsedDiscount,
                is_default: isDefault,
                is_active: isActive,
                valid_from: payloadValidFrom,
                valid_until: payloadValidUntil,
                customer_type_id: customerTypeId === 'none' ? null : customerTypeId,
            })
            onClose()
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-heading text-xl text-navy">
                        {initialData ? 'Editar Tabela de Preços' : 'Nova Tabela de Preços'}
                    </DialogTitle>
                    <DialogDescription>
                        Configure o percentual base que será aplicado a todos os produtos para os clientes desta tabela.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome da Tabela *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Tabela Especial Ouro"
                            required
                            className="bg-white/60"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Para clientes da Grande SP"
                            className="bg-white/60"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="discount">Desconto Base (%)</Label>
                        <div className="relative">
                            <Input
                                id="discount"
                                type="number"
                                step="0.01"
                                value={discount}
                                onChange={(e) => setDiscount(e.target.value)}
                                className="bg-white/60 pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Use números positivos para desconto. Use números negativos (-10) para acréscimo de preço.
                        </p>
                    </div>
                    
                    {/* Time Scheduling Blocks */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-2">
                            <Label htmlFor="validFrom" className="text-xs">Data de Início</Label>
                            <Input
                                id="validFrom"
                                type="datetime-local"
                                value={validFrom}
                                onChange={(e) => setValidFrom(e.target.value)}
                                className="bg-white/60 text-sm h-9"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="validUntil" className="text-xs">Data de Término</Label>
                            <Input
                                id="validUntil"
                                type="datetime-local"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                className="bg-white/60 text-sm h-9"
                            />
                        </div>
                    </div>

                    {/* Customer Type Association */}
                    <div className="space-y-2">
                        <Label>Tipo de Cliente Associado</Label>
                        <Select value={customerTypeId} onValueChange={(v) => setCustomerTypeId(v || 'none')}>
                            <SelectTrigger className="bg-white/60">
                                <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sem tipo — atribuição manual</SelectItem>
                                {customerTypes.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                            Se definido, esta tabela será aplicada automaticamente a todos os clientes deste tipo.
                        </p>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mt-2">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Tabela Padrão</Label>
                            <p className="text-[11px] text-muted-foreground">
                                Atribuir automaticamente a novos clientes
                            </p>
                        </div>
                        <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-white/40 mb-4">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Status Ativo</Label>
                            <p className="text-[11px] text-muted-foreground">
                                Lojistas com esta tabela só verão os preços se ela estiver ativa
                            </p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSaving} className="gradient-navy border-0 text-white">
                            {isSaving ? 'Salvando...' : 'Salvar Tabela'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
