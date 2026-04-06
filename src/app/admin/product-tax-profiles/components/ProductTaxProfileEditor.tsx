'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    getProductTaxProfileDetailAction,
    upsertProductTaxProfileAction,
} from '@/app/admin/actions/products'
import { ProductTaxProfileForm } from './ProductTaxProfileForm'
import type { ProductTaxProfileFormData } from '../schema'

interface ProductTaxProfileEditorProps {
    mode: 'create' | 'edit'
    taxProfileId?: string
}

export function ProductTaxProfileEditor({ mode, taxProfileId }: ProductTaxProfileEditorProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(mode === 'edit')
    const [saving, setSaving] = useState(false)
    const [initialData, setInitialData] = useState<Partial<ProductTaxProfileFormData> | null>(null)

    const isEditMode = mode === 'edit'

    const loadProfile = useCallback(async () => {
        if (!isEditMode || !taxProfileId) return

        setLoading(true)
        const result = await getProductTaxProfileDetailAction(taxProfileId)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel carregar o perfil tributario.')
            router.push('/admin/product-tax-profiles')
            return
        }

        setInitialData(result.data.profile as unknown as Partial<ProductTaxProfileFormData>)
        setLoading(false)
    }, [isEditMode, router, taxProfileId])

    useEffect(() => {
        void loadProfile()
    }, [loadProfile])

    const handleSave = async (data: ProductTaxProfileFormData) => {
        setSaving(true)

        const result = await upsertProductTaxProfileAction({
            id: data.id,
            name: data.name,
            code: data.code,
            description: data.description,
            ncm: data.ncm,
            cest: data.cest,
            originCode: data.originCode,
            commercialUnit: data.commercialUnit,
            taxUnit: data.taxUnit,
            eanGtin: data.eanGtin,
            taxEanGtin: data.taxEanGtin,
            defaultFiscalDescription: data.defaultFiscalDescription,
            fiscalType: data.fiscalType,
            itemType: data.itemType,
            hasSubstitutionTax: data.hasSubstitutionTax,
            requiresCest: data.requiresCest,
            hasIpi: data.hasIpi,
            ipiCstOut: data.ipiCstOut,
            ipiEnquadramentoCodigo: data.ipiEnquadramentoCodigo,
            pisCst: data.pisCst,
            cofinsCst: data.cofinsCst,
            pisAliquota: data.pisAliquota ?? null,
            cofinsAliquota: data.cofinsAliquota ?? null,
            defaultOutputCfop: data.defaultOutputCfop,
            defaultInputCfop: data.defaultInputCfop,
            internalFiscalCode: data.internalFiscalCode,
            defaultFiscalNotes: data.defaultFiscalNotes,
            isActive: data.isActive,
            requiresTaxConfiguration: data.requiresTaxConfiguration,
        })

        if (!result.success || !result.data) {
            toast.error(result.error || 'Falha ao salvar perfil tributario.')
            setSaving(false)
            return
        }

        toast.success(result.data.created ? 'Perfil tributario criado.' : 'Perfil tributario atualizado.')
        router.push('/admin/product-tax-profiles')
        router.refresh()
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                        <Link href="/admin/product-tax-profiles">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para perfis tributarios
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        {isEditMode ? 'Editar Perfil Tributario' : 'Novo Perfil Tributario'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {isEditMode
                            ? 'Atualize regras fiscais sem acoplamento por produto.'
                            : 'Crie um perfil fiscal reutilizavel para padronizar a emissao fiscal no catalogo.'}
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="rounded-xl border bg-white p-6">
                    <p className="text-sm text-muted-foreground">Carregando perfil tributario...</p>
                </div>
            ) : (
                <ProductTaxProfileForm
                    saving={saving}
                    initialData={initialData}
                    onCancel={() => router.push('/admin/product-tax-profiles')}
                    onSubmit={handleSave}
                    submitLabel={isEditMode ? 'Salvar Alteracoes' : 'Criar Perfil'}
                />
            )}
        </div>
    )
}

