'use server'

import { createClient } from '@/lib/supabase/server'
import type {
    EmitterIbscbsStateLink,
    EmitterIcmsStateLink,
    EmitterTaxPreferencesConfig,
} from '@/lib/types'

export async function loadEmitterFederalTaxConfig(): Promise<{
    data: EmitterTaxPreferencesConfig | null
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
        return { data: null, error: `Erro ao carregar preferências fiscais do emitente: ${error.message}` }
    }

    return { data: data as EmitterTaxPreferencesConfig | null, error: null }
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
        return { error: 'Alíquota de PIS deve estar entre 0 e 100.' }
    }
    if (input.aliquota_cofins !== null && (input.aliquota_cofins < 0 || input.aliquota_cofins > 100)) {
        return { error: 'Alíquota de COFINS deve estar entre 0 e 100.' }
    }

    const supabase = await createClient()
    const { data: fiscalProfile } = await supabase
        .from('company_fiscal_profile')
        .select('regime_tributario')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (
        input.ultrapassou_sublimite &&
        fiscalProfile?.regime_tributario &&
        !['simples_nacional', 'simples_excesso'].includes(fiscalProfile.regime_tributario as string)
    ) {
        return { error: 'O flag de sublimite só pode ser usado para emitentes enquadrados no Simples Nacional.' }
    }

    const payload = {
        aliquota_pis: input.aliquota_pis ?? 0,
        aliquota_cofins: input.aliquota_cofins ?? 0,
        artigo_sc_mva: input.artigo_sc_mva || 'nenhum',
        exibir_total_tributos: input.exibir_total_tributos,
        credito_presumido_icms: input.credito_presumido_icms,
        ultrapassou_sublimite: input.ultrapassou_sublimite,
    }

    if (input.id) {
        const { error } = await supabase.from('emitter_federal_tax_config').update(payload).eq('id', input.id)
        if (error) return { error: `Erro ao salvar preferências fiscais: ${error.message}` }
    } else {
        const { error } = await supabase.from('emitter_federal_tax_config').insert(payload)
        if (error) return { error: `Erro ao criar preferências fiscais: ${error.message}` }
    }

    return { error: null }
}

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
        return { data: [], error: `Erro ao carregar vínculos de ICMS: ${error.message}` }
    }

    if (!links || links.length === 0) {
        return { data: [], error: null }
    }

    const baseIds = [...new Set((links as EmitterIcmsStateLink[]).map((link) => link.icms_base_id))]

    const [{ data: bases }, { data: rules }] = await Promise.all([
        supabase.from('fiscal_icms_bases').select('id, name, code').in('id', baseIds),
        supabase
            .from('fiscal_icms_rules')
            .select('icms_base_id, cst_code')
            .in('icms_base_id', baseIds)
            .is('target_uf', null),
    ])

    const baseMap = new Map((bases || []).map((row: Record<string, unknown>) => [row.id as string, row]))
    const ruleMap = new Map((rules || []).map((row: Record<string, unknown>) => [row.icms_base_id as string, row]))

    return {
        data: (links as EmitterIcmsStateLink[]).map((link) => ({
            ...link,
            icms_base_name: (baseMap.get(link.icms_base_id)?.name as string) || '',
            icms_base_code: (baseMap.get(link.icms_base_id)?.code as string) || '',
            icms_national_cst: (ruleMap.get(link.icms_base_id)?.cst_code as string) || '',
        })),
        error: null,
    }
}

interface SaveIcmsLinkInput {
    id?: string
    target_uf: string | null
    icms_base_id: string
}

