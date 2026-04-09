'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyFiscalProfile } from '@/lib/types'

function digitsOnly(value: string | null | undefined): string {
    return (value || '').replace(/\D/g, '')
}

function isValidCnpj(value: string | null | undefined): boolean {
    const cnpj = digitsOnly(value)
    if (!cnpj || cnpj.length !== 14) return false
    if (/^(\d)\1{13}$/.test(cnpj)) return false

    const calcDigit = (base: string, factors: number[]) => {
        const total = base.split('').reduce((sum, digit, index) => sum + Number(digit) * factors[index], 0)
        const remainder = total % 11
        return remainder < 2 ? 0 : 11 - remainder
    }

    const base12 = cnpj.slice(0, 12)
    const digit1 = calcDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    const digit2 = calcDigit(`${base12}${digit1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

    return cnpj === `${base12}${digit1}${digit2}`
}

export async function loadFiscalProfileAction(): Promise<{ data: CompanyFiscalProfile | null; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('company_fiscal_profile')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (error) {
        return { data: null, error: `Erro ao carregar dados do emitente: ${error.message}` }
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
        return { error: 'Razão social é obrigatória e deve ter pelo menos 3 caracteres.' }
    }

    const cnpjDigits = digitsOnly(input.cnpj)
    if (!isValidCnpj(cnpjDigits)) {
        return { error: 'Informe um CNPJ válido para o emitente.' }
    }

    if (input.indicador_contribuinte === 'contributor' && !input.inscricao_estadual?.trim()) {
        return { error: 'Inscrição estadual é obrigatória para emitente contribuinte do ICMS.' }
    }

    if (input.fiscal_state && !/^[A-Z]{2}$/.test(input.fiscal_state)) {
        return { error: 'UF fiscal inválida.' }
    }

    if (input.fiscal_municipality_code_ibge && !/^\d{7}$/.test(input.fiscal_municipality_code_ibge)) {
        return { error: 'Código IBGE do município deve ter 7 dígitos.' }
    }

    const zipDigits = digitsOnly(input.fiscal_zip_code)
    if (zipDigits && zipDigits.length !== 8) {
        return { error: 'CEP fiscal inválido. Use 8 dígitos.' }
    }

    if (input.cnae_principal && !/^\d{4}-\d\/\d{2}$/.test(input.cnae_principal)) {
        return { error: 'CNAE principal inválido. Use o formato 0000-0/00.' }
    }

    if (input.inscricao_estadual && input.indicador_contribuinte !== 'exempt') {
        const ieNormalized = input.inscricao_estadual.replace(/[^A-Za-z0-9]/g, '')
        if (ieNormalized.length < 2) {
            return { error: 'Inscrição estadual inválida.' }
        }
    }

    if (input.inscricao_estadual && input.indicador_contribuinte === 'exempt' && input.inscricao_estadual.toUpperCase() !== 'ISENTO') {
        return { error: 'Quando o emitente for isento, use IE como ISENTO ou deixe o campo em branco.' }
    }

    if (input.fiscal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.fiscal_email)) {
        return { error: 'Email fiscal inválido.' }
    }

    if (
        input.regime_tributario &&
        !(
            (input.regime_tributario === 'simples_nacional' && input.crt === '1') ||
            (input.regime_tributario === 'simples_excesso' && input.crt === '2') ||
            ((input.regime_tributario === 'lucro_presumido' || input.regime_tributario === 'lucro_real') &&
                input.crt === '3')
        )
    ) {
        return { error: 'Regime tributário e CRT do emitente estão incoerentes.' }
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
            return { error: `Erro ao salvar dados do emitente: ${error.message}` }
        }
    } else {
        const { error } = await supabase.from('company_fiscal_profile').insert(data)
        if (error) {
            return { error: `Erro ao criar dados do emitente: ${error.message}` }
        }
    }

    const { data: settings } = await supabase
        .from('system_settings')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (settings?.id) {
        await supabase
            .from('system_settings')
            .update({
                razao_social: input.razao_social.trim(),
                nome_fantasia: input.nome_fantasia || null,
                cnpj: cnpjDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
            })
            .eq('id', settings.id)
    }

    return { error: null }
}
