import type {
  FiscalItemContext,
  ResolvedIbsCbsContext,
} from './types'

interface EmitterIbscbsLinkSnapshot {
  target_uf: string | null
  ibscbs_base_id: string
  ibscbs_version_id: string | null
}

interface CfopConfigSnapshot {
  id: string
  impacts_ibscbs: boolean
  configuration_status: string | null
  future_tax_payload: Record<string, unknown>
}

interface CfopIbscbsConfigSnapshot {
  cfop_config_id: string
  cst_catalog_version_id: string | null
  cst_code: string | null
  classification_version_id: string | null
  classification_code: string | null
  regular_cst_code: string | null
  regular_classification_code: string | null
  presumed_credit_catalog_version_id: string | null
  presumed_credit_code: string | null
  presumed_credit_rate: number | null
  future_tax_payload: Record<string, unknown>
}

interface IbscbsBaseSnapshot {
  id: string
  code: string | null
  name: string | null
  future_tax_payload: Record<string, unknown>
}

interface IbscbsVersionSnapshot {
  id: string
  ibscbs_base_id: string
  version_label: string | null
  future_tax_payload: Record<string, unknown>
}

interface IbscbsRuleSnapshot {
  ibscbs_version_id: string
  target_uf: string | null
  cst_code: string | null
  classification_code: string | null
  future_tax_payload: Record<string, unknown>
}

export interface ResolvedIbsCbsDependencies {
  emitterLinks: EmitterIbscbsLinkSnapshot[]
  cfopConfigsById: Map<string, CfopConfigSnapshot>
  cfopIbscbsByCfopConfigId: Map<string, CfopIbscbsConfigSnapshot>
  basesById: Map<string, IbscbsBaseSnapshot>
  versionsById: Map<string, IbscbsVersionSnapshot>
  activeVersionsByBaseId: Map<string, IbscbsVersionSnapshot>
  rulesByVersionId: Map<string, IbscbsRuleSnapshot[]>
}

