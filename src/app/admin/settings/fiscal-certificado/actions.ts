'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { CompanyCertificateConfig } from '@/lib/types'
import {
  decryptCertificatePassword,
  encryptCertificatePassword,
  fingerprintFile,
} from '@/lib/fiscal/certificate-security'
import { parseA1CertificateFromBuffer } from '@/lib/fiscal/certificate-parser'

function formatCertificateSecretActionError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback

  if (error.message.includes('Segredo do certificado nao configurado')) {
    return 'FISCAL_CERTIFICATE_SECRET nao esta configurado no ambiente. Defina essa variavel antes de salvar a senha operacional do certificado.'
  }

  if (error.message.includes('segredos configurados')) {
    return 'Nao foi possivel ler a senha operacional armazenada com os segredos atuais. Verifique FISCAL_CERTIFICATE_SECRET ou informe novamente a senha do certificado.'
  }

  if (error.message.includes('formato criptografado esperado')) {
    return 'A senha operacional armazenada do certificado esta em formato invalido. Informe novamente a senha do certificado e salve.'
  }

  return error.message || fallback
}

function normalizeCertificateStatus(input: {
  certificate_storage_path?: string | null
  valid_to?: string | null
  is_active: boolean
}): 'active' | 'expired' | 'pending' {
  if (!input.certificate_storage_path) return 'pending'

  if (input.valid_to) {
    const validTo = new Date(input.valid_to)
    if (!Number.isNaN(validTo.getTime()) && validTo.getTime() <= Date.now()) {
      return 'expired'
    }
  }

  return input.is_active ? 'active' : 'pending'
}

function sanitizeCertificateRecord(record: Record<string, unknown> | null): CompanyCertificateConfig | null {
  if (!record) return null

  const hasEncryptedPassword = Boolean(record.certificate_password_encrypted)
  const hasLegacyPasswordHash = !hasEncryptedPassword && Boolean(record.certificate_password_hash)
  const currentValidationNotes =
    typeof record.validation_notes === 'string' && record.validation_notes.trim()
      ? record.validation_notes.trim()
      : null
  const legacyPasswordNote = hasLegacyPasswordHash
    ? 'A senha operacional armazenada esta em formato legado. Informe novamente a senha do certificado e salve para concluir a migracao.'
    : null

  return {
    ...(record as unknown as CompanyCertificateConfig),
    has_stored_password: hasEncryptedPassword,
    validation_notes: [currentValidationNotes, legacyPasswordNote].filter(Boolean).join(' '),
    certificate_password_encrypted: undefined,
  }
}

