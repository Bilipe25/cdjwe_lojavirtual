'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyCertificateConfig } from '@/lib/types'
import {
  encryptCertificatePassword,
  fingerprintFile,
} from '@/lib/fiscal/certificate-security'

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

export async function loadCertificateAction(): Promise<{ data: CompanyCertificateConfig | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('company_certificate_config')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { data: null, error: `Erro ao carregar certificado digital: ${error.message}` }
  }

  if (!data) return { data: null, error: null }

  return {
    data: {
      ...(data as CompanyCertificateConfig),
      has_stored_password: Boolean((data as Record<string, unknown>).certificate_password_encrypted),
      certificate_password_encrypted: undefined,
    },
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

export async function saveCertificateAction(input: SaveCertificateInput): Promise<{ error: string | null }> {
  if (input.alert_days_before_expiry < 1 || input.alert_days_before_expiry > 365) {
    return { error: 'Os dias de alerta devem ficar entre 1 e 365.' }
  }

  if (input.valid_from && Number.isNaN(new Date(input.valid_from).getTime())) {
    return { error: 'Data inicial de validade inválida.' }
  }

  if (input.valid_to && Number.isNaN(new Date(input.valid_to).getTime())) {
    return { error: 'Data final de validade inválida.' }
  }

  if (input.valid_from && input.valid_to && new Date(input.valid_to) < new Date(input.valid_from)) {
    return { error: 'A validade final do certificado deve ser posterior à validade inicial.' }
  }

  const supabase = await createClient()
  const existing = input.id
    ? await supabase
        .from('company_certificate_config')
        .select('*')
        .eq('id', input.id)
        .maybeSingle()
    : { data: null, error: null }

  if (existing.error) {
    return { error: `Erro ao carregar o certificado atual: ${existing.error.message}` }
  }

  const current = existing.data as Record<string, unknown> | null
  const encryptedPassword =
    input.certificate_password && input.certificate_password.trim()
      ? encryptCertificatePassword(input.certificate_password.trim())
      : (current?.certificate_password_encrypted as string | null) || null

  const normalizedPath = input.certificate_storage_path || null
  const normalizedStatus = normalizeCertificateStatus({
    certificate_storage_path: normalizedPath,
    valid_to: input.valid_to || null,
    is_active: input.is_active,
  })

  if (normalizedPath && !encryptedPassword) {
    return { error: 'Informe a senha do certificado para concluir o cadastro operacional.' }
  }

  if (input.is_active) {
    if (!normalizedPath) {
      return { error: 'Envie o arquivo .pfx ou .p12 antes de ativar o certificado.' }
    }
    if (!encryptedPassword) {
      return { error: 'A ativação do certificado exige uma senha operacional armazenada.' }
    }
    if (!input.certificate_serial || !input.certificate_issuer || !input.valid_from || !input.valid_to) {
      return { error: 'Preencha serial, emissor e validade antes de ativar o certificado.' }
    }
    if (normalizedStatus === 'expired') {
      return { error: 'Não é possível ativar um certificado expirado.' }
    }
  }

  const data = {
    certificate_name: input.certificate_name || null,
    certificate_status: normalizedStatus,
    valid_from: input.valid_from || null,
    valid_to: input.valid_to || null,
    certificate_serial: input.certificate_serial || null,
    certificate_issuer: input.certificate_issuer || null,
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
      ? 'Arquivo e senha operacional registrados. Confira os metadados do certificado antes de habilitar emissão em produção.'
      : 'Nenhum certificado operacional enviado.',
    last_validated_at: normalizedPath ? new Date().toISOString() : null,
  }

  if (input.id) {
    const { error } = await supabase.from('company_certificate_config').update(data).eq('id', input.id)
    if (error) {
      return { error: `Erro ao salvar certificado digital: ${error.message}` }
    }
  } else {
    const { error } = await supabase.from('company_certificate_config').insert(data)
    if (error) {
      return { error: `Erro ao criar certificado digital: ${error.message}` }
    }
  }

  return { error: null }
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
    return { path: null, error: 'Formato inválido. Use um arquivo .pfx ou .p12.' }
  }

  if (file.size > 10 * 1024 * 1024) {
    return { path: null, error: 'Arquivo muito grande. O limite é de 10MB.' }
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
