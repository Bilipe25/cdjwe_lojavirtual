'use server'

import { createClient } from '@/lib/supabase/server'
import type {
    EmitterFederalTaxConfig,
    EmitterIcmsStateLink,
    EmitterIbscbsStateLink,
} from '@/lib/types'

// ====== FEDERAL TAX CONFIG ======

export async function loadEmitterFederalTaxConfig(): Promise<{
    data: EmitterFederalTaxConfig | null
    error: string | null
}> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('emitter_federal_tax_config')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (error) {
        return { data: null, error: `Erro ao carregar configuração federal: ${error.message}` }
    }
    return { data: data as EmitterFederalTaxConfig | null, error: null }
}

interface SaveFederalTaxInput {
    id?: string
    aliquota_pis: number | null
    aliquota_cofins: number | null
    artigo_sc_mva: string | null
    exibir_total_tributos: boolean
    credito_presumido_icms: boolean
    ultrapassou_sublimite: boolean
}

export async function saveEmitterFederalTaxConfig(
    input: SaveFederalTaxInput
): Promise<{ error: string | null }> {
    if (input.aliquota_pis !== null && (input.aliquota_pis < 0 || input.aliquota_pis > 100)) {
        return { error: 'Alíquota PIS deve estar entre 0 e 100.' }
    }
    if (input.aliquota_cofins !== null && (input.aliquota_cofins < 0 || input.aliquota_cofins > 100)) {
        return { error: 'Alíquota COFINS deve estar entre 0 e 100.' }
    }

    const supabase = await createClient()
    const payload = {
        aliquota_pis: input.aliquota_pis ?? 0,
        aliquota_cofins: input.aliquota_cofins ?? 0,
        artigo_sc_mva: input.artigo_sc_mva || 'nenhum',
        exibir_total_tributos: input.exibir_total_tributos,
        credito_presumido_icms: input.credito_presumido_icms,
        ultrapassou_sublimite: input.ultrapassou_sublimite,
    }

    if (input.id) {
        const { error } = await supabase
            .from('emitter_federal_tax_config')
            .update(payload)
            .eq('id', input.id)
        if (error) return { error: `Erro ao salvar: ${error.message}` }
    } else {
        const { error } = await supabase
            .from('emitter_federal_tax_config')
            .insert(payload)
        if (error) return { error: `Erro ao criar: ${error.message}` }
    }

    return { error: null }
}

// ====== ICMS STATE LINKS ======

export async function loadEmitterIcmsLinks(): Promise<{
    data: EmitterIcmsStateLink[]
    error: string | null
}> {
    const supabase = await createClient()

    const { data: links, error } = await supabase
        .from('emitter_icms_state_links')
        .select('*')
        .eq('is_active', true)
        .order('target_uf', { ascending: true, nullsFirst: true })

    if (error) {
        return { data: [], error: `Erro ao carregar vínculos ICMS: ${error.message}` }
    }

    if (!links || links.length === 0) {
        return { data: [], error: null }
    }

    // Fetch base info for each link
    const baseIds = [...new Set((links as EmitterIcmsStateLink[]).map((l) => l.icms_base_id))]
    const { data: bases } = await supabase
        .from('fiscal_icms_bases')
        .select('id, name, code')
        .in('id', baseIds)

    // Fetch national CST for each base
    const { data: rules } = await supabase
        .from('fiscal_icms_rules')
        .select('icms_base_id, cst_code')
        .in('icms_base_id', baseIds)
        .is('target_uf', null)

    const basesMap = new Map((bases || []).map((b: Record<string, unknown>) => [b.id as string, b]))
    const rulesMap = new Map((rules || []).map((r: Record<string, unknown>) => [r.icms_base_id as string, r]))

    const enriched: EmitterIcmsStateLink[] = (links as EmitterIcmsStateLink[]).map((link) => {
        const base = basesMap.get(link.icms_base_id)
        const rule = rulesMap.get(link.icms_base_id)
        return {
            ...link,
            icms_base_name: (base?.name as string) || '',
            icms_base_code: (base?.code as string) || '',
            icms_national_cst: (rule?.cst_code as string) || '',
        }
    })

    return { data: enriched, error: null }
}

interface SaveIcmsLinkInput {
    id?: string
    target_uf: string | null
    icms_base_id: string
}

export async function saveEmitterIcmsLink(
    input: SaveIcmsLinkInput
): Promise<{ error: string | null }> {
    if (input.target_uf && !/^[A-Z]{2}$/.test(input.target_uf)) {
        return { error: 'UF inválida.' }
    }
    if (!input.icms_base_id) {
        return { error: 'Selecione uma base de ICMS.' }
    }

    const supabase = await createClient()

    if (input.id) {
        const { error } = await supabase
            .from('emitter_icms_state_links')
            .update({
                target_uf: input.target_uf || null,
                icms_base_id: input.icms_base_id,
            })
            .eq('id', input.id)
        if (error) return { error: `Erro ao atualizar vínculo: ${error.message}` }
    } else {
        const { error } = await supabase
            .from('emitter_icms_state_links')
            .insert({
                target_uf: input.target_uf || null,
                icms_base_id: input.icms_base_id,
                is_active: true,
            })
        if (error) {
            if (error.message?.includes('uq_emitter_icms_state_links_uf')) {
                return { error: 'Já existe um vínculo ICMS para esta UF.' }
            }
            return { error: `Erro ao criar vínculo: ${error.message}` }
        }
    }

    return { error: null }
}

