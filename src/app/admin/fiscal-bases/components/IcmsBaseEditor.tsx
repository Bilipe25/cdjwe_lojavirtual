'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ZodIssue } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    listFiscalCatalogItemsAction,
    type FiscalCatalogItemOption,
} from '@/app/admin/actions/fiscal-bases'
import {
    getIcmsBaseDetailAction,
    upsertIcmsBaseAction,
} from '@/app/admin/actions/icms-bases'
import {
    createEmptyIcmsBaseFormValues,
    icmsBaseFormSchema,
    type IcmsBaseFormValues,
} from '../icms/schema'
import { IcmsBaseForm } from './IcmsBaseForm'

interface IcmsBaseEditorProps {
    mode: 'create' | 'edit'
    icmsBaseId?: string
}

function createEmptyStateRule(): IcmsBaseFormValues['stateRules'][number] {
    return {
        targetUf: undefined,
        cstCode: '',
        icmsRate: 0,
        fcpRate: 0,
        specialAdvanceDestination: false,
        differentiateConsumerFinalRate: false,
        baseCalcType: 'operation_value',
        baseCalcPercent: undefined,
        baseReductionPercent: undefined,
        baseNotes: undefined,
        isActive: true,
    }
}

function mapIssues(issues: ZodIssue[]) {
    return issues.reduce<Record<string, string>>((acc, issue) => {
        const key = issue.path.join('.')
        if (key && !acc[key]) {
            acc[key] = issue.message
        }
        return acc
    }, {})
}

