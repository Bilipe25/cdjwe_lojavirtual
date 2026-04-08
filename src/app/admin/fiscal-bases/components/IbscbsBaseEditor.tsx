'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ZodIssue } from 'zod'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'
import {
    activateIbscbsBaseVersionAction,
    createIbscbsBaseVersionAction,
    getIbscbsBaseDetailAction,
    listIbscbsCatalogVersionsAction,
    listIbscbsCstCatalogAction,
    searchIbscbsClassificationAction,
    upsertIbscbsBaseVersionAction,
    type IbscbsBaseVersionItem,
    type IbscbsCatalogVersionItem,
    type IbscbsCstCatalogItem,
} from '@/app/admin/actions/ibscbs-bases'
import {
    createEmptyIbscbsBaseFormValues,
    ibscbsBaseFormSchema,
    type IbscbsBaseFormValues,
} from '../ibscbs/schema'
import type { IbscbsVersionStatus } from '@/lib/fiscal/ibscbs'
import { IbscbsBaseForm } from './IbscbsBaseForm'

interface IbscbsBaseEditorProps {
    mode: 'create' | 'edit'
    ibscbsBaseId?: string
}

function mapIssues(issues: ZodIssue[]) {
    return issues.reduce<Record<string, string>>((acc, issue) => {
        const key = issue.path.join('.')
        if (key && !acc[key]) acc[key] = issue.message
        return acc
    }, {})
}

function toSearchOption(item: {
    id: string
    code: string
    label: string
    shortLabel?: string | null
    description?: string | null
    catalogVersionId: string
}): FiscalSearchOption {
    return {
        id: item.id,
        versionId: item.catalogVersionId,
        versionLabel: '',
        code: item.code,
        description: item.label,
        secondaryText: item.shortLabel || item.description || null,
    }
}

function normalizeFormValues(input: {
    baseId?: string | null
    versionId?: string | null
    name: string
    code: string
    description?: string | null
    isBaseActive: boolean
    versionLabel: string
    status: IbscbsVersionStatus
    validFrom?: string | null
    validTo?: string | null
    cstCatalogVersionId: string
    classificationCatalogVersionId: string
    nationalRule: {
        id?: string | null
        targetUf?: string | null
        cstCode: string
        classificationCode: string
        isActive?: boolean
    }
    stateRules: Array<{
        id?: string | null
        targetUf?: string | null
        cstCode: string
        classificationCode: string
        isActive?: boolean
    }>
}): IbscbsBaseFormValues {
    return {
        baseId: input.baseId || undefined,
        versionId: input.versionId || undefined,
        name: input.name,
        code: input.code,
        description: input.description || undefined,
        isBaseActive: input.isBaseActive,
        versionLabel: input.versionLabel,
        status: input.status,
        validFrom: input.validFrom || undefined,
        validTo: input.validTo || undefined,
        cstCatalogVersionId: input.cstCatalogVersionId || '',
        classificationCatalogVersionId: input.classificationCatalogVersionId || '',
        nationalRule: {
            id: input.nationalRule.id || undefined,
            targetUf: input.nationalRule.targetUf || undefined,
            cstCode: input.nationalRule.cstCode,
            classificationCode: input.nationalRule.classificationCode,
            isActive: input.nationalRule.isActive !== false,
        },
        stateRules: input.stateRules.map((rule) => ({
            id: rule.id || undefined,
            targetUf: rule.targetUf || undefined,
            cstCode: rule.cstCode,
            classificationCode: rule.classificationCode,
            isActive: rule.isActive !== false,
        })),
    }
}