export async function saveEmitterIcmsLink(input: SaveIcmsLinkInput): Promise<{ error: string | null }> {
    if (input.target_uf && !/^[A-Z]{2}$/.test(input.target_uf)) {
        return { error: 'UF inválida.' }
    }
    if (!input.icms_base_id) {
        return { error: 'Selecione uma base de ICMS.' }
    }

    const supabase = await createClient()
    const { data: base, error: baseError } = await supabase
        .from('fiscal_icms_bases')
        .select('id, is_active')
        .eq('id', input.icms_base_id)
        .maybeSingle()

    if (baseError) {
        return { error: `Erro ao validar a base de ICMS: ${baseError.message}` }
    }
    if (!base) {
        return { error: 'A base de ICMS selecionada não foi encontrada.' }
    }
    if (!base.is_active) {
        return { error: 'A base de ICMS selecionada está inativa para novos vínculos.' }
    }

    if (input.id) {
        const { error } = await supabase
            .from('emitter_icms_state_links')
            .update({
                target_uf: input.target_uf || null,
                icms_base_id: input.icms_base_id,
            })
            .eq('id', input.id)
        if (error) return { error: `Erro ao atualizar vínculo de ICMS: ${error.message}` }
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
                return { error: 'Já existe um vínculo de ICMS para esta UF.' }
            }
            return { error: `Erro ao criar vínculo de ICMS: ${error.message}` }
        }
    }

    return { error: null }
}

export async function deleteEmitterIcmsLink(id: string): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { error } = await supabase.from('emitter_icms_state_links').delete().eq('id', id)
    if (error) return { error: `Erro ao remover vínculo de ICMS: ${error.message}` }
    return { error: null }
}

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
        return { data: [], error: `Erro ao carregar vínculos de IBS/CBS: ${error.message}` }
    }

    if (!links || links.length === 0) {
        return { data: [], error: null }
    }

    const baseIds = [...new Set((links as EmitterIbscbsStateLink[]).map((link) => link.ibscbs_base_id))]
    const versionIds = [
        ...new Set(
            (links as EmitterIbscbsStateLink[])
                .map((link) => link.ibscbs_version_id)
                .filter((value): value is string => Boolean(value))
        ),
    ]

    const [{ data: bases }, { data: versions }, { data: rules }] = await Promise.all([
        supabase.from('fiscal_ibscbs_bases').select('id, name, code').in('id', baseIds),
        versionIds.length
            ? supabase
                  .from('fiscal_ibscbs_base_versions')
                  .select('id, ibscbs_base_id, version_label, valid_from, valid_to')
                  .in('id', versionIds)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
        versionIds.length
            ? supabase
                  .from('fiscal_ibscbs_rules')
                  .select('ibscbs_version_id, cst_code, classification_code')
                  .in('ibscbs_version_id', versionIds)
                  .is('target_uf', null)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ])

    const baseMap = new Map((bases || []).map((row: Record<string, unknown>) => [row.id as string, row]))
    const versionMap = new Map((versions || []).map((row: Record<string, unknown>) => [row.id as string, row]))
    const ruleMap = new Map((rules || []).map((row: Record<string, unknown>) => [row.ibscbs_version_id as string, row]))

    return {
        data: (links as EmitterIbscbsStateLink[]).map((link) => {
            const base = baseMap.get(link.ibscbs_base_id)
            const version = link.ibscbs_version_id ? versionMap.get(link.ibscbs_version_id) : null
            const rule = link.ibscbs_version_id ? ruleMap.get(link.ibscbs_version_id) : null

            return {
                ...link,
                ibscbs_base_name: (base?.name as string) || '',
                ibscbs_base_code: (base?.code as string) || '',
                ibscbs_national_cst: (rule?.cst_code as string) || '',
                ibscbs_classification_code: (rule?.classification_code as string) || '',
                ibscbs_version_label: (version?.version_label as string) || '',
                ibscbs_valid_from: (version?.valid_from as string | null) || null,
                ibscbs_valid_to: (version?.valid_to as string | null) || null,
            }
        }),
        error: null,
    }
}

interface SaveIbscbsLinkInput {
    id?: string
    target_uf: string | null
    ibscbs_base_id: string
    ibscbs_version_id: string | null
}

