'use client'

import { AlertTriangle, BookCheck, CalendarRange, Plus, Sparkles, Trash2 } from 'lucide-react'
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
import type { FiscalSearchOption } from '@/app/admin/actions/fiscal-bases'
import { BRAZIL_UF_OPTIONS } from '@/lib/fiscal/icms'
import type {
    IbscbsBaseFormValues,
} from '../ibscbs/schema'
import type {
    IbscbsBaseVersionItem,
    IbscbsCatalogVersionItem,
    IbscbsCstCatalogItem,
} from '@/app/admin/actions/ibscbs-bases'
import { FiscalAutocompleteField } from './FiscalAutocompleteField'

interface IbscbsBaseFormProps {
    mode: 'create' | 'edit'
    loading: boolean
    saving: boolean
    readOnly: boolean
    values: IbscbsBaseFormValues
    cstOptions: IbscbsCstCatalogItem[]
    cstCatalogVersions: IbscbsCatalogVersionItem[]
    classificationCatalogVersions: IbscbsCatalogVersionItem[]
    versionHistory: IbscbsBaseVersionItem[]
    activeVersionId: string | null
    errors: Record<string, string>
    classificationOptionsByKey: Record<string, FiscalSearchOption[]>
    classificationLoadingByKey: Record<string, boolean>
    resolveClassificationValue: (fieldKey: string, code?: string | null) => FiscalSearchOption | null
    onSearchClassification: (fieldKey: string, query: string, cstCode?: string | null) => void
    onCancel: () => void
    onSubmit: () => void
    onCreateDraftFromCurrent?: () => void
    onActivateDraft?: () => void
    onChangeBase: (patch: Partial<IbscbsBaseFormValues>) => void
    onUpdateNationalRule: (patch: Partial<IbscbsBaseFormValues['nationalRule']>) => void
    onAddStateRule: () => void
    onRemoveStateRule: (index: number) => void
    onUpdateStateRule: (index: number, patch: Partial<IbscbsBaseFormValues['stateRules'][number]>) => void
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null
    return <p className="text-xs text-red-500">{message}</p>
}

function SectionIntro({ title, description }: { title: string; description: string }) {
    return (
        <div className="space-y-1">
            <h2 className="text-lg font-semibold text-navy">{title}</h2>
            <p className="text-sm text-slate-600">{description}</p>
        </div>
    )
}

function SummaryMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
    )
}

