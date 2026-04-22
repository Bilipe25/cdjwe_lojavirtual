import 'server-only'

import { createHash } from 'node:crypto'
import type { CompanyFiscalEnvironmentParams, FiscalTechnicalResponsibleConfig } from '@/lib/types'

export const DEFAULT_TECHNICAL_RESPONSIBLE_CONFIG: FiscalTechnicalResponsibleConfig = {
  enabled: false,
  cnpj: null,
  contato: null,
  email: null,
  fone: null,
  csrt_id: null,
  csrt_secret: null,
}

function normalizeText(value: string | null | undefined) {
  const normalized = (value || '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeDigits(value: string | null | undefined) {
  const digits = (value || '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

export function sanitizeTechnicalResponsibleConfig(
  value: Partial<FiscalTechnicalResponsibleConfig> | Record<string, unknown> | null | undefined
): FiscalTechnicalResponsibleConfig {
  const source = (value || {}) as Partial<FiscalTechnicalResponsibleConfig> & Record<string, unknown>
  return {
    enabled: source.enabled === true,
    cnpj: normalizeDigits(typeof source.cnpj === 'string' ? source.cnpj : null),
    contato: normalizeText(typeof source.contato === 'string' ? source.contato : null),
    email: normalizeText(typeof source.email === 'string' ? source.email : null),
    fone: normalizeDigits(typeof source.fone === 'string' ? source.fone : null),
    csrt_id: normalizeText(typeof source.csrt_id === 'string' ? source.csrt_id : null),
    csrt_secret: normalizeText(typeof source.csrt_secret === 'string' ? source.csrt_secret : null),
  }
}

export function parseTechnicalResponsibleConfig(
  params: CompanyFiscalEnvironmentParams | Record<string, unknown> | null | undefined
) {
  const source = (params || {}) as Record<string, unknown>
  return sanitizeTechnicalResponsibleConfig(
    source.responsavel_tecnico as Record<string, unknown> | undefined
  )
}

export interface TechnicalResponsibleTag {
  CNPJ: string
  xContato: string
  email: string
  fone?: string
  idCSRT?: string
  hashCSRT?: string
}

export function buildTechnicalResponsibleTag(params: {
  environmentParams?: CompanyFiscalEnvironmentParams | Record<string, unknown> | null
  chaveAcesso: string
}): TechnicalResponsibleTag | null {
  const config = parseTechnicalResponsibleConfig(params.environmentParams)
  if (!config.enabled || !config.cnpj || !config.contato || !config.email) {
    return null
  }

  const tag: TechnicalResponsibleTag = {
    CNPJ: config.cnpj,
    xContato: config.contato,
    email: config.email,
    ...(config.fone ? { fone: config.fone } : {}),
  }

  if (config.csrt_id && config.csrt_secret) {
    const hash = createHash('sha1')
      .update(`${config.csrt_secret}${params.chaveAcesso}`)
      .digest('base64')

    tag.idCSRT = config.csrt_id
    tag.hashCSRT = hash
  }

  return tag
}
