'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Pencil, X, Save, Loader2, Mail, Phone, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { updateCustomerAsAdminTx } from '../actions'
import type { CustomerWithStore } from './CustomerList'

const contactSchema = z.object({
    fullName: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail inválido'),
    phone: z.string().optional(),
})

type ContactFormData = z.infer<typeof contactSchema>

interface ClientContactCardProps {
    customer: CustomerWithStore
    onUpdated: (updated: Partial<CustomerWithStore>) => void
}

export function ClientContactCard({ customer, onUpdated }: ClientContactCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const store = customer.stores?.[0]

    const normalizedEmail = (customer.email || '').trim().toLowerCase()
    const hasPlaceholderEmail =
        normalizedEmail.endsWith('@placeholder.invalid') ||
        normalizedEmail.endsWith('@placeholder.local') ||
        normalizedEmail.startsWith('importado+')
    const canEditEmail = Boolean(
        customer.status === 'imported' || customer.status === 'pending' || hasPlaceholderEmail
    )

    const form = useForm<ContactFormData>({
        resolver: zodResolver(contactSchema),
        defaultValues: {
            fullName: customer.full_name || '',
            email: customer.email || '',
            phone: customer.phone || '',
        },
    })

    const { register, handleSubmit, formState: { errors, isDirty }, reset } = form

    const handleCancel = () => {
        reset({
            fullName: customer.full_name || '',
            email: customer.email || '',
            phone: customer.phone || '',
        })
        setIsEditing(false)
    }

    const onSubmit = async (data: ContactFormData) => {
        if (!store) return
        setSaving(true)
        try {
            const result = await updateCustomerAsAdminTx(customer.id, store.id, {
                fullName: data.fullName,
                email: data.email,
                phone: data.phone,
                companyName: store.company_name || '',
                cnpj: store.cnpj || '',
            })
            if (!result.success) {
                toast.error(result.error || 'Erro ao atualizar contato')
            } else {
                toast.success('Contato atualizado!')
                onUpdated({
                    full_name: data.fullName,
                    email: data.email,
                    phone: data.phone || null,
                } as Partial<CustomerWithStore>)
                setIsEditing(false)
            }
        } catch {
            toast.error('Erro inesperado ao salvar')
        } finally {
            setSaving(false)
        }
    }

    // ─── READ MODE ───
    if (!isEditing) {
        return (
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm group relative">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
                        <User className="h-4 w-4" /> Dados de Contato
                    </h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="text-muted-foreground hover:text-navy md:opacity-0 md:group-hover:opacity-100 transition-opacity h-7 px-2"
                    >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Nome</p>
                        <p className="text-sm font-medium">{customer.full_name}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1"><Mail className="h-3 w-3" /> E-mail</p>
                        <p className="text-sm font-medium break-all">{customer.email || 'Não informado'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</p>
                        <p className="text-sm font-medium">{customer.phone || 'Não informado'}</p>
                    </div>
                </div>
            </div>
        )
    }

    // ─── EDIT MODE ───
    return (
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border-2 border-navy/20 bg-navy/[0.02] p-4 sm:p-5 shadow-sm transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
                    <User className="h-4 w-4" /> Editando Contato
                </h3>
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={saving} className="h-8 px-3 text-muted-foreground">
                        <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={saving || !isDirty} className="h-8 px-4 bg-navy hover:bg-navy/90 text-white">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                        Salvar
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-xs">Nome do Responsável *</Label>
                    <Input {...register('fullName')} className="bg-white h-9 text-sm" />
                    {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">E-mail *</Label>
                    <Input {...register('email')} type="email" className="bg-white h-9 text-sm" disabled={!canEditEmail} />
                    {!canEditEmail && (
                        <p className="text-[11px] text-muted-foreground">E-mail bloqueado para cliente já ativo.</p>
                    )}
                    {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Telefone / WhatsApp</Label>
                    <Input {...register('phone')} className="bg-white h-9 text-sm" />
                </div>
            </div>
        </form>
    )
}
