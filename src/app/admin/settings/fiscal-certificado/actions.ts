'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyCertificateConfig } from '@/lib/types'

export async function loadCertificateAction(): Promise<{ data: CompanyCertificateConfig | null; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('company_certificate_config')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (error) {
        return { data: null, error: `Erro ao carregar certificado: ${error.message}` }
    }

    return { data: data as CompanyCertificateConfig | null, error: null }
}

interface SaveCertificateInput {
    id?: string
    certificate_name?: string | null
    certificate_status: string
    valid_from?: string | null
    valid_to?: string | null
    certificate_serial?: string | null
    certificate_issuer?: string | null
    certificate_storage_path?: string | null
    is_active: boolean
    alert_days_before_expiry: number
}

export async function saveCertificateAction(input: SaveCertificateInput): Promise<{ error: string | null }> {
    if (input.alert_days_before_expiry < 1 || input.alert_days_before_expiry > 365) {
        return { error: 'Dias de alerta deve estar entre 1 e 365.' }
    }

    const supabase = await createClient()

    const data = {
        certificate_name: input.certificate_name || null,
        certificate_status: input.certificate_status || 'pending',
        valid_from: input.valid_from || null,
        valid_to: input.valid_to || null,
        certificate_serial: input.certificate_serial || null,
        certificate_issuer: input.certificate_issuer || null,
        certificate_storage_path: input.certificate_storage_path || null,
        is_active: input.is_active,
        alert_days_before_expiry: input.alert_days_before_expiry,
    }

    if (input.id) {
        const { error } = await supabase.from('company_certificate_config').update(data).eq('id', input.id)
        if (error) {
            console.error('Update certificate error:', error)
            return { error: `Erro ao salvar certificado: ${error.message}` }
        }
    } else {
        const { error } = await supabase.from('company_certificate_config').insert(data)
        if (error) {
            console.error('Insert certificate error:', error)
            return { error: `Erro ao criar certificado: ${error.message}` }
        }
    }

    return { error: null }
}

export async function uploadCertificateAction(formData: FormData): Promise<{ path: string | null; error: string | null }> {
    const file = formData.get('file') as File | null
    if (!file) return { path: null, error: 'Nenhum arquivo enviado.' }

    const allowedExtensions = ['.pfx', '.p12']
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '')
    if (!allowedExtensions.includes(ext)) {
        return { path: null, error: 'Formato inválido. Use .pfx ou .p12.' }
    }

    if (file.size > 10 * 1024 * 1024) {
        return { path: null, error: 'Arquivo muito grande. Máximo 10MB.' }
    }

    const supabase = await createClient()
    const filePath = `certificates/cert_${Date.now()}${ext}`

    const { error } = await supabase.storage.from('certificates').upload(filePath, file, { upsert: true })
    if (error) return { path: null, error: 'Erro ao fazer upload do certificado.' }

    return { path: filePath, error: null }
}
