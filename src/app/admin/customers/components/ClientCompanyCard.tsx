'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Pencil, X, Save, Loader2, Building2, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { updateCustomerAsAdminTx } from '../actions'
import type { CustomerWithStore } from './CustomerList'
import type { CustomerType, CustomerTag, Profile } from '@/lib/types'

const companySchema = z.object({
    companyName: z.string().min(2, 'Razão Social obrigatória').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ deve ter pelo menos 14 caracteres'),
    customerTypeId: z.string().optional(),
    representativeId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
})

type CompanyFormData = z.infer<typeof companySchema>

interface ClientCompanyCardProps {
    customer: CustomerWithStore
    customerTypes: CustomerType[]
    customerTags: CustomerTag[]
    representatives: Partial<Profile>[]
    onUpdated: () => void
}

export function ClientCompanyCard({ customer, customerTypes, customerTags, representatives, onUpdated }: ClientCompanyCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const store = customer.stores?.[0]

    const customerTypeLabel = store?.customer_type?.name
    const representativeName = store?.representative?.full_name

    const form = useForm<CompanyFormData>({
        resolver: zodResolver(companySchema),
        defaultValues: {
            companyName: store?.company_name || '',
            tradeName: store?.trade_name || '',
            cnpj: store?.cnpj || '',
            customerTypeId: store?.customer_type_id || '',
            representativeId: store?.representative_id || '',
            tagIds: store?.store_tags?.map(st => st.tag_id) || [],
        },
    })

    const { register, handleSubmit, formState: { errors, isDirty }, reset, setValue } = form
    const selectedCustomerTypeId = useWatch({ control: form.control, name: 'customerTypeId' }) || ''
    const selectedRepresentativeId = useWatch({ control: form.control, name: 'representativeId' }) || ''
    const selectedTagIds = useWatch({ control: form.control, name: 'tagIds' }) || []

    const selectedCustomerType = customerTypes.find((t) => t.id === selectedCustomerTypeId)
    const selectedRepresentative = representatives.find((r) => r.id === selectedRepresentativeId)
    const hasMissingCustomerTypeOption = Boolean(selectedCustomerTypeId && selectedCustomerTypeId !== 'none' && !selectedCustomerType)
    const hasMissingRepresentativeOption = Boolean(selectedRepresentativeId && selectedRepresentativeId !== 'none' && !selectedRepresentative)
    const fallbackCustomerTypeLabel = store?.customer_type?.name || 'Tipo vinculado (inativo)'
    const fallbackRepresentativeLabel = store?.representative?.full_name || 'Representante vinculado (inativo)'
    const selectedCustomerTypeLabel = selectedCustomerType
        ? `${selectedCustomerType.name}${!selectedCustomerType.is_active ? ' (inativo)' : ''}`
        : hasMissingCustomerTypeOption ? fallbackCustomerTypeLabel : ''
    const selectedRepresentativeLabel = selectedRepresentative?.full_name || (hasMissingRepresentativeOption ? fallbackRepresentativeLabel : '')
    const willBecomeRepresentative =
        (selectedCustomerType?.slug || '').toLowerCase() === 'representante' ||
        (selectedCustomerType?.name || '').toLowerCase() === 'representante'

    const handleCancel = () => {
        reset({
            companyName: store?.company_name || '',
            tradeName: store?.trade_name || '',
            cnpj: store?.cnpj || '',
            customerTypeId: store?.customer_type_id || '',
            representativeId: store?.representative_id || '',
            tagIds: store?.store_tags?.map(st => st.tag_id) || [],
        })
        setIsEditing(false)
    }

    const onSubmit = async (data: CompanyFormData) => {
        if (!store) return
        setSaving(true)
        try {
            const result = await updateCustomerAsAdminTx(customer.id, store.id, {
                fullName: customer.full_name,
                email: customer.email || '',
                companyName: data.companyName,
                tradeName: data.tradeName,
                cnpj: data.cnpj,
                customerTypeId: data.customerTypeId === 'none' ? undefined : data.customerTypeId,
                representativeId: data.representativeId === 'none' ? undefined : data.representativeId,
                tagIds: data.tagIds,
            })
            if (!result.success) {
                toast.error(result.error || 'Erro ao atualizar empresa')
            } else {
                toast.success('Dados da empresa atualizados!')
                onUpdated()
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
                        <Building2 className="h-4 w-4" /> Dados da Empresa
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
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Razão Social</p>
                        <p className="text-sm font-medium">{store?.company_name || '—'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Nome Fantasia</p>
                        <p className="text-sm font-medium">{store?.trade_name || '—'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">CNPJ</p>
                        <p className="text-sm font-medium">{store?.cnpj || '—'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tipo de Cliente</p>
                        <p className="text-sm font-medium">{customerTypeLabel || '—'}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Representante</p>
                        <p className="text-sm font-medium">{representativeName || '—'}</p>
                    </div>
                    {store?.store_tags && store.store_tags.length > 0 && (
                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</p>
                            <div className="flex flex-wrap gap-1.5">
                                {store.store_tags.map((t, idx) => t.customer_tags && (
                                    <Badge key={idx} variant="outline" className={`font-normal text-xs ${t.customer_tags.color || ''}`}>
                                        {t.customer_tags.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ─── EDIT MODE ───
    return (
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border-2 border-navy/20 bg-navy/[0.02] p-4 sm:p-5 shadow-sm transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Editando Empresa
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Razão Social *</Label>
                    <Input {...register('companyName')} className="bg-white h-9 text-sm" />
                    {errors.companyName && <p className="text-xs text-red-500">{errors.companyName.message}</p>}
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Nome Fantasia</Label>
                    <Input {...register('tradeName')} className="bg-white h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">CNPJ *</Label>
                    <Input {...register('cnpj')} className="bg-white h-9 text-sm" />
                    {errors.cnpj && <p className="text-xs text-red-500">{errors.cnpj.message}</p>}
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de Cliente</Label>
                    <Select
                        value={selectedCustomerTypeId || 'none'}
                        onValueChange={(v) => setValue('customerTypeId', !v || v === 'none' ? undefined : v, { shouldDirty: true })}
                    >
                        <SelectTrigger className="bg-white h-9 text-sm">
                            <SelectValue placeholder="Selecione...">
                                {selectedCustomerTypeId && selectedCustomerTypeId !== 'none' ? selectedCustomerTypeLabel : undefined}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Sem tipo</SelectItem>
                            {hasMissingCustomerTypeOption && (
                                <SelectItem value={selectedCustomerTypeId}>{fallbackCustomerTypeLabel}</SelectItem>
                            )}
                            {customerTypes.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.name}{!t.is_active ? ' (inativo)' : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {willBecomeRepresentative && (
                        <p className="text-[11px] text-blue-700">
                            Ao salvar, este usuario tera acesso ao painel de representante.
                        </p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Representante Responsável</Label>
                    <Select
                        value={selectedRepresentativeId || 'none'}
                        onValueChange={(v) => setValue('representativeId', !v || v === 'none' ? undefined : v, { shouldDirty: true })}
                    >
                        <SelectTrigger className="bg-white h-9 text-sm">
                            <SelectValue placeholder="Selecione...">
                                {selectedRepresentativeId && selectedRepresentativeId !== 'none' ? selectedRepresentativeLabel : undefined}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {hasMissingRepresentativeOption && (
                                <SelectItem value={selectedRepresentativeId}>{fallbackRepresentativeLabel}</SelectItem>
                            )}
                            {representatives.filter((r) => Boolean(r.id)).map(r => (
                                <SelectItem key={r.id as string} value={r.id as string}>
                                    {r.full_name || 'Representante sem nome'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Tags */}
                <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" /> Tags de Segmentação</Label>
                    <div className="flex flex-wrap gap-2">
                        {customerTags.map(tag => {
                            const isSelected = selectedTagIds.includes(tag.id)
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => {
                                        if (isSelected) {
                                            setValue('tagIds', selectedTagIds.filter(id => id !== tag.id), { shouldDirty: true })
                                        } else {
                                            setValue('tagIds', [...selectedTagIds, tag.id], { shouldDirty: true })
                                        }
                                    }}
                                    className={`px-3 py-1 text-xs border rounded-full transition-colors ${
                                        isSelected
                                            ? tag.color
                                            : 'bg-white text-muted-foreground border-border hover:bg-slate-50'
                                    }`}
                                >
                                    {tag.name}
                                </button>
                            )
                        })}
                        {customerTags.length === 0 && (
                            <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada.</span>
                        )}
                    </div>
                </div>
            </div>
        </form>
    )
}
