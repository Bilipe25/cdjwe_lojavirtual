'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    getFiscalSuggestionsByNcmAction,
    listFiscalCatalogItemsAction,
    listFiscalReferenceVersionsAction,
    searchFiscalCestEntriesAction,
    searchFiscalNcmEntriesAction,
    type FiscalCatalogItemOption,
    type FiscalNcmSuggestions,
    type FiscalReferenceVersionItem,
    type FiscalSearchOption,
} from '@/app/admin/actions/fiscal-bases'
import {
    searchCfopConfigOptionsAction,
    type CfopConfigSearchOption,
} from '@/app/admin/actions/cfop-configs'
import {
    listIcmsBaseOptionsAction,
    type IcmsBaseOption,
} from '@/app/admin/actions/icms-bases'
import {
    listIbscbsBaseOptionsAction,
    type IbscbsBaseOption,
} from '@/app/admin/actions/ibscbs-bases'
import { productTaxProfileSchema, type ProductTaxProfileFormData } from '../schema'
import { TaxProfileNcmSelector } from './TaxProfileNcmSelector'
import { TaxProfileCestSelector } from './TaxProfileCestSelector'
import { TaxProfileCfopConfigSelector } from './TaxProfileCfopConfigSelector'

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
    ncmReferenceId: undefined,
    ncmVersionId: undefined,
    tipiReferenceId: undefined,
    tipiVersionId: undefined,
    cestReferenceId: undefined,
    cestVersionId: undefined,
    defaultOutputCfopReferenceId: undefined,
    defaultOutputCfopVersionId: undefined,
    defaultInputCfopReferenceId: undefined,
    defaultInputCfopVersionId: undefined,
    defaultOutputCfopConfigId: undefined,
    defaultInputCfopConfigId: undefined,
    icmsBaseId: undefined,
    ibscbsBaseId: undefined,
    ibscbsVersionId: undefined,
    fiscalReferenceSnapshot: undefined,
    rules: [],
}

function sanitizeVersionLookup(node: unknown, versionId: string) {
    if (!node || typeof node !== 'object' || !versionId) return ''
    const map = node as Record<string, unknown>
    const entry = map[versionId]
    if (!entry || typeof entry !== 'object') return ''
    return String((entry as Record<string, unknown>).version_label || '')
}

function buildInitialOption(
    snapshot: Record<string, unknown> | undefined,
    key: 'ncm' | 'tipi' | 'cest' | 'default_output_cfop' | 'default_input_cfop'
): FiscalSearchOption | null {
    const node = snapshot?.[key]
    if (!node || typeof node !== 'object') return null
    const value = node as Record<string, unknown>
    const referenceId = value.reference_id
    const versionId = value.version_id

    if (!referenceId || !versionId) return null

    const versionLookup = sanitizeVersionLookup(snapshot?.version_labels, String(versionId))
    if (key === 'tipi') {
        const ipiRate =
            typeof value.ipi_rate === 'number'
                ? `${value.ipi_rate.toFixed(2)}%`
                : String(value.ipi_rate || '').trim()
        return {
            id: String(referenceId),
            versionId: String(versionId),
            versionLabel: versionLookup || '',
            code: String(value.ncm_code || ''),
            description: String(value.description || ''),
            secondaryText: `IPI ${ipiRate}${value.ex_tipi ? ` | EX ${String(value.ex_tipi)}` : ''}`,
        }
    }

    return {
        id: String(referenceId),
        versionId: String(versionId),
        versionLabel: versionLookup || '',
        code: String(value.code || ''),
        description: String(value.description || ''),
        secondaryText:
            key === 'default_output_cfop' || key === 'default_input_cfop'
                ? String(value.operation_direction || '')
                : String(value.segment || value.full_description || ''),
    }
}

function buildInitialCfopConfigOption(
    snapshot: Record<string, unknown> | undefined,
    key: 'default_output_cfop_config' | 'default_input_cfop_config'
): CfopConfigSearchOption | null {
    const node = snapshot?.[key]
    if (!node || typeof node !== 'object') return null
    const value = node as Record<string, unknown>
    const configId = value.config_id
    const referenceId = value.reference_id
    const versionId = value.version_id

    if (!configId || !referenceId || !versionId) return null

    const versionLookup = sanitizeVersionLookup(snapshot?.version_labels, String(versionId))

    return {
        id: String(configId),
        configId: String(configId),
        referenceId: String(referenceId),
        versionId: String(versionId),
        versionLabel: versionLookup || '',
        code: String(value.code || ''),
        description: String(value.description || ''),
        secondaryText: [
            String(value.operation_direction || ''),
            String(value.operation_scope || ''),
            String(value.operation_group || ''),
        ]
            .filter((part) => part.trim().length > 0)
            .join(' | '),
        metadata: {
            operation_direction: value.operation_direction || null,
            operation_scope: value.operation_scope || null,
            configuration_status: value.configuration_status || null,
            supports_st: value.supports_st === true,
            impacts_icms: value.impacts_icms !== false,
            impacts_ibscbs: value.impacts_ibscbs === true,
        },
        operationDirection: (String(value.operation_direction || 'both') as 'outbound' | 'inbound' | 'both'),
        operationScope:
            String(value.operation_scope || 'all') === 'internal' ||
            String(value.operation_scope || 'all') === 'interstate' ||
            String(value.operation_scope || 'all') === 'external'
                ? (String(value.operation_scope) as 'internal' | 'interstate' | 'external')
                : 'all',
        configurationStatus:
            String(value.configuration_status || 'pending') === 'partial' ||
            String(value.configuration_status || 'pending') === 'ready' ||
            String(value.configuration_status || 'pending') === 'legacy'
                ? (String(value.configuration_status) as 'partial' | 'ready' | 'legacy')
                : 'pending',
        supportsSt: value.supports_st === true,
        impactsIcms: value.impacts_icms !== false,
        impactsIbscbs: value.impacts_ibscbs === true,
    }
}

