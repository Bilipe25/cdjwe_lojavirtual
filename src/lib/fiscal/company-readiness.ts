'use server'

import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type FiscalReadinessStatus = 'ok' | 'missing' | 'warning'

export interface FiscalReadinessItem {
  key: string
  label: string
  status: FiscalReadinessStatus
  href: string
  detail?: string
  blocking: boolean
}

export interface FiscalReadinessSummary {
  items: FiscalReadinessItem[]
  completedCount: number
  totalCount: number
  blockingCount: number
  warningCount: number
  isReadyForEmission: boolean
  isReadyForProduction: boolean
}

function digitsOnly(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = digitsOnly(value)
  if (!cnpj || cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const calcDigit = (base: string, factors: number[]) => {
    const total = base
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * factors[index], 0)
    const remainder = total % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const base12 = cnpj.slice(0, 12)
  const digit1 = calcDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const digit2 = calcDigit(`${base12}${digit1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return cnpj === `${base12}${digit1}${digit2}`
}

function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isDateStringValid(value: string | null | undefined): boolean {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function isCertificateExpired(validTo: string | null | undefined): boolean {
  if (!isDateStringValid(validTo)) return false
  return new Date(validTo as string).getTime() <= Date.now()
}

function hasCompleteFiscalAddress(profile: Record<string, unknown> | null): boolean {
  if (!profile) return false

  return Boolean(
    profile.fiscal_address &&
      profile.fiscal_number &&
      profile.fiscal_neighborhood &&
      profile.fiscal_city &&
      profile.fiscal_state &&
      digitsOnly(profile.fiscal_zip_code as string).length === 8 &&
      typeof profile.fiscal_municipality_code_ibge === 'string' &&
      /^\d{7}$/.test(profile.fiscal_municipality_code_ibge)
  )
}

function hasCertificateMetadata(cert: Record<string, unknown> | null): boolean {
  if (!cert) return false

  return Boolean(
    cert.certificate_serial &&
      cert.certificate_issuer &&
      cert.valid_from &&
      cert.valid_to &&
      isDateStringValid(cert.valid_from as string) &&
      isDateStringValid(cert.valid_to as string)
  )
}

function hasParsedCertificateMetadata(cert: Record<string, unknown> | null): boolean {
  if (!cert) return false
  return cert.metadata_source === 'parsed_a1' && Boolean(cert.last_validated_at)
}

function hasStoredPassword(cert: Record<string, unknown> | null): boolean {
  if (!cert) return false
  return Boolean(cert.certificate_password_encrypted)
}

export async function evaluateCompanyFiscalReadiness(): Promise<FiscalReadinessSummary> {
  const supabase = await createClient()

  const [profileRes, envRes, certRes, federalRes, icmsLinksRes, ibscbsLinksRes] = await Promise.all([
    supabase.from('company_fiscal_profile').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('company_fiscal_environment').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('company_certificate_config').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('emitter_federal_tax_config').select('id').order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('emitter_icms_state_links').select('id').eq('is_active', true).limit(1),
    supabase.from('emitter_ibscbs_state_links').select('id, ibscbs_version_id').eq('is_active', true).limit(1),
  ])

  const profile = profileRes.data as Record<string, unknown> | null
  const env = envRes.data as Record<string, unknown> | null
  const cert = certRes.data as Record<string, unknown> | null

  const certExpired = isCertificateExpired(cert?.valid_to as string | null | undefined)
  const certificateReady =
    Boolean(cert?.is_active) &&
    cert?.certificate_status === 'active' &&
    Boolean(cert?.certificate_storage_path) &&
    hasStoredPassword(cert) &&
    hasCertificateMetadata(cert) &&
    hasParsedCertificateMetadata(cert) &&
    !certExpired

  const items: FiscalReadinessItem[] = [
    {
      key: 'company_identity',
      label: 'Dados básicos do emitente',
      status: profile?.razao_social && profile?.nome_fantasia !== undefined ? 'ok' : 'missing',
      href: '/admin/settings/fiscal-emitente',
      detail: profile?.razao_social ? undefined : 'Razão social ainda não foi definida.',
      blocking: true,
    },
    {
      key: 'cnpj',
      label: 'CNPJ válido',
      status: isValidCnpj(profile?.cnpj as string | null | undefined) ? 'ok' : 'missing',
      href: '/admin/settings/fiscal-emitente',
      detail: isValidCnpj(profile?.cnpj as string | null | undefined)
        ? undefined
        : 'O emitente precisa de um CNPJ com dígitos verificadores válidos.',
      blocking: true,
    },
    {
      key: 'ie_or_exempt',
      label: 'IE ou indicação de isenção',
      status:
        profile?.indicador_contribuinte === 'exempt'
          ? 'ok'
          : profile?.inscricao_estadual
            ? 'ok'
            : 'missing',
      href: '/admin/settings/fiscal-emitente',
      detail:
        profile?.indicador_contribuinte === 'exempt' || profile?.inscricao_estadual
          ? undefined
          : 'Informe a inscrição estadual ou marque o emitente como isento.',
      blocking: true,
    },
    {
      key: 'regime',
      label: 'Regime tributário e CRT coerentes',
      status:
        profile?.regime_tributario &&
        ((profile.regime_tributario === 'simples_nacional' && profile.crt === '1') ||
          (profile.regime_tributario === 'simples_excesso' && profile.crt === '2') ||
          ((profile.regime_tributario === 'lucro_presumido' || profile.regime_tributario === 'lucro_real') &&
            profile.crt === '3'))
          ? 'ok'
          : 'missing',
      href: '/admin/settings/fiscal-emitente',
      detail: 'Regime tributário e CRT precisam estar preenchidos e coerentes.',
      blocking: true,
    },
    {
      key: 'address',
      label: 'Endereço fiscal completo',
      status: hasCompleteFiscalAddress(profile) ? 'ok' : 'missing',
      href: '/admin/settings/fiscal-emitente',
      detail: hasCompleteFiscalAddress(profile)
        ? undefined
        : 'Preencha logradouro, número, bairro, cidade, UF, CEP e código IBGE.',
      blocking: true,
    },
    {
      key: 'fiscal_contact',
      label: 'Contato fiscal utilizável',
      status:
        profile?.fiscal_email && isValidEmail(profile.fiscal_email as string | null | undefined)
          ? 'ok'
          : 'warning',
      href: '/admin/settings/fiscal-emitente',
      detail: 'Um e-mail fiscal válido ajuda suporte, monitoramento e comunicação operacional.',
      blocking: false,
    },
    {
      key: 'tax_settings',
      label: 'Configurações fiscais do emitente revisadas',
      status:
        federalRes.data ||
        (icmsLinksRes.data && icmsLinksRes.data.length > 0) ||
        (ibscbsLinksRes.data && ibscbsLinksRes.data.some((row: Record<string, unknown>) => Boolean(row.ibscbs_version_id)))
          ? 'ok'
          : 'warning',
      href: '/admin/settings/fiscal-configuracoes',
      detail: 'Revise preferências fiscais corporativas e vínculos por UF, sempre com versão explícita de IBS/CBS.',
      blocking: false,
    },
    {
      key: 'environment',
      label: 'Ambiente de emissão configurado',
      status:
        env?.ambiente &&
        typeof env.serie_padrao_nfe === 'string' &&
        /^\d{1,3}$/.test(env.serie_padrao_nfe) &&
        typeof env.proximo_numero_nfe === 'number' &&
        env.proximo_numero_nfe >= 1 &&
        typeof env.tipo_emissao === 'string'
          ? 'ok'
          : 'missing',
      href: '/admin/settings/fiscal-ambiente',
      detail: 'Defina ambiente, série, próximo número e tipo de emissão.',
      blocking: true,
    },
    {
      key: 'certificate_upload',
      label: 'Certificado com arquivo e senha operacional',
      status: cert?.certificate_storage_path && hasStoredPassword(cert) ? 'ok' : 'missing',
      href: '/admin/settings/fiscal-certificado',
      detail: 'O certificado precisa de arquivo .pfx/.p12 e senha operacional armazenada com criptografia.',
      blocking: true,
    },
    {
      key: 'certificate_metadata',
      label: 'Metadados do certificado extraidos e validados',
      status:
        hasCertificateMetadata(cert) && hasParsedCertificateMetadata(cert)
          ? 'ok'
          : hasCertificateMetadata(cert)
            ? 'warning'
            : 'missing',
      href: '/admin/settings/fiscal-certificado',
      detail:
        hasCertificateMetadata(cert) && !hasParsedCertificateMetadata(cert)
          ? 'O certificado ainda precisa passar pela extracao automatica do arquivo A1 com a senha operacional.'
          : 'Serial, emissor e validade precisam ser extraidos automaticamente do certificado ativo.',
      blocking: true,
    },
    {
      key: 'certificate_active',
      label: 'Certificado ativo e dentro da validade',
      status: certificateReady ? 'ok' : certExpired ? 'warning' : 'missing',
      href: '/admin/settings/fiscal-certificado',
      detail: certExpired
        ? 'O certificado ativo expirou e precisa ser renovado.'
        : 'Ative um certificado válido antes de liberar emissão fiscal.',
      blocking: true,
    },
  ]

  // ─── Motor Fiscal readiness (GAP-11) ───────────
  const { count: productsWithTaxProfile } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('tax_profile_id', 'is', null)

  const hasProductsConfigured = (productsWithTaxProfile || 0) > 0

  items.push({
    key: 'products_tax_profile',
    label: 'Produtos com perfil fiscal vinculado',
    status: hasProductsConfigured ? 'ok' : 'missing',
    href: '/admin/products',
    detail: hasProductsConfigured
      ? `${productsWithTaxProfile} produto(s) com perfil fiscal configurado.`
      : 'Nenhum produto possui perfil fiscal vinculado. Configure pelo menos 1 produto para habilitar o Motor Fiscal.',
    blocking: true,
  })

  const cnaeValue = String(profile?.cnae_principal || '')
  const hasCnae = cnaeValue.length > 0 && /^\d{7}$/.test(cnaeValue)
  items.push({
    key: 'emitter_cnae',
    label: 'CNAE principal do emitente',
    status: hasCnae ? 'ok' : 'warning',
    href: '/admin/settings/fiscal-emitente',
    detail: hasCnae
      ? `CNAE: ${cnaeValue}`
      : 'CNAE principal nao informado. Recomendado para determinacao de obrigatoriedade de IPI e regras especiais.',
    blocking: false,
  })

  const completedCount = items.filter((item) => item.status === 'ok').length
  const blockingCount = items.filter((item) => item.blocking && item.status !== 'ok').length
  const warningCount = items.filter((item) => item.status === 'warning').length

  return {
    items,
    completedCount,
    totalCount: items.length,
    blockingCount,
    warningCount,
    isReadyForEmission: blockingCount === 0,
    isReadyForProduction: blockingCount === 0,
  }
}
