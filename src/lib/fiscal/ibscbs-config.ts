export type IbscbsReadinessLevel = 'ready' | 'partial' | 'pending'

export type IbscbsBaseMode =
  | 'subtotal'
  | 'fiscal_gross'
  | 'fiscal_gross_less_icms_fcp'

export interface IbscbsRuntimeModelInput {
  baseMode?: IbscbsBaseMode | string | null
  basePercent?: number | null
  baseReductionPercent?: number | null
  ibsUfRate?: number | null
  ibsMunRate?: number | null
  cbsRate?: number | null
}

export interface IbscbsRuntimeModel {
  baseMode: IbscbsBaseMode
  basePercent: number
  baseReductionPercent: number
  ibsUfRate: number | null
  ibsMunRate: number | null
  cbsRate: number | null
  totalRate: number
}

export interface IbscbsReadinessSummary {
  level: IbscbsReadinessLevel
  title: string
  description: string
  items: string[]
}

export function parseIbscbsRuntimeModel(payload: unknown): IbscbsRuntimeModel {
  const record = asRecord(payload)
  const basePercent = normalizePercent(record?.base_percent, 100)
  const baseReductionPercent = normalizePercent(record?.base_reduction_percent, 0)
  const ibsUfRate = normalizeNullableNumber(record?.ibs_uf_rate)
  const ibsMunRate = normalizeNullableNumber(record?.ibs_mun_rate)
  const cbsRate = normalizeNullableNumber(record?.cbs_rate)
  const totalRate = roundTo4((ibsUfRate || 0) + (ibsMunRate || 0) + (cbsRate || 0))

  return {
    baseMode: normalizeBaseMode(record?.base_mode),
    basePercent,
    baseReductionPercent,
    ibsUfRate,
    ibsMunRate,
    cbsRate,
    totalRate,
  }
}

export function serializeIbscbsRuntimeModel(input: IbscbsRuntimeModelInput) {
  const model = parseIbscbsRuntimeModel({
    base_mode: input.baseMode,
    base_percent: input.basePercent,
    base_reduction_percent: input.baseReductionPercent,
    ibs_uf_rate: input.ibsUfRate,
    ibs_mun_rate: input.ibsMunRate,
    cbs_rate: input.cbsRate,
  })

  return {
    base_mode: model.baseMode,
    base_percent: model.basePercent,
    base_reduction_percent: model.baseReductionPercent,
    ibs_uf_rate: model.ibsUfRate ?? 0,
    ibs_mun_rate: model.ibsMunRate ?? 0,
    cbs_rate: model.cbsRate ?? 0,
    rate: model.totalRate,
  } satisfies Record<string, unknown>
}

export function buildIbscbsBaseReadinessSummary(input: {
  cstCatalogVersionId?: string | null
  classificationCatalogVersionId?: string | null
  nationalCstCode?: string | null
  nationalClassificationCode?: string | null
  stateRuleCount: number
  model: IbscbsRuntimeModel
}): IbscbsReadinessSummary {
  const items: string[] = []

  if (!normalizeOptionalText(input.cstCatalogVersionId) || !normalizeOptionalText(input.classificationCatalogVersionId)) {
    items.push('Selecione os dois catalogos oficiais: CST e classificacao tributaria.')
  }

  if (!normalizeOptionalText(input.nationalCstCode) || !normalizeOptionalText(input.nationalClassificationCode)) {
    items.push('A regra nacional precisa informar CST e classificacao tributaria.')
  }

  if (input.model.totalRate <= 0) {
    items.push('Defina as aliquotas numericas da versao: IBS UF, IBS Municipio e/ou CBS.')
  }

  if (items.length === 0) {
    return {
      level: 'ready',
      title: 'Base IBS/CBS pronta para heranca',
      description: 'A base ja unifica catalogo, regra nacional/UF e formula numerica da versao para o runtime fiscal.',
      items: [
        `Formula da base: ${describeBaseModel(input.model)}`,
        input.stateRuleCount > 0
          ? `${input.stateRuleCount} excecao(oes) estadual(is) pronta(s) para sobrepor a regra nacional.`
          : 'Sem excecoes por UF: a regra nacional cobre o comportamento padrao da base.',
      ],
    }
  }

  return {
    level: 'partial',
    title: 'Base IBS/CBS ainda incompleta para o runtime',
    description: 'A estrutura administrativa existe, mas ainda faltam pecas para a resolucao unica de IBS/CBS.',
    items,
  }
}