function buildRuleCfopConfigOption(rule: ProductTaxProfileFormData['rules'][number]): CfopConfigSearchOption | null {
    if (!rule?.cfopConfigId) return null

    const snapshot =
        rule.cfopConfigSnapshot && typeof rule.cfopConfigSnapshot === 'object'
            ? (rule.cfopConfigSnapshot as Record<string, unknown>)
            : null

    if (snapshot) {
        return {
            id: String(snapshot.config_id || rule.cfopConfigId),
            configId: String(snapshot.config_id || rule.cfopConfigId),
            referenceId: String(snapshot.reference_id || rule.cfopReferenceId || ''),
            versionId: String(snapshot.version_id || rule.cfopVersionId || ''),
            versionLabel: '',
            code: String(snapshot.code || rule.cfopOverride || ''),
            description: String(snapshot.description || rule.ruleName || 'CFOP contextual'),
            secondaryText: [
                snapshot.operation_direction ? String(snapshot.operation_direction) : null,
                snapshot.operation_scope ? String(snapshot.operation_scope) : null,
                snapshot.operation_group ? String(snapshot.operation_group) : null,
                rule.destinationUf ? `UF ${rule.destinationUf}` : null,
            ]
                .filter((part) => typeof part === 'string' && part.trim().length > 0)
                .join(' | '),
            metadata: {
                operation_direction: snapshot.operation_direction || null,
                operation_scope: snapshot.operation_scope || null,
                configuration_status: snapshot.configuration_status || null,
                supports_st: snapshot.supports_st === true,
                impacts_icms: snapshot.impacts_icms !== false,
                impacts_ibscbs: snapshot.impacts_ibscbs === true,
                is_active: snapshot.is_active !== false,
            },
            operationDirection:
                snapshot.operation_direction === 'outbound' ||
                snapshot.operation_direction === 'inbound' ||
                snapshot.operation_direction === 'both'
                    ? snapshot.operation_direction
                    : ((rule.operationDirection || 'outbound') as 'outbound' | 'inbound' | 'both'),
            operationScope:
                snapshot.operation_scope === 'internal' ||
                snapshot.operation_scope === 'interstate' ||
                snapshot.operation_scope === 'external'
                    ? snapshot.operation_scope
                    : 'all',
            configurationStatus:
                snapshot.configuration_status === 'partial' ||
                snapshot.configuration_status === 'ready' ||
                snapshot.configuration_status === 'legacy'
                    ? snapshot.configuration_status
                    : 'pending',
            supportsSt: snapshot.supports_st === true,
            impactsIcms: snapshot.impacts_icms !== false,
            impactsIbscbs: snapshot.impacts_ibscbs === true,
        }
    }

    return {
        id: rule.cfopConfigId,
        configId: rule.cfopConfigId,
        referenceId: rule.cfopReferenceId || '',
        versionId: rule.cfopVersionId || '',
        versionLabel: '',
        code: rule.cfopOverride || '',
        description: rule.ruleName || 'CFOP contextual',
        secondaryText: rule.destinationUf ? `UF ${rule.destinationUf}` : undefined,
        metadata: {},
        operationDirection: rule.operationDirection || 'outbound',
        operationScope: 'all',
        configurationStatus: 'pending',
        supportsSt: false,
        impactsIcms: true,
        impactsIbscbs: false,
    }
}