export async function deleteEmitterIcmsLink(id: string): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { error } = await supabase
        .from('emitter_icms_state_links')
        .delete()
        .eq('id', id)
    if (error) return { error: `Erro ao remover vínculo: ${error.message}` }
    return { error: null }
}

// ====== IBS/CBS STATE LINKS ======

export async function loadEmitterIbscbsLinks(): Promise<{
    data: EmitterIbscbsStateLink[]
    error: string | null
}> {
    const supabase = await createClient()

    const { data: links, error } = await supabase
        .from('emitter_ibscbs_state_links')
        .select('*')
        .eq('is_active', true)
        .order('target_uf', { ascending: true, nullsFirst: true })

    if (error) {
        return { data: [], error: `Erro ao carregar vínculos IBS/CBS: ${error.message}` }
    }

    if (!links || links.length === 0) {
        return { data: [], error: null }
    }

    const baseIds = [...new Set((links as EmitterIbscbsStateLink[]).map((l) => l.ibscbs_base_id))]
    const { data: bases } = await supabase
        .from('fiscal_ibscbs_bases')
        .select('id, name, code')
        .in('id', baseIds)

    // Fetch active version + national rule for each base
    const { data: versions } = await supabase
        .from('fiscal_ibscbs_base_versions')
        .select('id, ibscbs_base_id')
        .in('ibscbs_base_id', baseIds)
        .eq('status', 'active')

    const versionIds = (versions || []).map((v: Record<string, unknown>) => v.id as string)
    const { data: ibsRules } = versionIds.length
        ? await supabase
              .from('fiscal_ibscbs_rules')
              .select('ibscbs_version_id, cst_code, classification_code')
              .in('ibscbs_version_id', versionIds)
              .is('target_uf', null)
        : { data: [] }

    const basesMap = new Map((bases || []).map((b: Record<string, unknown>) => [b.id as string, b]))
    const versionsMap = new Map(
        (versions || []).map((v: Record<string, unknown>) => [v.ibscbs_base_id as string, v])
    )
    const ibsRulesMap = new Map(
        (ibsRules || []).map((r: Record<string, unknown>) => [r.ibscbs_version_id as string, r])
    )

    const enriched: EmitterIbscbsStateLink[] = (links as EmitterIbscbsStateLink[]).map((link) => {
        const base = basesMap.get(link.ibscbs_base_id)
        const version = versionsMap.get(link.ibscbs_base_id)
        const rule = version ? ibsRulesMap.get(version.id as string) : null
        return {
            ...link,
            ibscbs_base_name: (base?.name as string) || '',
            ibscbs_base_code: (base?.code as string) || '',
            ibscbs_national_cst: (rule?.cst_code as string) || '',
            ibscbs_classification_code: (rule?.classification_code as string) || '',
        }
    })

    return { data: enriched, error: null }
}

interface SaveIbscbsLinkInput {
    id?: string
    target_uf: string | null
    ibscbs_base_id: string
    ibscbs_version_id?: string | null
}

export async function saveEmitterIbscbsLink(
    input: SaveIbscbsLinkInput
): Promise<{ error: string | null }> {
    if (input.target_uf && !/^[A-Z]{2}$/.test(input.target_uf)) {
        return { error: 'UF inválida.' }
    }
    if (!input.ibscbs_base_id) {
        return { error: 'Selecione uma base IBS/CBS.' }
    }

    const supabase = await createClient()

    if (input.id) {
        const { error } = await supabase
            .from('emitter_ibscbs_state_links')
            .update({
                target_uf: input.target_uf || null,
                ibscbs_base_id: input.ibscbs_base_id,
                ibscbs_version_id: input.ibscbs_version_id || null,
            })
            .eq('id', input.id)
        if (error) return { error: `Erro ao atualizar vínculo: ${error.message}` }
    } else {
        const { error } = await supabase
            .from('emitter_ibscbs_state_links')
            .insert({
                target_uf: input.target_uf || null,
                ibscbs_base_id: input.ibscbs_base_id,
                ibscbs_version_id: input.ibscbs_version_id || null,
                is_active: true,
            })
        if (error) {
            if (error.message?.includes('uq_emitter_ibscbs_state_links_uf')) {
                return { error: 'Já existe um vínculo IBS/CBS para esta UF.' }
            }
            return { error: `Erro ao criar vínculo: ${error.message}` }
        }
    }

    return { error: null }
}

export async function deleteEmitterIbscbsLink(id: string): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { error } = await supabase
        .from('emitter_ibscbs_state_links')
        .delete()
        .eq('id', id)
    if (error) return { error: `Erro ao remover vínculo: ${error.message}` }
    return { error: null }
}

// ====== OPTIONS LOADERS (for dialogs) ======

export interface IcmsBaseOption {
    id: string
    name: string
    code: string
    isActive: boolean
}

export async function loadIcmsBaseOptions(): Promise<{
    data: IcmsBaseOption[]
    error: string | null
}> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('fiscal_icms_bases')
        .select('id, name, code, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })

    if (error) return { data: [], error: error.message }
    return {
        data: (data || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.name as string,
            code: row.code as string,
            isActive: row.is_active as boolean,
        })),
        error: null,
    }
}

export interface IbscbsBaseOption {
    id: string
    name: string
    code: string
    isActive: boolean
}

export async function loadIbscbsBaseOptions(): Promise<{
    data: IbscbsBaseOption[]
    error: string | null
}> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('fiscal_ibscbs_bases')
        .select('id, name, code, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })

    if (error) return { data: [], error: error.message }
    return {
        data: (data || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.name as string,
            code: row.code as string,
            isActive: row.is_active as boolean,
        })),
        error: null,
    }
}
