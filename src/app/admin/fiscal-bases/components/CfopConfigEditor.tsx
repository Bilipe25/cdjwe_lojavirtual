'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FiscalAutocompleteField } from './FiscalAutocompleteField'
import {
    getCfopConfigDetailAction,
    upsertCfopConfigAction,
    type CfopConfigDetail,
    type CfopConfigFormData,
} from '@/app/admin/actions/cfop-configs'
import {
    listIbscbsCatalogVersionsAction,
    listIbscbsCstCatalogAction,
    listIbscbsPresumedCreditCatalogAction,
    searchIbscbsClassificationAction,
    type IbscbsClassificationCatalogItem,
    type IbscbsCstCatalogItem,
    type IbscbsPresumedCreditCatalogItem,
} from '@/app/admin/actions/ibscbs-bases'
import { listFiscalCatalogItemsAction, type FiscalCatalogItemOption, type FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'
import {
    CFOP_OPERATION_GROUP_OPTIONS,
    CFOP_OPERATION_SCOPE_OPTIONS,
    getCfopConfigurationStatusLabel,
} from '@/lib/fiscal/cfop'
import { cfopConfigFormSchema, type CfopConfigFormValues } from '@/app/admin/fiscal-bases/cfop/schema'

interface CfopConfigEditorProps {
    entryId: string
    initialDetail: CfopConfigDetail
}

type CfopBooleanField =
    | 'appliesToOwnManufacture'
    | 'appliesToResale'
    | 'appliesOutsideEstablishment'
    | 'appliesConsumerFinal'
    | 'appliesTaxpayer'
    | 'supportsSt'
    | 'sumOperationTotalInvoice'
    | 'isRecommended'

type CfopIcmsBooleanField =
    | 'icmsConfig.calculateIcms'
    | 'icmsConfig.simpleNationalNonTaxed'
    | 'icmsConfig.omitIcmsForIndividual'
    | 'icmsConfig.highlightStOnInvoice'
    | 'icmsConfig.stCollectedPreviously'
    | 'impactsIcms'

function toClassificationOption(item: IbscbsClassificationCatalogItem): FiscalSearchOption {
    return {
        id: item.id,
        versionId: item.catalogVersionId,
        versionLabel: '',
        code: item.code,
        description: item.label,
        secondaryText: item.shortLabel || item.description || undefined,
    }
}

function getDirectionLabel(direction: 'outbound' | 'inbound' | 'both') {
    if (direction === 'outbound') return 'Saida'
    if (direction === 'inbound') return 'Entrada'
    return 'Entrada e saida'
}

function getConfigurationStatusBadgeClass(status?: string | null) {
    if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700'
    if (status === 'legacy') return 'border-slate-200 bg-slate-100 text-slate-700'
    return 'border-rose-200 bg-rose-50 text-rose-700'
}

function normalizeDetailToForm(detail: CfopConfigDetail): CfopConfigFormValues {
    return {
        entryId: detail.entryId,
        configId: detail.configId || undefined,
        versionId: detail.versionId,
        code: detail.code,
        description: detail.description,
        operationDirection: detail.operationDirection,
        operationGroup: detail.operationGroup,
        generalDescription: detail.generalDescription || '',
        defaultNote: detail.defaultNote || undefined,
        operationScope: detail.operationScope,
        appliesToOwnManufacture: detail.appliesToOwnManufacture,
        appliesToResale: detail.appliesToResale,
        appliesOutsideEstablishment: detail.appliesOutsideEstablishment,
        appliesConsumerFinal: detail.appliesConsumerFinal,
        appliesTaxpayer: detail.appliesTaxpayer,
        supportsSt: detail.supportsSt,
        impactsIcms: detail.impactsIcms,
        impactsIbscbs: detail.impactsIbscbs,
        sumOperationTotalInvoice: detail.sumOperationTotalInvoice,
        isRecommended: detail.isRecommended,
        isLegacy: detail.isLegacy,
        isActive: detail.isActive,
        icmsConfig: {
            calculateIcms: detail.icmsConfig.calculateIcms,
            simpleNationalNonTaxed: detail.icmsConfig.simpleNationalNonTaxed,
            omitIcmsForIndividual: detail.icmsConfig.omitIcmsForIndividual,
            highlightStOnInvoice: detail.icmsConfig.highlightStOnInvoice,
            stCollectedPreviously: detail.icmsConfig.stCollectedPreviously,
        },
        ibscbsConfig: {
            cstCatalogVersionId: detail.ibscbsConfig.cstCatalogVersionId || undefined,
            cstCode: detail.ibscbsConfig.cstCode || undefined,
            classificationVersionId: detail.ibscbsConfig.classificationVersionId || undefined,
            classificationCode: detail.ibscbsConfig.classificationCode || undefined,
            regularCstCode: detail.ibscbsConfig.regularCstCode || undefined,
            regularClassificationCode: detail.ibscbsConfig.regularClassificationCode || undefined,
            presumedCreditCatalogVersionId: detail.ibscbsConfig.presumedCreditCatalogVersionId || undefined,
            presumedCreditCode: detail.ibscbsConfig.presumedCreditCode || undefined,
            presumedCreditRate: detail.ibscbsConfig.presumedCreditRate ?? undefined,
        },
        piscofinsConfig: {
            pisCstCode: detail.piscofinsConfig.pisCstCode || undefined,
            cofinsCstCode: detail.piscofinsConfig.cofinsCstCode || undefined,
        },
    }
}

export function CfopConfigEditor({ entryId, initialDetail }: CfopConfigEditorProps) {
    const [detail, setDetail] = useState(initialDetail)
    const [saving, setSaving] = useState(false)
    const [loadingCatalogs, setLoadingCatalogs] = useState(true)
    const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null)
    const [ibscbsCatalogReady, setIbscbsCatalogReady] = useState(false)
    const [presumedCreditCatalogReady, setPresumedCreditCatalogReady] = useState(false)
    const [cstOptions, setCstOptions] = useState<IbscbsCstCatalogItem[]>([])
    const [presumedCreditOptions, setPresumedCreditOptions] = useState<IbscbsPresumedCreditCatalogItem[]>([])
    const [pisOptions, setPisOptions] = useState<FiscalCatalogItemOption[]>([])
    const [cofinsOptions, setCofinsOptions] = useState<FiscalCatalogItemOption[]>([])
    const [classificationOptions, setClassificationOptions] = useState<FiscalSearchOption[]>([])
    const [regularClassificationOptions, setRegularClassificationOptions] = useState<FiscalSearchOption[]>([])
    const [classificationLoading, setClassificationLoading] = useState(false)
    const [regularClassificationLoading, setRegularClassificationLoading] = useState(false)
    const [selectedClassification, setSelectedClassification] = useState<FiscalSearchOption | null>(null)
    const [selectedRegularClassification, setSelectedRegularClassification] = useState<FiscalSearchOption | null>(null)

    const form = useForm<CfopConfigFormValues>({
        resolver: zodResolver(cfopConfigFormSchema) as Resolver<CfopConfigFormValues>,
        defaultValues: normalizeDetailToForm(initialDetail),
    })

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = form
    const impactsIbscbs = watch('impactsIbscbs')
    const ibscbsCstCode = watch('ibscbsConfig.cstCode')
    const ibscbsCatalogVersionId = watch('ibscbsConfig.classificationVersionId')

    useEffect(() => {
        reset(normalizeDetailToForm(detail))
        setSelectedClassification(
            detail.ibscbsConfig.classificationCode
                ? {
                      id: detail.ibscbsConfig.classificationCode,
                      versionId: detail.ibscbsConfig.classificationVersionId || '',
                      versionLabel: '',
                      code: detail.ibscbsConfig.classificationCode,
                      description: 'Carregando classificacao...',
                  }
                : null
        )
        setSelectedRegularClassification(
            detail.ibscbsConfig.regularClassificationCode
                ? {
                      id: detail.ibscbsConfig.regularClassificationCode,
                      versionId: detail.ibscbsConfig.classificationVersionId || '',
                      versionLabel: '',
                      code: detail.ibscbsConfig.regularClassificationCode,
                      description: 'Carregando classificacao...',
                  }
                : null
        )
    }, [detail, reset])

    const loadCatalogs = useCallback(async () => {
        setLoadingCatalogs(true)
        setCatalogLoadError(null)

        try {
            const [catalogVersions, cstResult, presumedCreditResult, pisResult, cofinsResult] = await Promise.all([
                listIbscbsCatalogVersionsAction(),
                listIbscbsCstCatalogAction({
                    catalogVersionId: detail.ibscbsConfig.cstCatalogVersionId || undefined,
                }),
                listIbscbsPresumedCreditCatalogAction({
                    catalogVersionId: detail.ibscbsConfig.presumedCreditCatalogVersionId || undefined,
                }),
                listFiscalCatalogItemsAction('pis_cst'),
                listFiscalCatalogItemsAction('cofins_cst'),
            ])

            setCstOptions(cstResult.success && cstResult.data ? cstResult.data : [])
            setPresumedCreditOptions(presumedCreditResult.success && presumedCreditResult.data ? presumedCreditResult.data : [])
            setPisOptions(pisResult.success && pisResult.data ? pisResult.data : [])
            setCofinsOptions(cofinsResult.success && cofinsResult.data ? cofinsResult.data : [])

            if (catalogVersions.success && catalogVersions.data) {
                const activeCst = catalogVersions.data.cstVersions.find((item) => item.isActive) || null
                const activeClassification =
                    catalogVersions.data.classificationVersions.find((item) => item.isActive) || null
                const activePresumedCredit =
                    catalogVersions.data.presumedCreditVersions.find((item) => item.isActive) || null

                setIbscbsCatalogReady(Boolean(activeCst && activeClassification))
                setPresumedCreditCatalogReady(Boolean(activePresumedCredit))

                if (!detail.ibscbsConfig.cstCatalogVersionId && activeCst) {
                    setValue('ibscbsConfig.cstCatalogVersionId', activeCst.id, { shouldDirty: false })
                }
                if (!detail.ibscbsConfig.classificationVersionId && activeClassification) {
                    setValue('ibscbsConfig.classificationVersionId', activeClassification.id, { shouldDirty: false })
                }
                if (!detail.ibscbsConfig.presumedCreditCatalogVersionId && activePresumedCredit) {
                    setValue('ibscbsConfig.presumedCreditCatalogVersionId', activePresumedCredit.id, {
                        shouldDirty: false,
                    })
                }
            } else {
                setIbscbsCatalogReady(false)
                setPresumedCreditCatalogReady(false)
                setCatalogLoadError(catalogVersions.error || 'Nao foi possivel carregar os catalogos ativos de IBS/CBS.')
            }
        } catch (error) {
            setIbscbsCatalogReady(false)
            setPresumedCreditCatalogReady(false)
            setCatalogLoadError(error instanceof Error ? error.message : 'Nao foi possivel carregar os catalogos fiscais.')
        } finally {
            setLoadingCatalogs(false)
        }
    }, [
        detail.ibscbsConfig.classificationVersionId,
        detail.ibscbsConfig.cstCatalogVersionId,
        detail.ibscbsConfig.presumedCreditCatalogVersionId,
        setValue,
    ])

    useEffect(() => {
        void loadCatalogs()
    }, [loadCatalogs])

    const hydrateClassificationOption = useCallback(
        async ({
            code,
            cstCode,
            catalogVersionId,
        }: {
            code?: string | null
            cstCode?: string | null
            catalogVersionId?: string | null
        }) => {
            if (!code || !catalogVersionId) return null
            const result = await searchIbscbsClassificationAction({
                query: code,
                cstCode: cstCode || undefined,
                catalogVersionId,
                limit: 8,
            })

            if (!result.success || !result.data) return null
            const match = result.data.find((item) => item.code === code) || result.data[0]
            return match ? toClassificationOption(match) : null
        },
        []
    )

    const handleClassificationSearch = async (query: string, regular = false) => {
        if (!ibscbsCatalogReady) {
            if (regular) {
                setRegularClassificationOptions([])
            } else {
                setClassificationOptions([])
            }
            return
        }
        const setter = regular ? setRegularClassificationLoading : setClassificationLoading
        const optionsSetter = regular ? setRegularClassificationOptions : setClassificationOptions
        setter(true)
        const result = await searchIbscbsClassificationAction({
            query,
            cstCode: regular ? watch('ibscbsConfig.regularCstCode') || undefined : ibscbsCstCode || undefined,
            catalogVersionId: ibscbsCatalogVersionId || undefined,
            limit: 12,
        })
        optionsSetter(result.success && result.data ? result.data.map(toClassificationOption) : [])
        setter(false)
    }

    useEffect(() => {
        if (!ibscbsCatalogReady) return

        let cancelled = false
        const hydrate = async () => {
            const [classification, regularClassification] = await Promise.all([
                hydrateClassificationOption({
                    code: detail.ibscbsConfig.classificationCode,
                    cstCode: detail.ibscbsConfig.cstCode,
                    catalogVersionId: detail.ibscbsConfig.classificationVersionId,
                }),
                hydrateClassificationOption({
                    code: detail.ibscbsConfig.regularClassificationCode,
                    cstCode: detail.ibscbsConfig.regularCstCode,
                    catalogVersionId: detail.ibscbsConfig.classificationVersionId,
                }),
            ])

            if (cancelled) return
            if (classification) setSelectedClassification(classification)
            if (regularClassification) setSelectedRegularClassification(regularClassification)
        }

        void hydrate()

        return () => {
            cancelled = true
        }
    }, [
        detail.ibscbsConfig.classificationCode,
        detail.ibscbsConfig.classificationVersionId,
        detail.ibscbsConfig.cstCode,
        detail.ibscbsConfig.regularClassificationCode,
        detail.ibscbsConfig.regularCstCode,
        hydrateClassificationOption,
        ibscbsCatalogReady,
    ])

    const usageSummary = useMemo(() => {
        const parts = [
            `Perfis padrao de saida: ${detail.usage.defaultOutputCount}`,
            `Perfis padrao de entrada: ${detail.usage.defaultInputCount}`,
            `Regras contextuais: ${detail.usage.contextualRuleCount}`,
        ]
        return parts.join(' | ')
    }, [detail.usage])

    const onSubmit = async (values: CfopConfigFormValues) => {
        setSaving(true)
        const payload = {
            ...values,
            operationGroup: values.operationGroup as CfopConfigFormData['operationGroup'],
            operationScope: values.operationScope as CfopConfigFormData['operationScope'],
        } satisfies CfopConfigFormData
        const result = await upsertCfopConfigAction(payload)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Falha ao salvar configuracao de CFOP.')
            setSaving(false)
            return
        }

        const refreshed = await getCfopConfigDetailAction(entryId)
        if (refreshed.success && refreshed.data) {
            setDetail(refreshed.data)
            toast.success(result.data.created ? 'Configuracao de CFOP criada.' : 'Configuracao de CFOP atualizada.')
        } else {
            toast.success('Configuracao de CFOP salva.')
        }
        setSaving(false)
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                        <Link href="/admin/fiscal-bases/cfop">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para a base de CFOP
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">Configuracao de CFOP</h1>
                    <p className="mt-1 text-muted-foreground">
                        Vincule contexto operacional, flags fiscais e catalogos estruturados ao CFOP oficial sem perder rastreabilidade por versao.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="bg-white">{detail.code}</Badge>
                    <Badge variant="outline" className="bg-white">{detail.versionLabel}</Badge>
                    <Badge variant="outline" className={getConfigurationStatusBadgeClass(detail.configurationStatus)}>
                        {getCfopConfigurationStatusLabel(detail.configurationStatus)}
                    </Badge>
                </div>
            </div>

            <form onSubmit={handleSubmit((values) => void onSubmit(values))} className="space-y-5">
                <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-navy">1. Configuracoes do CFOP</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Codigo</Label>
                            <Input value={detail.code} disabled />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label>Descricao oficial</Label>
                            <Input value={detail.description} disabled />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Direcao oficial</Label>
                            <Input value={getDirectionLabel(detail.operationDirection)} disabled />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Grupo operacional</Label>
                            <Select
                                value={watch('operationGroup')}
                                onValueChange={(value) => setValue('operationGroup', value as CfopConfigFormValues['operationGroup'], { shouldDirty: true })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CFOP_OPERATION_GROUP_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.operationGroup ? <p className="text-xs text-red-500">{errors.operationGroup.message}</p> : null}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Escopo da operacao</Label>
                            <Select
                                value={watch('operationScope')}
                                onValueChange={(value) => setValue('operationScope', value as CfopConfigFormValues['operationScope'], { shouldDirty: true })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CFOP_OPERATION_SCOPE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.operationScope ? <p className="text-xs text-red-500">{errors.operationScope.message}</p> : null}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Descricao operacional</Label>
                        <Textarea rows={2} {...register('generalDescription')} />
                        {errors.generalDescription ? <p className="text-xs text-red-500">{errors.generalDescription.message}</p> : null}
                    </div>
                    <div className="space-y-1.5">
                        <Label>Observacao padrao na nota</Label>
                        <Textarea rows={2} {...register('defaultNote')} />
                    </div>
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-navy">2. Propriedades e Elegibilidade</h3>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {([
                            ['appliesToOwnManufacture', 'Fabricacao propria'],
                            ['appliesToResale', 'Revenda'],
                            ['appliesOutsideEstablishment', 'Fora do estabelecimento'],
                            ['appliesConsumerFinal', 'Consumidor final'],
                            ['appliesTaxpayer', 'Contribuinte'],
                            ['supportsSt', 'Compativel com ST'],
                            ['sumOperationTotalInvoice', 'Somar no total da nota'],
                            ['isRecommended', 'CFOP recomendado'],
                        ] as Array<[CfopBooleanField, string]>).map(([field, label]) => (
                            <div key={field} className="flex items-center justify-between rounded-xl border p-3">
                                <Label>{label}</Label>
                                <Switch
                                    checked={watch(field)}
                                    onCheckedChange={(value) => setValue(field, value, { shouldDirty: true })}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-navy">3. ICMS</h3>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {([
                            ['icmsConfig.calculateIcms', 'Calcular ICMS nesta operacao'],
                            ['icmsConfig.simpleNationalNonTaxed', 'Operacao nao tributada no Simples'],
                            ['icmsConfig.omitIcmsForIndividual', 'Nao destacar ICMS para pessoa fisica'],
                            ['icmsConfig.highlightStOnInvoice', 'Destacar ST na nota fiscal'],
                            ['icmsConfig.stCollectedPreviously', 'ICMS ja recolhido por ST'],
                            ['impactsIcms', 'Impacta logica de ICMS'],
                        ] as Array<[CfopIcmsBooleanField, string]>).map(([field, label]) => (
                            <div key={field} className="flex items-center justify-between rounded-xl border p-3">
                                <Label>{label}</Label>
                                <Switch
                                    checked={watch(field)}
                                    onCheckedChange={(value) => setValue(field, value, { shouldDirty: true })}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-navy">4. Dados de IBS/CBS</h3>
                    <div className="flex items-center justify-between rounded-xl border p-3">
                        <div>
                            <p className="font-medium text-slate-900">Ativar bloco de IBS/CBS</p>
                            <p className="text-xs text-muted-foreground">Use catalogos controlados e estrutura preparada para a reforma tributaria.</p>
                        </div>
                        <Switch
                            checked={impactsIbscbs}
                            onCheckedChange={(value) => setValue('impactsIbscbs', value, { shouldDirty: true })}
                        />
                    </div>
                    {catalogLoadError ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="font-medium text-amber-950">Os catalogos de IBS/CBS nao puderam ser carregados.</p>
                                    <p className="mt-1">
                                        Voce ainda pode revisar o restante do CFOP enquanto restabelece os catalogos fiscais necessarios.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" size="sm" variant="outline" onClick={() => void loadCatalogs()}>
                                        Tentar novamente
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" asChild>
                                        <Link href="/admin/fiscal-bases/ibscbs">Revisar base IBS/CBS</Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {!catalogLoadError && !loadingCatalogs && !ibscbsCatalogReady ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                            Ative uma versao de catalogo de CST e outra de classificacao tributaria de IBS/CBS para habilitar este bloco com seguranca.
                        </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>CST IBS/CBS</Label>
                            <Select
                                value={watch('ibscbsConfig.cstCode') || '__none__'}
                                disabled={!ibscbsCatalogReady}
                                onValueChange={(value) =>
                                    setValue('ibscbsConfig.cstCode', value && value !== '__none__' ? value : undefined, {
                                        shouldDirty: true,
                                    })
                                }
                            >
                                <SelectTrigger><SelectValue placeholder={loadingCatalogs ? 'Carregando...' : 'Selecione o CST'} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sem CST</SelectItem>
                                    {cstOptions.map((option) => (
                                        <SelectItem key={option.id} value={option.code}>{option.code} - {option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <FiscalAutocompleteField
                            label="Classificacao tributaria"
                            placeholder="Buscar classificacao"
                            value={selectedClassification}
                            options={classificationOptions}
                            loading={classificationLoading || loadingCatalogs}
                            onSearch={(query) => void handleClassificationSearch(query, false)}
                            onSelect={(option) => {
                                setSelectedClassification(option)
                                setValue('ibscbsConfig.classificationCode', option.code, { shouldDirty: true })
                            }}
                            onClear={() => {
                                setSelectedClassification(null)
                                setValue('ibscbsConfig.classificationCode', undefined, { shouldDirty: true })
                            }}
                        />

                        <div className="space-y-1.5">
                            <Label>Tributacao regular - CST</Label>
                            <Select
                                value={watch('ibscbsConfig.regularCstCode') || '__none__'}
                                disabled={!ibscbsCatalogReady}
                                onValueChange={(value) =>
                                    setValue('ibscbsConfig.regularCstCode', value && value !== '__none__' ? value : undefined, {
                                        shouldDirty: true,
                                    })
                                }
                            >
                                <SelectTrigger><SelectValue placeholder="Selecione o CST regular" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sem CST regular</SelectItem>
                                    {cstOptions.map((option) => (
                                        <SelectItem key={`regular-${option.id}`} value={option.code}>{option.code} - {option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <FiscalAutocompleteField
                            label="Tributacao regular - Classificacao"
                            placeholder="Buscar classificacao regular"
                            value={selectedRegularClassification}
                            options={regularClassificationOptions}
                            loading={regularClassificationLoading || loadingCatalogs}
                            onSearch={(query) => void handleClassificationSearch(query, true)}
                            onSelect={(option) => {
                                setSelectedRegularClassification(option)
                                setValue('ibscbsConfig.regularClassificationCode', option.code, { shouldDirty: true })
                            }}
                            onClear={() => {
                                setSelectedRegularClassification(null)
                                setValue('ibscbsConfig.regularClassificationCode', undefined, { shouldDirty: true })
                            }}
                        />

                        <div className="space-y-1.5">
                            <Label>Codigo do credito presumido</Label>
                            <Select
                                value={watch('ibscbsConfig.presumedCreditCode') || '__none__'}
                                disabled={!presumedCreditCatalogReady}
                                onValueChange={(value) =>
                                    setValue('ibscbsConfig.presumedCreditCode', value && value !== '__none__' ? value : undefined, {
                                        shouldDirty: true,
                                    })
                                }
                            >
                                <SelectTrigger><SelectValue placeholder="Selecione o credito presumido" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sem credito presumido</SelectItem>
                                    {presumedCreditOptions.map((option) => (
                                        <SelectItem key={option.id} value={option.code}>{option.code} - {option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Alíquota de credito presumido</Label>
                            <Input type="number" step="0.01" {...register('ibscbsConfig.presumedCreditRate')} />
                        </div>
                    </div>
                    {!loadingCatalogs && !presumedCreditCatalogReady ? (
                        <p className="text-xs text-muted-foreground">
                            O catalogo de credito presumido ainda nao esta ativo. O restante da configuracao de IBS/CBS continua disponivel.
                        </p>
                    ) : null}
                    {errors.ibscbsConfig?.classificationCode ? <p className="text-xs text-red-500">{errors.ibscbsConfig.classificationCode.message}</p> : null}
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-navy">5. CST de PIS / COFINS</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>PIS CST</Label>
                            <Select
                                value={watch('piscofinsConfig.pisCstCode') || '__none__'}
                                onValueChange={(value) =>
                                    setValue('piscofinsConfig.pisCstCode', value && value !== '__none__' ? value : undefined, {
                                        shouldDirty: true,
                                    })
                                }
                            >
                                <SelectTrigger><SelectValue placeholder="Selecione o CST de PIS" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sem CST de PIS</SelectItem>
                                    {pisOptions.map((option) => (
                                        <SelectItem key={option.id} value={option.code}>{option.code} - {option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>COFINS CST</Label>
                            <Select
                                value={watch('piscofinsConfig.cofinsCstCode') || '__none__'}
                                onValueChange={(value) =>
                                    setValue('piscofinsConfig.cofinsCstCode', value && value !== '__none__' ? value : undefined, {
                                        shouldDirty: true,
                                    })
                                }
                            >
                                <SelectTrigger><SelectValue placeholder="Selecione o CST de COFINS" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sem CST de COFINS</SelectItem>
                                    {cofinsOptions.map((option) => (
                                        <SelectItem key={option.id} value={option.code}>{option.code} - {option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-navy">6. Integracao e Uso</h3>
                    <div className="rounded-xl border bg-slate-50/70 px-4 py-3 text-sm text-slate-700">{usageSummary}</div>
                    {detail.prefilledFrom ? (
                        <div className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
                            Esta entrada ainda nao tinha configuracao propria. O editor esta pronto para reutilizar o historico operacional do mesmo codigo em outra versao quando isso fizer sentido na revisao fiscal.
                        </div>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="flex items-center justify-between rounded-xl border p-3">
                            <Label>Configuracao ativa</Label>
                            <Switch checked={watch('isActive')} onCheckedChange={(value) => setValue('isActive', value, { shouldDirty: true })} />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border p-3">
                            <Label>Marcar como legado</Label>
                            <Switch checked={watch('isLegacy')} onCheckedChange={(value) => setValue('isLegacy', value, { shouldDirty: true })} />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border p-3">
                            <Label>Impacta IBS/CBS</Label>
                            <Switch checked={watch('impactsIbscbs')} onCheckedChange={(value) => setValue('impactsIbscbs', value, { shouldDirty: true })} />
                        </div>
                    </div>
                </section>

                <input type="hidden" {...register('entryId')} />
                <input type="hidden" {...register('configId')} />
                <input type="hidden" {...register('versionId')} />
                <input type="hidden" {...register('code')} />
                <input type="hidden" {...register('description')} />
                <input type="hidden" {...register('operationDirection')} />

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" asChild>
                        <Link href="/admin/fiscal-bases/cfop">Cancelar</Link>
                    </Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar configuracao
                    </Button>
                </div>
            </form>
        </div>
    )
}






