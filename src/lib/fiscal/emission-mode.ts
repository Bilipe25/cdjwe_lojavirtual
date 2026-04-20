export type FiscalEmissionMode =
  | 'normal'
  | 'contingencia_scan'
  | 'contingencia_dpec'
  | 'contingencia_fsda'
  | 'contingencia_svcan'
  | 'contingencia_svcrs'

const LEGACY_MODE_MAP: Record<string, FiscalEmissionMode> = {
  '1': 'normal',
  '3': 'contingencia_scan',
  '4': 'contingencia_dpec',
  '5': 'contingencia_fsda',
  '6': 'contingencia_svcan',
  '7': 'contingencia_svcrs',
  normal: 'normal',
  contingencia_scan: 'contingencia_scan',
  contingencia_dpec: 'contingencia_dpec',
  contingencia_fsda: 'contingencia_fsda',
  contingencia_svcan: 'contingencia_svcan',
  contingencia_svcrs: 'contingencia_svcrs',
}

const TP_EMIS_MAP: Record<FiscalEmissionMode, 1 | 3 | 4 | 5 | 6 | 7> = {
  normal: 1,
  contingencia_scan: 3,
  contingencia_dpec: 4,
  contingencia_fsda: 5,
  contingencia_svcan: 6,
  contingencia_svcrs: 7,
}

export function normalizeFiscalEmissionMode(value: unknown): FiscalEmissionMode {
  const normalized = String(value || '').trim().toLowerCase()
  return LEGACY_MODE_MAP[normalized] || 'normal'
}

export function mapFiscalEmissionModeToTpEmis(value: unknown): 1 | 3 | 4 | 5 | 6 | 7 {
  const mode = normalizeFiscalEmissionMode(value)
  return TP_EMIS_MAP[mode]
}

export function isOperationalFiscalEmissionModeSupported(value: unknown): boolean {
  const mode = normalizeFiscalEmissionMode(value)
  return mode === 'normal' || mode === 'contingencia_svcan' || mode === 'contingencia_svcrs'
}

export function getUnsupportedFiscalEmissionModeMessage(value: unknown): string | null {
  const mode = normalizeFiscalEmissionMode(value)

  switch (mode) {
    case 'contingencia_scan':
      return 'O modo de emissao SCAN nao esta operacional no fluxo atual. Use Normal, SVC-AN ou SVC-RS.'
    case 'contingencia_dpec':
      return 'O modo de emissao DPEC nao esta operacional no fluxo atual. Use Normal, SVC-AN ou SVC-RS.'
    case 'contingencia_fsda':
      return 'O modo de emissao FS-DA nao esta operacional no fluxo atual. Use Normal, SVC-AN ou SVC-RS.'
    default:
      return null
  }
}

export function resolveEmissionAuthorizerOverride(value: unknown): 'SVAN' | 'SVRS' | null {
  const mode = normalizeFiscalEmissionMode(value)

  if (mode === 'contingencia_svcan') return 'SVAN'
  if (mode === 'contingencia_svcrs') return 'SVRS'
  return null
}
