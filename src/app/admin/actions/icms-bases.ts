'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
    IcmsBaseCalcType,
    IcmsInterstateConsumerFinalMode,
    IcmsStBaseCalcType,
} from '@/lib/fiscal/icms'

export interface IcmsRuleInput {
    id?: string | null
    targetUf?: string | null
    cstCode: string
    icmsRate: number
    fcpRate: number
    specialAdvanceDestination: boolean
    differentiateConsumerFinalRate: boolean
    baseCalcType: IcmsBaseCalcType
    baseCalcPercent?: number | null
    baseReductionPercent?: number | null
    baseNotes?: string | null
    isActive?: boolean
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface IcmsInterstateRuleInput {
    id?: string | null
    targetUf?: string | null
    icmsRate: number
    fcpRate: number
    consumerFinalMode: IcmsInterstateConsumerFinalMode
    isActive?: boolean
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface IcmsStRuleInput {
    id?: string | null
    targetUf?: string | null
    stEnabled: boolean
    stBaseCalcType?: IcmsStBaseCalcType | null
    stBaseCalcPercent?: number | null
    stBaseReductionPercent?: number | null
    stRate?: number | null
    stFcpRate?: number | null
    mvaOriginal?: number | null
    mvaAdjusted?: number | null
    stNotes?: string | null
    isActive?: boolean
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface IcmsBaseFormData {
    id?: string | null
    name: string
    code: string
    description?: string | null
    isActive: boolean
    version?: number
    metadata?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
    nationalRule: IcmsRuleInput
    stateRules: IcmsRuleInput[]
    interstateRule?: IcmsInterstateRuleInput | null
    stRule?: IcmsStRuleInput | null
}

export interface IcmsBaseListItem {
    id: string
    name: string
    code: string
    description: string | null
    isActive: boolean
    version: number
    updatedAt: string
    nationalRuleCount: number
    stateRuleCount: number
    ufCount: number
    hasInterstateRule: boolean
    hasStConfigured: boolean
    stUfCount: number
}

export interface IcmsBaseOption {
    id: string
    name: string
    code: string
    description: string | null
    isActive: boolean
    version: number
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

function sanitizeText(value?: string | null) {
    const normalized = (value || '').trim()
    return normalized.length > 0 ? normalized : null
}

function sanitizeJsonObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function toNullableNumber(value: unknown) {
    if (value === '' || value === null || value === undefined) return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

function mapIcmsRuleRow(row: Record<string, unknown>): IcmsRuleInput {
    return {
        id: String(row.id),
        targetUf: typeof row.target_uf === 'string' ? row.target_uf : null,
        cstCode: String(row.cst_code || ''),
        icmsRate: Number(row.icms_rate || 0),
        fcpRate: Number(row.fcp_rate || 0),
        specialAdvanceDestination: row.special_advance_destination === true,
        differentiateConsumerFinalRate: row.differentiate_consumer_final_rate === true,
        baseCalcType: String(row.base_calc_type || 'operation_value') as IcmsBaseCalcType,
        baseCalcPercent: toNullableNumber(row.base_calc_percent),
        baseReductionPercent: toNullableNumber(row.base_reduction_percent),
        baseNotes: sanitizeText(row.base_notes as string | null),
        isActive: row.is_active !== false,
        metadata: sanitizeJsonObject(row.metadata_jsonb),
        futureTaxPayload: sanitizeJsonObject(row.future_tax_payload),
    }
}

function mapIcmsInterstateRuleRow(row: Record<string, unknown>): IcmsInterstateRuleInput {
    return {
        id: String(row.id),
        targetUf: typeof row.target_uf === 'string' ? row.target_uf : null,
        icmsRate: Number(row.icms_rate || 0),
        fcpRate: Number(row.fcp_rate || 0),
        consumerFinalMode: String(row.consumer_final_mode || 'standard') as IcmsInterstateConsumerFinalMode,
        isActive: row.is_active !== false,
        metadata: sanitizeJsonObject(row.metadata_jsonb),
        futureTaxPayload: sanitizeJsonObject(row.future_tax_payload),
    }
}

function mapIcmsStRuleRow(row: Record<string, unknown>): IcmsStRuleInput {
    return {
        id: String(row.id),
        targetUf: typeof row.target_uf === 'string' ? row.target_uf : null,
        stEnabled: row.st_enabled === true,
        stBaseCalcType: (row.st_base_calc_type as IcmsStBaseCalcType | null) || null,
        stBaseCalcPercent: toNullableNumber(row.st_base_calc_percent),
        stBaseReductionPercent: toNullableNumber(row.st_base_reduction_percent),
        stRate: toNullableNumber(row.st_rate),
        stFcpRate: toNullableNumber(row.st_fcp_rate),
        mvaOriginal: toNullableNumber(row.mva_original),
        mvaAdjusted: toNullableNumber(row.mva_adjusted),
        stNotes: sanitizeText(row.st_notes as string | null),
        isActive: row.is_active !== false,
        metadata: sanitizeJsonObject(row.metadata_jsonb),
        futureTaxPayload: sanitizeJsonObject(row.future_tax_payload),
    }
}

async function ensureAdminAccess() {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) throw new Error('Nao autenticado.')

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single()

    if (profileError || !profile || profile.role !== 'admin') {
        throw new Error('Acesso negado.')
    }

    return authData.user.id
}

export async function listIcmsBasesAction(params?: {
    search?: string | null
    includeInactive?: boolean
}): Promise<{ success: boolean; data?: IcmsBaseListItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase
            .from('fiscal_icms_bases')
            .select('*')
            .order('updated_at', { ascending: false })

        if (params?.includeInactive === false) {
            query = query.eq('is_active', true)
        }

        const search = sanitizeText(params?.search)
        if (search) {
            query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,description.ilike.%${search}%`)
        }

        const { data: bases, error } = await query
        if (error) throw error

        const baseIds = ((bases || []) as Array<Record<string, unknown>>).map((row) => String(row.id))
        if (baseIds.length === 0) return { success: true, data: [] }

        const [{ data: rules, error: rulesError }, { data: interstate, error: interstateError }, { data: stRules, error: stError }] =
            await Promise.all([
                adminSupabase.from('fiscal_icms_rules').select('icms_base_id,target_uf,is_active').in('icms_base_id', baseIds),
                adminSupabase.from('fiscal_icms_interstate_rules').select('icms_base_id,is_active').in('icms_base_id', baseIds),
                adminSupabase.from('fiscal_icms_st_rules').select('icms_base_id,target_uf,is_active,st_enabled').in('icms_base_id', baseIds),
            ])

        if (rulesError) throw rulesError
        if (interstateError) throw interstateError
        if (stError) throw stError

        const mapped = ((bases || []) as Array<Record<string, unknown>>).map((row) => {
            const id = String(row.id)
            const relatedRules = ((rules || []) as Array<Record<string, unknown>>).filter((item) => String(item.icms_base_id) === id && item.is_active !== false)
            const relatedInterstate = ((interstate || []) as Array<Record<string, unknown>>).filter((item) => String(item.icms_base_id) === id && item.is_active !== false)
            const relatedSt = ((stRules || []) as Array<Record<string, unknown>>).filter((item) => String(item.icms_base_id) === id && item.is_active !== false)
            const stateRuleCount = relatedRules.filter((item) => Boolean(item.target_uf)).length
            const nationalRuleCount = relatedRules.filter((item) => !item.target_uf).length
            const stConfigured = relatedSt.some((item) => item.st_enabled === true)

            return {
                id,
                name: String(row.name || ''),
                code: String(row.code || ''),
                description: sanitizeText(row.description as string | null),
                isActive: row.is_active !== false,
                version: Number(row.version || 1),
                updatedAt: String(row.updated_at || row.created_at || ''),
                nationalRuleCount,
                stateRuleCount,
                ufCount: stateRuleCount,
                hasInterstateRule: relatedInterstate.length > 0,
                hasStConfigured: stConfigured,
                stUfCount: relatedSt.filter((item) => Boolean(item.target_uf) && item.st_enabled === true).length,
            } satisfies IcmsBaseListItem
        })

        return { success: true, data: mapped }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar bases de ICMS.') }
    }
}

export async function listIcmsBaseOptionsAction(params?: {
    includeInactive?: boolean
    includeCurrentId?: string | null
}): Promise<{ success: boolean; data?: IcmsBaseOption[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        let query = adminSupabase
            .from('fiscal_icms_bases')
            .select('id, name, code, description, is_active, version')
            .order('name', { ascending: true })

        if (params?.includeInactive === false) {
            const currentId = sanitizeText(params?.includeCurrentId)
            if (currentId) {
                query = query.or(`is_active.eq.true,id.eq.${currentId}`)
            } else {
                query = query.eq('is_active', true)
            }
        }

        const { data, error } = await query
        if (error) throw error

        return {
            success: true,
            data: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
                id: String(row.id),
                name: String(row.name || ''),
                code: String(row.code || ''),
                description: sanitizeText(row.description as string | null),
                isActive: row.is_active !== false,
                version: Number(row.version || 1),
            })),
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao listar opcoes de base de ICMS.') }
    }
}

export async function getIcmsBaseDetailAction(
    icmsBaseId: string
): Promise<{ success: boolean; data?: IcmsBaseFormData; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const [{ data: base, error: baseError }, { data: rules, error: rulesError }, { data: interstate, error: interstateError }, { data: stRule, error: stError }] =
            await Promise.all([
                adminSupabase.from('fiscal_icms_bases').select('*').eq('id', icmsBaseId).single(),
                adminSupabase.from('fiscal_icms_rules').select('*').eq('icms_base_id', icmsBaseId).order('target_uf', { ascending: true, nullsFirst: true }),
                adminSupabase.from('fiscal_icms_interstate_rules').select('*').eq('icms_base_id', icmsBaseId).order('target_uf', { ascending: true, nullsFirst: true }),
                adminSupabase.from('fiscal_icms_st_rules').select('*').eq('icms_base_id', icmsBaseId).order('target_uf', { ascending: true, nullsFirst: true }),
            ])

        if (baseError || !base) throw baseError || new Error('Base de ICMS nao encontrada.')
        if (rulesError) throw rulesError
        if (interstateError) throw interstateError
        if (stError) throw stError

        const mappedRules = ((rules || []) as Array<Record<string, unknown>>).map(mapIcmsRuleRow)
        const nationalRule = mappedRules.find((item) => !item.targetUf) || {
            cstCode: '',
            icmsRate: 0,
            fcpRate: 0,
            specialAdvanceDestination: false,
            differentiateConsumerFinalRate: false,
            baseCalcType: 'operation_value',
            baseCalcPercent: null,
            baseReductionPercent: null,
            baseNotes: null,
            isActive: true,
        }

        return {
            success: true,
            data: {
                id: String(base.id),
                name: String(base.name || ''),
                code: String(base.code || ''),
                description: sanitizeText(base.description as string | null),
                isActive: base.is_active !== false,
                version: Number(base.version || 1),
                metadata: sanitizeJsonObject(base.metadata_jsonb),
                futureTaxPayload: sanitizeJsonObject(base.future_tax_payload),
                nationalRule,
                stateRules: mappedRules.filter((item) => Boolean(item.targetUf)),
                interstateRule: ((interstate || []) as Array<Record<string, unknown>>)[0]
                    ? mapIcmsInterstateRuleRow(((interstate || []) as Array<Record<string, unknown>>)[0])
                    : null,
                stRule: ((stRule || []) as Array<Record<string, unknown>>)[0]
                    ? mapIcmsStRuleRow(((stRule || []) as Array<Record<string, unknown>>)[0])
                    : null,
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao carregar base de ICMS.') }
    }
}

export async function upsertIcmsBaseAction(
    input: IcmsBaseFormData
): Promise<{ success: boolean; data?: { icmsBaseId: string; created: boolean; version: number }; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_upsert_fiscal_icms_base', {
            p_icms_base_id: input.id ?? null,
            p_name: input.name.trim(),
            p_code: input.code.trim().toUpperCase(),
            p_description: sanitizeText(input.description),
            p_is_active: input.isActive !== false,
            p_national_rule: {
                id: input.nationalRule.id ?? null,
                cst_code: input.nationalRule.cstCode,
                icms_rate: input.nationalRule.icmsRate,
                fcp_rate: input.nationalRule.fcpRate,
                special_advance_destination: input.nationalRule.specialAdvanceDestination === true,
                differentiate_consumer_final_rate: input.nationalRule.differentiateConsumerFinalRate === true,
                base_calc_type: input.nationalRule.baseCalcType,
                base_calc_percent: input.nationalRule.baseCalcPercent ?? null,
                base_reduction_percent: input.nationalRule.baseReductionPercent ?? null,
                base_notes: sanitizeText(input.nationalRule.baseNotes),
                is_active: input.nationalRule.isActive !== false,
                metadata_jsonb: sanitizeJsonObject(input.nationalRule.metadata),
                future_tax_payload: sanitizeJsonObject(input.nationalRule.futureTaxPayload),
            },
            p_state_rules: input.stateRules.map((rule) => ({
                id: rule.id ?? null,
                target_uf: rule.targetUf,
                cst_code: rule.cstCode,
                icms_rate: rule.icmsRate,
                fcp_rate: rule.fcpRate,
                special_advance_destination: rule.specialAdvanceDestination === true,
                differentiate_consumer_final_rate: rule.differentiateConsumerFinalRate === true,
                base_calc_type: rule.baseCalcType,
                base_calc_percent: rule.baseCalcPercent ?? null,
                base_reduction_percent: rule.baseReductionPercent ?? null,
                base_notes: sanitizeText(rule.baseNotes),
                is_active: rule.isActive !== false,
                metadata_jsonb: sanitizeJsonObject(rule.metadata),
                future_tax_payload: sanitizeJsonObject(rule.futureTaxPayload),
            })),
            p_interstate_rule: input.interstateRule
                ? {
                      id: input.interstateRule.id ?? null,
                      target_uf: input.interstateRule.targetUf ?? null,
                      icms_rate: input.interstateRule.icmsRate,
                      fcp_rate: input.interstateRule.fcpRate,
                      consumer_final_mode: input.interstateRule.consumerFinalMode,
                      is_active: input.interstateRule.isActive !== false,
                      metadata_jsonb: sanitizeJsonObject(input.interstateRule.metadata),
                      future_tax_payload: sanitizeJsonObject(input.interstateRule.futureTaxPayload),
                  }
                : {},
            p_st_rule: input.stRule
                ? {
                      id: input.stRule.id ?? null,
                      target_uf: input.stRule.targetUf ?? null,
                      st_enabled: input.stRule.stEnabled === true,
                      st_base_calc_type: input.stRule.stBaseCalcType ?? null,
                      st_base_calc_percent: input.stRule.stBaseCalcPercent ?? null,
                      st_base_reduction_percent: input.stRule.stBaseReductionPercent ?? null,
                      st_rate: input.stRule.stRate ?? null,
                      st_fcp_rate: input.stRule.stFcpRate ?? null,
                      mva_original: input.stRule.mvaOriginal ?? null,
                      mva_adjusted: input.stRule.mvaAdjusted ?? null,
                      st_notes: sanitizeText(input.stRule.stNotes),
                      is_active: input.stRule.isActive !== false,
                      metadata_jsonb: sanitizeJsonObject(input.stRule.metadata),
                      future_tax_payload: sanitizeJsonObject(input.stRule.futureTaxPayload),
                  }
                : {},
            p_metadata_jsonb: sanitizeJsonObject(input.metadata),
            p_future_tax_payload: sanitizeJsonObject(input.futureTaxPayload),
        })

        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.icms_base_id) throw new Error('Falha ao salvar base de ICMS.')

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/icms')
        revalidatePath('/admin/product-tax-profiles')

        return {
            success: true,
            data: {
                icmsBaseId: String(row.icms_base_id),
                created: Boolean(row.created),
                version: Number(row.version || 1),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao salvar base de ICMS.') }
    }
}

export async function toggleIcmsBaseStatusAction(
    icmsBaseId: string,
    isActive: boolean
): Promise<{ success: boolean; data?: { icmsBaseId: string; isActive: boolean; version: number }; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_toggle_fiscal_icms_base_status', {
            p_icms_base_id: icmsBaseId,
            p_is_active: isActive,
        })

        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.icms_base_id) throw new Error('Falha ao atualizar status da base de ICMS.')

        revalidatePath('/admin/fiscal-bases')
        revalidatePath('/admin/fiscal-bases/icms')
        revalidatePath('/admin/product-tax-profiles')

        return {
            success: true,
            data: {
                icmsBaseId: String(row.icms_base_id),
                isActive: Boolean(row.is_active),
                version: Number(row.version || 1),
            },
        }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, 'Erro ao atualizar status da base de ICMS.') }
    }
}