export function IcmsBaseEditor({ mode, icmsBaseId }: IcmsBaseEditorProps) {
    const router = useRouter()
    const [values, setValues] = useState<IcmsBaseFormValues>(createEmptyIcmsBaseFormValues())
    const [cstOptions, setCstOptions] = useState<FiscalCatalogItemOption[]>([])
    const [loading, setLoading] = useState(mode === 'edit')
    const [loadingCatalogs, setLoadingCatalogs] = useState(true)
    const [saving, setSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null)
    const [detailLoadError, setDetailLoadError] = useState<string | null>(null)

    const isEditMode = mode === 'edit'
    const ready = useMemo(() => !loading && !loadingCatalogs, [loading, loadingCatalogs])

    const loadInitialData = useCallback(async () => {
        setLoadingCatalogs(true)
        setCatalogLoadError(null)
        setDetailLoadError(null)
        const catalogResult = await listFiscalCatalogItemsAction('icms_cst')
        if (!catalogResult.success || !catalogResult.data || catalogResult.data.length === 0) {
            setCstOptions([])
            setCatalogLoadError(
                catalogResult.error ||
                    'Nao foi possivel carregar o catalogo de CST de ICMS. Revise a base fiscal interna e tente novamente.'
            )
            setLoadingCatalogs(false)
            setLoading(false)
            return
        }

        setCstOptions(catalogResult.data)
        setLoadingCatalogs(false)

        if (!isEditMode || !icmsBaseId) {
            setLoading(false)
            return
        }

        setLoading(true)
        const result = await getIcmsBaseDetailAction(icmsBaseId)
        if (!result.success || !result.data) {
            setDetailLoadError(
                result.error ||
                    'Nao foi possivel carregar os detalhes da base de ICMS. Verifique se ela ainda existe ou atualize a listagem antes de editar.'
            )
            setLoading(false)
            return
        }

        const initial = createEmptyIcmsBaseFormValues()
        setValues({
            ...initial,
            id: result.data.id || undefined,
            name: result.data.name,
            code: result.data.code,
            description: result.data.description || undefined,
            isActive: result.data.isActive !== false,
            nationalRule: {
                id: result.data.nationalRule.id || undefined,
                targetUf: undefined,
                cstCode: result.data.nationalRule.cstCode,
                icmsRate: result.data.nationalRule.icmsRate,
                fcpRate: result.data.nationalRule.fcpRate,
                specialAdvanceDestination: result.data.nationalRule.specialAdvanceDestination === true,
                differentiateConsumerFinalRate: result.data.nationalRule.differentiateConsumerFinalRate === true,
                baseCalcType: result.data.nationalRule.baseCalcType,
                baseCalcPercent: result.data.nationalRule.baseCalcPercent ?? undefined,
                baseReductionPercent: result.data.nationalRule.baseReductionPercent ?? undefined,
                baseNotes: result.data.nationalRule.baseNotes || undefined,
                isActive: result.data.nationalRule.isActive !== false,
            },
            enableInterstateRule: Boolean(result.data.interstateRule),
            enableStRule: Boolean(result.data.stRule),
            interstateRule: result.data.interstateRule
                ? {
                      id: result.data.interstateRule.id || undefined,
                      targetUf: result.data.interstateRule.targetUf || undefined,
                      icmsRate: result.data.interstateRule.icmsRate,
                      fcpRate: result.data.interstateRule.fcpRate,
                      consumerFinalMode: result.data.interstateRule.consumerFinalMode,
                      isActive: result.data.interstateRule.isActive !== false,
                  }
                : initial.interstateRule,
            stRule: result.data.stRule
                ? {
                      id: result.data.stRule.id || undefined,
                      targetUf: result.data.stRule.targetUf || undefined,
                      stEnabled: result.data.stRule.stEnabled === true,
                      stBaseCalcType: result.data.stRule.stBaseCalcType || undefined,
                      stBaseCalcPercent: result.data.stRule.stBaseCalcPercent ?? undefined,
                      stBaseReductionPercent: result.data.stRule.stBaseReductionPercent ?? undefined,
                      stRate: result.data.stRule.stRate ?? undefined,
                      stFcpRate: result.data.stRule.stFcpRate ?? undefined,
                      mvaOriginal: result.data.stRule.mvaOriginal ?? undefined,
                      mvaAdjusted: result.data.stRule.mvaAdjusted ?? undefined,
                      stNotes: result.data.stRule.stNotes || undefined,
                      isActive: result.data.stRule.isActive !== false,
                  }
                : initial.stRule,
            stateRules: (result.data.stateRules || []).map((rule) => ({
                id: rule.id || undefined,
                targetUf: rule.targetUf || undefined,
                cstCode: rule.cstCode,
                icmsRate: rule.icmsRate,
                fcpRate: rule.fcpRate,
                specialAdvanceDestination: rule.specialAdvanceDestination === true,
                differentiateConsumerFinalRate: rule.differentiateConsumerFinalRate === true,
                baseCalcType: rule.baseCalcType,
                baseCalcPercent: rule.baseCalcPercent ?? undefined,
                baseReductionPercent: rule.baseReductionPercent ?? undefined,
                baseNotes: rule.baseNotes || undefined,
                isActive: rule.isActive !== false,
            })),
        })
        setLoading(false)
    }, [icmsBaseId, isEditMode, router])

    useEffect(() => {
        void loadInitialData()
    }, [loadInitialData])

    const handleSubmit = async () => {
        const parsed = icmsBaseFormSchema.safeParse(values)
        if (!parsed.success) {
            setErrors(mapIssues(parsed.error.issues))
            toast.error('Revise os campos destacados antes de salvar a base de ICMS.')
            return
        }

        setErrors({})
        setSaving(true)

        const payload = {
            id: parsed.data.id,
            name: parsed.data.name,
            code: parsed.data.code,
            description: parsed.data.description,
            isActive: parsed.data.isActive,
            nationalRule: parsed.data.nationalRule,
            stateRules: parsed.data.stateRules.map((rule) => ({
                ...rule,
                targetUf: rule.targetUf?.toUpperCase(),
            })),
            interstateRule: parsed.data.enableInterstateRule
                ? {
                      ...parsed.data.interstateRule,
                      targetUf: parsed.data.interstateRule.targetUf?.toUpperCase(),
                  }
                : null,
            stRule: parsed.data.enableStRule
                ? {
                      ...parsed.data.stRule,
                      targetUf: parsed.data.stRule.targetUf?.toUpperCase(),
                  }
                : null,
        }

        const result = await upsertIcmsBaseAction(payload)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Falha ao salvar a base de ICMS.')
            setSaving(false)
            return
        }

        toast.success(result.data.created ? 'Base de ICMS criada.' : 'Base de ICMS atualizada.')
        router.push('/admin/fiscal-bases/icms')
        router.refresh()
    }

    if (catalogLoadError) {
        return (
            <div className="space-y-5">
                <div>
                    <Button asChild variant="ghost" className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900">
                        <Link href="/admin/fiscal-bases/icms">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para bases de ICMS
                        </Link>
                    </Button>
                </div>

                <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
                    <h1 className="text-xl font-semibold text-amber-900">Catalogo CST indisponivel</h1>
                    <p className="mt-2 text-sm text-amber-800">{catalogLoadError}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void loadInitialData()}>
                            Tentar novamente
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push('/admin/fiscal-bases/icms')}>
                            Voltar para a listagem
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
                        <Link href="/admin/fiscal-bases/icms">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para bases de ICMS
                        </Link>
                    </Button>
                </div>

                <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
                    <h1 className="text-xl font-semibold text-amber-900">Base de ICMS indisponivel para edicao</h1>
                    <p className="mt-2 text-sm text-amber-800">{detailLoadError}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void loadInitialData()}>
                            Tentar novamente
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push('/admin/fiscal-bases/icms')}>
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
                    <Link href="/admin/fiscal-bases/icms">
                        <ArrowLeft className="h-4 w-4" />
                        Voltar para bases de ICMS
                    </Link>
                </Button>
            </div>

            <IcmsBaseForm
                mode={mode}
                loading={!ready}
                saving={saving}
                values={values}
                cstOptions={cstOptions}
                errors={errors}
                onCancel={() => router.push('/admin/fiscal-bases/icms')}
                onSubmit={() => void handleSubmit()}
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
                        stateRules: [...current.stateRules, createEmptyStateRule()],
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
                onToggleInterstate={(enabled) =>
                    setValues((current) => ({
                        ...current,
                        enableInterstateRule: enabled,
                    }))
                }
                onUpdateInterstateRule={(patch) =>
                    setValues((current) => ({
                        ...current,
                        interstateRule: {
                            ...current.interstateRule,
                            ...patch,
                        },
                    }))
                }
                onToggleStRule={(enabled) =>
                    setValues((current) => ({
                        ...current,
                        enableStRule: enabled,
                    }))
                }
                onUpdateStRule={(patch) =>
                    setValues((current) => ({
                        ...current,
                        stRule: {
                            ...current.stRule,
                            ...patch,
                        },
                    }))
                }
            />
        </div>
    )
}
