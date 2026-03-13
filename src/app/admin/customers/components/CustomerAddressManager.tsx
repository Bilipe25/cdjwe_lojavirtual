'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MapPin, Plus, Loader2, Pencil, Trash2, Home, Star } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { storeAddressSchema, type StoreAddressFormData } from '../schema'
import { getStoreAddresses, upsertStoreAddress, deleteStoreAddress } from '../actions'
import { toast } from 'sonner'
import type { StoreAddress } from '@/lib/types'

interface CustomerAddressManagerProps {
    storeId: string
}

export function CustomerAddressManager({ storeId }: CustomerAddressManagerProps) {
    const [addresses, setAddresses] = useState<StoreAddress[]>([])
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const form = useForm<StoreAddressFormData>({
        resolver: zodResolver(storeAddressSchema) as any,
        defaultValues: { storeId, isMain: false }
    })

    const fetchAddresses = async () => {
        setLoading(true)
        const { data, error } = await getStoreAddresses(storeId)
        if (data) setAddresses(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchAddresses()
    }, [storeId])

    const handleEdit = (addr: StoreAddress) => {
        form.reset({
            id: addr.id,
            storeId: addr.store_id,
            title: addr.title,
            isMain: addr.is_main,
            zipCode: addr.zip_code,
            address: addr.address,
            number: addr.number || '',
            complement: addr.complement || '',
            neighborhood: addr.neighborhood || '',
            city: addr.city,
            state: addr.state
        })
        setEditingId(addr.id)
        setIsEditing(true)
    }

    const handleAddNew = () => {
        form.reset({
            storeId,
            title: '',
            isMain: addresses.length === 0, // se não tiver nenhum, já surge marcado
            zipCode: '',
            address: '',
            number: '',
            complement: '',
            neighborhood: '',
            city: '',
            state: ''
        })
        setEditingId(null)
        setIsEditing(true)
    }

    const onSubmit = async (data: StoreAddressFormData) => {
        setSaving(true)
        const { error } = await upsertStoreAddress(data)
        if (error) {
            toast.error(error)
        } else {
            toast.success('Endereço salvo com sucesso!')
            setIsEditing(false)
            fetchAddresses()
        }
        setSaving(false)
    }

    const handleDelete = async (id: string, isMain: boolean) => {
        if (isMain && addresses.length > 1) {
            toast.error('Não é possível excluir o endereço principal. Defina outro antes.')
            return
        }
        if (!confirm('Deseja realmente excluir este endereço?')) return

        const { error } = await deleteStoreAddress(id)
        if (error) {
            toast.error(error)
        } else {
            toast.success('Endereço excluído!')
            fetchAddresses()
        }
    }

    if (loading) {
        return <div className="p-4 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>
    }

    if (isEditing) {
        return (
            <div className="space-y-4 border rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-navy flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {editingId ? 'Editar Endereço' : 'Novo Endereço'}
                    </h3>
                </div>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="flex items-center space-x-2 py-2 mb-2 bg-white px-3 border rounded-md">
                        <Switch
                            id="isMain"
                            checked={form.watch('isMain')}
                            onCheckedChange={(val) => form.setValue('isMain', val)}
                        />
                        <Label htmlFor="isMain" className="cursor-pointer">Este é o Endereço Principal / Faturamento</Label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                            <Label>Identificação do Local (Ex: Sede, Filial, Depósito) *</Label>
                            <Input {...form.register('title')} placeholder="Sede" className="bg-white" />
                            {form.formState.errors.title && <p className="text-xs text-red-500">{form.formState.errors.title.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>CEP *</Label>
                            <Input {...form.register('zipCode')} placeholder="00000-000" className="bg-white" />
                            {form.formState.errors.zipCode && <p className="text-xs text-red-500">{form.formState.errors.zipCode.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Endereço *</Label>
                            <Input {...form.register('address')} placeholder="Rua / Av" className="bg-white" />
                            {form.formState.errors.address && <p className="text-xs text-red-500">{form.formState.errors.address.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label>Número</Label>
                            <Input {...form.register('number')} className="bg-white" />
                        </div>
                        <div className="space-y-2">
                            <Label>Complemento</Label>
                            <Input {...form.register('complement')} placeholder="Sala, Galpão" className="bg-white" />
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
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>Cancelar</Button>
                        <Button type="submit" className="gradient-navy border-0" disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Salvar Endereço
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
                    <span className="text-sm font-medium">Endereços da Loja</span>
                </div>
                <Button size="sm" variant="outline" className="h-8 shadow-sm" onClick={handleAddNew}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Novo Endereço
                </Button>
            </div>

            {addresses.length === 0 ? (
                <div className="text-center p-6 border border-dashed rounded-xl bg-slate-50/50">
                    <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {addresses.map(addr => (
                        <Card key={addr.id} className={`overflow-hidden transition-all ${addr.is_main ? 'border-navy/40 shadow-sm ring-1 ring-navy/10' : 'border-border'}`}>
                            <CardContent className="p-0">
                                <div className="p-3 bg-slate-50/50 border-b flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        {addr.is_main ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <Home className="h-4 w-4 text-muted-foreground" />}
                                        <span className="font-semibold text-sm text-navy">{addr.title}</span>
                                        {addr.is_main && (
                                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Principal</span>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-navy" onClick={() => handleEdit(addr)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => handleDelete(addr.id, addr.is_main)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="p-3 text-sm text-muted-foreground">
                                    <p>{addr.address}{addr.number ? `, ${addr.number}` : ''}{addr.complement ? ` - ${addr.complement}` : ''}</p>
                                    <p>{addr.neighborhood ? `${addr.neighborhood}, ` : ''}{addr.city} - {addr.state}</p>
                                    <p>CEP: {addr.zip_code}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