export function buildCfopIbscbsReadinessSummary(input: {
  impactsIbscbs: boolean
  hasCatalogPair: boolean
  hasCst: boolean
  hasClassification: boolean
  hasRegularClassificationWithoutCst?: boolean
  presumedCreditCatalogReady?: boolean
  hasPresumedCreditCode?: boolean
}): IbscbsReadinessSummary {
  if (!input.impactsIbscbs) {
    return {
      level: 'pending',
      title: 'CFOP sem impacto IBS/CBS',
      description: 'Este CFOP nao participa da resolucao de IBS/CBS. Se a operacao realmente impactar a reforma tributaria, ative o bloco.',
      items: [
        'O CFOP e o dono do enquadramento da operacao: impacto, CST, classificacao e credito presumido.',
      ],
    }
  }

  const items: string[] = []
  if (!input.hasCatalogPair) {
    items.push('Ative os catalogos de CST e classificacao IBS/CBS para este CFOP.')
  }
  if (!input.hasCst || !input.hasClassification) {
    items.push('Defina CST e classificacao tributaria da operacao.')
  }
  if (input.hasRegularClassificationWithoutCst) {
    items.push('A classificacao de tributacao regular exige um CST regular correspondente.')
  }
  if (input.hasPresumedCreditCode && input.presumedCreditCatalogReady === false) {
    items.push('O codigo de credito presumido escolhido nao esta coberto por um catalogo ativo.')
  }

  if (items.length === 0) {
    return {
      level: 'ready',
      title: 'CFOP pronto para enquadramento IBS/CBS',
      description: 'O CFOP ja informa ao runtime se a operacao impacta IBS/CBS e qual e o enquadramento legal da operacao.',
      items: [
        'As aliquotas e a formula de base continuam vindo da base/versionamento IBS/CBS do perfil e dos vinculos por UF.',
      ],
    }
  }

  return {
    level: 'partial',
    title: 'CFOP com impacto IBS/CBS, mas ainda incompleto',
    description: 'A operacao ja foi marcada como impactante, porem o enquadramento ainda nao esta totalmente consistente.',
    items,
  }
}

export function buildProfileIbscbsReadinessSummary(input: {
  hasBaseVersion: boolean
  isSelectedVersionActive: boolean
  hasAnyCfopConfig: boolean
  requiresTaxConfiguration: boolean
}): IbscbsReadinessSummary {
  if (!input.requiresTaxConfiguration) {
    return {
      level: 'pending',
      title: 'Perfil sem exigencia fiscal estruturada',
      description: 'Enquanto a configuracao fiscal estiver opcional neste perfil, o runtime IBS/CBS nao deve ser tratado como pronto.',
      items: ['Ative a configuracao fiscal estruturada quando esse perfil entrar em emissao documental.'],
    }
  }

  const items: string[] = []

  if (!input.hasBaseVersion) {
    items.push('Vincule uma base/versionamento IBS/CBS neste perfil.')
  }

  if (input.hasBaseVersion && !input.isSelectedVersionActive) {
    items.push('A referencia IBS/CBS atual e historica; para novos usos, prefira uma versao ativa.')
  }

  if (!input.hasAnyCfopConfig) {
    items.push('Complete o perfil com CFOP configurado, porque o enquadramento IBS/CBS da operacao vem do CFOP.')
  }

  if (items.length === 0) {
    return {
      level: 'ready',
      title: 'Perfil pronto para herdar IBS/CBS',
      description: 'O perfil ja escolhe a base/versionamento padrao e aponta para CFOP configurado, alinhando produto e operacao na mesma linguagem fiscal.',
      items: [
        'Vinculos do emitente por UF continuam servindo como complemento geografico do runtime.',
      ],
    }
  }

  return {
    level: input.hasBaseVersion ? 'partial' : 'pending',
    title: input.hasBaseVersion
      ? 'Perfil parcialmente pronto para IBS/CBS'
      : 'Perfil ainda sem base/versionamento de IBS/CBS',
    description: 'O perfil e o dono da heranca padrao de base/versionamento do produto; sem isso, o runtime fica incompleto.',
    items,
  }
}

export function getIbscbsReadinessClassName(level: IbscbsReadinessLevel) {
  if (level === 'ready') return 'border-emerald-300 bg-emerald-50 text-emerald-900'
  if (level === 'partial') return 'border-amber-300 bg-amber-50 text-amber-900'
  return 'border-slate-300 bg-slate-50 text-slate-800'
}

export function describeBaseModel(model: IbscbsRuntimeModel) {
  const segments = [
    humanizeIbscbsBaseMode(model.baseMode),
    `Base considerada ${formatPercent(model.basePercent)}`,
  ]

  if (model.baseReductionPercent > 0) {
    segments.push(`Reducao ${formatPercent(model.baseReductionPercent)}`)
  }

  segments.push(`IBS UF ${formatRate(model.ibsUfRate)}`)
  segments.push(`IBS Mun ${formatRate(model.ibsMunRate)}`)
  segments.push(`CBS ${formatRate(model.cbsRate)}`)

  return segments.join(' | ')
}

export function humanizeIbscbsBaseMode(mode: string | null | undefined) {
  switch (normalizeBaseMode(mode)) {
    case 'fiscal_gross':
      return 'Valor fiscal do item (valor + frete + seguro + outras despesas - desconto)'
    case 'fiscal_gross_less_icms_fcp':
      return 'Valor fiscal do item - ICMS/FCP proprio'
    case 'subtotal':
    default:
      return 'Subtotal puro do item'
  }
}

export function normalizeBaseMode(value: unknown): IbscbsBaseMode {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''

  switch (normalized) {
    case 'fiscal_gross':
      return 'fiscal_gross'
    case 'fiscal_gross_less_icms_fcp':
    case 'subtotal_less_icms_fcp':
      return 'fiscal_gross_less_icms_fcp'
    case 'subtotal':
    case 'subtotal_percent':
    case 'subtotal_reduced':
    case 'subtotal_percent_reduced':
    default:
      return 'subtotal'
  }
}

function normalizePercent(value: unknown, fallback: number) {
  const numeric = normalizeNullableNumber(value)
  if (numeric === null) return fallback
  return Math.max(0, roundTo4(numeric))
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? roundTo4(numeric) : null
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}%`
}

function formatRate(value: number | null) {
  return formatPercent(value ?? 0)
}

function roundTo4(value: number) {
  return Math.round(value * 10000) / 10000
}