async function downloadStoredCertificateFile(storagePath: string): Promise<Buffer> {
  const serviceRole = createServiceRoleClient()
  const { data, error } = await serviceRole.storage.from('certificates').download(storagePath)

  if (error || !data) {
    throw new Error('Nao foi possivel baixar o arquivo do certificado no armazenamento seguro.')
  }

  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function loadCertificateAction(): Promise<{ data: CompanyCertificateConfig | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('company_certificate_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { data: null, error: `Erro ao carregar certificado digital: ${error.message}` }
  }

  return {
    data: sanitizeCertificateRecord((data as Record<string, unknown> | null) || null),
    error: null,
  }
}

interface SaveCertificateInput {
  id?: string
  certificate_name?: string | null
  valid_from?: string | null
  valid_to?: string | null
  certificate_serial?: string | null
  certificate_issuer?: string | null
  certificate_storage_path?: string | null
  uploaded_file_name?: string | null
  certificate_fingerprint_sha256?: string | null
  certificate_password?: string | null
  is_active: boolean
  alert_days_before_expiry: number
}

export async function saveCertificateAction(
  input: SaveCertificateInput
): Promise<{ data: CompanyCertificateConfig | null; error: string | null }> {
  if (input.alert_days_before_expiry < 1 || input.alert_days_before_expiry > 365) {
    return { data: null, error: 'Os dias de alerta devem ficar entre 1 e 365.' }
  }

  const supabase = await createClient()
  const existing = input.id
    ? await supabase.from('company_certificate_config').select('*').eq('id', input.id).maybeSingle()
    : await supabase
      .from('company_certificate_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  if (existing.error) {
    return { data: null, error: `Erro ao carregar o certificado atual: ${existing.error.message}` }
  }

  const current = (existing.data as Record<string, unknown> | null) || null
  const hasLegacyPasswordHash =
    typeof current?.certificate_password_hash === 'string' && current.certificate_password_hash.trim().length > 0
  const normalizedPath = input.certificate_storage_path || null
  const rawPassword = input.certificate_password?.trim() || null
  let decryptedStoredPassword: string | null = null
  if (!rawPassword && typeof current?.certificate_password_encrypted === 'string') {
    try {
      decryptedStoredPassword = decryptCertificatePassword(current.certificate_password_encrypted)
    } catch (error) {
      return {
        data: null,
        error: formatCertificateSecretActionError(
          error,
          'Nao foi possivel ler a senha operacional armazenada do certificado.'
        ),
      }
    }
  }
  const operationalPassword = rawPassword || decryptedStoredPassword
  let encryptedPassword = (current?.certificate_password_encrypted as string | null) || null
  if (rawPassword) {
    try {
      encryptedPassword = encryptCertificatePassword(rawPassword)
    } catch (error) {
      return {
        data: null,
        error: formatCertificateSecretActionError(
          error,
          'Nao foi possivel proteger a senha operacional do certificado.'
        ),
      }
    }
  }

  if (normalizedPath && !encryptedPassword) {
    return {
      data: null,
      error: hasLegacyPasswordHash
        ? 'A senha operacional do certificado esta em formato legado. Informe novamente a senha do certificado e salve para concluir a migracao.'
        : 'Informe a senha do certificado para concluir o cadastro operacional.',
    }
  }

  let parsedMetadata:
    | {
        certificateName: string | null
        serial: string
        issuer: string
        subject: string | null
        validFrom: string
        validTo: string
        thumbprint: string | null
      }
    | null = null

  if (normalizedPath) {
    if (!operationalPassword) {
      return { data: null, error: 'A validacao do certificado A1 exige a senha operacional.' }
    }

    try {
      const fileBuffer = await downloadStoredCertificateFile(normalizedPath)
      const parsed = await parseA1CertificateFromBuffer(
        fileBuffer,
        operationalPassword,
        input.uploaded_file_name || (current?.uploaded_file_name as string | null) || 'certificado.pfx'
      )

      parsedMetadata = {
        certificateName:
          input.certificate_name?.trim() ||
          parsed.subjectCommonName ||
          (current?.certificate_name as string | null) ||
          null,
        serial: parsed.serialNumber,
        issuer: parsed.issuer,
        subject: parsed.subject || null,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo,
        thumbprint: parsed.thumbprint || null,
      }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Falha ao validar o certificado A1.',
      }
    }
  }

  const normalizedStatus = normalizeCertificateStatus({
    certificate_storage_path: normalizedPath,
    valid_to: parsedMetadata?.validTo || input.valid_to || null,
    is_active: input.is_active,
  })

  if (input.is_active) {
    if (!normalizedPath) {
      return { data: null, error: 'Envie o arquivo .pfx ou .p12 antes de ativar o certificado.' }
    }
    if (!encryptedPassword) {
      return { data: null, error: 'A ativacao do certificado exige uma senha operacional armazenada.' }
    }
    if (!parsedMetadata) {
      return { data: null, error: 'Valide o certificado A1 com a senha operacional antes de ativar.' }
    }
    if (normalizedStatus === 'expired') {
      const expiredAt = parsedMetadata?.validTo
        ? new Date(parsedMetadata.validTo).toLocaleDateString('pt-BR')
        : null
      return {
        data: null,
        error: expiredAt
          ? `O certificado A1 informado venceu em ${expiredAt} e nao pode ser ativado.`
          : 'Nao e possivel ativar um certificado expirado.',
      }
    }
  }

  const data = {
    certificate_name: parsedMetadata?.certificateName || input.certificate_name || null,
    certificate_status: normalizedStatus,
    valid_from: parsedMetadata?.validFrom || input.valid_from || null,
    valid_to: parsedMetadata?.validTo || input.valid_to || null,
    certificate_serial: parsedMetadata?.serial || input.certificate_serial || null,
    certificate_issuer: parsedMetadata?.issuer || input.certificate_issuer || null,
    certificate_subject: parsedMetadata?.subject || null,
    certificate_thumbprint: parsedMetadata?.thumbprint || null,
    metadata_source: parsedMetadata ? 'parsed_a1' : 'manual',
    certificate_storage_path: normalizedPath,
    uploaded_file_name: input.uploaded_file_name || null,
    certificate_fingerprint_sha256:
      input.certificate_fingerprint_sha256 ||
      (current?.certificate_fingerprint_sha256 as string | null) ||
      null,
    certificate_password_encrypted: encryptedPassword,
    is_active: input.is_active && normalizedStatus === 'active',
    alert_days_before_expiry: input.alert_days_before_expiry,
    validation_notes: normalizedPath
      ? parsedMetadata
        ? normalizedStatus === 'expired'
          ? 'Metadados do certificado A1 extraidos automaticamente, mas o certificado ja esta vencido.'
          : 'Metadados do certificado A1 extraidos automaticamente a partir do arquivo e da senha operacional.'
        : 'Arquivo operacional registrado, mas ainda sem validacao automatica concluida.'
      : 'Nenhum certificado operacional enviado.',
    last_validated_at: normalizedPath && parsedMetadata ? new Date().toISOString() : null,
  }

  const targetCertificateId = input.id || (current?.id as string | undefined) || null

  if (targetCertificateId) {
    const { error } = await supabase.from('company_certificate_config').update(data).eq('id', targetCertificateId)
    if (error) {
      return { data: null, error: `Erro ao salvar certificado digital: ${error.message}` }
    }
  } else {
    const { error } = await supabase.from('company_certificate_config').insert(data)
    if (error) {
      return { data: null, error: `Erro ao criar certificado digital: ${error.message}` }
    }
  }

  const saved = targetCertificateId
    ? await supabase.from('company_certificate_config').select('*').eq('id', targetCertificateId).maybeSingle()
    : await supabase
        .from('company_certificate_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  if (saved.error) {
    return {
      data: null,
      error: `Certificado salvo, mas houve falha ao recarregar os dados: ${saved.error.message}`,
    }
  }

  return {
    data: sanitizeCertificateRecord((saved.data as Record<string, unknown> | null) || null),
    error: null,
  }
}

