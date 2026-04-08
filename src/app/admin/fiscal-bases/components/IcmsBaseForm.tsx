'use client'

import { AlertTriangle, Layers3, Plus, Trash2 } from 'lucide-react'
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
import type { FiscalCatalogItemOption } from '@/app/admin/actions/fiscal-bases'
import {
    BRAZIL_UF_OPTIONS,
    ICMS_BASE_CALC_TYPES,
    ICMS_INTERSTATE_CONSUMER_FINAL_MODES,
    ICMS_ST_BASE_CALC_TYPES,
} from '@/lib/fiscal/icms'
import type { IcmsBaseFormValues } from '../icms/schema'

interface IcmsBaseFormProps {
    mode: 'create' | 'edit'
    loading: boolean
    saving: boolean
    values: IcmsBaseFormValues
    cstOptions: FiscalCatalogItemOption[]
    errors: Record<string, string>
    onCancel: () => void
    onSubmit: () => void
    onChangeBase: (patch: Partial<IcmsBaseFormValues>) => void
    onUpdateNationalRule: (patch: Partial<IcmsBaseFormValues['nationalRule']>) => void
    onAddStateRule: () => void
    onRemoveStateRule: (index: number) => void
    onUpdateStateRule: (index: number, patch: Partial<IcmsBaseFormValues['stateRules'][number]>) => void
    onToggleInterstate: (enabled: boolean) => void
    onUpdateInterstateRule: (patch: Partial<IcmsBaseFormValues['interstateRule']>) => void
    onToggleStRule: (enabled: boolean) => void
    onUpdateStRule: (patch: Partial<IcmsBaseFormValues['stRule']>) => void
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

function OptionalUfSelect({ value, placeholder, onChange }: { value?: string | null; placeholder: string; onChange: (next: string | undefined) => void }) {
    return (
        <Select value={value || '__none__'} onValueChange={(next) => onChange(!next || next === '__none__' ? undefined : next)}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="__none__">{placeholder}</SelectItem>
                {BRAZIL_UF_OPTIONS.map((uf) => (
                    <SelectItem key={uf.value} value={uf.value}>{uf.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

function RequiredUfSelect({ value, onChange }: { value?: string | null; onChange: (next: string | undefined) => void }) {
    return (
        <Select value={value || '__empty__'} onValueChange={(next) => onChange(!next || next === '__empty__' ? undefined : next)}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a UF" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="__empty__">Selecione a UF</SelectItem>
                {BRAZIL_UF_OPTIONS.map((uf) => (
                    <SelectItem key={uf.value} value={uf.value}>{uf.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

function IcmsRuleCard({
    title,
    description,
    rule,
    cstOptions,
    getError,
    onChange,
    showRequiredUf = false,
    onRemove,
}: {
    title: string
    description: string
    rule: IcmsBaseFormValues['nationalRule']
    cstOptions: FiscalCatalogItemOption[]
    getError: (path: string) => string | undefined
    onChange: (patch: Partial<IcmsBaseFormValues['nationalRule']>) => void
    showRequiredUf?: boolean
    onRemove?: () => void
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-navy">{title}</p>
                        <Badge variant="outline" className={rule.isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                            {rule.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                    </div>
                    <p className="text-xs text-slate-600">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                        <span className="text-xs text-slate-600">Regra ativa</span>
                        <Switch checked={rule.isActive !== false} onCheckedChange={(next) => onChange({ isActive: next })} />
                    </div>
                    {onRemove ? (
                        <Button type="button" size="sm" variant="outline" onClick={onRemove}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remover
                        </Button>
                    ) : null}
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {showRequiredUf ? (
                    <div className="space-y-1.5">
                        <Label>UF da excecao *</Label>
                        <RequiredUfSelect value={rule.targetUf} onChange={(next) => onChange({ targetUf: next })} />
                        <FieldError message={getError('targetUf')} />
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <Label>Escopo da regra</Label>
                        <div className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-700">UF vazia = regra nacional / base padrao</div>
                    </div>
                )}
                <div className="space-y-1.5">
                    <Label>CST *</Label>
                    <Select value={rule.cstCode || '__empty__'} onValueChange={(next) => onChange({ cstCode: !next || next === '__empty__' ? '' : next })}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o CST" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__empty__">Selecione o CST</SelectItem>
                            {cstOptions.map((option) => (<SelectItem key={option.id} value={option.code}>{option.label}</SelectItem>))}
                        </SelectContent>
                    </Select>
                    <FieldError message={getError('cstCode')} />
                </div>
                <div className="space-y-1.5">
                    <Label>Aliquota ICMS (%) *</Label>
                    <Input type="number" step="0.01" value={rule.icmsRate} onChange={(event) => onChange({ icmsRate: Number(event.target.value || 0) })} />
                    <FieldError message={getError('icmsRate')} />
                </div>
                <div className="space-y-1.5">
                    <Label>Aliquota FCP (%) *</Label>
                    <Input type="number" step="0.01" value={rule.fcpRate} onChange={(event) => onChange({ fcpRate: Number(event.target.value || 0) })} />
                    <FieldError message={getError('fcpRate')} />
                </div>
                <div className="space-y-1.5">
                    <Label>Tipo de base</Label>
                    <Select value={rule.baseCalcType} onValueChange={(next) => onChange({ baseCalcType: next as typeof rule.baseCalcType })}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                        <SelectContent>
                            {ICMS_BASE_CALC_TYPES.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}
                        </SelectContent>
                    </Select>
                    <FieldError message={getError('baseCalcType')} />
                </div>
                <div className="space-y-1.5">
                    <Label>Percentual da base (%)</Label>
                    <Input type="number" step="0.01" value={rule.baseCalcPercent ?? ''} onChange={(event) => onChange({ baseCalcPercent: event.target.value === '' ? undefined : Number(event.target.value) })} />
                    <FieldError message={getError('baseCalcPercent')} />
                </div>
                <div className="space-y-1.5">
                    <Label>Reducao de base (%)</Label>
                    <Input type="number" step="0.01" value={rule.baseReductionPercent ?? ''} onChange={(event) => onChange({ baseReductionPercent: event.target.value === '' ? undefined : Number(event.target.value) })} />
                    <FieldError message={getError('baseReductionPercent')} />
                </div>
                <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                    <Label>Observacoes</Label>
                    <Textarea rows={3} value={rule.baseNotes || ''} onChange={(event) => onChange({ baseNotes: event.target.value || undefined })} />
                    <FieldError message={getError('baseNotes')} />
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl border bg-white p-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">Antecipacao no destinatario</p>
                        <p className="text-xs text-slate-500">Use quando a legislacao do destino antecipar o recolhimento do ICMS.</p>
                    </div>
                    <Switch checked={rule.specialAdvanceDestination === true} onCheckedChange={(next) => onChange({ specialAdvanceDestination: next })} />
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-white p-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">Consumidor final com aliquota diferenciada</p>
                        <p className="text-xs text-slate-500">Reserve esta flag para contextos em que o tratamento ao consumidor final muda.</p>
                    </div>
                    <Switch checked={rule.differentiateConsumerFinalRate === true} onCheckedChange={(next) => onChange({ differentiateConsumerFinalRate: next })} />
                </div>
            </div>
        </div>
    )
}

export function IcmsBaseForm({
    mode,
    loading,
    saving,
    values,
    cstOptions,
    errors,
    onCancel,
    onSubmit,
    onChangeBase,
    onUpdateNationalRule,
    onAddStateRule,
    onRemoveStateRule,
    onUpdateStateRule,
    onToggleInterstate,
    onUpdateInterstateRule,
    onToggleStRule,
    onUpdateStRule,
}: IcmsBaseFormProps) {
    const getError = (path: string) => errors[path]
    const stateRuleErrorCount = Object.keys(errors).filter((key) => key.startsWith('stateRules.')).length
    const stateRuleAffectedUf = Array.from(
        new Set(
            Object.keys(errors)
                .filter((key) => key.startsWith('stateRules.'))
                .map((key) => {
                    const match = key.match(/^stateRules\.(\d+)\./)
                    if (!match) return null
                    const index = Number(match[1])
                    return values.stateRules[index]?.targetUf || `#${index + 1}`
                })
                .filter((value): value is string => Boolean(value))
        )
    )
    const stMinimumPayloadMissing =
        values.enableStRule &&
        values.stRule.stEnabled &&
        values.stRule.stRate === undefined &&
        values.stRule.mvaOriginal === undefined &&
        values.stRule.stBaseCalcPercent === undefined

    if (loading) {
        return <div className="rounded-3xl border bg-white p-8 text-sm text-slate-600 shadow-sm">Carregando estrutura da base de ICMS...</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">Governanca ICMS</Badge>
                        <Badge variant="outline" className={values.isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                            {values.isActive ? 'Ativa para novos perfis' : 'Inativa para novos vinculos'}
                        </Badge>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-heading text-gradient-navy">{mode === 'edit' ? 'Editar Base de ICMS' : 'Nova Base de ICMS'}</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">Estruture uma base reutilizavel de ICMS com regra nacional, excecoes por UF, interestadual e preparacao de ST, sem confundir esta camada interna com bases oficiais importaveis.</p>
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                    <p className="font-medium text-slate-800">Escopo desta base</p>
                    <p className="mt-1">Regra nacional {values.stateRules.length > 0 ? `+ ${values.stateRules.length} excecao(oes) por UF` : 'sem excecoes por UF'}</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryMetric label="Regras estaduais" value={values.stateRules.length.toLocaleString('pt-BR')} helper="UF vazia continua sendo a regra base" />
                <SummaryMetric label="Interestadual" value={values.enableInterstateRule ? 'Configurado' : 'Pendente'} helper="Camada separada da regra nacional" />
                <SummaryMetric label="ST / MVA" value={values.enableStRule ? (values.stRule.stEnabled ? 'Ativo' : 'Preparado') : 'Nao usado'} helper="Estrutura pronta para evolucao futura" />
                <SummaryMetric label="Integracao" value="Perfil tributario" helper="Esta base pode ser vinculada aos perfis de produto" />
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="1. Informacoes gerais" description="Identifique a base de ICMS de forma clara para reutilizacao em perfis tributarios e evolucao futura da engine fiscal." />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-1.5 md:col-span-2"><Label>Nome da base *</Label><Input value={values.name} onChange={(event) => onChangeBase({ name: event.target.value })} /><FieldError message={getError('name')} /></div>
                    <div className="space-y-1.5"><Label>Codigo interno *</Label><Input value={values.code} onChange={(event) => onChangeBase({ code: event.target.value.toUpperCase() })} /><FieldError message={getError('code')} /></div>
                    <div className="space-y-1.5 md:col-span-3"><Label>Descricao</Label><Textarea rows={2} value={values.description || ''} onChange={(event) => onChangeBase({ description: event.target.value || undefined })} /><FieldError message={getError('description')} /></div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3">
                    <div><p className="text-sm font-medium text-slate-800">Status da base</p><p className="text-xs text-slate-500">Bases inativas permanecem auditaveis, mas nao devem ser usadas em novos perfis.</p></div>
                    <Switch checked={values.isActive} onCheckedChange={(next) => onChangeBase({ isActive: next })} />
                </div>
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="2. ICMS base / nacional" description="Esta regra cobre o comportamento padrao da base. A partir dela, voce pode abrir excecoes por UF quando a operacao exigir tratamento estadual especifico." />
                <IcmsRuleCard title="Regra nacional" description="UF vazia = regra nacional / base padrao da configuracao." rule={values.nationalRule} cstOptions={cstOptions} getError={(field) => getError(`nationalRule.${field}`)} onChange={onUpdateNationalRule} />
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <SectionIntro title="3. Regras por UF" description="Crie excecoes apenas quando a legislacao estadual exigir comportamento diferente da regra base. Cada UF pode existir uma unica vez por base." />
                    <Button type="button" variant="outline" onClick={onAddStateRule}><Plus className="mr-1.5 h-4 w-4" />Adicionar excecao por UF</Button>
                </div>
                {stateRuleErrorCount > 0 ? (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Revise as excecoes por UF antes de salvar. Foram encontrados {stateRuleErrorCount} erro(s) nas regras de{' '}
                        {stateRuleAffectedUf.join(', ')}.
                    </div>
                ) : null}
                {values.stateRules.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-600">Nenhuma excecao estadual configurada. Se nada for criado aqui, a regra nacional sera herdada para todas as UFs.</div>
                ) : (
                    <div className="space-y-4">
                        {values.stateRules.map((rule, index) => (
                            <IcmsRuleCard
                                key={rule.id || `state-rule-${index}`}
                                title={`Excecao estadual ${rule.targetUf || `#${index + 1}`}`}
                                description="UF preenchida = excecao especifica que sobrepoe a regra base para aquela operacao."
                                rule={rule}
                                cstOptions={cstOptions}
                                getError={(field) => getError(`stateRules.${index}.${field}`)}
                                onChange={(patch) => onUpdateStateRule(index, patch)}
                                showRequiredUf
                                onRemove={() => onRemoveStateRule(index)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">ICMS interestadual</p>
                        <p className="text-xs text-slate-500">Camada propria para operacoes interestaduais, separada da regra base.</p>
                    </div>
                    <Switch checked={values.enableInterstateRule} onCheckedChange={onToggleInterstate} />
                </div>
                {values.enableInterstateRule ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1.5"><Label>UF de override (opcional)</Label><OptionalUfSelect value={values.interstateRule.targetUf} placeholder="Sem override por UF" onChange={(next) => onUpdateInterstateRule({ targetUf: next })} /><FieldError message={getError('interstateRule.targetUf')} /></div>
                        <div className="space-y-1.5"><Label>Aliquota ICMS interestadual (%) *</Label><Input type="number" step="0.01" value={values.interstateRule.icmsRate} onChange={(event) => onUpdateInterstateRule({ icmsRate: Number(event.target.value || 0) })} /><FieldError message={getError('interstateRule.icmsRate')} /></div>
                        <div className="space-y-1.5"><Label>Aliquota FCP interestadual (%) *</Label><Input type="number" step="0.01" value={values.interstateRule.fcpRate} onChange={(event) => onUpdateInterstateRule({ fcpRate: Number(event.target.value || 0) })} /><FieldError message={getError('interstateRule.fcpRate')} /></div>
                        <div className="space-y-1.5">
                            <Label>Modo consumidor final</Label>
                            <Select value={values.interstateRule.consumerFinalMode} onValueChange={(next) => onUpdateInterstateRule({ consumerFinalMode: next as typeof values.interstateRule.consumerFinalMode })}>
                                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o modo" /></SelectTrigger>
                                <SelectContent>
                                    {ICMS_INTERSTATE_CONSUMER_FINAL_MODES.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}
                                </SelectContent>
                            </Select>
                            <FieldError message={getError('interstateRule.consumerFinalMode')} />
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-600">Interestadual ainda nao configurado. Ative esta camada quando quiser registrar aliquotas proprias para operacoes fora da UF base.</div>
                )}
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">ICMS ST / MVA</p>
                        <p className="text-xs text-slate-500">Estrutura avancada para preparar substituicao tributaria, MVA e FCP ST sem acoplar calculo completo nesta fase.</p>
                    </div>
                    <Switch checked={values.enableStRule} onCheckedChange={onToggleStRule} />
                </div>
                {values.enableStRule ? (
                    <div className="space-y-4">
                        {stMinimumPayloadMissing ? (
                            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                ST esta habilitado, mas ainda falta o preenchimento minimo. Informe ao menos aliquota ST, MVA original ou percentual de base ST para concluir a configuracao com seguranca.
                            </div>
                        ) : null}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="space-y-1.5"><Label>UF de override ST (opcional)</Label><OptionalUfSelect value={values.stRule.targetUf} placeholder="Sem override por UF" onChange={(next) => onUpdateStRule({ targetUf: next })} /><FieldError message={getError('stRule.targetUf')} /></div>
                            <div className="space-y-1.5">
                                <Label>Tipo de base ST</Label>
                                <Select value={values.stRule.stBaseCalcType || '__empty__'} onValueChange={(next) => onUpdateStRule({ stBaseCalcType: next === '__empty__' ? undefined : (next as typeof values.stRule.stBaseCalcType) })}>
                                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__empty__">Selecione o tipo</SelectItem>
                                        {ICMS_ST_BASE_CALC_TYPES.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                                <FieldError message={getError('stRule.stBaseCalcType')} />
                            </div>
                            <div className="space-y-1.5"><Label>Percentual base ST (%)</Label><Input type="number" step="0.01" value={values.stRule.stBaseCalcPercent ?? ''} onChange={(event) => onUpdateStRule({ stBaseCalcPercent: event.target.value === '' ? undefined : Number(event.target.value) })} /><FieldError message={getError('stRule.stBaseCalcPercent')} /></div>
                            <div className="space-y-1.5"><Label>Reducao base ST (%)</Label><Input type="number" step="0.01" value={values.stRule.stBaseReductionPercent ?? ''} onChange={(event) => onUpdateStRule({ stBaseReductionPercent: event.target.value === '' ? undefined : Number(event.target.value) })} /><FieldError message={getError('stRule.stBaseReductionPercent')} /></div>
                            <div className="space-y-1.5"><Label>Aliquota ST (%)</Label><Input type="number" step="0.01" value={values.stRule.stRate ?? ''} onChange={(event) => onUpdateStRule({ stRate: event.target.value === '' ? undefined : Number(event.target.value) })} /><FieldError message={getError('stRule.stRate')} /></div>
                            <div className="space-y-1.5"><Label>FCP ST (%)</Label><Input type="number" step="0.01" value={values.stRule.stFcpRate ?? ''} onChange={(event) => onUpdateStRule({ stFcpRate: event.target.value === '' ? undefined : Number(event.target.value) })} /><FieldError message={getError('stRule.stFcpRate')} /></div>
                            <div className="space-y-1.5"><Label>MVA original (%)</Label><Input type="number" step="0.01" value={values.stRule.mvaOriginal ?? ''} onChange={(event) => onUpdateStRule({ mvaOriginal: event.target.value === '' ? undefined : Number(event.target.value) })} /><FieldError message={getError('stRule.mvaOriginal')} /></div>
                            <div className="space-y-1.5"><Label>MVA ajustada (%)</Label><Input type="number" step="0.01" value={values.stRule.mvaAdjusted ?? ''} onChange={(event) => onUpdateStRule({ mvaAdjusted: event.target.value === '' ? undefined : Number(event.target.value) })} /><FieldError message={getError('stRule.mvaAdjusted')} /></div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                            <div className="space-y-1.5"><Label>Observacoes ST / MVA</Label><Textarea rows={4} value={values.stRule.stNotes || ''} onChange={(event) => onUpdateStRule({ stNotes: event.target.value || undefined })} /><FieldError message={getError('stRule.stNotes')} /></div>
                            <div className="rounded-2xl border bg-slate-50 p-4">
                                <div className="flex items-start gap-3">
                                    <Layers3 className="mt-0.5 h-4 w-4 text-navy" />
                                    <div className="space-y-3">
                                        <p className="text-sm font-medium text-slate-800">Status da estrutura ST</p>
                                        <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                                            <span className="text-sm text-slate-700">ST habilitado</span>
                                            <Switch checked={values.stRule.stEnabled === true} onCheckedChange={(next) => onUpdateStRule({ stEnabled: next })} />
                                        </div>
                                        <p className="text-xs text-slate-500">Nesta fase, a estrutura fica pronta para evolucao futura do calculo fiscal real. Ainda nao substitui revisao tributaria especializada.</p>
                                        <FieldError message={getError('stRule.stRate')} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-600">A estrutura ST / MVA esta desativada nesta base. Ative quando precisar preparar cenarios com substituicao tributaria.</div>
                )}
            </div>

            <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm">
                <SectionIntro title="6. Resumo e integracao" description="Esta base fica preparada para vinculo com Perfis Tributarios de Produto e rastreabilidade futura no snapshot fiscal dos pedidos." />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-sm font-medium text-slate-800">Regra base</p><p className="mt-1 text-sm text-slate-600">CST {values.nationalRule.cstCode || 'pendente'} · ICMS {values.nationalRule.icmsRate.toFixed(2)}% · FCP {values.nationalRule.fcpRate.toFixed(2)}%</p></div>
                    <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-sm font-medium text-slate-800">Excecoes por UF</p><p className="mt-1 text-sm text-slate-600">{values.stateRules.length > 0 ? `${values.stateRules.length} regra(s) estadual(is)` : 'Nenhuma excecao configurada'}</p></div>
                    <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-sm font-medium text-slate-800">Interestadual</p><p className="mt-1 text-sm text-slate-600">{values.enableInterstateRule ? `${values.interstateRule.icmsRate.toFixed(2)}% ICMS · ${values.interstateRule.fcpRate.toFixed(2)}% FCP` : 'Nao configurado nesta fase'}</p></div>
                    <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-sm font-medium text-slate-800">ST / MVA</p><p className="mt-1 text-sm text-slate-600">{values.enableStRule ? (values.stRule.stEnabled ? 'Estrutura ST ativa' : 'Estrutura ST preparada') : 'Nao utilizado'}</p></div>
                </div>
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Esta base organiza CST, aliquotas, FCP, excecoes por UF, interestadual e preparacao de ST. Ela ainda nao executa calculo fiscal automatico completo, mas ja nasce estruturada para a proxima fase da engine tributaria.</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
                <Button type="button" className="gradient-navy border-0 text-white" onClick={onSubmit} disabled={saving}>{saving ? 'Salvando...' : mode === 'edit' ? 'Salvar base de ICMS' : 'Criar base de ICMS'}</Button>
            </div>
        </div>
    )
}
