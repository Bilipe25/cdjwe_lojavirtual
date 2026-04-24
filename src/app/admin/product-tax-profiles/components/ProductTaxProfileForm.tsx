'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
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
import {
    buildProfileIbscbsReadinessSummary,
    getIbscbsReadinessClassName,
} from '@/lib/fiscal/ibscbs-config'

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
    pisUnitRate: undefined,
    cofinsUnitRate: undefined,
    approxTaxRatePercent: undefined,
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

function CatalogSelectField({
    label,
    value,
    options,
    placeholder,
    loading = false,
    onChange,
}: {
    label: string
    value?: string
    options: FiscalCatalogItemOption[]
    placeholder: string
    loading?: boolean
    onChange: (nextValue: string | null) => void
}) {
    const EMPTY_VALUE = '__empty__'
    const selectedOption = options.find((option) => option.code === value) || null
    const buildOptionDisplayLabel = (option: FiscalCatalogItemOption) => {
        const normalizedCode = option.code.trim()
        const normalizedLabel = option.label.trim()
        const normalizedDescription = (option.description || '').trim()

        const bestDescription =
            normalizedDescription && normalizedDescription !== normalizedCode
                ? normalizedDescription
                : normalizedLabel && normalizedLabel !== normalizedCode
                  ? normalizedLabel
                  : ''

        if (!normalizedCode) return bestDescription || placeholder
        if (!bestDescription) return normalizedCode
        return `${normalizedCode} - ${bestDescription}`
    }

    const selectedLabel = selectedOption ? buildOptionDisplayLabel(selectedOption) : placeholder

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            {loading ? (
                <div className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-muted-foreground dark:bg-input/30">
                    {placeholder}
                </div>
            ) : (
            <Select
                value={value || EMPTY_VALUE}
                onValueChange={(nextValue) => onChange(!nextValue || nextValue === EMPTY_VALUE ? null : nextValue)}
            >
                <SelectTrigger className="w-full">
                    <span
                        data-slot="select-value"
                        className={selectedOption ? 'flex flex-1 text-left' : 'flex flex-1 text-left text-muted-foreground'}
                    >
                        {selectedLabel}
                    </span>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>{placeholder}</SelectItem>
                    {options.map((option) => (
                        <SelectItem key={option.id} value={option.code}>
                            {buildOptionDisplayLabel(option)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            )}
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

function readSnapshotNode(
    snapshot: Record<string, unknown> | undefined,
    key:
        | 'ncm'
        | 'tipi'
        | 'cest'
        | 'default_output_cfop'
        | 'default_input_cfop'
        | 'default_output_cfop_config'
        | 'default_input_cfop_config'
        | 'icms_base'
        | 'ibscbs_base'
) {
    const node = snapshot?.[key]
    return node && typeof node === 'object' ? (node as Record<string, unknown>) : null
}

function readSnapshotString(node: Record<string, unknown> | null, key: string) {
    const value = node?.[key]
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function normalizeInitialProfileFormData(
    initialData: Partial<ProductTaxProfileFormData> | null
): Partial<ProductTaxProfileFormData> | null {
    if (!initialData) return null

    const snapshot = initialData.fiscalReferenceSnapshot as Record<string, unknown> | undefined
    const ncmNode = readSnapshotNode(snapshot, 'ncm')
    const tipiNode = readSnapshotNode(snapshot, 'tipi')
    const cestNode = readSnapshotNode(snapshot, 'cest')
    const outputCfopNode = readSnapshotNode(snapshot, 'default_output_cfop')
    const inputCfopNode = readSnapshotNode(snapshot, 'default_input_cfop')
    const outputCfopConfigNode = readSnapshotNode(snapshot, 'default_output_cfop_config')
    const inputCfopConfigNode = readSnapshotNode(snapshot, 'default_input_cfop_config')
    const icmsBaseNode = readSnapshotNode(snapshot, 'icms_base')
    const ibscbsBaseNode = readSnapshotNode(snapshot, 'ibscbs_base')

    return {
        ...initialData,
        ncm: initialData.ncm || readSnapshotString(ncmNode, 'code'),
        ncmReferenceId: initialData.ncmReferenceId || readSnapshotString(ncmNode, 'reference_id'),
        ncmVersionId: initialData.ncmVersionId || readSnapshotString(ncmNode, 'version_id'),
        tipiReferenceId: initialData.tipiReferenceId || readSnapshotString(tipiNode, 'reference_id'),
        tipiVersionId: initialData.tipiVersionId || readSnapshotString(tipiNode, 'version_id'),
        cest: initialData.cest || readSnapshotString(cestNode, 'code'),
        cestReferenceId: initialData.cestReferenceId || readSnapshotString(cestNode, 'reference_id'),
        cestVersionId: initialData.cestVersionId || readSnapshotString(cestNode, 'version_id'),
        defaultOutputCfop: initialData.defaultOutputCfop || readSnapshotString(outputCfopNode, 'code'),
        defaultOutputCfopReferenceId:
            initialData.defaultOutputCfopReferenceId || readSnapshotString(outputCfopNode, 'reference_id'),
        defaultOutputCfopVersionId:
            initialData.defaultOutputCfopVersionId || readSnapshotString(outputCfopNode, 'version_id'),
        defaultOutputCfopConfigId:
            initialData.defaultOutputCfopConfigId || readSnapshotString(outputCfopConfigNode, 'config_id'),
        defaultInputCfop: initialData.defaultInputCfop || readSnapshotString(inputCfopNode, 'code'),
        defaultInputCfopReferenceId:
            initialData.defaultInputCfopReferenceId || readSnapshotString(inputCfopNode, 'reference_id'),
        defaultInputCfopVersionId:
            initialData.defaultInputCfopVersionId || readSnapshotString(inputCfopNode, 'version_id'),
        defaultInputCfopConfigId:
            initialData.defaultInputCfopConfigId || readSnapshotString(inputCfopConfigNode, 'config_id'),
        icmsBaseId: initialData.icmsBaseId || readSnapshotString(icmsBaseNode, 'base_id'),
        ibscbsBaseId: initialData.ibscbsBaseId || readSnapshotString(ibscbsBaseNode, 'base_id'),
        ibscbsVersionId: initialData.ibscbsVersionId || readSnapshotString(ibscbsBaseNode, 'version_id'),
    }
}

function collectProductTaxProfileIssues(errors: FieldErrors<ProductTaxProfileFormData>) {
    const issues = new Set<string>()
    const visited = new WeakSet<object>()

    const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        const objectNode = node as Record<string, unknown>
        if (visited.has(objectNode)) return
        visited.add(objectNode)

        if (typeof objectNode.message === 'string' && objectNode.message.trim()) {
            issues.add(objectNode.message.trim())
        }

        for (const [key, value] of Object.entries(objectNode)) {
            if (key === 'message' || key === 'ref') continue
            walk(value)
        }
    }

    walk(errors)
    return [...issues]
}

export function ProductTaxProfileForm({
    saving,
    initialData,
    onCancel,
    onSubmit,
    submitLabel,
}: ProductTaxProfileFormProps) {
    const normalizedInitialData = useMemo(() => normalizeInitialProfileFormData(initialData), [initialData])
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
        formState: { errors },
    } = form

    const [catalogs, setCatalogs] = useState<Record<string, FiscalCatalogItemOption[]>>({})
    const [catalogsLoading, setCatalogsLoading] = useState(true)
    const [activeVersions, setActiveVersions] = useState<
        Partial<Record<'ncm' | 'tipi' | 'cest', FiscalReferenceVersionItem | null>>
    >({})
    const [ncmOptions, setNcmOptions] = useState<FiscalSearchOption[]>([])
    const [cestOptions, setCestOptions] = useState<FiscalSearchOption[]>([])
    const [ncmLoading, setNcmLoading] = useState(false)
    const [cestLoading, setCestLoading] = useState(false)
    const [selectedNcm, setSelectedNcm] = useState<FiscalSearchOption | null>(null)
    const [selectedTipi, setSelectedTipi] = useState<FiscalSearchOption | null>(null)
    const [selectedCest, setSelectedCest] = useState<FiscalSearchOption | null>(null)
    const [ncmSuggestions, setNcmSuggestions] = useState<FiscalNcmSuggestions | null>(null)
    const [icmsBaseOptions, setIcmsBaseOptions] = useState<IcmsBaseOption[]>([])
    const [ibscbsBaseOptions, setIbscbsBaseOptions] = useState<IbscbsBaseOption[]>([])

    const hasSt = watch('hasSubstitutionTax')
    const requiresCest = watch('requiresCest')
    const hasIpi = watch('hasIpi')
    const isActive = watch('isActive')
    const requiresTaxConfiguration = watch('requiresTaxConfiguration')
    const currentDefaultFiscalDescription = watch('defaultFiscalDescription')
    const currentTipiReferenceId = watch('tipiReferenceId')
    const currentIcmsBaseId = watch('icmsBaseId')
    const currentIbscbsVersionId = watch('ibscbsVersionId')
    const currentDefaultOutputCfopConfigId = watch('defaultOutputCfopConfigId')
    const currentDefaultInputCfopConfigId = watch('defaultInputCfopConfigId')
    const currentProfileId = normalizedInitialData?.id

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
                ]),
                listIcmsBaseOptionsAction({
                    includeInactive: false,
                    includeCurrentId:
                        typeof normalizedInitialData?.icmsBaseId === 'string' ? normalizedInitialData.icmsBaseId : null,
                }),
                listIbscbsBaseOptionsAction({
                    includeCurrentVersionId:
                        typeof normalizedInitialData?.ibscbsVersionId === 'string'
                            ? normalizedInitialData.ibscbsVersionId
                            : null,
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

            const [ncmVersions, tipiVersions, cestVersions] = versionResults
            setActiveVersions({
                ncm: ncmVersions.success && ncmVersions.data ? ncmVersions.data.find((item) => item.isActive) || null : null,
                tipi:
                    tipiVersions.success && tipiVersions.data ? tipiVersions.data.find((item) => item.isActive) || null : null,
                cest:
                    cestVersions.success && cestVersions.data ? cestVersions.data.find((item) => item.isActive) || null : null,
            })
            setIcmsBaseOptions(icmsBaseResult.success && icmsBaseResult.data ? icmsBaseResult.data : [])
            setIbscbsBaseOptions(ibscbsBaseResult.success && ibscbsBaseResult.data ? ibscbsBaseResult.data : [])
            setCatalogsLoading(false)
        }

        void loadCatalogsAndVersions()
    }, [currentProfileId, normalizedInitialData?.ibscbsVersionId, normalizedInitialData?.icmsBaseId])

    useEffect(() => {
        const snapshot = normalizedInitialData?.fiscalReferenceSnapshot as Record<string, unknown> | undefined
        reset({
            ...defaultValues,
            ...(normalizedInitialData || {}),
        })
        setSelectedNcm(buildInitialOption(snapshot, 'ncm'))
        setSelectedTipi(buildInitialOption(snapshot, 'tipi'))
        setSelectedCest(buildInitialOption(snapshot, 'cest'))
        setNcmSuggestions(null)
    }, [normalizedInitialData, reset])

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
    const ibscbsProfileReadiness = useMemo(
        () =>
            buildProfileIbscbsReadinessSummary({
                hasBaseVersion: Boolean(selectedIbscbsBase),
                isSelectedVersionActive: Boolean(selectedIbscbsBase?.isBaseActive && selectedIbscbsBase?.isVersionActive),
                hasAnyCfopConfig: Boolean(currentDefaultOutputCfopConfigId || currentDefaultInputCfopConfigId),
                requiresTaxConfiguration,
            }),
        [
            currentDefaultInputCfopConfigId,
            currentDefaultOutputCfopConfigId,
            requiresTaxConfiguration,
            selectedIbscbsBase,
        ]
    )

    const referenceSummary = useMemo(() => {
        const parts = [
            selectedNcm ? `NCM ${selectedNcm.code}` : null,
            selectedTipi ? `TIPI ${selectedTipi.code}` : null,
            selectedCest ? `CEST ${selectedCest.code}` : null,
            selectedIcmsBase ? `ICMS ${selectedIcmsBase.code}` : null,
            selectedIbscbsBase ? `IBS/CBS ${selectedIbscbsBase.code} ${selectedIbscbsBase.versionLabel}` : null,
        ].filter((value): value is string => Boolean(value))

        if (parts.length === 0) return 'Perfil ainda sem referencias estruturadas da base fiscal.'
        return parts.join(' | ')
    }, [selectedCest, selectedIcmsBase, selectedIbscbsBase, selectedNcm, selectedTipi])

    const hasReferenceMismatch = useMemo(() => {
        return (
            Boolean(selectedNcm?.versionLabel && activeVersions.ncm && selectedNcm.versionLabel !== activeVersions.ncm.versionLabel) ||
            Boolean(selectedTipi?.versionLabel && activeVersions.tipi && selectedTipi.versionLabel !== activeVersions.tipi.versionLabel) ||
            Boolean(selectedCest?.versionLabel && activeVersions.cest && selectedCest.versionLabel !== activeVersions.cest.versionLabel)
        )
    }, [activeVersions, selectedCest, selectedNcm, selectedTipi])

    const validationIssues = useMemo(() => collectProductTaxProfileIssues(errors), [errors])

    const handleInvalidSubmit = () => {
        toast.error(validationIssues[0] || 'Revise os campos obrigatorios antes de salvar o perfil tributario.')
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

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

    return (
        <form onSubmit={handleSubmit((data) => void onSubmit(data), handleInvalidSubmit)} className="space-y-5">
            {validationIssues.length > 0 ? (
                <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-amber-950">Ainda faltam ajustes antes de salvar</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                        {validationIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                        ))}
                    </ul>
                </section>
            ) : null}

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
                            if (!currentDefaultFiscalDescription) {
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
                                <span
                                    data-slot="select-value"
                                    className={selectedIcmsBase ? 'flex flex-1 text-left' : 'flex flex-1 text-left text-muted-foreground'}
                                >
                                    {selectedIcmsBase
                                        ? `${selectedIcmsBase.code} - ${selectedIcmsBase.name}`
                                        : catalogsLoading
                                          ? 'Carregando bases...'
                                          : 'Selecione a base de ICMS'}
                                </span>
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
                                <span
                                    data-slot="select-value"
                                    className={selectedIbscbsBase ? 'flex flex-1 text-left' : 'flex flex-1 text-left text-muted-foreground'}
                                >
                                    {selectedIbscbsBase
                                        ? `${selectedIbscbsBase.code} - ${selectedIbscbsBase.name} | ${selectedIbscbsBase.versionLabel}`
                                        : catalogsLoading
                                          ? 'Carregando bases...'
                                          : 'Selecione a base de IBS/CBS'}
                                </span>
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
                            O perfil escolhe a base/versionamento padrao do produto. O enquadramento da operacao continua vindo do CFOP e os vinculos do emitente por UF entram como complemento geografico.
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
                        <div className={`rounded-xl border px-3 py-3 text-xs ${getIbscbsReadinessClassName(ibscbsProfileReadiness.level)}`}>
                            <p className="font-medium">{ibscbsProfileReadiness.title}</p>
                            <p className="mt-1">{ibscbsProfileReadiness.description}</p>
                            <ul className="mt-2 space-y-1">
                                {ibscbsProfileReadiness.items.map((item) => (
                                    <li key={item}>• {item}</li>
                                ))}
                            </ul>
                        </div>
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
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione a origem'}
                        onChange={(value) => setValue('originCode', value || '0', { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Unidade Comercial"
                        value={watch('commercialUnit') || ''}
                        options={catalogs.commercial_unit || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione a unidade'}
                        onChange={(value) => setValue('commercialUnit', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Unidade Tributavel"
                        value={watch('taxUnit') || ''}
                        options={catalogs.tax_unit || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione a unidade'}
                        onChange={(value) => setValue('taxUnit', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Tipo Fiscal"
                        value={watch('fiscalType') || 'goods'}
                        options={catalogs.fiscal_type || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o tipo fiscal'}
                        onChange={(value) => setValue('fiscalType', value || 'goods', { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="Tipo de Item"
                        value={watch('itemType') || 'goods'}
                        options={catalogs.item_type || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o tipo de item'}
                        onChange={(value) => setValue('itemType', value || 'goods', { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="PIS CST"
                        value={watch('pisCst') || ''}
                        options={catalogs.pis_cst || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o CST'}
                        onChange={(value) => setValue('pisCst', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="COFINS CST"
                        value={watch('cofinsCst') || ''}
                        options={catalogs.cofins_cst || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o CST'}
                        onChange={(value) => setValue('cofinsCst', value || undefined, { shouldDirty: true })}
                    />
                    <CatalogSelectField
                        label="IPI CST Saida"
                        value={watch('ipiCstOut') || ''}
                        options={catalogs.ipi_cst || []}
                        loading={catalogsLoading}
                        placeholder={catalogsLoading ? 'Carregando...' : 'Selecione o CST'}
                        onChange={(value) => setValue('ipiCstOut', value || undefined, { shouldDirty: true })}
                    />
                    <div className="space-y-1.5">
                        <Label>Aliquota PIS (%)</Label>
                        <Input type="number" step="0.01" {...register('pisAliquota')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Aliquota COFINS (%)</Label>
                        <Input type="number" step="0.01" {...register('cofinsAliquota')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>PIS por unidade (CST 03)</Label>
                        <Input type="number" step="0.0001" {...register('pisUnitRate')} />
                        <p className="text-xs text-muted-foreground">Usado somente quando o CST PIS for 03.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>COFINS por unidade (CST 03)</Label>
                        <Input type="number" step="0.0001" {...register('cofinsUnitRate')} />
                        <p className="text-xs text-muted-foreground">Usado somente quando o CST COFINS for 03.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Tributos aproximados IBPT (%)</Label>
                        <Input type="number" step="0.01" {...register('approxTaxRatePercent')} />
                        <p className="text-xs text-muted-foreground">Calcula vTotTrib da Lei da Transparencia.</p>
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
                <h3 className="text-sm font-semibold text-navy">4. Apoio a Emissao</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Codigo Fiscal Interno</Label>
                        <Input {...register('internalFiscalCode')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Observacoes Fiscais</Label>
                        <Textarea rows={2} {...register('defaultFiscalNotes')} />
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

                {validationIssues.length > 0 && (
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

                {!activeVersions.ncm && !activeVersions.cest ? (
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
