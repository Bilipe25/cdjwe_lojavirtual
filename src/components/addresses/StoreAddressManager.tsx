'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MapPin, Plus, Loader2, Pencil, Trash2, Home, Star } from 'lucide-react'
import { toast } from 'sonner'
import type { StoreAddress } from '@/lib/types'
import {
    createEmptyStoreAddressFormData,
    storeAddressSchema,
    toStoreAddressFormData,
    type StoreAddressFormData,
} from '@/lib/schemas/store-address'

type AsyncResult<T = void> = Promise<{ data?: T; success?: boolean; error?: string }>

type AddressManagerLabels = {
    sectionTitle: string
    addButtonLabel: string
    emptyStateLabel: string
    mainToggleLabel: string
    editTitleLabel: string
    newTitleLabel: string
    saveButtonLabel: string
    saveSuccessLabel: string
    deleteSuccessLabel: string
    deleteMainErrorLabel: string
    deleteConfirmLabel: string
}

const defaultLabels: AddressManagerLabels = {
    sectionTitle: 'Enderecos da loja',
    addButtonLabel: 'Novo endereco',
    emptyStateLabel: 'Nenhum endereco cadastrado.',
    mainToggleLabel: 'Este e o endereco principal / faturamento',
    editTitleLabel: 'Editar Endereco',
    newTitleLabel: 'Novo Endereco',
    saveButtonLabel: 'Salvar Endereco',
    saveSuccessLabel: 'Endereco salvo com sucesso!',
    deleteSuccessLabel: 'Endereco excluido!',
    deleteMainErrorLabel: 'Nao e possivel excluir o endereco principal. Defina outro antes.',
    deleteConfirmLabel: 'Deseja realmente excluir este endereco?',
}

interface StoreAddressManagerProps {
    storeId: string
    fetchAddresses: () => AsyncResult<StoreAddress[]>
    saveAddress: (data: StoreAddressFormData) => AsyncResult
    deleteAddress: (id: string) => AsyncResult
    labels?: Partial<AddressManagerLabels>
}

