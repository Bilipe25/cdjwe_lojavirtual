'use client'

import { useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { productTaxProfileSchema, type ProductTaxProfileFormData } from '../schema'

interface ProductTaxProfileFormProps {
    saving: boolean
    initialData: Partial<ProductTaxProfileFormData> | null
    onCancel: () => void
    onSubmit: (data: ProductTaxProfileFormData) => Promise<void>
    submitLabel?: string
}

const defaultValues: ProductTaxProfileFormData = {
    id: undefined,
    name: '',
    code: '',
    description: undefined,
    ncm: undefined,
    cest: undefined,
    originCode: '0',
    commercialUnit: undefined,
    taxUnit: undefined,
    eanGtin: undefined,
    taxEanGtin: undefined,
    defaultFiscalDescription: undefined,
    fiscalType: 'goods',
    itemType: 'goods',
    hasSubstitutionTax: false,
    requiresCest: false,
    hasIpi: false,
    ipiCstOut: undefined,
    ipiEnquadramentoCodigo: undefined,
    pisCst: undefined,
    cofinsCst: undefined,
    pisAliquota: undefined,
    cofinsAliquota: undefined,
    defaultOutputCfop: undefined,
    defaultInputCfop: undefined,
    internalFiscalCode: undefined,
    defaultFiscalNotes: undefined,
    isActive: true,
    requiresTaxConfiguration: true,
}

export function ProductTaxProfileForm({
    saving,
    initialData,
    onCancel,
    onSubmit,
    submitLabel,
}: ProductTaxProfileFormProps) {
    const form = useForm<ProductTaxProfileFormData>({
        resolver: zodResolver(productTaxProfileSchema) as Resolver<ProductTaxProfileFormData>,
        defaultValues,
    })

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = form
    const hasSt = watch('hasSubstitutionTax')
    const requiresCest = watch('requiresCest')
    const hasIpi = watch('hasIpi')
    const isActive = watch('isActive')
    const requiresTaxConfiguration = watch('requiresTaxConfiguration')

    useEffect(() => {
        reset({
            ...defaultValues,
            ...(initialData || {}),
        })
    }, [initialData, reset])

    return (
        <form onSubmit={handleSubmit((data) => onSubmit(data))} className="space-y-5">
            <section className="rounded-xl border bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-navy">1. Informacoes Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1 md:col-span-2">
                        <Label>Nome do Perfil *</Label>
                        <Input {...register('name')} />
                        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Codigo Interno *</Label>
                        <Input {...register('code')} />
                        {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
                    </div>
                    <div className="space-y-1 md:col-span-3">
                        <Label>Descricao</Label>
                        <Textarea rows={2} {...register('description')} />
                    </div>
                </div>
            </section>

            <section className="rounded-xl border bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-navy">2. Identificacao Fiscal</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <Label>NCM</Label>
                        <Input {...register('ncm')} />
                        {errors.ncm && <p className="text-xs text-red-500">{errors.ncm.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>CEST</Label>
                        <Input {...register('cest')} />
                        {errors.cest && <p className="text-xs text-red-500">{errors.cest.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Origem</Label>
                        <Input {...register('originCode')} />
                    </div>
                    <div className="space-y-1">
                        <Label>Unidade Comercial</Label>
                        <Input {...register('commercialUnit')} />
                    </div>
                    <div className="space-y-1">
                        <Label>Unidade Tributavel</Label>
                        <Input {...register('taxUnit')} />
                    </div>
                    <div className="space-y-1">
                        <Label>EAN/GTIN</Label>
                        <Input {...register('eanGtin')} />
                    </div>
                    <div className="space-y-1">
                        <Label>EAN Tributavel</Label>
                        <Input {...register('taxEanGtin')} />
                    </div>
                    <div className="space-y-1 md:col-span-4">
                        <Label>Descricao Fiscal Padrao</Label>
                        <Textarea rows={2} {...register('defaultFiscalDescription')} />
                    </div>
                </div>
            </section>

            <section className="rounded-xl border bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-navy">3. Classificacao Fiscal</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <Label>PIS CST</Label>
                        <Input {...register('pisCst')} />
                    </div>
                    <div className="space-y-1">
                        <Label>COFINS CST</Label>
                        <Input {...register('cofinsCst')} />
                    </div>
                    <div className="space-y-1">
                        <Label>Aliquota PIS</Label>
                        <Input type="number" step="0.01" {...register('pisAliquota')} />
                    </div>
                    <div className="space-y-1">
                        <Label>Aliquota COFINS</Label>
                        <Input type="number" step="0.01" {...register('cofinsAliquota')} />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                        <Label>Substituicao Tributaria</Label>
                        <Switch checked={hasSt} onCheckedChange={(value) => setValue('hasSubstitutionTax', value, { shouldDirty: true })} />
                    </div>
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                        <Label>Exige CEST</Label>
                        <Switch checked={requiresCest} onCheckedChange={(value) => setValue('requiresCest', value, { shouldDirty: true })} />
                    </div>
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                        <Label>Possui IPI</Label>
                        <Switch checked={hasIpi} onCheckedChange={(value) => setValue('hasIpi', value, { shouldDirty: true })} />
                    </div>
                </div>
                {hasIpi && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>IPI CST Saida</Label>
                            <Input {...register('ipiCstOut')} />
                            {errors.ipiCstOut && <p className="text-xs text-red-500">{errors.ipiCstOut.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label>Codigo de Enquadramento IPI</Label>
                            <Input {...register('ipiEnquadramentoCodigo')} />
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-xl border bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-navy">4. CFOP e Apoio a Emissao</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <Label>CFOP Padrao Saida</Label>
                        <Input {...register('defaultOutputCfop')} />
                        {errors.defaultOutputCfop && <p className="text-xs text-red-500">{errors.defaultOutputCfop.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>CFOP Padrao Entrada</Label>
                        <Input {...register('defaultInputCfop')} />
                        {errors.defaultInputCfop && <p className="text-xs text-red-500">{errors.defaultInputCfop.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Codigo Fiscal Interno</Label>
                        <Input {...register('internalFiscalCode')} />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                        <Label>Observacoes Fiscais</Label>
                        <Textarea rows={2} {...register('defaultFiscalNotes')} />
                    </div>
                </div>
            </section>

            <section className="rounded-xl border bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-navy">5. Flags e Evolucao</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                        <Label>Perfil ativo</Label>
                        <Switch checked={isActive} onCheckedChange={(value) => setValue('isActive', value, { shouldDirty: true })} />
                    </div>
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                        <Label>Exige configuracao fiscal</Label>
                        <Switch
                            checked={requiresTaxConfiguration}
                            onCheckedChange={(value) =>
                                setValue('requiresTaxConfiguration', value, { shouldDirty: true })
                            }
                        />
                    </div>
                </div>
            </section>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {submitLabel || 'Salvar Perfil'}
                </Button>
            </div>
        </form>
    )
}