export function resolveIbsCbsContext(
  item: FiscalItemContext,
  storeUf: string,
  operationDirection: 'outbound' | 'inbound',
  dependencies: ResolvedIbsCbsDependencies
): ResolvedIbsCbsContext | null {
  const cfopConfigId = resolveCfopConfigId(item, operationDirection)
  const cfopConfig = cfopConfigId ? dependencies.cfopConfigsById.get(cfopConfigId) || null : null

  if (!cfopConfigId && !item.tax_profile.ibscbs_version_id && !item.tax_profile.ibscbs_base_id) {
    return null
  }

  if (cfopConfig && !cfopConfig.impacts_ibscbs) {
    return {
      target_uf: normalizeOptionalText(storeUf),
      cfop_config_id: cfopConfigId,
      impacts_ibscbs: false,
      configuration_status: cfopConfig?.configuration_status || null,
      base_id: item.tax_profile.ibscbs_base_id,
      base_code: null,
      base_name: null,
      version_id: item.tax_profile.ibscbs_version_id,
      version_label: null,
      cst_catalog_version_id: null,
      cst_code: null,
      classification_version_id: null,
      classification_code: null,
      regular_cst_code: null,
      regular_classification_code: null,
      presumed_credit_catalog_version_id: null,
      presumed_credit_code: null,
      presumed_credit_rate: null,
      ibs_uf_rate: null,
      ibs_mun_rate: null,
      cbs_rate: null,
      rate: null,
      base_mode: null,
      base_percent: null,
      base_reduction_percent: null,
      applied_rule_scope: 'none',
      legacy_payload_used: false,
      readiness_errors: [],
    }
  }

  const readinessErrors: string[] = []
  const emitterLink =
    dependencies.emitterLinks.find((link) => normalizeOptionalText(link.target_uf) === storeUf)
    || dependencies.emitterLinks.find((link) => !normalizeOptionalText(link.target_uf))
    || null

  const explicitBaseId = emitterLink?.ibscbs_base_id || item.tax_profile.ibscbs_base_id || null
  const explicitVersionId = emitterLink?.ibscbs_version_id || item.tax_profile.ibscbs_version_id || null
  const cfopIbscbsConfig = cfopConfigId
    ? dependencies.cfopIbscbsByCfopConfigId.get(cfopConfigId) || null
    : null
  const explicitVersion = explicitVersionId
    ? dependencies.versionsById.get(explicitVersionId) || null
    : null
  const baseId = explicitBaseId || explicitVersion?.ibscbs_base_id || null
  const activeVersion = baseId
    ? dependencies.activeVersionsByBaseId.get(baseId) || null
    : null
  const version = explicitVersion || activeVersion
  const versionId = version?.id || explicitVersionId
  const base = baseId
    ? dependencies.basesById.get(baseId) || null
    : version?.ibscbs_base_id
      ? dependencies.basesById.get(version.ibscbs_base_id) || null
      : null
  const rule = versionId
    ? selectIbscbsRule(dependencies.rulesByVersionId.get(versionId) || [], storeUf)
    : { rule: null, scope: 'none' as const }

  if (!cfopConfigId) {
    readinessErrors.push('Nenhum CFOP configurado foi resolvido para o item.')
  }

  if (!baseId || !versionId) {
    readinessErrors.push('O perfil tributario nao possui base e versao de IBS/CBS completas.')
  }

  if (explicitVersion && explicitBaseId && explicitVersion.ibscbs_base_id !== explicitBaseId) {
    readinessErrors.push('A versao de IBS/CBS nao pertence a base configurada no runtime.')
  }

  if (!rule.rule) {
    readinessErrors.push(`A base IBS/CBS nao possui regra nacional ou da UF ${storeUf}.`)
  }

  const officialPayload = mergePayloads(
    base?.future_tax_payload,
    version?.future_tax_payload,
    rule.rule?.future_tax_payload,
    cfopConfig?.future_tax_payload,
    cfopIbscbsConfig?.future_tax_payload
  )
  const legacyPayload = extractLegacyIbsCbsPayload(item.applied_rule?.rule_payload)

  const cstResult = resolveTextValue(
    [
      cfopIbscbsConfig?.cst_code,
      rule.rule?.cst_code,
      readTextValue(officialPayload, ['cst_code', 'cstCode']),
    ],
    readTextValue(legacyPayload, ['cst_code', 'cstCode'])
  )
  const classificationResult = resolveTextValue(
    [
      cfopIbscbsConfig?.classification_code,
      rule.rule?.classification_code,
      readTextValue(officialPayload, ['classification_code', 'classificationCode']),
    ],
    readTextValue(legacyPayload, ['classification_code', 'classificationCode'])
  )
  const regularCstResult = resolveTextValue(
    [
      cfopIbscbsConfig?.regular_cst_code,
      readTextValue(officialPayload, ['regular_cst_code', 'regularCstCode']),
    ],
    readTextValue(legacyPayload, ['regular_cst_code', 'regularCstCode'])
  )
  const regularClassificationResult = resolveTextValue(
    [
      cfopIbscbsConfig?.regular_classification_code,
      readTextValue(officialPayload, ['regular_classification_code', 'regularClassificationCode']),
    ],
    readTextValue(legacyPayload, ['regular_classification_code', 'regularClassificationCode'])
  )
  const presumedCreditCodeResult = resolveTextValue(
    [
      cfopIbscbsConfig?.presumed_credit_code,
      readTextValue(officialPayload, ['presumed_credit_code', 'presumedCreditCode']),
    ],
    readTextValue(legacyPayload, ['presumed_credit_code', 'presumedCreditCode'])
  )
  const presumedCreditRateResult = resolveNumberValue(
    [
      cfopIbscbsConfig?.presumed_credit_rate,
      readNumberValue(officialPayload, ['presumed_credit_rate', 'presumedCreditRate']),
    ],
    readNumberValue(legacyPayload, ['presumed_credit_rate', 'presumedCreditRate'])
  )
  const ibsUfRateResult = resolveNumberValue(
    [readNumberValue(officialPayload, ['ibs_uf_rate', 'ibsUfRate'])],
    readNumberValue(legacyPayload, ['ibs_uf_rate', 'ibsUfRate'])
  )
  const ibsMunRateResult = resolveNumberValue(
    [readNumberValue(officialPayload, ['ibs_mun_rate', 'ibsMunRate'])],
    readNumberValue(legacyPayload, ['ibs_mun_rate', 'ibsMunRate'])
  )
  const cbsRateResult = resolveNumberValue(
    [readNumberValue(officialPayload, ['cbs_rate', 'cbsRate'])],
    readNumberValue(legacyPayload, ['cbs_rate', 'cbsRate'])
  )
  const rateResult = resolveNumberValue(
    [readNumberValue(officialPayload, ['rate', 'total_rate', 'totalRate'])],
    readNumberValue(legacyPayload, ['rate', 'total_rate', 'totalRate'])
  )
  const baseModeResult = resolveTextValue(
    [readTextValue(officialPayload, ['base_mode', 'baseMode'])],
    readTextValue(legacyPayload, ['base_mode', 'baseMode'])
  )
  const basePercentResult = resolveNumberValue(
    [readNumberValue(officialPayload, ['base_percent', 'basePercent'])],
    readNumberValue(legacyPayload, ['base_percent', 'basePercent'])
  )
  const baseReductionResult = resolveNumberValue(
    [readNumberValue(officialPayload, ['base_reduction_percent', 'baseReductionPercent', 'base_reduction_rate'])],
    readNumberValue(legacyPayload, ['base_reduction_percent', 'baseReductionPercent', 'base_reduction_rate'])
  )

  if (!cstResult.value) {
    readinessErrors.push('Nenhum CST de IBS/CBS foi resolvido para o item.')
  }

  if (!classificationResult.value) {
    readinessErrors.push('Nenhuma classificacao tributaria de IBS/CBS foi resolvida para o item.')
  }

  const hasAnyComponentRate =
    (ibsUfRateResult.value || 0) > 0
    || (ibsMunRateResult.value || 0) > 0
    || (cbsRateResult.value || 0) > 0
    || (rateResult.value || 0) > 0

  if (!hasAnyComponentRate) {
    readinessErrors.push('A base/versionamento IBS/CBS nao informa aliquotas de IBS UF, IBS Municipio ou CBS.')
  }

  return {
    target_uf: normalizeOptionalText(storeUf),
    cfop_config_id: cfopConfigId,
    impacts_ibscbs: true,
    configuration_status: cfopConfig?.configuration_status || null,
    base_id: baseId || null,
    base_code: base?.code || null,
    base_name: base?.name || null,
    version_id: versionId || null,
    version_label: version?.version_label || null,
    cst_catalog_version_id: cfopIbscbsConfig?.cst_catalog_version_id || null,
    cst_code: cstResult.value,
    classification_version_id: cfopIbscbsConfig?.classification_version_id || null,
    classification_code: classificationResult.value,
    regular_cst_code: regularCstResult.value,
    regular_classification_code: regularClassificationResult.value,
    presumed_credit_catalog_version_id: cfopIbscbsConfig?.presumed_credit_catalog_version_id || null,
    presumed_credit_code: presumedCreditCodeResult.value,
    presumed_credit_rate: presumedCreditRateResult.value,
    ibs_uf_rate: ibsUfRateResult.value,
    ibs_mun_rate: ibsMunRateResult.value,
    cbs_rate: cbsRateResult.value,
    rate: rateResult.value,
    base_mode: baseModeResult.value,
    base_percent: basePercentResult.value,
    base_reduction_percent: baseReductionResult.value,
    applied_rule_scope: rule.scope,
    legacy_payload_used: [
      cstResult.fromLegacy,
      classificationResult.fromLegacy,
      regularCstResult.fromLegacy,
      regularClassificationResult.fromLegacy,
      presumedCreditCodeResult.fromLegacy,
      presumedCreditRateResult.fromLegacy,
      ibsUfRateResult.fromLegacy,
      ibsMunRateResult.fromLegacy,
      cbsRateResult.fromLegacy,
      rateResult.fromLegacy,
      baseModeResult.fromLegacy,
      basePercentResult.fromLegacy,
      baseReductionResult.fromLegacy,
    ].some(Boolean),
    readiness_errors: dedupeStrings(readinessErrors),
  }
}