export async function saveEmitterIbscbsLink(input: SaveIbscbsLinkInput): Promise<{ error: string | null }> {
    if (input.target_uf && !/^[A-Z]{2}$/.test(input.target_uf)) {
        return { error: 'UF inválida.' }
    }
    if (!input.ibscbs_base_id) {
        return { error: 'Selecione uma base de IBS/CBS.' }
    }
    if (!input.ibscbs_version_id) {
        return { error: 'Selecione uma versão ativa da base de IBS/CBS.' }
    }

    const supabase = await createClient()

    const { data: base, error: baseError } = await supabase
        .from('fiscal_ibscbs_bases')
        .select('id, is_active')
        .eq('id', input.ibscbs_base_id)
        .maybeSingle()

    if (baseError) {
        return { error: `Erro ao validar a base de IBS/CBS: ${baseError.message}` }
    }
    if (!base) {
        return { error: 'A base de IBS/CBS selecionada não foi encontrada.' }
    }
    if (!base.is_active) {
        return { error: 'A base de IBS/CBS selecionada está inativa para novos vínculos.' }
    }

    const { data: version, error: versionError } = await supabase
        .from('fiscal_ibscbs_base_versions')
        .select('id, ibscbs_base_id, status')
        .eq('id', input.ibscbs_version_id)
        .maybeSingle()

    if (versionError) {
        return { error: `Erro ao validar a versão de IBS/CBS: ${versionError.message}` }
    }
    if (!version || version.ibscbs_base_id !== input.ibscbs_base_id) {
        return { error: 'A versão selecionada não pertence à base de IBS/CBS informada.' }
    }
    if (version.status !== 'active') {
        return { error: 'Somente versões ativas de IBS/CBS podem ser vinculadas ao emitente.' }
    }

    if (input.id) {
        const { error } = await supabase
            .from('emitter_ibscbs_state_links')
            .update({
                target_uf: input.target_uf || null,
                ibscbs_base_id: input.ibscbs_base_id,
                ibscbs_version_id: input.ibscbs_version_id,
            })
            .eq('id', input.id)
        if (error) return { error: `Erro ao atualizar vínculo de IBS/CBS: ${error.message}` }
    } else {
        const { error } = await supabase
            .from('emitter_ibscbs_state_links')
            .insert({
                target_uf: input.target_uf || null,
                ibscbs_base_id: input.ibscbs_base_id,
                ibscbs_version_id: input.ibscbs_version_id,
                is_active: true,
            })
        if (error) {
            if (error.message?.includes('uq_emitter_ibscbs_state_links_uf')) {
                return { error: 'Já existe um vínculo de IBS/CBS para esta UF.' }
            }
            return { error: `Erro ao criar vínculo de IBS/CBS: ${error.message}` }
        }
    }

    return { error: null }
}

export async function deleteEmitterIbscbsLink(id: string): Promise<{ error: string | null }> {
    const supabase = await createClient()
    const { error } = await supabase.from('emitter_ibscbs_state_links').delete().eq('id', id)
    if (error) return { error: `Erro ao remover vínculo de IBS/CBS: ${error.message}` }
    return { error: null }
}

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
    activeVersionId: string | null
    activeVersionLabel: string | null
    activeValidFrom: string | null
    activeValidTo: string | null
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

    const baseIds = (data || []).map((row: Record<string, unknown>) => row.id as string)
    const { data: versions, error: versionError } = baseIds.length
        ? await supabase
              .from('fiscal_ibscbs_base_versions')
              .select('id, ibscbs_base_id, version_label, valid_from, valid_to')
              .in('ibscbs_base_id', baseIds)
              .eq('status', 'active')
        : { data: [], error: null }

    if (versionError) return { data: [], error: versionError.message }

    const versionMap = new Map(
        (versions || []).map((row: Record<string, unknown>) => [row.ibscbs_base_id as string, row])
    )

    return {
        data: (data || [])
            .map((row: Record<string, unknown>) => {
                const version = versionMap.get(row.id as string)
                return {
                    id: row.id as string,
                    name: row.name as string,
                    code: row.code as string,
                    isActive: row.is_active as boolean,
                    activeVersionId: (version?.id as string) || null,
                    activeVersionLabel: (version?.version_label as string) || null,
                    activeValidFrom: (version?.valid_from as string | null) || null,
                    activeValidTo: (version?.valid_to as string | null) || null,
                }
            })
            .filter((row) => Boolean(row.activeVersionId)),
        error: null,
    }
}
