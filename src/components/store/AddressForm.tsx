'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createStoreAddress } from '@/app/(store)/cart/actions'

const addressSchema = z.object({
    title: z.string().min(2, 'Nome do endereço é obrigatório (ex: Casa, Loja)'),
    zip_code: z.string().min(8, 'CEP inválido'),
    address: z.string().min(3, 'Endereço é obrigatório'),
    number: z.string().min(1, 'Número é obrigatório'),
    complement: z.string().optional(),
    neighborhood: z.string().min(2, 'Bairro é obrigatório'),
    city: z.string().min(2, 'Cidade é obrigatória'),
    state: z.string().min(2, 'Estado (UF) é obrigatório').max(2, 'Use apenas a sigla (ex: SP)'),
    is_main: z.boolean()
})

type AddressFormValues = z.infer<typeof addressSchema>

interface AddressFormProps {
    onSuccess: (address: any) => void
    onCancel: () => void
}

export function AddressForm({ onSuccess, onCancel }: AddressFormProps) {
    const [loading, setLoading] = useState(false)
    const [cepLoading, setCepLoading] = useState(false)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors }
    } = useForm<AddressFormValues>({
        resolver: zodResolver(addressSchema),
        defaultValues: {
            title: '',
            zip_code: '',
            address: '',
            number: '',
            complement: '',
            neighborhood: '',
            city: '',
            state: '',
            is_main: false
        }
    })

    const zipCode = watch('zip_code')

    const handleLookupCEP = async () => {
        const cleanCEP = zipCode.replace(/\D/g, '')
        if (cleanCEP.length !== 8) {
            toast.error('CEP deve ter 8 dígitos')
            return
        }

        setCepLoading(true)
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`)
            const data = await response.json()

            if (data.erro) {
                toast.error('CEP não encontrado')
            } else {
                setValue('address', data.logradouro)
                setValue('neighborhood', data.bairro)
                setValue('city', data.localidade)
                setValue('state', data.uf)
                toast.success('Endereço localizado!')
            }
        } catch (error) {
            toast.error('Não foi possível consultar o CEP')
        } finally {
            setCepLoading(false)
        }
    }

    const onSubmit = async (data: AddressFormValues) => {
        setLoading(true)
        try {
            const result = await createStoreAddress(data)
            if (result.success) {
                toast.success('Endereço cadastrado com sucesso!')
                onSuccess(result.address)
            } else {
                toast.error(result.error || 'Erro ao cadastrar endereço')
            }
        } catch (error) {
            toast.error('Ocorreu um erro inesperado')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="title">Nome do Endereço (Ex: Casa, Loja, Depósito)</Label>
                    <Input id="title" {...register('title')} placeholder="Ex: Escritório Central" className="bg-white/50" />
                    {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="zip_code">CEP</Label>
                    <div className="flex gap-2">
                        <Input 
                            id="zip_code" 
                            {...register('zip_code')} 
                            placeholder="00000-000" 
                            className="bg-white/50"
                            maxLength={9}
                        />
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="icon" 
                            onClick={handleLookupCEP}
                            disabled={cepLoading}
                            className="shrink-0 h-10 w-10"
                        >
                            {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                    </div>
                    {errors.zip_code && <p className="text-xs text-destructive">{errors.zip_code.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="state">Estado (UF)</Label>
                    <Input id="state" {...register('state')} placeholder="SP" maxLength={2} className="bg-white/50 uppercase" />
                    {errors.state && <p className="text-xs text-destructive">{errors.state.message}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Logradouro (Rua/Avenida)</Label>
                    <Input id="address" {...register('address')} placeholder="Rua..." className="bg-white/50" />
                    {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="number">Número</Label>
                    <Input id="number" {...register('number')} placeholder="123" className="bg-white/50" />
                    {errors.number && <p className="text-xs text-destructive">{errors.number.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="complement">Complemento</Label>
                    <Input id="complement" {...register('complement')} placeholder="Sala, Apto..." className="bg-white/50" />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input id="neighborhood" {...register('neighborhood')} placeholder="Bairro..." className="bg-white/50" />
                    {errors.neighborhood && <p className="text-xs text-destructive">{errors.neighborhood.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" {...register('city')} placeholder="Cidade..." className="bg-white/50" />
                    {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
                </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="is_main" {...register('is_main')} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <Label htmlFor="is_main" className="text-sm cursor-pointer">Definir como endereço principal</Label>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
                    Cancelar
                </Button>
                <Button type="submit" className="gradient-bronze border-0 text-white min-w-[120px]" disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Salvando...
                        </>
                    ) : (
                        <>
                            <MapPin className="h-4 w-4 mr-2" />
                            Salvar Endereço
                        </>
                    )}
                </Button>
            </div>
        </form>
    )
}