export function StoreAddressManager({
    storeId,
    fetchAddresses,
    saveAddress,
    deleteAddress,
    labels,
}: StoreAddressManagerProps) {
    const [addresses, setAddresses] = useState<StoreAddress[]>([])
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const i18n = useMemo(() => ({ ...defaultLabels, ...labels }), [labels])

    const form = useForm<StoreAddressFormData>({
        resolver: zodResolver(storeAddressSchema),
        defaultValues: { storeId, isMain: false },
    })
    const isMain = useWatch({ control: form.control, name: 'isMain' }) ?? false

    const loadAddresses = useCallback(async () => {
        setLoading(true)
        const result = await fetchAddresses()
        if (result.error) {
            toast.error(result.error)
        } else {
            setAddresses(result.data || [])
        }
        setLoading(false)
    }, [fetchAddresses])

    useEffect(() => {
        const timer = setTimeout(() => {
            void loadAddresses()
        }, 0)

        return () => clearTimeout(timer)
    }, [loadAddresses])

    const handleEdit = useCallback(
        (address: StoreAddress) => {
            form.reset(toStoreAddressFormData(address, storeId))
            setEditingId(address.id)
            setIsEditing(true)
        },
        [form, storeId]
    )

    const handleAddNew = useCallback(() => {
        form.reset(createEmptyStoreAddressFormData(storeId, addresses.length === 0))
        setEditingId(null)
        setIsEditing(true)
    }, [addresses.length, form, storeId])

    const handleCancelEditing = useCallback(() => {
        setIsEditing(false)
    }, [])

    const handleSubmit: SubmitHandler<StoreAddressFormData> = useCallback(
        async (data) => {
            setSaving(true)
            const result = await saveAddress(data)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(i18n.saveSuccessLabel)
                setIsEditing(false)
                await loadAddresses()
            }
            setSaving(false)
        },
        [i18n.saveSuccessLabel, loadAddresses, saveAddress]
    )

    const handleDelete = useCallback(
        async (id: string, addressIsMain: boolean) => {
            if (addressIsMain && addresses.length > 1) {
                toast.error(i18n.deleteMainErrorLabel)
                return
            }

            if (!confirm(i18n.deleteConfirmLabel)) return

            const result = await deleteAddress(id)
            if (result.error) {
                toast.error(result.error)
                return
            }

            toast.success(i18n.deleteSuccessLabel)
            await loadAddresses()
        },
        [addresses.length, deleteAddress, i18n.deleteConfirmLabel, i18n.deleteMainErrorLabel, i18n.deleteSuccessLabel, loadAddresses]
    )

    if (loading) {
        return (
            <div className="p-4 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-navy" />
            </div>
        )
    }

    if (isEditing) {
        return (
            <div className="space-y-4 border rounded-xl p-4 bg-slate-50/50">
                <h3 className="font-semibold text-navy flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {editingId ? i18n.editTitleLabel : i18n.newTitleLabel}
                </h3>

                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="flex items-center space-x-2 py-2 mb-2 bg-white px-3 border rounded-md">
                        <Switch
                            id="isMain"
                            checked={isMain}
                            onCheckedChange={(value) => form.setValue('isMain', value)}
                        />
                        <Label htmlFor="isMain" className="cursor-pointer">
                            {i18n.mainToggleLabel}
                        </Label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Identificacao do local *</Label>
                            <Input {...form.register('title')} placeholder="Sede" className="bg-white" />
                            {form.formState.errors.title && <p className="text-xs text-red-500">{form.formState.errors.title.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>CEP *</Label>
                            <Input {...form.register('zipCode')} placeholder="00000-000" className="bg-white" />
                            {form.formState.errors.zipCode && <p className="text-xs text-red-500">{form.formState.errors.zipCode.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Endereco *</Label>
                            <Input {...form.register('address')} placeholder="Rua / Av" className="bg-white" />
                            {form.formState.errors.address && <p className="text-xs text-red-500">{form.formState.errors.address.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Numero</Label>
                            <Input {...form.register('number')} className="bg-white" />
                        </div>
                        <div className="space-y-2">
                            <Label>Complemento</Label>
                            <Input {...form.register('complement')} placeholder="Sala, Galpao" className="bg-white" />
                        </div>

                        <div className="space-y-2">
                            <Label>Bairro</Label>
                            <Input {...form.register('neighborhood')} className="bg-white" />
                        </div>
                        <div className="space-y-2">
                            <Label>Cidade *</Label>
                            <Input {...form.register('city')} className="bg-white" />
                            {form.formState.errors.city && <p className="text-xs text-red-500">{form.formState.errors.city.message}</p>}
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                            <Label>Estado (UF) *</Label>
                            <Input {...form.register('state')} placeholder="SP" maxLength={2} className="bg-white uppercase" />
                            {form.formState.errors.state && <p className="text-xs text-red-500">{form.formState.errors.state.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Codigo Municipio (IBGE)</Label>
                            <Input {...form.register('municipalityCode')} placeholder="3550308" className="bg-white" />
                        </div>

                        <div className="space-y-2">
                            <Label>Codigo Pais (BACEN)</Label>
                            <Input {...form.register('countryCode')} placeholder="1058" className="bg-white" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button type="button" variant="ghost" onClick={handleCancelEditing}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="gradient-navy border-0" disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {i18n.saveButtonLabel}
                        </Button>
                    </div>
                </form>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm font-medium">{i18n.sectionTitle}</span>
                </div>
                <Button size="sm" variant="outline" className="h-8 shadow-sm" onClick={handleAddNew}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {i18n.addButtonLabel}
                </Button>
            </div>

            {addresses.length === 0 ? (
                <div className="text-center p-6 border border-dashed rounded-xl bg-slate-50/50">
                    <p className="text-sm text-muted-foreground">{i18n.emptyStateLabel}</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {addresses.map((address) => (
                        <Card
                            key={address.id}
                            className={`overflow-hidden transition-all ${
                                address.is_main ? 'border-navy/40 shadow-sm ring-1 ring-navy/10' : 'border-border'
                            }`}
                        >
                            <CardContent className="p-0">
                                <div className="p-3 bg-slate-50/50 border-b flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        {address.is_main ? (
                                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                        ) : (
                                            <Home className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="font-semibold text-sm text-navy">{address.title}</span>
                                        {address.is_main && (
                                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                                                Principal
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 text-muted-foreground hover:text-navy"
                                            onClick={() => handleEdit(address)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                            onClick={() => handleDelete(address.id, address.is_main)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="p-3 text-sm text-muted-foreground">
                                    <p>
                                        {address.address}
                                        {address.number ? `, ${address.number}` : ''}
                                        {address.complement ? ` - ${address.complement}` : ''}
                                    </p>
                                    <p>
                                        {address.neighborhood ? `${address.neighborhood}, ` : ''}
                                        {address.city} - {address.state}
                                    </p>
                                    <p>CEP: {address.zip_code}</p>
                                    {(address.municipality_code || address.country_code) && (
                                        <p className="text-[11px]">
                                            Municipio: {address.municipality_code || 'N/D'} | Pais: {address.country_code || 'N/D'}
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