function resolveCfopConfigId(
  item: FiscalItemContext,
  operationDirection: 'outbound' | 'inbound'
) {
  if (item.applied_rule?.cfop_config_id) return item.applied_rule.cfop_config_id
  return operationDirection === 'inbound'
    ? item.tax_profile.default_input_cfop_config_id
    : item.tax_profile.default_output_cfop_config_id
}

function selectIbscbsRule(rules: IbscbsRuleSnapshot[], storeUf: string) {
  const normalizedStoreUf = normalizeOptionalText(storeUf)
  const stateRule = rules.find((rule) => normalizeOptionalText(rule.target_uf) === normalizedStoreUf) || null
  if (stateRule) return { rule: stateRule, scope: 'state' as const }

  const nationalRule = rules.find((rule) => !normalizeOptionalText(rule.target_uf)) || null
  if (nationalRule) return { rule: nationalRule, scope: 'national' as const }

  return { rule: null, scope: 'none' as const }
}

function extractLegacyIbsCbsPayload(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const raw = value || {}
  return asRecord(raw.ibscbs_config) || asRecord(raw.ibscbs) || {}
}

function mergePayloads(...values: Array<Record<string, unknown> | null | undefined>) {
  return values.reduce<Record<string, unknown>>((acc, current) => {
    const normalized = extractNestedIbscbsPayload(current)
    if (!normalized) return acc
    return { ...acc, ...normalized }
  }, {})
}

function extractNestedIbscbsPayload(value: Record<string, unknown> | null | undefined) {
  const record = asRecord(value)
  if (!record) return null
  return asRecord(record.ibscbs) || record
}

function resolveTextValue(officialCandidates: Array<string | null | undefined>, legacyValue: string | null) {
  for (const candidate of officialCandidates) {
    const normalized = normalizeOptionalText(candidate)
    if (normalized) {
      return { value: normalized, fromLegacy: false }
    }
  }

  return {
    value: normalizeOptionalText(legacyValue),
    fromLegacy: normalizeOptionalText(legacyValue) !== null,
  }
}

function resolveNumberValue(officialCandidates: Array<number | null | undefined>, legacyValue: number | null) {
  for (const candidate of officialCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return { value: candidate, fromLegacy: false }
    }
  }

  return {
    value: typeof legacyValue === 'number' && Number.isFinite(legacyValue) ? legacyValue : null,
    fromLegacy: typeof legacyValue === 'number' && Number.isFinite(legacyValue),
  }
}

function readTextValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeOptionalText(record[key])
    if (normalized) return normalized
  }

  return null
}

function readNumberValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = record[key]
    const numeric = typeof candidate === 'number' ? candidate : Number(candidate)
    if (Number.isFinite(numeric)) return numeric
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}
