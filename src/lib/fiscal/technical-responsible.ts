import 'server-only'

import { createHash } from 'node:crypto'
import type { CompanyFiscalEnvironmentParams } from '@/lib/types'
import { parseTechnicalResponsibleConfig } from './technical-responsible.shared'

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
