'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyFiscalEnvironment } from '@/lib/types'

export async function loadFiscalEnvironmentAction(): Promise<{ data: CompanyFiscalEnvironment | null; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('company_fiscal_environment')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (error) {
        return { data: null, error: `Erro ao carregar ambiente fiscal: ${error.message}` }
    }

    return { data: data as CompanyFiscalEnvironment | null, error: null }
}

interface SaveFiscalEnvironmentInput {
    id?: string
    ambiente: string
    serie_padrao_nfe: string
    proximo_numero_nfe: number
    tipo_emissao: string
    emissao_ativa: boolean
}

export async function saveFiscalEnvironmentAction(input: SaveFiscalEnvironmentInput): Promise<{ error: string | null }> {
    if (!input.ambiente || !['homologacao', 'producao'].includes(input.ambiente)) {
        return { error: 'Ambiente deve ser "homologacao" ou "producao".' }
    }

    if (!/^\d{1,3}$/.test(input.serie_padrao_nfe)) {
        return { error: 'Série deve ter entre 1 e 3 dígitos numéricos.' }
    }

    if (input.proximo_numero_nfe < 1) {
        return { error: 'Próximo número deve ser no mínimo 1.' }
    }

    const supabase = await createClient()

    const data = {
        ambiente: input.ambiente,
        serie_padrao_nfe: input.serie_padrao_nfe,
        proximo_numero_nfe: input.proximo_numero_nfe,
        tipo_emissao: input.tipo_emissao || 'normal',
        emissao_ativa: input.emissao_ativa,
        parametros_jsonb: {},
    }

    if (input.id) {
        const { error } = await supabase.from('company_fiscal_environment').update(data).eq('id', input.id)
        if (error) {
            console.error('Update fiscal environment error:', error)
            return { error: `Erro ao salvar ambiente fiscal: ${error.message}` }
        }
    } else {
        const { error } = await supabase.from('company_fiscal_environment').insert(data)
        if (error) {
            console.error('Insert fiscal environment error:', error)
            return { error: `Erro ao criar ambiente fiscal: ${error.message}` }
        }
    }

    return { error: null }
}
