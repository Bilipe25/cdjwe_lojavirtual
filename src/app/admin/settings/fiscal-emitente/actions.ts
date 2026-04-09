'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyFiscalProfile } from '@/lib/types'

export async function loadFiscalProfileAction(): Promise<{ data: CompanyFiscalProfile | null; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('company_fiscal_profile')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (error) {
        return { data: null, error: `Erro ao carregar perfil fiscal: ${error.message}` }
    }

    return { data: data as CompanyFiscalProfile | null, error: null }
}

interface SaveFiscalProfileInput {
    id?: string
    razao_social: string
    nome_fantasia?: string | null
    cnpj: string
    inscricao_estadual?: string | null
    inscricao_municipal?: string | null
    regime_tributario?: string | null
    crt?: string | null
    cnae_principal?: string | null
    indicador_contribuinte: string
    fiscal_email?: string | null
    fiscal_phone?: string | null
    fiscal_address?: string | null
    fiscal_number?: string | null
    fiscal_complement?: string | null
    fiscal_neighborhood?: string | null
    fiscal_city?: string | null
    fiscal_state?: string | null
    fiscal_zip_code?: string | null
    fiscal_municipality_code_ibge?: string | null
    fiscal_country_code?: string | null
}

export async function saveFiscalProfileAction(input: SaveFiscalProfileInput): Promise<{ error: string | null }> {
    if (!input.razao_social || input.razao_social.trim().length < 3) {
        return { error: 'Razão Social é obrigatória (mínimo 3 caracteres).' }
    }

    const cnpjDigits = (input.cnpj || '').replace(/\D/g, '')
    if (cnpjDigits.length !== 14) {
        return { error: 'CNPJ deve ter 14 dígitos.' }
    }

    if (input.fiscal_state && !/^[A-Z]{2}$/.test(input.fiscal_state)) {
        return { error: 'UF fiscal inválida.' }
    }

    if (input.fiscal_municipality_code_ibge && !/^\d{7}$/.test(input.fiscal_municipality_code_ibge)) {
        return { error: 'Código IBGE do município deve ter 7 dígitos.' }
    }

    if (input.fiscal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.fiscal_email)) {
        return { error: 'Email fiscal inválido.' }
    }

    const supabase = await createClient()

    const data = {
        razao_social: input.razao_social.trim(),
        nome_fantasia: input.nome_fantasia || null,
        cnpj: cnpjDigits,
        inscricao_estadual: input.inscricao_estadual || null,
        inscricao_municipal: input.inscricao_municipal || null,
        regime_tributario: input.regime_tributario || null,
        crt: input.crt || null,
        cnae_principal: input.cnae_principal || null,
        indicador_contribuinte: input.indicador_contribuinte || 'contributor',
        fiscal_email: input.fiscal_email || null,
        fiscal_phone: input.fiscal_phone || null,
        fiscal_address: input.fiscal_address || null,
        fiscal_number: input.fiscal_number || null,
        fiscal_complement: input.fiscal_complement || null,
        fiscal_neighborhood: input.fiscal_neighborhood || null,
        fiscal_city: input.fiscal_city || null,
        fiscal_state: input.fiscal_state || null,
        fiscal_zip_code: input.fiscal_zip_code || null,
        fiscal_municipality_code_ibge: input.fiscal_municipality_code_ibge || null,
        fiscal_country_code: input.fiscal_country_code || '1058',
    }

    if (input.id) {
        const { error } = await supabase.from('company_fiscal_profile').update(data).eq('id', input.id)
        if (error) {
            console.error('Update fiscal profile error:', error)
            return { error: `Erro ao salvar perfil fiscal: ${error.message}` }
        }
    } else {
        const { error } = await supabase.from('company_fiscal_profile').insert(data)
        if (error) {
            console.error('Insert fiscal profile error:', error)
            return { error: `Erro ao criar perfil fiscal: ${error.message}` }
        }
    }

    // Sync razao_social / nome_fantasia to system_settings
    const { data: settings } = await supabase
        .from('system_settings')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (settings?.id) {
        await supabase.from('system_settings').update({
            razao_social: input.razao_social.trim(),
            nome_fantasia: input.nome_fantasia || null,
            cnpj: cnpjDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
        }).eq('id', settings.id)
    }

    return { error: null }
}