export function IbscbsBaseEditor({ mode, ibscbsBaseId }: IbscbsBaseEditorProps) {
    const router = useRouter()
    const [values, setValues] = useState<IbscbsBaseFormValues>(createEmptyIbscbsBaseFormValues())
    const [cstOptions, setCstOptions] = useState<IbscbsCstCatalogItem[]>([])
    const [cstCatalogVersions, setCstCatalogVersions] = useState<IbscbsCatalogVersionItem[]>([])
    const [classificationCatalogVersions, setClassificationCatalogVersions] = useState<IbscbsCatalogVersionItem[]>([])
    const [versionHistory, setVersionHistory] = useState<IbscbsBaseVersionItem[]>([])
    const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
    const [loading, setLoading] = useState(mode === 'edit')
    const [loadingCatalogs, setLoadingCatalogs] = useState(true)
    const [saving, setSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null)
    const [detailLoadError, setDetailLoadError] = useState<string | null>(null)
    const [classificationOptionsByKey, setClassificationOptionsByKey] = useState<Record<string, FiscalSearchOption[]>>({})
    const [classificationLoadingByKey, setClassificationLoadingByKey] = useState<Record<string, boolean>>({})
    const [classificationLookup, setClassificationLookup] = useState<Record<string, FiscalSearchOption>>({})

    const isEditMode = mode === 'edit'
    const ready = useMemo(() => !loading && !loadingCatalogs, [loading, loadingCatalogs])
    const readOnly = values.status === 'active'

    const mergeClassificationOptions = useCallback((items: FiscalSearchOption[]) => {
        setClassificationLookup((current) => {
            const next = { ...current }
            items.forEach((item) => {
                next[item.code] = item
            })
            return next
        })
    }, [])

    const loadClassificationSeedValues = useCallback(
        async (nextValues: IbscbsBaseFormValues) => {
            const distinctCodes = Array.from(
                new Set(
                    [nextValues.nationalRule.classificationCode, ...nextValues.stateRules.map((rule) => rule.classificationCode)].filter(
                        (code): code is string => Boolean(code && code.trim())
                    )
                )
            )

            if (distinctCodes.length === 0 || !nextValues.classificationCatalogVersionId) return

            const results = await Promise.all(
                distinctCodes.map((code) =>
                    searchIbscbsClassificationAction({
                        query: code,
                        catalogVersionId: nextValues.classificationCatalogVersionId,
                        limit: 10,
                    })
                )
            )

            const hydrated = results.flatMap((result) =>
                result.success && result.data ? result.data.map(toSearchOption) : []
            )
            mergeClassificationOptions(hydrated)
        },
        [mergeClassificationOptions]
    )

    const loadInitialData = useCallback(async () => {
        setLoadingCatalogs(true)
        setCatalogLoadError(null)
        setDetailLoadError(null)

        const catalogVersionsResult = await listIbscbsCatalogVersionsAction()
        if (!catalogVersionsResult.success || !catalogVersionsResult.data) {
            setCatalogLoadError(catalogVersionsResult.error || 'Nao foi possivel carregar as versoes de catalogo IBS/CBS.')
            setLoadingCatalogs(false)
            setLoading(false)
            return
        }

        const activeCstCatalogVersion =
            catalogVersionsResult.data.cstVersions.find((item) => item.isActive) || catalogVersionsResult.data.cstVersions[0] || null
        const activeClassificationVersion =
            catalogVersionsResult.data.classificationVersions.find((item) => item.isActive) ||
            catalogVersionsResult.data.classificationVersions[0] ||
            null

        if (!activeCstCatalogVersion || !activeClassificationVersion) {
            setCatalogLoadError('Os catalogos iniciais de IBS/CBS ainda nao estao disponiveis. Aplique a migration 079 e tente novamente.')
            setLoadingCatalogs(false)
            setLoading(false)
            return
        }

        const cstCatalogResult = await listIbscbsCstCatalogAction({ catalogVersionId: activeCstCatalogVersion.id })
        if (!cstCatalogResult.success || !cstCatalogResult.data || cstCatalogResult.data.length === 0) {
            setCatalogLoadError(cstCatalogResult.error || 'Nao foi possivel carregar o catalogo CST de IBS/CBS.')
            setLoadingCatalogs(false)
            setLoading(false)
            return
        }

        setCstCatalogVersions(catalogVersionsResult.data.cstVersions)
        setClassificationCatalogVersions(catalogVersionsResult.data.classificationVersions)
        setCstOptions(cstCatalogResult.data)
        setLoadingCatalogs(false)

        if (!isEditMode || !ibscbsBaseId) {
            const initial = createEmptyIbscbsBaseFormValues()
            setValues({
                ...initial,
                cstCatalogVersionId: activeCstCatalogVersion.id,
                classificationCatalogVersionId: activeClassificationVersion.id,
            })
            setVersionHistory([])
            setActiveVersionId(null)
            setLoading(false)
            return
        }

        setLoading(true)
        const result = await getIbscbsBaseDetailAction(ibscbsBaseId)
        if (!result.success || !result.data) {
            setDetailLoadError(result.error || 'Nao foi possivel carregar os detalhes da base IBS/CBS.')
            setLoading(false)
            return
        }

        const normalizedValues = normalizeFormValues(result.data.form)
        setValues(normalizedValues)
        setVersionHistory(result.data.versionHistory)
        setActiveVersionId(result.data.activeVersionId)
        await loadClassificationSeedValues(normalizedValues)
        setLoading(false)
    }, [ibscbsBaseId, isEditMode, loadClassificationSeedValues])

    useEffect(() => {
        void loadInitialData()
    }, [loadInitialData])

    useEffect(() => {
        const currentCstVersion = cstCatalogVersions.find((item) => item.id === values.cstCatalogVersionId)
        if (!currentCstVersion) return
        void (async () => {
            const result = await listIbscbsCstCatalogAction({ catalogVersionId: currentCstVersion.id })
            if (result.success && result.data) setCstOptions(result.data)
        })()
    }, [cstCatalogVersions, values.cstCatalogVersionId])

    const handleSearchClassification = async (fieldKey: string, query: string, cstCode?: string | null) => {
        if (!cstCode) {
            setClassificationOptionsByKey((current) => ({ ...current, [fieldKey]: [] }))
            return
        }
        setClassificationLoadingByKey((current) => ({ ...current, [fieldKey]: true }))
        const result = await searchIbscbsClassificationAction({
            query,
            cstCode,
            catalogVersionId: values.classificationCatalogVersionId,
            limit: 12,
        })
        const mapped = result.success && result.data ? result.data.map(toSearchOption) : []
        mergeClassificationOptions(mapped)
        setClassificationOptionsByKey((current) => ({ ...current, [fieldKey]: mapped }))
        setClassificationLoadingByKey((current) => ({ ...current, [fieldKey]: false }))
    }

    const resolveClassificationValue = useCallback(
        (fieldKey: string, code?: string | null) => {
            if (!code) return null
            const fromScoped = (classificationOptionsByKey[fieldKey] || []).find((item) => item.code === code)
            if (fromScoped) return fromScoped
            return classificationLookup[code] || {
                id: code,
                versionId: values.classificationCatalogVersionId || '',
                versionLabel: '',
                code,
                description: code,
                secondaryText: null,
            }
        },
        [classificationLookup, classificationOptionsByKey, values.classificationCatalogVersionId]
    )

    const handleSubmit = async () => {
        const parsed = ibscbsBaseFormSchema.safeParse(values)
        if (!parsed.success) {
            setErrors(mapIssues(parsed.error.issues))
            toast.error('Revise os campos destacados antes de salvar a base IBS/CBS.')
            return
        }

        setErrors({})
        setSaving(true)
        const result = await upsertIbscbsBaseVersionAction(parsed.data)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Falha ao salvar a base IBS/CBS.')
            setSaving(false)
            return
        }

        toast.success(result.data.createdBase ? 'Base IBS/CBS criada.' : 'Versao IBS/CBS atualizada.')
        router.push(`/admin/fiscal-bases/ibscbs/${result.data.ibscbsBaseId}/editar`)
        router.refresh()
    }

    const handleCreateDraft = async () => {
        if (!values.baseId || !values.versionId) return
        setSaving(true)
        const result = await createIbscbsBaseVersionAction(values.baseId, values.versionId)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel criar uma nova versao draft.')
            setSaving(false)
            return
        }
        toast.success('Nova versao draft criada a partir da versao ativa.')
        await loadInitialData()
        router.refresh()
        setSaving(false)
    }

    const handleActivateDraft = async () => {
        if (!values.versionId) return
        setSaving(true)
        const result = await activateIbscbsBaseVersionAction(values.versionId)
        if (!result.success) {
            toast.error(result.error || 'Nao foi possivel ativar a versao IBS/CBS.')
            setSaving(false)
            return
        }
        toast.success(`Versao ${result.data?.versionLabel || ''} ativada.`)
        await loadInitialData()
        router.refresh()
        setSaving(false)
    }

    if (catalogLoadError) {
        return (
            <div className="space-y-5">
                <div>
                    <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                        <Link href="/admin/fiscal-bases">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para bases fiscais
                        </Link>
                    </Button>
                </div>
                <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
                    <h1 className="text-xl font-semibold text-amber-900">Catalogos IBS/CBS indisponiveis</h1>
                    <p className="mt-2 text-sm text-amber-800">{catalogLoadError}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void loadInitialData()}>
                            Tentar novamente
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push('/admin/fiscal-bases')}>
                            Voltar para o hub fiscal
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    if (detailLoadError) {
        return (
            <div className="space-y-5">
                <div>
                    <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                        <Link href="/admin/fiscal-bases/ibscbs">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para bases de IBS/CBS
                        </Link>
                    </Button>
                </div>
                <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
                    <h1 className="text-xl font-semibold text-amber-900">Base IBS/CBS indisponivel para edicao</h1>
                    <p className="mt-2 text-sm text-amber-800">{detailLoadError}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void loadInitialData()}>
                            Tentar novamente
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push('/admin/fiscal-bases/ibscbs')}>
                            Voltar para a listagem
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div>
                <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                    <Link href="/admin/fiscal-bases/ibscbs">
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para bases de IBS/CBS
                    </Link>
                </Button>
            </div>

            <IbscbsBaseForm
                mode={mode}
                loading={!ready}
                saving={saving}
                readOnly={readOnly}
                values={values}
                cstOptions={cstOptions}
                cstCatalogVersions={cstCatalogVersions}
                classificationCatalogVersions={classificationCatalogVersions}
                versionHistory={versionHistory}
                activeVersionId={activeVersionId}
                errors={errors}
                classificationOptionsByKey={classificationOptionsByKey}
                classificationLoadingByKey={classificationLoadingByKey}
                resolveClassificationValue={resolveClassificationValue}
                onSearchClassification={(fieldKey, query, cstCode) => void handleSearchClassification(fieldKey, query, cstCode)}
                onCancel={() => router.push('/admin/fiscal-bases/ibscbs')}
                onSubmit={() => void handleSubmit()}
                onCreateDraftFromCurrent={readOnly ? () => void handleCreateDraft() : undefined}
                onActivateDraft={!readOnly && values.status === 'draft' ? () => void handleActivateDraft() : undefined}
                onChangeBase={(patch) => setValues((current) => ({ ...current, ...patch }))}
                onUpdateNationalRule={(patch) =>
                    setValues((current) => ({
                        ...current,
                        nationalRule: {
                            ...current.nationalRule,
                            ...patch,
                        },
                    }))
                }
                onAddStateRule={() =>
                    setValues((current) => ({
                        ...current,
                        stateRules: [
                            ...current.stateRules,
                            {
                                targetUf: undefined,
                                cstCode: '',
                                classificationCode: '',
                                isActive: true,
                            },
                        ],
                    }))
                }
                onRemoveStateRule={(index) =>
                    setValues((current) => ({
                        ...current,
                        stateRules: current.stateRules.filter((_, currentIndex) => currentIndex !== index),
                    }))
                }
                onUpdateStateRule={(index, patch) =>
                    setValues((current) => ({
                        ...current,
                        stateRules: current.stateRules.map((rule, currentIndex) =>
                            currentIndex === index
                                ? {
                                      ...rule,
                                      ...patch,
                                  }
                                : rule
                        ),
                    }))
                }
            />
        </div>
    )
}