function CatalogSelectField({
    label,
    value,
    options,
    placeholder,
    onChange,
}: {
    label: string
    value?: string
    options: FiscalCatalogItemOption[]
    placeholder: string
    onChange: (nextValue: string | null) => void
}) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <Select value={value || undefined} onValueChange={onChange}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.id} value={option.code}>
                            {option.code} - {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

function VersionStateBadge({
    label,
    selectedVersionLabel,
    activeVersion,
}: {
    label: string
    selectedVersionLabel?: string | null
    activeVersion?: FiscalReferenceVersionItem | null
}) {
    if (!selectedVersionLabel) return null

    if (!activeVersion) {
        return (
            <Badge variant="outline" className="bg-white text-slate-700">
                {label}: usando {selectedVersionLabel} | sem versao ativa
            </Badge>
        )
    }

    if (activeVersion.versionLabel !== selectedVersionLabel) {
        return (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                {label}: usando {selectedVersionLabel} | ativa atual {activeVersion.versionLabel}
            </Badge>
        )
    }

    return (
        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
            {label}: base ativa {selectedVersionLabel}
        </Badge>
    )
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

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        getValues,
        watch,
        control,
        formState: { errors },
    } = form

    const { fields: contextualRuleFields, append: appendContextualRule, remove: removeContextualRule } = useFieldArray({
        control,
        name: 'rules',
    })

    const [catalogs, setCatalogs] = useState<Record<string, FiscalCatalogItemOption[]>>({})
    const [catalogsLoading, setCatalogsLoading] = useState(true)
    const [activeVersions, setActiveVersions] = useState<
        Partial<Record<'ncm' | 'tipi' | 'cest' | 'cfop', FiscalReferenceVersionItem | null>>
    >({})
    const [ncmOptions, setNcmOptions] = useState<FiscalSearchOption[]>([])
    const [cestOptions, setCestOptions] = useState<FiscalSearchOption[]>([])
    const [outputCfopOptions, setOutputCfopOptions] = useState<CfopConfigSearchOption[]>([])
    const [inputCfopOptions, setInputCfopOptions] = useState<CfopConfigSearchOption[]>([])
    const [ncmLoading, setNcmLoading] = useState(false)
    const [cestLoading, setCestLoading] = useState(false)
    const [outputCfopLoading, setOutputCfopLoading] = useState(false)
    const [inputCfopLoading, setInputCfopLoading] = useState(false)
    const [selectedNcm, setSelectedNcm] = useState<FiscalSearchOption | null>(null)
    const [selectedTipi, setSelectedTipi] = useState<FiscalSearchOption | null>(null)
    const [selectedCest, setSelectedCest] = useState<FiscalSearchOption | null>(null)
    const [selectedOutputCfop, setSelectedOutputCfop] = useState<CfopConfigSearchOption | null>(null)
    const [selectedInputCfop, setSelectedInputCfop] = useState<CfopConfigSearchOption | null>(null)
    const [contextCfopOptions, setContextCfopOptions] = useState<Record<number, CfopConfigSearchOption[]>>({})
    const [contextCfopLoading, setContextCfopLoading] = useState<Record<number, boolean>>({})
    const [selectedContextCfops, setSelectedContextCfops] = useState<Record<number, CfopConfigSearchOption | null>>({})
    const [ncmSuggestions, setNcmSuggestions] = useState<FiscalNcmSuggestions | null>(null)
    const [icmsBaseOptions, setIcmsBaseOptions] = useState<IcmsBaseOption[]>([])
    const [ibscbsBaseOptions, setIbscbsBaseOptions] = useState<IbscbsBaseOption[]>([])

    const hasSt = watch('hasSubstitutionTax')
    const requiresCest = watch('requiresCest')
    const hasIpi = watch('hasIpi')
    const isActive = watch('isActive')
    const requiresTaxConfiguration = watch('requiresTaxConfiguration')
    const currentTipiReferenceId = watch('tipiReferenceId')
    const currentIcmsBaseId = watch('icmsBaseId')
    const currentIbscbsVersionId = watch('ibscbsVersionId')
    const currentProfileId = initialData?.id

    useEffect(() => {
        const loadCatalogsAndVersions = async () => {
            setCatalogsLoading(true)
            const catalogKeys = [
                'origin',
                'commercial_unit',
                'tax_unit',
                'pis_cst',
                'cofins_cst',
                'ipi_cst',
                'item_type',
                'fiscal_type',
            ] as const

            const [catalogResults, versionResults, icmsBaseResult, ibscbsBaseResult] = await Promise.all([
                Promise.all(catalogKeys.map((key) => listFiscalCatalogItemsAction(key))),
                Promise.all([
                    listFiscalReferenceVersionsAction('ncm'),
                    listFiscalReferenceVersionsAction('tipi'),
                    listFiscalReferenceVersionsAction('cest'),
                    listFiscalReferenceVersionsAction('cfop'),
                ]),
                listIcmsBaseOptionsAction({
                    includeInactive: false,
                    includeCurrentId: typeof initialData?.icmsBaseId === 'string' ? initialData.icmsBaseId : null,
                }),
                listIbscbsBaseOptionsAction({
                    includeCurrentVersionId:
                        typeof initialData?.ibscbsVersionId === 'string' ? initialData.ibscbsVersionId : null,
                }),
            ])

            const mappedCatalogs = catalogResults.reduce<Record<string, FiscalCatalogItemOption[]>>(
                (acc, result, index) => {
                    acc[catalogKeys[index]] = result.success && result.data ? result.data : []
                    return acc
                },
                {}
            )
            setCatalogs(mappedCatalogs)

            const [ncmVersions, tipiVersions, cestVersions, cfopVersions] = versionResults
            setActiveVersions({
                ncm: ncmVersions.success && ncmVersions.data ? ncmVersions.data.find((item) => item.isActive) || null : null,
                tipi:
                    tipiVersions.success && tipiVersions.data ? tipiVersions.data.find((item) => item.isActive) || null : null,
                cest:
                    cestVersions.success && cestVersions.data ? cestVersions.data.find((item) => item.isActive) || null : null,
                cfop:
                    cfopVersions.success && cfopVersions.data ? cfopVersions.data.find((item) => item.isActive) || null : null,
            })
            setIcmsBaseOptions(icmsBaseResult.success && icmsBaseResult.data ? icmsBaseResult.data : [])
            setIbscbsBaseOptions(ibscbsBaseResult.success && ibscbsBaseResult.data ? ibscbsBaseResult.data : [])
            setCatalogsLoading(false)
        }

        void loadCatalogsAndVersions()
    }, [currentProfileId, initialData?.ibscbsVersionId, initialData?.icmsBaseId])

    useEffect(() => {
        const snapshot = initialData?.fiscalReferenceSnapshot as Record<string, unknown> | undefined
        reset({
            ...defaultValues,
            ...(initialData || {}),
        })
        setSelectedNcm(buildInitialOption(snapshot, 'ncm'))
        setSelectedTipi(buildInitialOption(snapshot, 'tipi'))
        setSelectedCest(buildInitialOption(snapshot, 'cest'))
        setSelectedOutputCfop(buildInitialCfopConfigOption(snapshot, 'default_output_cfop_config'))
        setSelectedInputCfop(buildInitialCfopConfigOption(snapshot, 'default_input_cfop_config'))
        setSelectedContextCfops(
            Object.fromEntries(
                ((initialData?.rules || []) as ProductTaxProfileFormData['rules']).map((rule, index) => [
                    index,
                    buildRuleCfopConfigOption(rule),
                ])
            )
        )
        setNcmSuggestions(null)
    }, [initialData, reset])

    useEffect(() => {
        const loadSuggestions = async () => {
            if (!selectedNcm?.code) {
                setNcmSuggestions(null)
                setSelectedTipi(null)
                setValue('tipiReferenceId', undefined, { shouldDirty: true })
                setValue('tipiVersionId', undefined, { shouldDirty: true })
                return
            }

            const result = await getFiscalSuggestionsByNcmAction(selectedNcm.code)
            if (result.success && result.data) {
                setNcmSuggestions(result.data)

                const currentTipiId = getValues('tipiReferenceId')
                const matchedCurrent = result.data.tipi.find((item) => item.id === currentTipiId)
                const singleTipi = result.data.tipi.length === 1 ? result.data.tipi[0] : null
                const chosenTipi = matchedCurrent || singleTipi || null

                if (chosenTipi) {
                    setSelectedTipi(chosenTipi)
                    setValue('tipiReferenceId', chosenTipi.id, { shouldDirty: true })
                    setValue('tipiVersionId', chosenTipi.versionId, { shouldDirty: true })
                } else {
                    setSelectedTipi(null)
                    setValue('tipiReferenceId', undefined, { shouldDirty: true })
                    setValue('tipiVersionId', undefined, { shouldDirty: true })
                }
            } else {
                setNcmSuggestions(null)
                setSelectedTipi(null)
                setValue('tipiReferenceId', undefined, { shouldDirty: true })
                setValue('tipiVersionId', undefined, { shouldDirty: true })
            }
        }

        void loadSuggestions()
    }, [getValues, selectedNcm, setValue])

    const selectedIcmsBase = useMemo(
        () => icmsBaseOptions.find((item) => item.id === currentIcmsBaseId) || null,
        [currentIcmsBaseId, icmsBaseOptions]
    )
    const selectedIcmsBaseIsInheritedInactive = Boolean(currentProfileId && selectedIcmsBase && !selectedIcmsBase.isActive)
    const selectedIbscbsBase = useMemo(
        () => ibscbsBaseOptions.find((item) => item.versionId === currentIbscbsVersionId) || null,
        [currentIbscbsVersionId, ibscbsBaseOptions]
    )
    const selectedIbscbsBaseIsInheritedInactive = Boolean(
        currentProfileId &&
            selectedIbscbsBase &&
            (!selectedIbscbsBase.isBaseActive || !selectedIbscbsBase.isVersionActive)
    )

    const referenceSummary = useMemo(() => {
        const parts = [
            selectedNcm ? `NCM ${selectedNcm.code}` : null,
            selectedTipi ? `TIPI ${selectedTipi.code}` : null,
            selectedCest ? `CEST ${selectedCest.code}` : null,
            selectedOutputCfop ? `CFOP saida ${selectedOutputCfop.code}` : null,
            selectedInputCfop ? `CFOP entrada ${selectedInputCfop.code}` : null,
            selectedIcmsBase ? `ICMS ${selectedIcmsBase.code}` : null,
            selectedIbscbsBase ? `IBS/CBS ${selectedIbscbsBase.code} ${selectedIbscbsBase.versionLabel}` : null,
        ].filter((value): value is string => Boolean(value))

        if (parts.length === 0) return 'Perfil ainda sem referencias estruturadas da base fiscal.'
        return parts.join(' | ')
    }, [selectedCest, selectedIcmsBase, selectedIbscbsBase, selectedInputCfop, selectedNcm, selectedOutputCfop, selectedTipi])

    const hasReferenceMismatch = useMemo(() => {
        return (
            Boolean(selectedNcm?.versionLabel && activeVersions.ncm && selectedNcm.versionLabel !== activeVersions.ncm.versionLabel) ||
            Boolean(selectedTipi?.versionLabel && activeVersions.tipi && selectedTipi.versionLabel !== activeVersions.tipi.versionLabel) ||
            Boolean(selectedCest?.versionLabel && activeVersions.cest && selectedCest.versionLabel !== activeVersions.cest.versionLabel) ||
            Boolean(
                selectedOutputCfop?.versionLabel &&
                    activeVersions.cfop &&
                    selectedOutputCfop.versionLabel !== activeVersions.cfop.versionLabel
            ) ||
            Boolean(
                selectedInputCfop?.versionLabel &&
                    activeVersions.cfop &&
                    selectedInputCfop.versionLabel !== activeVersions.cfop.versionLabel
            )
        )
    }, [activeVersions, selectedCest, selectedInputCfop, selectedNcm, selectedOutputCfop, selectedTipi])

    const handleNcmSearch = async (query: string) => {
        setNcmLoading(true)
        const result = await searchFiscalNcmEntriesAction({ query, limit: 12 })
        setNcmOptions(result.success && result.data ? result.data : [])
        setNcmLoading(false)
    }

    const handleCestSearch = async (query: string) => {
        setCestLoading(true)
        const result = await searchFiscalCestEntriesAction({
            query,
            ncmCode: selectedNcm?.code || undefined,
            limit: 12,
        })
        setCestOptions(result.success && result.data ? result.data : [])
        setCestLoading(false)
    }

    const handleOutputCfopSearch = async (query: string) => {
        setOutputCfopLoading(true)
        const result = await searchCfopConfigOptionsAction({
            query,
            operationDirection: 'outbound',
            limit: 12,
        })
        setOutputCfopOptions(result.success && result.data ? result.data : [])
        setOutputCfopLoading(false)
    }

    const handleInputCfopSearch = async (query: string) => {
        setInputCfopLoading(true)
        const result = await searchCfopConfigOptionsAction({
            query,
            operationDirection: 'inbound',
            limit: 12,
        })
        setInputCfopOptions(result.success && result.data ? result.data : [])
        setInputCfopLoading(false)
    }

    const handleContextCfopSearch = async (index: number, query: string) => {
        const direction = watch(`rules.${index}.operationDirection`) || 'outbound'
        setContextCfopLoading((current) => ({ ...current, [index]: true }))
        const result = await searchCfopConfigOptionsAction({
            query,
            operationDirection: direction,
            limit: 12,
        })
        setContextCfopOptions((current) => ({
            ...current,
            [index]: result.success && result.data ? result.data : [],
        }))
        setContextCfopLoading((current) => ({ ...current, [index]: false }))
    }

    return (
        <form onSubmit={handleSubmit((data) => onSubmit(data))} className="space-y-5">
            <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-navy">1. Informacoes Gerais</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1 md:col-span-2">
                        <Label>Nome do Perfil *</Label>
                        <Input {...register('name')} />
                        {errors.name ? <p className="text-xs text-red-500">{errors.name.message}</p> : null}
                    </div>
                    <div className="space-y-1">
                        <Label>Codigo Interno *</Label>
                        <Input {...register('code')} />
                        {errors.code ? <p className="text-xs text-red-500">{errors.code.message}</p> : null}
                    </div>
                    <div className="space-y-1 md:col-span-3">
                        <Label>Descricao</Label>
                        <Textarea rows={2} {...register('description')} />
                    </div>
                </div>
            </section>

            <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-navy">2. Base Fiscal do Perfil</h3>
                        <p className="text-xs text-muted-foreground">
                            Selecione referencias versionadas da base interna e reduza digitacao manual no cadastro.
                        </p>
                    </div>
                    <div className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700">
                        {referenceSummary}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <TaxProfileNcmSelector
                        value={selectedNcm}
                        options={ncmOptions}
                        loading={ncmLoading}
                        onSearch={(query) => void handleNcmSearch(query)}
                        onSelect={(option) => {
                            setSelectedNcm(option)
                            setValue('ncmReferenceId', option.id, { shouldDirty: true })
                            setValue('ncmVersionId', option.versionId, { shouldDirty: true })
                            setValue('ncm', option.code, { shouldDirty: true })
                            if (!watch('defaultFiscalDescription')) {
                                setValue('defaultFiscalDescription', option.description, { shouldDirty: true })
                            }
                        }}
                        onClear={() => {
                            setSelectedNcm(null)
                            setSelectedTipi(null)
                            setNcmSuggestions(null)
                            setValue('ncmReferenceId', undefined, { shouldDirty: true })
                            setValue('ncmVersionId', undefined, { shouldDirty: true })
                            setValue('tipiReferenceId', undefined, { shouldDirty: true })
                            setValue('tipiVersionId', undefined, { shouldDirty: true })
                            setValue('ncm', undefined, { shouldDirty: true })
                        }}
                    />
                    {errors.ncm ? <p className="-mt-2 text-xs text-red-500">{errors.ncm.message}</p> : null}

                    <TaxProfileCestSelector
                        value={selectedCest}
                        options={cestOptions}
                        loading={cestLoading}
                        onSearch={(query) => void handleCestSearch(query)}
                        onSelect={(option) => {
                            setSelectedCest(option)
                            setValue('cestReferenceId', option.id, { shouldDirty: true })
                            setValue('cestVersionId', option.versionId, { shouldDirty: true })
                            setValue('cest', option.code, { shouldDirty: true })
                        }}
                        onClear={() => {
                            setSelectedCest(null)
                            setValue('cestReferenceId', undefined, { shouldDirty: true })
                            setValue('cestVersionId', undefined, { shouldDirty: true })
                            setValue('cest', undefined, { shouldDirty: true })
                        }}
                    />
                    {errors.cest ? <p className="-mt-2 text-xs text-red-500">{errors.cest.message}</p> : null}

                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Base de ICMS</Label>
                        <Select
                            value={currentIcmsBaseId || '__none__'}
                            onValueChange={(value) =>
                                setValue('icmsBaseId', !value || value === '__none__' ? undefined : value, { shouldDirty: true })
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={catalogsLoading ? 'Carregando bases...' : 'Selecione a base de ICMS'} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Sem base de ICMS vinculada</SelectItem>
                                {icmsBaseOptions.map((option) => (
                                    <SelectItem
                                        key={option.id}
                                        value={option.id}
                                        disabled={!option.isActive && currentIcmsBaseId !== option.id}
                                    >
                                        {option.code} - {option.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Vincule uma base ativa para herdar regra nacional, excecoes por UF, interestadual e estrutura futura de ST neste perfil.
                        </p>
                        {selectedIcmsBase ? (
                            <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline" className="border-cyan-300 bg-cyan-50 text-cyan-700">
                                    {selectedIcmsBase.code}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={
                                        selectedIcmsBase.isActive
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                            : 'border-amber-300 bg-amber-50 text-amber-700'
                                    }
                                >
                                    {selectedIcmsBase.isActive ? 'Base de ICMS ativa' : 'Base de ICMS inativa'}
                                </Badge>
                                <Badge variant="outline" className="bg-white text-slate-700">
                                    Versao {selectedIcmsBase.version}
                                </Badge>
                            </div>
                        ) : null}
                        {selectedIcmsBaseIsInheritedInactive ? (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Esta base de ICMS esta inativa e permaneceu vinculada apenas por heranca historica deste perfil.
                                Para novos ajustes, prefira migrar para uma base ativa.
                            </div>
                        ) : null}
                        {errors.icmsBaseId ? <p className="text-xs text-red-500">{errors.icmsBaseId.message}</p> : null}
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Base de IBS/CBS</Label>
                        <Select
                            value={currentIbscbsVersionId || '__none__'}
                            onValueChange={(value) => {
                                if (!value || value === '__none__') {
                                    setValue('ibscbsBaseId', undefined, { shouldDirty: true })
                                    setValue('ibscbsVersionId', undefined, { shouldDirty: true })
                                    return
                                }

                                const selectedOption = ibscbsBaseOptions.find((option) => option.versionId === value) || null
                                setValue('ibscbsBaseId', selectedOption?.baseId || undefined, { shouldDirty: true })
                                setValue('ibscbsVersionId', selectedOption?.versionId || undefined, { shouldDirty: true })
                            }}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={catalogsLoading ? 'Carregando bases...' : 'Selecione a base de IBS/CBS'} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Sem base de IBS/CBS vinculada</SelectItem>
                                {ibscbsBaseOptions.map((option) => (
                                    <SelectItem
                                        key={option.versionId}
                                        value={option.versionId}
                                        disabled={
                                            (!option.isBaseActive || !option.isVersionActive) &&
                                            currentIbscbsVersionId !== option.versionId
                                        }
                                    >
                                        {option.code} - {option.name} | {option.versionLabel}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Vincule uma base versionada de IBS/CBS para preparar o perfil para reforma tributaria, vigencia fiscal e futura previa tributaria do pedido.
                        </p>
                        {selectedIbscbsBase ? (
                            <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                                    {selectedIbscbsBase.code}
                                </Badge>
                                <Badge variant="outline" className="bg-white text-slate-700">
                                    {selectedIbscbsBase.versionLabel}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={
                                        selectedIbscbsBase.isBaseActive && selectedIbscbsBase.isVersionActive
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                            : 'border-amber-300 bg-amber-50 text-amber-700'
                                    }
                                >
                                    {selectedIbscbsBase.isBaseActive && selectedIbscbsBase.isVersionActive
                                        ? 'Versao ativa de IBS/CBS'
                                        : 'Referencia IBS/CBS historica'}
                                </Badge>
                                {selectedIbscbsBase.validFrom || selectedIbscbsBase.validTo ? (
                                    <Badge variant="outline" className="bg-white text-slate-700">
                                        Vigencia {selectedIbscbsBase.validFrom || 'sem inicio'} ate {selectedIbscbsBase.validTo || 'sem fim'}
                                    </Badge>
                                ) : null}
                            </div>
                        ) : null}
                        {selectedIbscbsBaseIsInheritedInactive ? (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Esta referencia de IBS/CBS permaneceu vinculada apenas por heranca historica do perfil. Para novos ajustes, prefira uma versao ativa.
                            </div>
                        ) : null}
                        {errors.ibscbsVersionId ? <p className="text-xs text-red-500">{errors.ibscbsVersionId.message}</p> : null}
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Descricao Fiscal Padrao</Label>
                        <Textarea rows={2} {...register('defaultFiscalDescription')} />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                    <VersionStateBadge
                        label="NCM"
                        selectedVersionLabel={selectedNcm?.versionLabel}
                        activeVersion={activeVersions.ncm}
                    />
                    <VersionStateBadge
                        label="TIPI"
                        selectedVersionLabel={selectedTipi?.versionLabel}
                        activeVersion={activeVersions.tipi}
                    />
                    <VersionStateBadge
                        label="CEST"
                        selectedVersionLabel={selectedCest?.versionLabel}
                        activeVersion={activeVersions.cest}
                    />
                    <VersionStateBadge
                        label="CFOP saida"
                        selectedVersionLabel={selectedOutputCfop?.versionLabel}
                        activeVersion={activeVersions.cfop}
                    />
                    <VersionStateBadge
                        label="CFOP entrada"
                        selectedVersionLabel={selectedInputCfop?.versionLabel}
                        activeVersion={activeVersions.cfop}
                    />
                </div>

                {hasReferenceMismatch ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Este perfil usa pelo menos uma referencia de versao diferente da base ativa atual. Isso nao e um
                        erro, mas merece revisao antes de usar o perfil em novas operacoes fiscais.
                    </div>
                ) : null}

                {ncmSuggestions ? (
                    <div className="rounded-2xl border border-dashed bg-slate-50/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-navy">
                            <Sparkles className="h-4 w-4 text-bronze" />
                            Assistente de preenchimento
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl border bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    TIPI / IPI efetivamente resolvido
                                </p>
                                {selectedTipi ? (
                                    <div className="mt-2 space-y-2 text-sm text-slate-700">
                                        <p className="font-medium">
                                            {selectedTipi.code} - {selectedTipi.description}
                                        </p>
                                        {selectedTipi.secondaryText ? (
                                            <p className="text-xs text-muted-foreground">
                                                {selectedTipi.secondaryText}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Nenhum TIPI foi resolvido automaticamente para este NCM.
                                    </p>
                                )}

                                {ncmSuggestions.tipi.length > 1 ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {ncmSuggestions.tipi.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className={`rounded-full border px-2.5 py-1 text-xs ${
                                                    currentTipiReferenceId === item.id
                                                        ? 'border-navy bg-navy/5 text-navy'
                                                        : 'bg-white text-slate-700 hover:border-navy hover:text-navy'
                                                }`}
                                                onClick={() => {
                                                    setSelectedTipi(item)
                                                    setValue('tipiReferenceId', item.id, { shouldDirty: true })
                                                    setValue('tipiVersionId', item.versionId, { shouldDirty: true })
                                                }}
                                            >
                                                {item.secondaryText ? `${item.code} - ${item.secondaryText}` : item.code}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            <div className="rounded-xl border bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">CESTs compativeis</p>
                                {ncmSuggestions.cest.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {ncmSuggestions.cest.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className="rounded-full border bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-navy hover:text-navy"
                                                onClick={() => {
                                                    setSelectedCest(item)
                                                    setValue('cestReferenceId', item.id, { shouldDirty: true })
                                                    setValue('cestVersionId', item.versionId, { shouldDirty: true })
                                                    setValue('cest', item.code, { shouldDirty: true })
                                                }}
                                            >
                                                {item.code}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Sem CEST relacionado para este NCM.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-navy">3. Identificacao Fiscal e Ajustes Complementares</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <CatalogSelectField
                        label="Origem"
                        value={watch('originCode')}
                        options={catalogs.origin || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione a origem'}
                        onChange={(value) => setValue('originCode', value || '0', { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Unidade Comercial"
                        value={watch('commercialUnit') || ''}
                        options={catalogs.commercial_unit || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione a unidade'}
                        onChange={(value) => setValue('commercialUnit', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Unidade Tributavel"
                        value={watch('taxUnit') || ''}
                        options={catalogs.tax_unit || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione a unidade'}
                        onChange={(value) => setValue('taxUnit', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Tipo Fiscal"
                        value={watch('fiscalType') || 'goods'}
                        options={catalogs.fiscal_type || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o tipo fiscal'}
                        onChange={(value) => setValue('fiscalType', value || 'goods', { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Tipo de Item"
                        value={watch('itemType') || 'goods'}
                        options={catalogs.item_type || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o tipo de item'}
                        onChange={(value) => setValue('itemType', value || 'goods', { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="PIS CST"
                        value={watch('pisCst') || ''}
                        options={catalogs.pis_cst || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o CST'}
                        onChange={(value) => setValue('pisCst', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="COFINS CST"
                        value={watch('cofinsCst') || ''}
                        options={catalogs.cofins_cst || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o CST'}
                        onChange={(value) => setValue('cofinsCst', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="IPI CST Saida"
                        value={watch('ipiCstOut') || ''}
                        options={catalogs.ipi_cst || []}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o CST'}
                        onChange={(value) => setValue('ipiCstOut', value || undefined, { shouldDirty: true })}
                    />
                    <div className="space-y-1.5">
                        <Label>Aliquota PIS</Label>
                        <Input type="number" step="0.01" {...register('pisAliquota')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Aliquota COFINS</Label>
                        <Input type="number" step="0.01" {...register('cofinsAliquota')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Codigo de enquadramento IPI</Label>
                        <Input {...register('ipiEnquadramentoCodigo')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>EAN / GTIN</Label>
                        <Input {...register('eanGtin')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>EAN Tributavel</Label>
                        <Input {...register('taxEanGtin')} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="flex items-center justify-between rounded-xl border p-3">
                        <Label>Substituicao Tributaria</Label>
                        <Switch
                            checked={hasSt}
                            onCheckedChange={(value) => setValue('hasSubstitutionTax', value, { shouldDirty: true })}
                        />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border p-3">
                        <Label>Exige CEST</Label>
                        <Switch
                            checked={requiresCest}
                            onCheckedChange={(value) => setValue('requiresCest', value, { shouldDirty: true })}
                        />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border p-3">
                        <Label>Possui IPI</Label>
                        <Switch checked={hasIpi} onCheckedChange={(value) => setValue('hasIpi', value, { shouldDirty: true })} />
                    </div>
                </div>

                {hasIpi && !selectedTipi ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        O perfil esta marcado com IPI, mas ainda nao ha TIPI resolvido para este NCM. Revise a
                        sugestao automatica ou confirme se o enquadramento sera tratado manualmente.
                    </div>
                ) : null}
            </section>

            <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-navy">4. CFOP e Apoio a Emissao</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <TaxProfileCfopConfigSelector
                        label="CFOP principal de Saida"
                        value={selectedOutputCfop}
                        options={outputCfopOptions}
                        loading={outputCfopLoading}
                        onSearch={(query) => void handleOutputCfopSearch(query)}
                        onSelect={(option) => {
                            setSelectedOutputCfop(option)
                            setValue('defaultOutputCfopConfigId', option.configId, { shouldDirty: true })
                            setValue('defaultOutputCfopReferenceId', option.referenceId, { shouldDirty: true })
                            setValue('defaultOutputCfopVersionId', option.versionId, { shouldDirty: true })
                            setValue('defaultOutputCfop', option.code, { shouldDirty: true })
                        }}
                        onClear={() => {
                            setSelectedOutputCfop(null)
                            setValue('defaultOutputCfopConfigId', undefined, { shouldDirty: true })
                            setValue('defaultOutputCfopReferenceId', undefined, { shouldDirty: true })
                            setValue('defaultOutputCfopVersionId', undefined, { shouldDirty: true })
                            setValue('defaultOutputCfop', undefined, { shouldDirty: true })
                        }}
                    />
                    {errors.defaultOutputCfop || errors.defaultOutputCfopConfigId ? (
                        <p className="-mt-2 text-xs text-red-500">
                            {errors.defaultOutputCfopConfigId?.message || errors.defaultOutputCfop?.message}
                        </p>
                    ) : null}

                    <TaxProfileCfopConfigSelector
                        label="CFOP principal de Entrada"
                        value={selectedInputCfop}
                        options={inputCfopOptions}
                        loading={inputCfopLoading}
                        onSearch={(query) => void handleInputCfopSearch(query)}
                        onSelect={(option) => {
                            setSelectedInputCfop(option)
                            setValue('defaultInputCfopConfigId', option.configId, { shouldDirty: true })
                            setValue('defaultInputCfopReferenceId', option.referenceId, { shouldDirty: true })
                            setValue('defaultInputCfopVersionId', option.versionId, { shouldDirty: true })
                            setValue('defaultInputCfop', option.code, { shouldDirty: true })
                        }}
                        onClear={() => {
                            setSelectedInputCfop(null)
                            setValue('defaultInputCfopConfigId', undefined, { shouldDirty: true })
                            setValue('defaultInputCfopReferenceId', undefined, { shouldDirty: true })
                            setValue('defaultInputCfopVersionId', undefined, { shouldDirty: true })
                            setValue('defaultInputCfop', undefined, { shouldDirty: true })
                        }}
                    />
                    {errors.defaultInputCfop || errors.defaultInputCfopConfigId ? (
                        <p className="-mt-2 text-xs text-red-500">
                            {errors.defaultInputCfopConfigId?.message || errors.defaultInputCfop?.message}
                        </p>
                    ) : null}

                    <div className="space-y-1.5">
                        <Label>Codigo Fiscal Interno</Label>
                        <Input {...register('internalFiscalCode')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Observacoes Fiscais</Label>
                        <Textarea rows={2} {...register('defaultFiscalNotes')} />
                    </div>
                </div>

                <div className="rounded-2xl border border-dashed bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h4 className="text-sm font-semibold text-navy">CFOPs alternativos por contexto</h4>
                            <p className="text-xs text-muted-foreground">
                                Use regras contextuais quando a operação exigir um CFOP diferente do principal por direção, UF ou tipo de contribuinte.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                appendContextualRule({
                                    id: undefined,
                                    ruleName: `Regra ${contextualRuleFields.length + 1}`,
                                    operationDirection: 'outbound',
                                    originUf: undefined,
                                    destinationUf: undefined,
                                    customerTypeId: undefined,
                                    personType: undefined,
                                    taxpayerIndicator: undefined,
                                    cfopOverride: undefined,
                                    cfopConfigId: undefined,
                                    cfopReferenceId: undefined,
                                    cfopVersionId: undefined,
                                    priority: contextualRuleFields.length,
                                    isActive: true,
                                    effectiveFrom: undefined,
                                    effectiveTo: undefined,
                                    rulePayload: undefined,
                                    futureTaxPayload: undefined,
                                })
                            }
                        >
                            Adicionar regra contextual
                        </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                        {contextualRuleFields.length === 0 ? (
                            <div className="rounded-xl border bg-white px-4 py-3 text-xs text-muted-foreground">
                                Nenhum CFOP alternativo cadastrado ainda. O perfil vai usar apenas os CFOPs principais.
                            </div>
                        ) : null}

                        {contextualRuleFields.map((field, index) => (
                            <div key={field.id} className="rounded-xl border bg-white p-4">
                                <div className="grid gap-3 md:grid-cols-5">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label>Nome da regra</Label>
                                        <Input {...register(`rules.${index}.ruleName` as const)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Direcao</Label>
                                        <Select
                                            value={watch(`rules.${index}.operationDirection`) || 'outbound'}
                                            onValueChange={(value) =>
                                                setValue(`rules.${index}.operationDirection`, value as 'outbound' | 'inbound', {
                                                    shouldDirty: true,
                                                })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="outbound">Saida</SelectItem>
                                                <SelectItem value="inbound">Entrada</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>UF destino</Label>
                                        <Input maxLength={2} {...register(`rules.${index}.destinationUf` as const)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Prioridade</Label>
                                        <Input
                                            type="number"
                                            {...register(`rules.${index}.priority` as const, { valueAsNumber: true })}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <TaxProfileCfopConfigSelector
                                        label="CFOP alternativo"
                                        value={selectedContextCfops[index] || null}
                                        options={contextCfopOptions[index] || []}
                                        loading={contextCfopLoading[index] === true}
                                        onSearch={(query) => void handleContextCfopSearch(index, query)}
                                        onSelect={(option) => {
                                            setSelectedContextCfops((current) => ({ ...current, [index]: option }))
                                            setValue(`rules.${index}.cfopConfigId`, option.configId, { shouldDirty: true })
                                            setValue(`rules.${index}.cfopReferenceId`, option.referenceId, { shouldDirty: true })
                                            setValue(`rules.${index}.cfopVersionId`, option.versionId, { shouldDirty: true })
                                            setValue(`rules.${index}.cfopOverride`, option.code, { shouldDirty: true })
                                        }}
                                        onClear={() => {
                                            setSelectedContextCfops((current) => ({ ...current, [index]: null }))
                                            setValue(`rules.${index}.cfopConfigId`, undefined, { shouldDirty: true })
                                            setValue(`rules.${index}.cfopReferenceId`, undefined, { shouldDirty: true })
                                            setValue(`rules.${index}.cfopVersionId`, undefined, { shouldDirty: true })
                                            setValue(`rules.${index}.cfopOverride`, undefined, { shouldDirty: true })
                                        }}
                                    />
                                </div>

                                <div className="mt-3 flex justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        O CFOP contextual pode ser refinado por direcao, UF e contribuinte, sem perder o fallback do CFOP principal.
                                    </p>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => removeContextualRule(index)}>
                                        Remover
                                    </Button>
                                </div>

                                <input type="hidden" {...register(`rules.${index}.cfopConfigId` as const)} />
                                <input type="hidden" {...register(`rules.${index}.cfopReferenceId` as const)} />
                                <input type="hidden" {...register(`rules.${index}.cfopVersionId` as const)} />
                                <input type="hidden" {...register(`rules.${index}.cfopOverride` as const)} />
                                <input type="hidden" {...register(`rules.${index}.customerTypeId` as const)} />
                                <input type="hidden" {...register(`rules.${index}.personType` as const)} />
                                <input type="hidden" {...register(`rules.${index}.taxpayerIndicator` as const)} />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-navy">5. Status e Governanca</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border p-3">
                        <Label>Perfil ativo</Label>
                        <Switch checked={isActive} onCheckedChange={(value) => setValue('isActive', value, { shouldDirty: true })} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border p-3">
                        <Label>Exige configuracao fiscal</Label>
                        <Switch
                            checked={requiresTaxConfiguration}
                            onCheckedChange={(value) => setValue('requiresTaxConfiguration', value, { shouldDirty: true })}
                        />
                    </div>
                </div>

                {(errors.ncm ||
                    errors.cest ||
                    errors.defaultOutputCfop ||
                    errors.defaultInputCfop ||
                    errors.ipiCstOut) && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Revise os campos fiscais destacados antes de salvar o perfil.
                    </div>
                )}

                {hasReferenceMismatch ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Este perfil continuara salvo com o snapshot atual. Se a mudanca de versao for intencional, tudo
                        bem; se nao for, revise as referencias antes de concluir.
                    </div>
                ) : null}

                {!activeVersions.ncm && !activeVersions.cest && !activeVersions.cfop ? (
                    <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        Ainda nao ha bases fiscais ativas para pelo menos uma das referencias principais. O perfil pode
                        ser salvo, mas ficara dependente de revisao antes do uso em emissao futura.
                    </div>
                ) : null}
            </section>

            <input type="hidden" {...register('ncm')} />
            <input type="hidden" {...register('cest')} />
            <input type="hidden" {...register('defaultOutputCfop')} />
            <input type="hidden" {...register('defaultInputCfop')} />
            <input type="hidden" {...register('originCode')} />
            <input type="hidden" {...register('commercialUnit')} />
            <input type="hidden" {...register('taxUnit')} />
            <input type="hidden" {...register('fiscalType')} />
            <input type="hidden" {...register('itemType')} />
            <input type="hidden" {...register('pisCst')} />
            <input type="hidden" {...register('cofinsCst')} />
            <input type="hidden" {...register('ipiCstOut')} />
            <input type="hidden" {...register('ncmReferenceId')} />
            <input type="hidden" {...register('ncmVersionId')} />
            <input type="hidden" {...register('tipiReferenceId')} />
            <input type="hidden" {...register('tipiVersionId')} />
            <input type="hidden" {...register('cestReferenceId')} />
            <input type="hidden" {...register('cestVersionId')} />
            <input type="hidden" {...register('defaultOutputCfopReferenceId')} />
            <input type="hidden" {...register('defaultOutputCfopVersionId')} />
            <input type="hidden" {...register('defaultInputCfopReferenceId')} />
            <input type="hidden" {...register('defaultInputCfopVersionId')} />
            <input type="hidden" {...register('defaultOutputCfopConfigId')} />
            <input type="hidden" {...register('defaultInputCfopConfigId')} />
            <input type="hidden" {...register('icmsBaseId')} />
            <input type="hidden" {...register('ibscbsBaseId')} />
            <input type="hidden" {...register('ibscbsVersionId')} />

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {submitLabel || 'Salvar Perfil'}
                </Button>
            </div>
        </form>
    )
}