export async function uploadCertificateAction(
  formData: FormData
): Promise<{
  path: string | null
  error: string | null
  fileName?: string | null
  fingerprintSha256?: string | null
}> {
  const file = formData.get('file') as File | null
  if (!file) return { path: null, error: 'Nenhum arquivo enviado.' }

  const allowedExtensions = ['.pfx', '.p12']
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '')
  if (!allowedExtensions.includes(ext)) {
    return { path: null, error: 'Formato invalido. Use um arquivo .pfx ou .p12.' }
  }

  // PKCS#12 files may arrive with several MIME types depending on the
  // browser / OS combination.  We accept all known variants and also
  // allow `application/octet-stream` (common generic fallback).
  const allowedMimeTypes = [
    'application/x-pkcs12',
    'application/pkcs12',
    'application/x-pem-file',
    'application/octet-stream',
  ]
  if (file.type && !allowedMimeTypes.includes(file.type.toLowerCase())) {
    return { path: null, error: 'Tipo de arquivo nao reconhecido. Envie um certificado .pfx ou .p12 valido.' }
  }

  if (file.size > 10 * 1024 * 1024) {
    return { path: null, error: 'Arquivo muito grande. O limite e de 10MB.' }
  }

  const supabase = await createClient()
  const fingerprintSha256 = await fingerprintFile(file)
  const filePath = `certificates/cert_${Date.now()}${ext}`

  const { error } = await supabase.storage.from('certificates').upload(filePath, file, { upsert: true })
  if (error) {
    return { path: null, error: 'Erro ao enviar o certificado para o armazenamento seguro.' }
  }

  return {
    path: filePath,
    error: null,
    fileName: file.name,
    fingerprintSha256,
  }
}