function OptionalUfSelect({
    value,
    placeholder,
    disabled,
    onChange,
}: {
    value?: string | null
    placeholder: string
    disabled?: boolean
    onChange: (next: string | undefined) => void
}) {
    return (
        <Select value={value || '__none__'} onValueChange={(next) => onChange(!next || next === '__none__' ? undefined : next)} disabled={disabled}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="__none__">{placeholder}</SelectItem>
                {BRAZIL_UF_OPTIONS.map((uf) => (
                    <SelectItem key={uf.value} value={uf.value}>
                        {uf.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

function IbscbsRuleCard({
    title,
    description,
    fieldKey,
    rule,
    cstOptions,
    getError,
    disabled,
    resolveClassificationValue,
    classificationOptions,
    classificationLoading,
    onSearchClassification,
    onChange,
    showRequiredUf = false,
    onRemove,
}: {
    title: string
    description: string
    fieldKey: string
    rule: IbscbsBaseFormValues['nationalRule']
    cstOptions: IbscbsCstCatalogItem[]
    getError: (path: string) => string | undefined
    disabled: boolean
    resolveClassificationValue: (fieldKey: string, code?: string | null) => FiscalSearchOption | null
    classificationOptions: FiscalSearchOption[]
    classificationLoading: boolean
    onSearchClassification: (fieldKey: string, query: string, cstCode?: string | null) => void
    onChange: (patch: Partial<IbscbsBaseFormValues['nationalRule']>) => void
    showRequiredUf?: boolean
    onRemove?: () => void
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-navy">{title}</p>
                        <Badge
                            variant="outline"
                            className={rule.isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}
                        >
                            {rule.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                    </div>
                    <p className="text-xs text-slate-600">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                        <span className="text-xs text-slate-600">Regra ativa</span>
                        <Switch checked={rule.isActive !== false} onCheckedChange={(next) => onChange({ isActive: next })} disabled={disabled} />
                    </div>
                    {onRemove ? (
                        <Button type="button" size="sm" variant="outline" onClick={onRemove} disabled={disabled}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Remover
                        </Button>
                    ) : null}
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                    <Label>{showRequiredUf ? 'UF da excecao *' : 'Abrangencia da regra'}</Label>
                    {showRequiredUf ? (
                        <OptionalUfSelect
                            value={rule.targetUf}
                            placeholder="Selecione a UF"
                            disabled={disabled}
                            onChange={(next) => onChange({ targetUf: next })}
                        />
                    ) : (
                        <div className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-700">UF vazia = regra nacional / padrao</div>
                    )}
                    <FieldError message={getError('targetUf')} />
                </div>
                <div className="space-y-1.5">
                    <Label>CST *</Label>
                    <Select
                        value={rule.cstCode || '__empty__'}
                        onValueChange={(next) =>
                            onChange({
                                cstCode: !next || next === '__empty__' ? '' : next,
                                classificationCode: rule.classificationCode.startsWith(next || '') ? rule.classificationCode : '',
                            })
                        }
                        disabled={disabled}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione o CST" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__empty__">Selecione o CST</SelectItem>
                            {cstOptions.map((option) => (
                                <SelectItem key={option.id} value={option.code}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FieldError message={getError('cstCode')} />
                </div>
                <div className="space-y-1.5 xl:col-span-1 md:col-span-2">
                    <FiscalAutocompleteField
                        label="Classificacao tributaria *"
                        placeholder={rule.cstCode ? 'Buscar classificacao' : 'Selecione antes o CST'}
                        value={resolveClassificationValue(fieldKey, rule.classificationCode)}
                        options={classificationOptions}
                        loading={classificationLoading}
                        emptyText={rule.cstCode ? 'Nenhuma classificacao encontrada para este CST.' : 'Defina o CST para buscar classificacoes.'}
                        onSearch={(query) => onSearchClassification(fieldKey, query, rule.cstCode)}
                        onSelect={(option) => onChange({ classificationCode: option.code })}
                        onClear={disabled ? undefined : () => onChange({ classificationCode: '' })}
                    />
                    <FieldError message={getError('classificationCode')} />
                </div>
            </div>
        </div>
    )
}

export function IbscbsBaseForm({
    mode,
    loading,
    saving,
    readOnly,
    values,
    cstOptions,
    cstCatalogVersions,
    classificationCatalogVersions,
    versionHistory,
    activeVersionId,
    errors,
    classificationOptionsByKey,
    classificationLoadingByKey,
    resolveClassificationValue,
    onSearchClassification,
    onCancel,
    onSubmit,
    onCreateDraftFromCurrent,
    onActivateDraft,
    onChangeBase,
    onUpdateNationalRule,
    onAddStateRule,
    onRemoveStateRule,
    onUpdateStateRule,
}: IbscbsBaseFormProps) {
    const getError = (path: string) => errors[path]
    const stateRuleErrorCount = Object.keys(errors).filter((key) => key.startsWith('stateRules.')).length
    const disabledFields = loading || saving || readOnly

    if (loading) {
        return <div className="rounded-3xl border bg-white p-8 text-sm text-slate-600 shadow-sm">Carregando estrutura da base de IBS/CBS...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            Governanca IBS/CBS
                        </Badge>
                        <Badge
                            variant="outline"
                            className={
                                values.status === 'active'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : 'border-cyan-300 bg-cyan-50 text-cyan-700'
                            }
                        >
                            {values.status === 'active' ? 'Versao ativa' : 'Versao draft'}
                        </Badge>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                            {mode === 'edit' ? 'Administrar Base de IBS/CBS' : 'Nova Base de IBS/CBS'}
                        </h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Estruture CST, classificacao tributaria, vigencia e excecoes por UF da reforma tributaria em uma base versionada, auditavel e pronta para integracao futura com preview fiscal.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {readOnly && onCreateDraftFromCurrent ? (
                        <Button type="button" variant="outline" onClick={onCreateDraftFromCurrent} disabled={saving}>
                            <Plus className="mr-1.5 h-4 w-4" />
                            Criar nova versao a partir desta
                        </Button>
                    ) : null}
                    {!readOnly && values.status === 'draft' && onActivateDraft ? (
                        <Button type="button" variant="outline" onClick={onActivateDraft} disabled={saving}>
                            <Sparkles className="mr-1.5 h-4 w-4" />
                            Ativar versao
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryMetric label="Versao atual" value={values.versionLabel || 'Draft'} helper={readOnly ? 'Visualizacao historica / ativa' : 'Edicao em rascunho'} />
                <SummaryMetric label="Regras por UF" value={values.stateRules.length.toLocaleString('pt-BR')} helper="Excecoes estaduais configuradas" />
                <SummaryMetric label="Versao ativa" value={activeVersionId ? 'Sim' : 'Nao'} helper="Somente uma versao ativa por base" />
                <SummaryMetric label="Integracao" value="Perfis tributarios" helper="Preparada para heranca e snapshot fiscal" />
            </div>

            {readOnly ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Esta versao esta ativa e permanece imutavel para preservar a trilha fiscal. Para evoluir a base, crie uma nova versao draft a partir dela.
                </div>
            ) : null}

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="1. Informacoes gerais da base" description="Identifique a base logica de IBS/CBS de forma clara para reutilizacao futura em Perfis Tributarios de Produto." />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Nome da base *</Label>
                        <Input value={values.name} onChange={(event) => onChangeBase({ name: event.target.value })} disabled={disabledFields} />
                        <FieldError message={getError('name')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Codigo interno *</Label>
                        <Input value={values.code} onChange={(event) => onChangeBase({ code: event.target.value.toUpperCase() })} disabled={disabledFields} />
                        <FieldError message={getError('code')} />
                    </div>
                    <div className="space-y-1.5 md:col-span-3">
                        <Label>Descricao</Label>
                        <Textarea rows={2} value={values.description || ''} onChange={(event) => onChangeBase({ description: event.target.value || undefined })} disabled={disabledFields} />
                        <FieldError message={getError('description')} />
                    </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">Status da base logica</p>
                        <p className="text-xs text-slate-500">A base pode ficar ativa para novos vinculos mesmo enquanto uma nova versao draft esta sendo preparada.</p>
                    </div>
                    <Switch checked={values.isBaseActive} onCheckedChange={(next) => onChangeBase({ isBaseActive: next })} disabled={disabledFields} />
                </div>
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="2. Versao, vigencia e catalogos" description="A versao ativa fica congelada. Ajustes futuros devem nascer em nova versao draft, com vigencia clara e referencia explicita aos catalogos de CST e classificacao tributaria." />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label>Rotulo da versao *</Label>
                        <Input value={values.versionLabel} onChange={(event) => onChangeBase({ versionLabel: event.target.value })} disabled={disabledFields} />
                        <FieldError message={getError('versionLabel')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Vigencia inicial</Label>
                        <Input type="date" value={values.validFrom || ''} onChange={(event) => onChangeBase({ validFrom: event.target.value || undefined })} disabled={disabledFields} />
                        <FieldError message={getError('validFrom')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Vigencia final</Label>
                        <Input type="date" value={values.validTo || ''} onChange={(event) => onChangeBase({ validTo: event.target.value || undefined })} disabled={disabledFields} />
                        <FieldError message={getError('validTo')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Status da versao</Label>
                        <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {values.status === 'active' ? 'Ativa e congelada' : values.status === 'draft' ? 'Draft editavel' : values.status}
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Catalogo CST IBS/CBS</Label>
                        <Select value={values.cstCatalogVersionId ?? undefined} onValueChange={(next) => onChangeBase({ cstCatalogVersionId: next || '' })} disabled={disabledFields}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione a versao do catalogo CST" />
                            </SelectTrigger>
                            <SelectContent>
                                {cstCatalogVersions.map((version) => (
                                    <SelectItem key={version.id} value={version.id}>
                                        {version.versionLabel}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError message={getError('cstCatalogVersionId')} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label>Catalogo de classificacao tributaria</Label>
                        <Select value={values.classificationCatalogVersionId ?? undefined} onValueChange={(next) => onChangeBase({ classificationCatalogVersionId: next || '' })} disabled={disabledFields}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione a versao do catalogo de classificacao" />
                            </SelectTrigger>
                            <SelectContent>
                                {classificationCatalogVersions.map((version) => (
                                    <SelectItem key={version.id} value={version.id}>
                                        {version.versionLabel}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError message={getError('classificationCatalogVersionId')} />
                    </div>
                </div>
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="3. Dados tributarios principais" description="A regra nacional funciona como base padrao. Quando uma UF exigir comportamento diferente, abra uma excecao estadual especifica." />
                <IbscbsRuleCard
                    title="Regra nacional"
                    description="Estado vazio = regra nacional / padrao de IBS/CBS."
                    fieldKey="national"
                    rule={values.nationalRule}
                    cstOptions={cstOptions}
                    getError={(field) => getError(`nationalRule.${field}`)}
                    disabled={disabledFields}
                    resolveClassificationValue={resolveClassificationValue}
                    classificationOptions={classificationOptionsByKey.national || []}
                    classificationLoading={classificationLoadingByKey.national === true}
                    onSearchClassification={onSearchClassification}
                    onChange={onUpdateNationalRule}
                />
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <SectionIntro title="4. Excecoes por UF" description="Cada UF representa uma excecao especifica que sobrepoe a regra nacional. A UX deixa explicito quando a base esta operando nacionalmente e quando ha divergencia estadual." />
                    <Button type="button" variant="outline" onClick={onAddStateRule} disabled={disabledFields}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Adicionar excecao por UF
                    </Button>
                </div>

                {stateRuleErrorCount > 0 ? (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Revise as excecoes estaduais antes de salvar. Foram encontrados {stateRuleErrorCount} erro(s) nesta secao.
                    </div>
                ) : null}

                {values.stateRules.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-600">
                        Nenhuma excecao estadual configurada. Enquanto isso, a regra nacional cobre o comportamento padrao da base em qualquer UF.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {values.stateRules.map((rule, index) => (
                            <IbscbsRuleCard
                                key={rule.id || `ibscbs-state-rule-${index}`}
                                title={`Excecao estadual ${rule.targetUf || `#${index + 1}`}`}
                                description="UF preenchida = excecao especifica daquela unidade federativa."
                                fieldKey={`state-${index}`}
                                rule={rule}
                                cstOptions={cstOptions}
                                getError={(field) => getError(`stateRules.${index}.${field}`)}
                                disabled={disabledFields}
                                resolveClassificationValue={resolveClassificationValue}
                                classificationOptions={classificationOptionsByKey[`state-${index}`] || []}
                                classificationLoading={classificationLoadingByKey[`state-${index}`] === true}
                                onSearchClassification={onSearchClassification}
                                onChange={(patch) => onUpdateStateRule(index, patch)}
                                showRequiredUf
                                onRemove={() => onRemoveStateRule(index)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="5. Resumo, historico e integracao" description="A base IBS/CBS fica pronta para ser herdada pelos Perfis Tributarios e usada como referencia futura na pre-analise fiscal do pedido e na emissao documental." />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-800">Regra base</p>
                        <p className="mt-1 text-sm text-slate-600">
                            CST {values.nationalRule.cstCode || 'pendente'} · Classificacao {values.nationalRule.classificationCode || 'pendente'}
                        </p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-800">Abrangencia</p>
                        <p className="mt-1 text-sm text-slate-600">
                            {values.stateRules.length > 0 ? `${values.stateRules.length} excecao(oes) estadual(is)` : 'Somente regra nacional'}
                        </p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-800">Preview fiscal futuro</p>
                        <p className="mt-1 text-sm text-slate-600">Preparada para resolver regra nacional x UF por contexto do cliente.</p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-800">Perfis Tributarios</p>
                        <p className="mt-1 text-sm text-slate-600">Apenas versoes ativas devem receber novos vinculos.</p>
                    </div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                        <BookCheck className="mt-0.5 h-4 w-4 text-navy" />
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-800">Historico resumido de versoes</p>
                            <div className="flex flex-wrap gap-2">
                                {versionHistory.map((version) => (
                                    <Badge
                                        key={version.id}
                                        variant="outline"
                                        className={
                                            version.id === activeVersionId
                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                : version.status === 'draft'
                                                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                                                  : 'bg-white text-slate-700'
                                        }
                                    >
                                        {version.versionLabel} · {version.status}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                            Esta fase entrega a fundacao administrativa e fiscal de IBS/CBS com catalogos controlados, vigencia e versionamento. O calculo automatico e o preview fiscal completo ficam preparados para a proxima etapa, sem exigir refatoracao estrutural.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button type="button" className="gradient-navy border-0 text-white" onClick={onSubmit} disabled={disabledFields}>
                    {saving ? 'Salvando...' : mode === 'edit' ? 'Salvar versao IBS/CBS' : 'Criar base IBS/CBS'}
                </Button>
            </div>
        </div>
    )
}
