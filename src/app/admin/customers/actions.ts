'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
    getPrimaryCustomerAccessIdentifier,
    hasRealCustomerEmail,
    normalizeCnpj,
    normalizeEmail,
} from '@/lib/customers/access'
import { normalizeFinancialProfile, type FinancialProfile } from '@/lib/commercial/types'

// ==================== HELPER: Get Admin Supabase Client ====================

async function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase server credentials nao configuradas no servidor.')
    }
    // Intentionally stateless service-role client to avoid inheriting end-user JWT and hitting RLS on admin writes.
    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    })
}

async function verifyAdmin() {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() { }
            }
        }
    )

    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) throw new Error('Acesso negado')

    const { data: adminProfile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (adminProfile?.role !== 'admin') throw new Error('Permissao negada')

    return user
}

type CustomerStatus = 'pending' | 'approved' | 'blocked' | 'imported'

type UpsertCustomerDomainInput = {
    profileId: string
    fullName: string
    phone?: string | null
    status?: CustomerStatus | null
    storeId?: string | null
    companyName: string
    tradeName?: string | null
    cnpj: string
    email: string
    customerTypeId?: string | null
    representativeId?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    tagIds?: string[]
}

type CustomerCommercialSettingsPayload = {
    storeId: string
    overridePriceTableId?: string | null
    overridePaymentMethodId?: string | null
    overridePaymentConditionId?: string | null
    financialProfile?: FinancialProfile
    maxDiscountPercentage?: number | null
    creditLimit?: number | null
    commercialNotes?: string | null
    representativeId?: string | null
}

type RepresentativeCommercialSettingsPayload = {
    profileId: string
    maxDiscountPercentage?: number | null
    allowFreeNegotiation?: boolean
    canOverridePriceTable?: boolean
    notes?: string | null
    allowedPriceTableIds?: string[]
    customerAccessMode?: 'assigned_only' | 'all_admin_portfolio' | 'filtered_portfolio'
    allowedStates?: string[]
    allowedCities?: string[]
    manualCustomerRules?: Array<{
        storeId: string
        decision: 'allow' | 'deny'
        reason?: string | null
    }>
}

async function sendAccountApprovedEmail(params: { email: string; fullName: string }) {
    if (!hasRealCustomerEmail(params.email)) {
        return
    }

    try {
        const supabaseAdmin = await getAdminClient()
        const { sendEmail } = await import('@/lib/email')
        const React = (await import('react')).default
        const { default: AccountApprovedEmail } = await import('@/emails/AccountApprovedEmail')

        const { data: settings } = await supabaseAdmin
            .from('system_settings')
            .select('system_name')
            .limit(1)
            .single()

        const systemName = settings?.system_name || 'CDJWE'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'

        await sendEmail({
            to: normalizeEmail(params.email),
            subject: `Sua conta foi aprovada - ${systemName}`,
            senderName: systemName,
            react: React.createElement(AccountApprovedEmail, {
                clientName: params.fullName,
                clientEmail: normalizeEmail(params.email),
                systemName,
                appUrl,
            }),
        })
    } catch (emailErr) {
        console.error('[CUSTOMER APPROVAL EMAIL] Error:', emailErr)
    }
}

async function upsertCustomerDomainViaRpc(
    supabaseAdmin: Awaited<ReturnType<typeof getAdminClient>>,
    input: UpsertCustomerDomainInput
) {
    const { data, error } = await supabaseAdmin.rpc('admin_upsert_customer_domain', {
        p_profile_id: input.profileId,
        p_full_name: input.fullName,
        p_phone: input.phone ?? null,
        p_status: input.status ?? null,
        p_store_id: input.storeId ?? null,
        p_company_name: input.companyName,
        p_trade_name: input.tradeName ?? null,
        p_cnpj: input.cnpj,
        p_email: input.email,
        p_customer_type_id: input.customerTypeId ?? null,
        p_representative_id: input.representativeId ?? null,
        p_address: input.address ?? null,
        p_city: input.city ?? null,
        p_state: input.state ?? null,
        p_zip_code: input.zipCode ?? null,
        p_tag_ids: input.tagIds && input.tagIds.length > 0 ? input.tagIds : [],
    })

    if (error) {
        return { error: error.message }
    }

    const firstRow = Array.isArray(data) ? data[0] : data
    return { storeId: firstRow?.store_id as string | undefined }
}

function isValidEmailFormat(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function createPlaceholderEmail(cnpj: string, rowNumber: number) {
    const normalizedCnpj = normalizeCnpj(cnpj)
    const token = normalizedCnpj || `linha${rowNumber}`
    return `importado+${token}@placeholder.invalid`
}

function normalizeOptionalImportEmail(email?: string | null) {
    const trimmed = (email || '').trim()
    if (!trimmed) return null

    const token = trimmed.toLowerCase()
    const emptyTokens = new Set(['-', '--', 'n/a', 'na', 'null', 'none', 'sem email', 'sem e-mail', 's/email'])
    if (emptyTokens.has(token)) return null

    return trimmed
}

function mapAuthCreateUserErrorMessage(rawMessage?: string) {
    if (!rawMessage) return 'Falha ao criar usuario no Auth.'
    const normalized = rawMessage.toLowerCase()
    if (normalized.includes('already registered') || normalized.includes('already exists')) {
        return 'Este email ja esta cadastrado.'
    }
    return rawMessage
}

function toErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error.length > 0) return error
    return fallback
}

function isAuthUserMissingError(message?: string) {
    const normalized = (message || '').toLowerCase()
    return normalized.includes('user not found') || normalized.includes('not found')
}

function toOptionalUuid(value?: string | null) {
    const normalized = (value || '').trim()
    return normalized.length > 0 ? normalized : null
}

function toNullableNumber(value?: number | null) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null
    return Number(value)
}

function normalizeStringArray(values?: string[] | null, transform?: (value: string) => string) {
    const mapper = transform || ((value: string) => value)
    return Array.from(new Set((values || []).map((value) => mapper((value || '').trim())).filter(Boolean)))
}

function sortStrings(values: string[]) {
    return [...values].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false
    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) return false
    }
    return true
}

function jsonStatesEqual(a: Record<string, unknown>, b: Record<string, unknown>) {
    return JSON.stringify(a) === JSON.stringify(b)
}

async function logRepresentativeAccessAudit(params: {
    supabaseAdmin: Awaited<ReturnType<typeof getAdminClient>>
    representativeId: string
    changedByProfileId?: string | null
    eventType: string
    entityType: string
    storeId?: string | null
    beforeState?: Record<string, unknown> | null
    afterState?: Record<string, unknown> | null
    notes?: string | null
}) {
    const { supabaseAdmin } = params
    const { error } = await supabaseAdmin
        .from('representative_customer_access_audit_logs')
        .insert({
            representative_id: params.representativeId,
            changed_by_profile_id: params.changedByProfileId || null,
            event_type: params.eventType,
            entity_type: params.entityType,
            store_id: params.storeId || null,
            before_state: params.beforeState || null,
            after_state: params.afterState || null,
            notes: params.notes || null,
        })

    if (error) {
        if (error.code === '42P01') return
        console.error('[REP ACCESS AUDIT] Failed to persist log:', error)
    }
}

function isRepresentativeCustomerType(type?: { slug?: string | null; name?: string | null } | null) {
    const slug = (type?.slug || '').trim().toLowerCase()
    const name = (type?.name || '').trim().toLowerCase()
    return slug === 'representante' || name === 'representante'
}

async function syncProfileRoleWithCustomerType(params: {
    supabaseAdmin: Awaited<ReturnType<typeof getAdminClient>>
    profileId: string
    customerTypeId?: string | null
    currentRole?: string | null
    currentStatus?: string | null
    fullName?: string | null
}) {
    const {
        supabaseAdmin,
        profileId,
        customerTypeId,
        currentRole = null,
        currentStatus = null,
        fullName = null,
    } = params

    const normalizedCustomerTypeId = toOptionalUuid(customerTypeId)
    if (!normalizedCustomerTypeId) {
        const targetRole = 'client' as const
        if (currentRole === targetRole) {
            return { role: targetRole, changed: false }
        }

        const targetStatus = currentStatus || 'approved'
        const { error: profileRoleError } = await supabaseAdmin
            .from('profiles')
            .update({ role: targetRole, status: targetStatus })
            .eq('id', profileId)

        if (profileRoleError) {
            throw profileRoleError
        }

        try {
            await supabaseAdmin.auth.admin.updateUserById(profileId, {
                user_metadata: {
                    role: targetRole,
                    ...(fullName ? { full_name: fullName } : {}),
                },
            })
        } catch (authError) {
            console.error('[CUSTOMER ROLE SYNC] Failed to sync auth metadata:', authError)
        }

        return { role: targetRole, changed: true }
    }

    const { data: customerType, error: customerTypeError } = await supabaseAdmin
        .from('customer_types')
        .select('id, slug, name')
        .eq('id', normalizedCustomerTypeId)
        .limit(1)
        .maybeSingle()

    if (customerTypeError) throw customerTypeError
    const shouldBeRepresentative = isRepresentativeCustomerType(customerType)
    const targetRole: 'client' | 'representative' = shouldBeRepresentative ? 'representative' : 'client'

    if (currentRole === targetRole) {
        return { role: targetRole, changed: false }
    }

    const targetStatus =
        targetRole === 'representative'
            ? 'approved'
            : (currentStatus || 'approved')

    const { error: profileRoleError } = await supabaseAdmin
        .from('profiles')
        .update({ role: targetRole, status: targetStatus })
        .eq('id', profileId)

    if (profileRoleError) {
        throw profileRoleError
    }

    try {
        await supabaseAdmin.auth.admin.updateUserById(profileId, {
            user_metadata: {
                role: targetRole,
                ...(fullName ? { full_name: fullName } : {}),
            },
        })
    } catch (authError) {
        console.error('[CUSTOMER ROLE SYNC] Failed to sync auth metadata:', authError)
    }

    return { role: targetRole, changed: true }
}

async function getCustomerDeleteBlocker(
    supabaseAdmin: Awaited<ReturnType<typeof getAdminClient>>,
    profileId: string
) {
    const [{ count: ordersByProfileCount }, { count: ordersByStoreCount }] = await Promise.all([
        supabaseAdmin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', profileId),
        supabaseAdmin
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .in(
                'store_id',
                (
                    await supabaseAdmin
                        .from('stores')
                        .select('id')
                        .eq('profile_id', profileId)
                ).data?.map((store) => store.id) || ['00000000-0000-0000-0000-000000000000']
            ),
    ])

    const totalOrders = Math.max(ordersByProfileCount || 0, ordersByStoreCount || 0)
    if (totalOrders > 0) {
        return `Este cliente possui ${totalOrders} pedido(s) vinculado(s) e nao pode ser excluido. Bloqueie ou inative o cadastro para preservar o historico.`
    }

    return null
}

async function deleteCustomerSafely(
    supabaseAdmin: Awaited<ReturnType<typeof getAdminClient>>,
    profileId: string
) {
    const blockerMessage = await getCustomerDeleteBlocker(supabaseAdmin, profileId)
    if (blockerMessage) {
        return { error: blockerMessage }
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(profileId)

    if (!authDeleteError) {
        return { success: true as const }
    }

    if (!isAuthUserMissingError(authDeleteError.message)) {
        console.error('Delete Customer Auth Error:', authDeleteError)
        return { error: 'Falha ao excluir o cliente no Supabase Auth.' }
    }

    // Safety fallback for legacy/inconsistent rows where the auth user no longer exists.
    const { error: profileDeleteError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', profileId)

    if (profileDeleteError) {
        console.error('Delete Customer Profile Fallback Error:', profileDeleteError)
        return { error: 'Falha ao excluir o cadastro legado do cliente.' }
    }

    return { success: true as const }
}

// ==================== CREATE CUSTOMER ====================

export async function createCustomerAsAdmin(formData: FormData) {
    return createCustomerAsAdminTx(formData)
}

// ==================== UPDATE CUSTOMER ====================

export async function updateCustomerAsAdmin(
    profileId: string,
    storeId: string,
    data: {
        fullName: string
        email: string
        phone?: string
        companyName: string
        tradeName?: string
        cnpj: string
        customerTypeId?: string
        representativeId?: string
        tagIds?: string[]
        address?: string
        city?: string
        state?: string
        zipCode?: string
    }
) {
    return updateCustomerAsAdminTx(profileId, storeId, data)
}

// ==================== TX V2 (RPC-BASED) ====================

export async function createCustomerAsAdminTx(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string
    const phone = formData.get('phone') as string
    const companyName = formData.get('companyName') as string
    const cnpj = formData.get('cnpj') as string
    const tradeName = formData.get('tradeName') as string
    const customerTypeId = formData.get('customerTypeId') as string
    const representativeId = formData.get('representativeId') as string
    const tagIdsJson = formData.get('tagIds') as string
    let tagIds: string[] = []
    if (tagIdsJson) {
        try { tagIds = JSON.parse(tagIdsJson) } catch { }
    }
    const address = formData.get('address') as string
    const city = formData.get('city') as string
    const state = formData.get('state') as string
    const zipCode = formData.get('zipCode') as string

    if (!email || !password || !fullName || !companyName || !cnpj) {
        return { error: 'Campos obrigatorios faltando.' }
    }

    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()
        const normalizedEmail = normalizeEmail(email)

        const { data: existingProfileByEmail } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', normalizedEmail)
            .limit(1)
            .maybeSingle()

        if (existingProfileByEmail?.id) {
            return { error: 'Este email ja esta cadastrado.' }
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: 'client',
            },
        })

        if (authError || !authData?.user?.id) {
            throw new Error(mapAuthCreateUserErrorMessage(authError?.message))
        }

        const upsertResult = await upsertCustomerDomainViaRpc(supabaseAdmin, {
            profileId: authData.user.id,
            fullName,
            phone: phone || null,
            status: 'approved',
            companyName,
            tradeName: tradeName || null,
            cnpj,
            email: normalizedEmail,
            customerTypeId: customerTypeId || null,
            representativeId: representativeId || null,
            address: address || null,
            city: city || null,
            state: state || null,
            zipCode: zipCode || null,
            tagIds,
        })

        if (upsertResult.error) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
            throw new Error(upsertResult.error)
        }

        await syncProfileRoleWithCustomerType({
            supabaseAdmin,
            profileId: authData.user.id,
            customerTypeId: customerTypeId || null,
            currentRole: 'client',
            currentStatus: 'approved',
            fullName,
        })

        await sendAccountApprovedEmail({
            email: normalizedEmail,
            fullName,
        })

        return { success: true }
    } catch (err: unknown) {
        console.error('Customer Creation TX Error:', err)
        return { error: toErrorMessage(err, 'Erro ao criar o cliente.') }
    }
}

export async function updateCustomerAsAdminTx(
    profileId: string,
    storeId: string,
    data: {
        fullName: string
        email: string
        phone?: string
        companyName: string
        tradeName?: string
        cnpj: string
        customerTypeId?: string
        representativeId?: string
        tagIds?: string[]
        address?: string
        city?: string
        state?: string
        zipCode?: string
    }
) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()
        const normalizedEmail = normalizeEmail(data.email)

        const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
            .from('profiles')
            .select('email, role, status, full_name')
            .eq('id', profileId)
            .single()

        if (currentProfileError || !currentProfile) {
            throw new Error('Cliente nao encontrado.')
        }

        if (normalizeEmail(currentProfile.email || '') !== normalizedEmail) {
            const { data: existingProfileByEmail } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('email', normalizedEmail)
                .neq('id', profileId)
                .limit(1)
                .maybeSingle()

            if (existingProfileByEmail?.id) {
                throw new Error('Este email ja esta cadastrado.')
            }

            const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
                email: normalizedEmail,
                email_confirm: true,
            })

            if (authUpdateError) {
                throw new Error(mapAuthCreateUserErrorMessage(authUpdateError.message))
            }
        }

        const upsertResult = await upsertCustomerDomainViaRpc(supabaseAdmin, {
            profileId,
            storeId,
            fullName: data.fullName,
            phone: data.phone || null,
            companyName: data.companyName,
            tradeName: data.tradeName || null,
            cnpj: data.cnpj,
            email: normalizedEmail,
            customerTypeId: data.customerTypeId || null,
            representativeId: data.representativeId || null,
            address: data.address || null,
            city: data.city || null,
            state: data.state || null,
            zipCode: data.zipCode || null,
            tagIds: data.tagIds || [],
        })

        if (upsertResult.error) {
            throw new Error(upsertResult.error)
        }

        await syncProfileRoleWithCustomerType({
            supabaseAdmin,
            profileId,
            customerTypeId: data.customerTypeId || null,
            currentRole: currentProfile.role,
            currentStatus: currentProfile.status,
            fullName: data.fullName || currentProfile.full_name,
        })

        return { success: true }
    } catch (err: unknown) {
        console.error('Customer Update TX Error:', err)
        return { error: toErrorMessage(err, 'Erro ao atualizar o cliente.') }
    }
}

export async function updateCustomerStatusAsAdmin(profileId: string, status: CustomerStatus) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data: profile, error: profileLoadError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, status, email, full_name')
            .eq('id', profileId)
            .single()

        if (profileLoadError || !profile) {
            return { error: 'Cliente nao encontrado.' }
        }

        if (!['client', 'representative', 'driver'].includes(profile.role)) {
            return { error: 'Apenas clientes, representantes e motoristas podem ter status alterado.' }
        }

        if (profile.status !== status) {
            const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({ status })
                .eq('id', profileId)

            if (updateError) throw updateError
        }

        if (status === 'approved' && profile.status !== 'approved' && profile.email) {
            await sendAccountApprovedEmail({
                email: profile.email,
                fullName: profile.full_name || 'Cliente',
            })
        }

        return { success: true }
    } catch (err: unknown) {
        console.error('Update Customer Status Error:', err)
        return { error: toErrorMessage(err, 'Erro ao atualizar status do cliente.') }
    }
}

export async function bulkUpdateCustomerStatusAsAdmin(ids: string[], status: CustomerStatus) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
        if (uniqueIds.length === 0) {
            return { error: 'Nenhum cliente selecionado.' }
        }

        const { data: customers, error: loadError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, status, email, full_name')
            .in('id', uniqueIds)
            .in('role', ['client', 'representative', 'driver'])

        if (loadError) throw loadError
        if (!customers || customers.length === 0) {
            return { error: 'Nenhum cliente valido encontrado.' }
        }

        const customerIds = customers.map((customer) => customer.id)
        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update({ status })
            .in('id', customerIds)

        if (updateError) throw updateError

        if (status === 'approved') {
            const emailTargets = customers.filter((customer) => customer.status !== 'approved' && customer.email)
            await Promise.allSettled(
                emailTargets.map((customer) =>
                    sendAccountApprovedEmail({
                        email: customer.email as string,
                        fullName: customer.full_name || 'Cliente',
                    })
                )
            )
        }

        return { success: true, updatedCount: customerIds.length }
    } catch (err: unknown) {
        console.error('Bulk Update Customer Status Error:', err)
        return { error: toErrorMessage(err, 'Erro ao atualizar status em lote.') }
    }
}

// ==================== GENERATE / SET PASSWORD ====================

export async function setCustomerPassword(profileId: string, password: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { error } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
            password
        })

        if (error) throw error
        return { success: true }
    } catch (err: unknown) {
        console.error('Set Password Error:', err)
        return { error: toErrorMessage(err, 'Erro ao alterar senha.') }
    }
}

export async function generateCustomerPassword(profileId: string) {
    // Generate simple memorable password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let password = ''
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    const result = await setCustomerPassword(profileId, password)
    if (result.error) return result
    return { success: true, password }
}

export async function getCustomerAccessSnapshot(profileId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const [{ data: profile }, { data: store }, authResult] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select('email')
                .eq('id', profileId)
                .maybeSingle(),
            supabaseAdmin
                .from('stores')
                .select('cnpj')
                .eq('profile_id', profileId)
                .limit(1)
                .maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(profileId),
        ])

        const normalizedEmail = normalizeEmail(profile?.email || '')
        const hasRealEmail = hasRealCustomerEmail(normalizedEmail)
        const primaryIdentifier =
            getPrimaryCustomerAccessIdentifier({
                cnpj: store?.cnpj,
                email: hasRealEmail ? normalizedEmail : null,
            }) || null

        return {
            success: true,
            data: {
                primaryIdentifier,
                alternateEmail: hasRealEmail ? normalizedEmail : null,
                passwordDefined: Boolean(authResult.data?.user?.id),
            },
        }
    } catch (err: unknown) {
        console.error('Get Customer Access Snapshot Error:', err)
        return { error: toErrorMessage(err, 'Erro ao carregar o status de acesso do cliente.') }
    }
}

export async function promoteCustomerToDriver(profileId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, status, phone, full_name')
            .eq('id', profileId)
            .single()

        if (profileError || !profile) {
            return { error: 'Cliente nao encontrado.' }
        }

        if (profile.role === 'admin') {
            return { error: 'Nao e permitido alterar um administrador para motorista.' }
        }

        if (!['client', 'representative', 'driver'].includes(profile.role)) {
            return { error: 'Somente clientes ou representantes podem ser definidos como motorista.' }
        }

        const { data: existingDriver, error: existingDriverError } = await supabaseAdmin
            .from('drivers')
            .select('id')
            .eq('profile_id', profileId)
            .maybeSingle()

        if (existingDriverError) throw existingDriverError

        if (!existingDriver?.id) {
            const { error: createDriverError } = await supabaseAdmin
                .from('drivers')
                .insert({
                    profile_id: profileId,
                    phone: profile.phone || null,
                    status: 'available',
                    notes: 'Criado automaticamente a partir do modulo de clientes.',
                })

            if (createDriverError) throw createDriverError
        }

        if (profile.role !== 'driver' || profile.status !== 'approved') {
            const { error: profileUpdateError } = await supabaseAdmin
                .from('profiles')
                .update({
                    role: 'driver',
                    status: 'approved',
                })
                .eq('id', profileId)

            if (profileUpdateError) throw profileUpdateError
        }

        try {
            await supabaseAdmin.auth.admin.updateUserById(profileId, {
                user_metadata: {
                    role: 'driver',
                    ...(profile.full_name ? { full_name: profile.full_name } : {}),
                },
            })
        } catch (authError) {
            console.error('[PROMOTE CUSTOMER TO DRIVER] Failed to sync auth metadata:', authError)
        }

        return { success: true }
    } catch (err: unknown) {
        console.error('Promote Customer To Driver Error:', err)
        return { error: toErrorMessage(err, 'Erro ao definir cliente como motorista.') }
    }
}

// ==================== IMPORT CUSTOMERS FROM CSV ====================

interface CSVCustomerRow {
    fullName: string
    email?: string
    phone?: string
    companyName: string
    cnpj: string
    customerType?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
    rowNumber?: number
}

export async function importCustomersFromCSV(rows: CSVCustomerRow[]) {
    return importCustomersFromCSVTx(rows)
}

export async function importCustomersFromCSVTx(rows: CSVCustomerRow[]) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data: types } = await supabaseAdmin
            .from('customer_types')
            .select('id, name, slug')

        const typeMap = new Map<string, string>()
        types?.forEach(t => {
            typeMap.set(t.name.toLowerCase(), t.id)
            typeMap.set(t.slug.toLowerCase(), t.id)
        })

        const results: { row: number; status: 'success' | 'error'; message: string }[] = []

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const rowRef = Number.isFinite(Number(row.rowNumber)) ? Number(row.rowNumber) : i + 1
            try {
                const fullName = row.fullName?.trim() || ''
                const companyName = row.companyName?.trim() || ''
                const cnpj = row.cnpj?.trim() || ''
                const rawEmail = normalizeOptionalImportEmail(row.email)
                const hasProvidedEmail = Boolean(rawEmail)

                if (!fullName || !companyName || !cnpj) {
                    results.push({ row: rowRef, status: 'error', message: 'Campos obrigatorios faltando' })
                    continue
                }

                if (hasProvidedEmail && rawEmail && !isValidEmailFormat(rawEmail)) {
                    results.push({ row: rowRef, status: 'error', message: 'Email invalido na linha' })
                    continue
                }

                const fallbackEmail = createPlaceholderEmail(cnpj, i + 1)
                const normalizedEmail = hasProvidedEmail && rawEmail ? normalizeEmail(rawEmail) : fallbackEmail
                const { data: existingProfileByEmail } = await supabaseAdmin
                    .from('profiles')
                    .select('id, role, email')
                    .eq('email', normalizedEmail)
                    .limit(1)
                    .maybeSingle()

                let targetProfileId: string | null = null
                let targetStoreId: string | null = null
                let createdNow = false
                let rowResolvedWithoutEmail = !hasProvidedEmail
                let effectiveEmailForDomain = normalizedEmail

                const { data: existingStoreByCnpj } = await supabaseAdmin
                    .from('stores')
                    .select('id, profile_id')
                    .eq('cnpj', cnpj)
                    .limit(1)
                    .maybeSingle()

                const existingProfileByCnpj = existingStoreByCnpj?.profile_id
                    ? await supabaseAdmin
                        .from('profiles')
                        .select('id, role, email')
                        .eq('id', existingStoreByCnpj.profile_id)
                        .limit(1)
                        .maybeSingle()
                    : { data: null }

                if (existingProfileByEmail?.id) {
                    if (existingProfileByEmail.role !== 'client') {
                        results.push({
                            row: rowRef,
                            status: 'error',
                            message: 'Email ja pertence a um usuario nao cliente',
                        })
                        continue
                    }

                    if (existingProfileByCnpj.data?.id && existingProfileByCnpj.data.id !== existingProfileByEmail.id) {
                        results.push({
                            row: rowRef,
                            status: 'error',
                            message: 'CNPJ pertence a outro cliente',
                        })
                        continue
                    }

                    targetProfileId = existingProfileByEmail.id
                    const { data: existingStore } = await supabaseAdmin
                        .from('stores')
                        .select('id')
                        .eq('profile_id', targetProfileId)
                        .limit(1)
                        .maybeSingle()

                    targetStoreId = existingStore?.id ?? null
                    if (!hasProvidedEmail && existingProfileByEmail.email) {
                        effectiveEmailForDomain = normalizeEmail(existingProfileByEmail.email)
                    }
                } else if (existingProfileByCnpj.data?.id) {
                    if (existingProfileByCnpj.data.role !== 'client') {
                        results.push({
                            row: rowRef,
                            status: 'error',
                            message: 'CNPJ pertence a um usuario nao cliente',
                        })
                        continue
                    }

                    targetProfileId = existingProfileByCnpj.data.id
                    targetStoreId = existingStoreByCnpj?.id ?? null
                    rowResolvedWithoutEmail = !hasProvidedEmail

                    if (hasProvidedEmail) {
                        const normalizedCurrentProfileEmail = normalizeEmail(existingProfileByCnpj.data.email || '')
                        if (normalizedCurrentProfileEmail !== normalizedEmail) {
                            const profileIdToUpdate = targetProfileId
                            if (!profileIdToUpdate) {
                                results.push({
                                    row: rowRef,
                                    status: 'error',
                                    message: 'Falha ao resolver perfil para atualizar email',
                                })
                                continue
                            }

                            const { data: emailOwner } = await supabaseAdmin
                                .from('profiles')
                                .select('id')
                                .eq('email', normalizedEmail)
                                .neq('id', profileIdToUpdate)
                                .limit(1)
                                .maybeSingle()

                            if (emailOwner?.id) {
                                results.push({
                                    row: rowRef,
                                    status: 'error',
                                    message: 'Email ja pertence a outro usuario',
                                })
                                continue
                            }

                            const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(profileIdToUpdate, {
                                email: normalizedEmail,
                                email_confirm: true,
                            })
                            if (authEmailError) {
                                results.push({
                                    row: rowRef,
                                    status: 'error',
                                    message: mapAuthCreateUserErrorMessage(authEmailError.message),
                                })
                                continue
                            }
                        }
                        effectiveEmailForDomain = normalizedEmail
                    } else {
                        effectiveEmailForDomain = normalizeEmail(existingProfileByCnpj.data.email || fallbackEmail)
                    }
                } else {
                    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!'
                    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                        email: normalizedEmail,
                        password: tempPassword,
                        email_confirm: true,
                        user_metadata: {
                            full_name: row.fullName,
                            role: 'client',
                        },
                    })

                    if (authError || !authData?.user?.id) {
                        results.push({
                            row: rowRef,
                            status: 'error',
                            message: mapAuthCreateUserErrorMessage(authError?.message),
                        })
                        continue
                    }

                    targetProfileId = authData.user.id
                    createdNow = true
                    effectiveEmailForDomain = normalizedEmail
                }

                if (!targetProfileId) {
                    results.push({ row: rowRef, status: 'error', message: 'Falha ao resolver perfil do cliente' })
                    continue
                }

                const upsertResult = await upsertCustomerDomainViaRpc(supabaseAdmin, {
                    profileId: targetProfileId,
                    storeId: targetStoreId,
                    fullName: row.fullName,
                    phone: row.phone || null,
                    status: 'imported',
                    companyName,
                    tradeName: null,
                    cnpj,
                    email: effectiveEmailForDomain,
                    customerTypeId: row.customerType
                        ? typeMap.get(row.customerType.toLowerCase()) || null
                        : null,
                    representativeId: null,
                    address: row.address || null,
                    city: row.city || null,
                    state: row.state || null,
                    zipCode: row.zipCode || null,
                    tagIds: [],
                })

                if (upsertResult.error) {
                    if (createdNow && targetProfileId) {
                        await supabaseAdmin.auth.admin.deleteUser(targetProfileId)
                    }
                    results.push({ row: rowRef, status: 'error', message: upsertResult.error })
                    continue
                }

                await syncProfileRoleWithCustomerType({
                    supabaseAdmin,
                    profileId: targetProfileId,
                    customerTypeId: row.customerType
                        ? typeMap.get(row.customerType.toLowerCase()) || null
                        : null,
                    currentRole: existingProfileByEmail?.role || existingProfileByCnpj.data?.role || 'client',
                    currentStatus: 'imported',
                    fullName: row.fullName,
                })

                results.push({
                    row: rowRef,
                    status: 'success',
                    message: rowResolvedWithoutEmail
                        ? (createdNow ? 'Importado sem email (provisorio)' : 'Atualizado sem email (provisorio)')
                        : (createdNow ? 'Importado com sucesso' : 'Cliente existente atualizado'),
                })
            } catch (err: unknown) {
                results.push({ row: rowRef, status: 'error', message: toErrorMessage(err, 'Erro desconhecido') })
            }
        }

        const successCount = results.filter(r => r.status === 'success').length
        return { success: true, results, totalImported: successCount, totalErrors: results.length - successCount }
    } catch (err: unknown) {
        console.error('Import CSV TX Error:', err)
        return { error: toErrorMessage(err, 'Erro ao importar clientes.') }
    }
}

// ==================== SEND ACCESS LINK ====================

export async function sendAccessLink(
    profileId: string,
    channel: 'whatsapp' | 'email',
    password?: string
) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data: profile } = await supabaseAdmin.from('profiles')
            .select('full_name, email, phone')
            .eq('id', profileId)
            .single()

        if (!profile) return { error: 'Cliente nao encontrado' }

        const { data: store } = await supabaseAdmin
            .from('stores')
            .select('cnpj, company_name')
            .eq('profile_id', profileId)
            .limit(1)
            .maybeSingle()

        const { data: settings } = await supabaseAdmin
            .from('system_settings')
            .select('system_name, whatsapp')
            .limit(1)
            .single()

        const systemName = settings?.system_name || 'CDJWE'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'
        const loginUrl = `${appUrl}/login`
        const primaryIdentifier =
            getPrimaryCustomerAccessIdentifier({
                cnpj: store?.cnpj,
                email: hasRealCustomerEmail(profile.email) ? profile.email : null,
            }) || profile.email
        const canSendEmail = hasRealCustomerEmail(profile.email)

        if (channel === 'whatsapp') {
            const phone = profile.phone?.replace(/\D/g, '')
            if (!phone) return { error: 'Cliente nao possui telefone cadastrado' }

            const message = encodeURIComponent(
                `Ola ${profile.full_name}!\n\n` +
                `Seu acesso ao *${systemName}* esta liberado!\n\n` +
                `Empresa: ${store?.company_name || profile.full_name}\n` +
                `Link de acesso: ${loginUrl}\n` +
                `Acesso principal: ${primaryIdentifier}\n` +
                (canSendEmail ? `Acesso alternativo por e-mail: ${normalizeEmail(profile.email)}\n` : '') +
                (password ? `Senha: ${password}\n` : '') +
                `\nEm caso de duvidas, entre em contato conosco.`
            )

            const whatsappUrl = `https://wa.me/55${phone}?text=${message}`
            return { success: true, whatsappUrl }
        }

        if (channel === 'email') {
            if (!canSendEmail) {
                return { error: 'Este cliente ainda nao possui um e-mail real cadastrado para envio.' }
            }

            try {
                const { sendEmail } = await import('@/lib/email')
                const React = (await import('react')).default
                const { default: AccountApprovedEmail } = await import('@/emails/AccountApprovedEmail')

                await sendEmail({
                    to: normalizeEmail(profile.email),
                    subject: `Seus dados de acesso - ${systemName}`,
                    senderName: systemName,
                    react: React.createElement(AccountApprovedEmail, {
                        clientName: profile.full_name,
                        clientEmail: normalizeEmail(profile.email),
                        clientDocument: store?.cnpj || undefined,
                        password: password || undefined,
                        systemName,
                        appUrl,
                    }),
                })
                return { success: true }
            } catch (emailErr) {
                console.error('[SEND ACCESS LINK EMAIL] Error:', emailErr)
                return { error: 'Erro ao enviar email de acesso.' }
            }
        }

        return { error: 'Canal de envio invalido' }
    } catch (err: unknown) {
        console.error('Send Access Link Error:', err)
        return { error: toErrorMessage(err, 'Erro ao enviar link de acesso.') }
    }
}

// ==================== GET CUSTOMER AUDIT LOG ====================

export async function getCustomerAuditLog(profileId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data, error } = await supabaseAdmin
            .from('customer_login_audit')
            .select('*')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) throw error
        return { data: data || [] }
    } catch (err: unknown) {
        console.error('Get Audit Log Error:', err)
        return { error: toErrorMessage(err, 'Erro ao buscar historico de acessos.') }
    }
}

// ==================== GET CUSTOMER ORDERS (for detail modal) ====================

export async function getCustomerOrders(profileId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data, error } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, status, payment_status, total, created_at')
            .eq('profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) throw error
        return { data: data || [] }
    } catch (err: unknown) {
        console.error('Get Customer Orders Error:', err)
        return { error: toErrorMessage(err, 'Erro ao buscar pedidos.') }
    }
}

// ==================== GET TAGS AND REPRESENTATIVES ====================

export async function getCustomerTags() {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data, error } = await supabaseAdmin
            .from('customer_tags')
            .select('id, name, color')
            .order('name')

        if (error) throw error
        return { data: data || [] }
    } catch (err: unknown) {
        console.error('Get Tags Error:', err)
        return { error: toErrorMessage(err, 'Erro ao buscar tags.') }
    }
}

export async function getRepresentatives() {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        // Assumption: representatives are profiles where role might be 'admin' or 'representative'. 
        // We'll fetch all admins for now as 'commercial' roles, or add 'representative' if it exists.
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, role')
            .in('role', ['admin', 'representative'])
            .order('full_name')

        if (error) throw error
        return { data: data || [] }
    } catch (err: unknown) {
        console.error('Get Representatives Error:', err)
        return { error: toErrorMessage(err, 'Erro ao buscar representantes.') }
    }
}

// ==================== CUSTOMER COMMERCIAL SETTINGS ====================

export async function getCustomerCommercialSetup(storeId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        if (!storeId) {
            return { error: 'Cliente sem loja vinculada.' }
        }

        const [priceTablesRes, methodsRes, conditionsRes, methodLinksRes, repsRes] = await Promise.all([
            supabaseAdmin
                .from('price_tables')
                .select('id, name, discount_percentage, is_default, is_active, valid_from, valid_until')
                .order('name', { ascending: true }),
            supabaseAdmin
                .from('payment_methods')
                .select('id, code, name, is_active, sort_order')
                .order('sort_order', { ascending: true }),
            supabaseAdmin
                .from('payment_conditions')
                .select('id, name, installments, is_active, sort_order')
                .order('sort_order', { ascending: true }),
            supabaseAdmin
                .from('payment_method_conditions')
                .select('id, payment_method_id, payment_condition_id, is_active')
                .eq('is_active', true),
            supabaseAdmin
                .from('profiles')
                .select('id, full_name, role')
                .in('role', ['admin', 'representative'])
                .order('full_name', { ascending: true }),
        ])

        let schemaReady = true
        let settingsData: Record<string, unknown> | null = null
        const { data: settingsRow, error: settingsError } = await supabaseAdmin
            .from('store_commercial_settings')
            .select('*')
            .eq('store_id', storeId)
            .maybeSingle()

        if (settingsError) {
            if (settingsError.code === '42P01') {
                schemaReady = false
            } else {
                throw settingsError
            }
        } else if (settingsRow) {
            settingsData = {
                ...settingsRow,
                financial_profile: normalizeFinancialProfile(settingsRow.financial_profile),
            }
        }

        return {
            data: {
                schemaReady,
                settings: settingsData,
                lookups: {
                    priceTables: priceTablesRes.data || [],
                    paymentMethods: methodsRes.data || [],
                    paymentConditions: conditionsRes.data || [],
                    paymentMethodConditions: methodLinksRes.data || [],
                    representatives: repsRes.data || [],
                },
            },
        }
    } catch (err: unknown) {
        console.error('Get Customer Commercial Setup Error:', err)
        return { error: toErrorMessage(err, 'Erro ao carregar configuracoes comerciais do cliente.') }
    }
}

export async function upsertCustomerCommercialSettings(
    payload: CustomerCommercialSettingsPayload
) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        if (!payload.storeId) {
            return { error: 'Loja do cliente nao informada.' }
        }

        const overridePriceTableId = toOptionalUuid(payload.overridePriceTableId)
        const overridePaymentMethodId = toOptionalUuid(payload.overridePaymentMethodId)
        const overridePaymentConditionId = toOptionalUuid(payload.overridePaymentConditionId)
        const representativeId =
            payload.representativeId === undefined ? undefined : toOptionalUuid(payload.representativeId)

        const financialProfile = normalizeFinancialProfile(payload.financialProfile)
        const maxDiscountPercentage = toNullableNumber(payload.maxDiscountPercentage)
        const creditLimit = toNullableNumber(payload.creditLimit)
        const commercialNotes = (payload.commercialNotes || '').trim() || null

        if (maxDiscountPercentage !== null && (maxDiscountPercentage < 0 || maxDiscountPercentage > 100)) {
            return { error: 'Desconto maximo deve ficar entre 0% e 100%.' }
        }

        if (creditLimit !== null && creditLimit < 0) {
            return { error: 'Limite de credito nao pode ser negativo.' }
        }

        if (overridePriceTableId) {
            const { data: table } = await supabaseAdmin
                .from('price_tables')
                .select('id')
                .eq('id', overridePriceTableId)
                .limit(1)
                .maybeSingle()
            if (!table?.id) {
                return { error: 'Tabela de preco especifica nao encontrada.' }
            }
        }

        if (overridePaymentMethodId) {
            const { data: method } = await supabaseAdmin
                .from('payment_methods')
                .select('id')
                .eq('id', overridePaymentMethodId)
                .limit(1)
                .maybeSingle()
            if (!method?.id) {
                return { error: 'Meio de pagamento especifico nao encontrado.' }
            }
        }

        let overridePaymentConditionInstallments: number | null = null
        if (overridePaymentConditionId) {
            const { data: condition } = await supabaseAdmin
                .from('payment_conditions')
                .select('id, installments')
                .eq('id', overridePaymentConditionId)
                .limit(1)
                .maybeSingle()
            if (!condition?.id) {
                return { error: 'Condicao de pagamento especifica nao encontrada.' }
            }
            overridePaymentConditionInstallments = Number(condition.installments || 1)
        }

        if (
            financialProfile === 'cash_only' &&
            overridePaymentConditionInstallments !== null &&
            overridePaymentConditionInstallments > 1
        ) {
            return {
                error: 'Perfil "Somente a vista" exige condicao com 1 parcela.',
            }
        }

        if (overridePaymentMethodId && overridePaymentConditionId) {
            const { data: link } = await supabaseAdmin
                .from('payment_method_conditions')
                .select('id')
                .eq('payment_method_id', overridePaymentMethodId)
                .eq('payment_condition_id', overridePaymentConditionId)
                .eq('is_active', true)
                .limit(1)
                .maybeSingle()

            if (!link?.id) {
                return {
                    error: 'A condicao selecionada nao esta ativa para o meio de pagamento escolhido.',
                }
            }
        }

        if (representativeId !== undefined) {
            if (representativeId) {
                const { data: representative } = await supabaseAdmin
                    .from('profiles')
                    .select('id, role')
                    .eq('id', representativeId)
                    .in('role', ['admin', 'representative'])
                    .limit(1)
                    .maybeSingle()

                if (!representative?.id) {
                    return { error: 'Representante vinculado nao encontrado.' }
                }
            }

            const { error: repUpdateError } = await supabaseAdmin
                .from('stores')
                .update({ representative_id: representativeId || null })
                .eq('id', payload.storeId)

            if (repUpdateError) {
                throw repUpdateError
            }
        }

        const upsertPayload = {
            store_id: payload.storeId,
            override_price_table_id: overridePriceTableId,
            override_payment_method_id: overridePaymentMethodId,
            override_payment_condition_id: overridePaymentConditionId,
            financial_profile: financialProfile,
            max_discount_percentage: maxDiscountPercentage,
            credit_limit: creditLimit,
            commercial_notes: commercialNotes,
            updated_at: new Date().toISOString(),
        }

        const { data, error } = await supabaseAdmin
            .from('store_commercial_settings')
            .upsert(upsertPayload, { onConflict: 'store_id' })
            .select('*')
            .single()

        if (error) {
            if (error.code === '42P01') {
                return {
                    error: 'A migration de configuracoes comerciais ainda nao foi aplicada no banco.',
                }
            }
            throw error
        }

        return {
            success: true,
            data: {
                ...data,
                financial_profile: normalizeFinancialProfile(data.financial_profile),
            },
        }
    } catch (err: unknown) {
        console.error('Upsert Customer Commercial Settings Error:', err)
        return { error: toErrorMessage(err, 'Erro ao salvar configuracoes comerciais.') }
    }
}

// ==================== REPRESENTATIVE COMMERCIAL SETTINGS ====================

export async function getRepresentativeCommercialSetup(profileId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        if (!profileId) {
            return { error: 'Representante nao informado.' }
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, full_name, status')
            .eq('id', profileId)
            .limit(1)
            .maybeSingle()

        if (profileError) throw profileError
        if (!profile?.id) return { error: 'Perfil nao encontrado.' }
        if (profile.role !== 'representative') {
            return { error: 'Este cadastro ainda nao e um representante.' }
        }

        const [priceTablesRes, linksRes, assignedCountRes, policyRes, portfolioLookupRes, manualRulesRes, auditLogRes, candidateStoresRes] = await Promise.all([
            supabaseAdmin
                .from('price_tables')
                .select('id, name, discount_percentage, is_default, is_active, valid_from, valid_until')
                .order('name', { ascending: true }),
            supabaseAdmin
                .from('representative_price_tables')
                .select('price_table_id')
                .eq('representative_id', profileId),
            supabaseAdmin
                .from('stores')
                .select('id', { count: 'exact', head: true })
                .eq('representative_id', profileId),
            supabaseAdmin
                .from('representative_customer_access_policies')
                .select('scope_mode, allowed_states, allowed_cities')
                .eq('representative_id', profileId)
                .maybeSingle(),
            supabaseAdmin
                .from('stores')
                .select('state, city')
                .is('representative_id', null)
                .eq('is_active', true),
            supabaseAdmin
                .from('representative_customer_access_rules')
                .select(`
                    store_id,
                    decision,
                    reason,
                    created_at,
                    updated_at,
                    store:stores!representative_customer_access_rules_store_id_fkey(
                        id,
                        company_name,
                        trade_name,
                        customer_code,
                        city,
                        state,
                        representative_id
                    )
                `)
                .eq('representative_id', profileId)
                .order('updated_at', { ascending: false }),
            supabaseAdmin
                .from('representative_customer_access_audit_logs')
                .select(`
                    id,
                    event_type,
                    entity_type,
                    store_id,
                    changed_by_profile_id,
                    before_state,
                    after_state,
                    notes,
                    created_at
                `)
                .eq('representative_id', profileId)
                .order('created_at', { ascending: false })
                .limit(80),
            supabaseAdmin
                .from('stores')
                .select(`
                    id,
                    company_name,
                    trade_name,
                    customer_code,
                    city,
                    state,
                    representative_id,
                    representative:profiles!stores_representative_id_fkey(id, full_name)
                `)
                .eq('is_active', true)
                .is('representative_id', null)
                .order('company_name', { ascending: true })
                .limit(120),
        ])

        let schemaReady = true
        let settingsData: Record<string, unknown> | null = null

        const { data: settingsRow, error: settingsError } = await supabaseAdmin
            .from('representative_commercial_settings')
            .select('*')
            .eq('profile_id', profileId)
            .maybeSingle()

        if (settingsError) {
            if (settingsError.code === '42P01') {
                schemaReady = false
            } else {
                throw settingsError
            }
        } else if (settingsRow) {
            settingsData = settingsRow
        }

        if (linksRes.error && linksRes.error.code === '42P01') {
            schemaReady = false
        } else if (linksRes.error) {
            throw linksRes.error
        }

        if (policyRes.error && policyRes.error.code === '42P01') {
            schemaReady = false
        } else if (policyRes.error) {
            throw policyRes.error
        }

        if (manualRulesRes.error && manualRulesRes.error.code === '42P01') {
            schemaReady = false
        } else if (manualRulesRes.error) {
            throw manualRulesRes.error
        }

        if (auditLogRes.error && auditLogRes.error.code === '42P01') {
            schemaReady = false
        } else if (auditLogRes.error) {
            throw auditLogRes.error
        }

        if (portfolioLookupRes.error) {
            throw portfolioLookupRes.error
        }

        if (candidateStoresRes.error) {
            throw candidateStoresRes.error
        }

        const rawAuditLogs = (auditLogRes.data || []) as Array<{
            id: string
            event_type: string | null
            entity_type: string | null
            store_id: string | null
            changed_by_profile_id: string | null
            before_state: Record<string, unknown> | null
            after_state: Record<string, unknown> | null
            notes: string | null
            created_at: string | null
        }>

        const auditStoreIds = Array.from(
            new Set(rawAuditLogs.map((entry) => entry.store_id).filter((value): value is string => Boolean(value)))
        )
        const auditActorIds = Array.from(
            new Set(rawAuditLogs.map((entry) => entry.changed_by_profile_id).filter((value): value is string => Boolean(value)))
        )

        const [auditStoresRes, auditActorsRes] = await Promise.all([
            auditStoreIds.length > 0
                ? supabaseAdmin
                    .from('stores')
                    .select('id, company_name, trade_name, customer_code')
                    .in('id', auditStoreIds)
                : Promise.resolve({ data: [], error: null }),
            auditActorIds.length > 0
                ? supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', auditActorIds)
                : Promise.resolve({ data: [], error: null }),
        ])

        if (auditStoresRes.error) throw auditStoresRes.error
        if (auditActorsRes.error) throw auditActorsRes.error

        const auditStoresMap = new Map((auditStoresRes.data || []).map((store) => [store.id, store]))
        const auditActorsMap = new Map((auditActorsRes.data || []).map((actor) => [actor.id, actor]))

        const auditLogs = rawAuditLogs.map((entry) => ({
            ...entry,
            changed_by_profile: entry.changed_by_profile_id
                ? (auditActorsMap.get(entry.changed_by_profile_id) || null)
                : null,
            store: entry.store_id ? (auditStoresMap.get(entry.store_id) || null) : null,
        }))

        const availableStates = Array.from(
            new Set(
                (portfolioLookupRes.data || [])
                    .map((row) => (row.state || '').trim().toUpperCase())
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

        const availableCities = Array.from(
            new Set(
                (portfolioLookupRes.data || [])
                    .map((row) => (row.city || '').trim())
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

        return {
            data: {
                schemaReady,
                profile,
                settings: settingsData,
                allowedPriceTableIds: (linksRes.data || []).map((row) => row.price_table_id),
                accessPolicy: {
                    scopeMode: policyRes.data?.scope_mode || 'assigned_only',
                    allowedStates: policyRes.data?.allowed_states || [],
                    allowedCities: policyRes.data?.allowed_cities || [],
                },
                manualRules: manualRulesRes.data || [],
                auditLogs,
                lookups: {
                    priceTables: priceTablesRes.data || [],
                    availableStates,
                    availableCities,
                    candidateStores: candidateStoresRes.data || [],
                },
                stats: {
                    assignedCustomers: assignedCountRes.count || 0,
                },
            },
        }
    } catch (err: unknown) {
        console.error('Get Representative Commercial Setup Error:', err)
        return { error: toErrorMessage(err, 'Erro ao carregar configuracoes do representante.') }
    }
}

export async function upsertRepresentativeCommercialSettings(
    payload: RepresentativeCommercialSettingsPayload
) {
    try {
        const adminUser = await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const profileId = toOptionalUuid(payload.profileId)
        if (!profileId) {
            return { error: 'Representante invalido.' }
        }

        const { data: representative, error: representativeError } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .eq('id', profileId)
            .limit(1)
            .maybeSingle()

        if (representativeError) throw representativeError
        if (!representative?.id || representative.role !== 'representative') {
            return { error: 'O perfil informado nao e um representante.' }
        }

        const maxDiscountPercentage = toNullableNumber(payload.maxDiscountPercentage)
        if (maxDiscountPercentage !== null && (maxDiscountPercentage < 0 || maxDiscountPercentage > 100)) {
            return { error: 'Desconto maximo deve ficar entre 0% e 100%.' }
        }

        const notes = (payload.notes || '').trim() || null
        const allowFreeNegotiation = payload.allowFreeNegotiation !== false
        const canOverridePriceTable = payload.canOverridePriceTable !== false
        const customerAccessMode = payload.customerAccessMode || 'assigned_only'
        const allowedPriceTableIds = sortStrings(normalizeStringArray(payload.allowedPriceTableIds))
        const allowedStates = sortStrings(
            normalizeStringArray(payload.allowedStates, (value) => value.toUpperCase())
        )
        const allowedCities = sortStrings(
            normalizeStringArray(payload.allowedCities)
        )
        const manualRulesInput = Array.from(
            (payload.manualCustomerRules || []).reduce((accumulator, item) => {
                const storeId = toOptionalUuid(item?.storeId)
                if (!storeId) return accumulator

                const decision = item?.decision === 'deny' ? 'deny' : 'allow'
                const reason = (item?.reason || '').trim() || null
                accumulator.set(storeId, {
                    storeId,
                    decision,
                    reason,
                })
                return accumulator
            }, new Map<string, { storeId: string; decision: 'allow' | 'deny'; reason: string | null }>())
        ).map(([, rule]) => rule)

        if (!['assigned_only', 'all_admin_portfolio', 'filtered_portfolio'].includes(customerAccessMode)) {
            return { error: 'Escopo de carteira invalido para o representante.' }
        }

        if (customerAccessMode === 'filtered_portfolio' && allowedStates.length === 0 && allowedCities.length === 0) {
            return { error: 'Selecione ao menos um estado ou uma cidade para o escopo filtrado.' }
        }

        if (allowedPriceTableIds.length > 0) {
            const { data: tables, error: tablesError } = await supabaseAdmin
                .from('price_tables')
                .select('id')
                .in('id', allowedPriceTableIds)

            if (tablesError) throw tablesError

            const foundIds = new Set((tables || []).map((table) => table.id))
            const missing = allowedPriceTableIds.filter((id) => !foundIds.has(id))
            if (missing.length > 0) {
                return { error: 'Uma ou mais tabelas selecionadas nao existem.' }
            }
        }

        const [existingSettingsRes, existingLinksRes, existingPolicyRes, existingRulesRes] = await Promise.all([
            supabaseAdmin
                .from('representative_commercial_settings')
                .select('max_discount_percentage, allow_free_negotiation, can_override_price_table, notes')
                .eq('profile_id', profileId)
                .maybeSingle(),
            supabaseAdmin
                .from('representative_price_tables')
                .select('price_table_id')
                .eq('representative_id', profileId),
            supabaseAdmin
                .from('representative_customer_access_policies')
                .select('scope_mode, allowed_states, allowed_cities')
                .eq('representative_id', profileId)
                .maybeSingle(),
            supabaseAdmin
                .from('representative_customer_access_rules')
                .select(`
                    store_id,
                    decision,
                    reason,
                    store:stores!representative_customer_access_rules_store_id_fkey(
                        id,
                        company_name,
                        trade_name,
                        customer_code,
                        city,
                        state,
                        representative_id
                    )
                `)
                .eq('representative_id', profileId),
        ])

        if (existingSettingsRes.error) {
            if (existingSettingsRes.error.code === '42P01') {
                return { error: 'A migration de configuracao do representante ainda nao foi aplicada no banco.' }
            }
            throw existingSettingsRes.error
        }

        if (existingLinksRes.error) {
            if (existingLinksRes.error.code === '42P01') {
                return { error: 'A migration de configuracao do representante ainda nao foi aplicada no banco.' }
            }
            throw existingLinksRes.error
        }

        if (existingPolicyRes.error) {
            if (existingPolicyRes.error.code === '42P01') {
                return { error: 'A migration de configuracao do representante ainda nao foi aplicada no banco.' }
            }
            throw existingPolicyRes.error
        }

        if (existingRulesRes.error) {
            if (existingRulesRes.error.code === '42P01') {
                return { error: 'A migration de regras de carteira por cliente ainda nao foi aplicada no banco.' }
            }
            throw existingRulesRes.error
        }

        const currentSettingsState = {
            maxDiscountPercentage:
                existingSettingsRes.data?.max_discount_percentage !== null &&
                    existingSettingsRes.data?.max_discount_percentage !== undefined
                    ? Number(existingSettingsRes.data.max_discount_percentage)
                    : null,
            allowFreeNegotiation: existingSettingsRes.data?.allow_free_negotiation !== false,
            canOverridePriceTable: existingSettingsRes.data?.can_override_price_table !== false,
            notes: (existingSettingsRes.data?.notes || '').trim() || null,
        }
        const targetSettingsState = {
            maxDiscountPercentage,
            allowFreeNegotiation,
            canOverridePriceTable,
            notes,
        }

        const currentPriceTableIds = sortStrings(
            normalizeStringArray((existingLinksRes.data || []).map((row) => row.price_table_id))
        )

        const currentPolicyState = {
            scopeMode: (existingPolicyRes.data?.scope_mode || 'assigned_only') as
                | 'assigned_only'
                | 'all_admin_portfolio'
                | 'filtered_portfolio',
            allowedStates: sortStrings(
                normalizeStringArray(existingPolicyRes.data?.allowed_states || [], (value) => value.toUpperCase())
            ),
            allowedCities: sortStrings(
                normalizeStringArray(existingPolicyRes.data?.allowed_cities || [])
            ),
        }
        const targetPolicyState = {
            scopeMode: customerAccessMode as 'assigned_only' | 'all_admin_portfolio' | 'filtered_portfolio',
            allowedStates,
            allowedCities,
        }

        const currentRulesMap = new Map(
            (existingRulesRes.data || []).map((rule) => [
                rule.store_id,
                {
                    storeId: rule.store_id,
                    decision: rule.decision === 'deny' ? 'deny' : 'allow',
                    reason: (rule.reason || '').trim() || null,
                    store: (rule as Record<string, unknown>).store as Record<string, unknown> | null,
                },
            ])
        )
        const targetRulesMap = new Map(
            manualRulesInput.map((rule) => [
                rule.storeId,
                {
                    storeId: rule.storeId,
                    decision: rule.decision,
                    reason: rule.reason,
                },
            ])
        )

        if (manualRulesInput.length > 0) {
            const manualStoreIds = manualRulesInput.map((rule) => rule.storeId)
            const { data: manualStores, error: manualStoresError } = await supabaseAdmin
                .from('stores')
                .select('id, representative_id, company_name, trade_name, customer_code')
                .in('id', manualStoreIds)

            if (manualStoresError) throw manualStoresError

            const storesById = new Map((manualStores || []).map((store) => [store.id, store]))
            const missingStoreIds = manualStoreIds.filter((storeId) => !storesById.has(storeId))
            if (missingStoreIds.length > 0) {
                return { error: 'Um ou mais clientes selecionados nao existem mais.' }
            }

            const blockedStore = manualStores?.find((store) => {
                if (currentRulesMap.has(store.id)) return false
                return Boolean(store.representative_id && store.representative_id !== profileId)
            })
            if (blockedStore) {
                const blockedName =
                    blockedStore.trade_name ||
                    blockedStore.company_name ||
                    blockedStore.customer_code ||
                    blockedStore.id
                return {
                    error: `O cliente "${blockedName}" pertence a outro representante e nao pode entrar nesta configuracao.`,
                }
            }
        }

        const { data: settingsRow, error: settingsError } = await supabaseAdmin
            .from('representative_commercial_settings')
            .upsert({
                profile_id: profileId,
                max_discount_percentage: maxDiscountPercentage,
                allow_free_negotiation: allowFreeNegotiation,
                can_override_price_table: canOverridePriceTable,
                notes,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'profile_id' })
            .select('*')
            .single()

        if (settingsError) {
            if (settingsError.code === '42P01') {
                return { error: 'A migration de configuracao do representante ainda nao foi aplicada no banco.' }
            }
            throw settingsError
        }

        const { error: cleanupError } = await supabaseAdmin
            .from('representative_price_tables')
            .delete()
            .eq('representative_id', profileId)

        if (cleanupError) {
            if (cleanupError.code === '42P01') {
                return { error: 'A migration de configuracao do representante ainda nao foi aplicada no banco.' }
            }
            throw cleanupError
        }

        if (allowedPriceTableIds.length > 0) {
            const { error: insertLinksError } = await supabaseAdmin
                .from('representative_price_tables')
                .insert(
                    allowedPriceTableIds.map((tableId) => ({
                        representative_id: profileId,
                        price_table_id: tableId,
                    }))
                )

            if (insertLinksError) throw insertLinksError
        }

        const { data: policyRow, error: policyError } = await supabaseAdmin
            .from('representative_customer_access_policies')
            .upsert({
                representative_id: profileId,
                scope_mode: customerAccessMode,
                allowed_states: allowedStates,
                allowed_cities: allowedCities,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'representative_id' })
            .select('scope_mode, allowed_states, allowed_cities')
            .single()

        if (policyError) {
            if (policyError.code === '42P01') {
                return { error: 'A migration de configuracao do representante ainda nao foi aplicada no banco.' }
            }
            throw policyError
        }

        const existingRuleIds = new Set(Array.from(currentRulesMap.keys()))
        const nextRuleIds = new Set(Array.from(targetRulesMap.keys()))
        const rulesToDelete = Array.from(existingRuleIds).filter((storeId) => !nextRuleIds.has(storeId))
        const rulesToInsert = manualRulesInput.filter((rule) => !existingRuleIds.has(rule.storeId))
        const rulesToUpdate = manualRulesInput.filter((rule) => existingRuleIds.has(rule.storeId))

        if (rulesToDelete.length > 0) {
            const { error: deleteRulesError } = await supabaseAdmin
                .from('representative_customer_access_rules')
                .delete()
                .eq('representative_id', profileId)
                .in('store_id', rulesToDelete)

            if (deleteRulesError) throw deleteRulesError
        }

        if (rulesToInsert.length > 0) {
            const { error: insertRulesError } = await supabaseAdmin
                .from('representative_customer_access_rules')
                .insert(
                    rulesToInsert.map((rule) => ({
                        representative_id: profileId,
                        store_id: rule.storeId,
                        decision: rule.decision,
                        reason: rule.reason,
                        created_by_profile_id: adminUser.id,
                        updated_by_profile_id: adminUser.id,
                        updated_at: new Date().toISOString(),
                    }))
                )

            if (insertRulesError) {
                if (insertRulesError.code === '42P01') {
                    return { error: 'A migration de regras de carteira por cliente ainda nao foi aplicada no banco.' }
                }
                throw insertRulesError
            }
        }

        if (rulesToUpdate.length > 0) {
            const { error: upsertRulesError } = await supabaseAdmin
                .from('representative_customer_access_rules')
                .upsert(
                    rulesToUpdate.map((rule) => ({
                        representative_id: profileId,
                        store_id: rule.storeId,
                        decision: rule.decision,
                        reason: rule.reason,
                        updated_by_profile_id: adminUser.id,
                        updated_at: new Date().toISOString(),
                    })),
                    { onConflict: 'representative_id,store_id' }
                )

            if (upsertRulesError) {
                if (upsertRulesError.code === '42P01') {
                    return { error: 'A migration de regras de carteira por cliente ainda nao foi aplicada no banco.' }
                }
                throw upsertRulesError
            }
        }

        if (!jsonStatesEqual(currentSettingsState, targetSettingsState)) {
            await logRepresentativeAccessAudit({
                supabaseAdmin,
                representativeId: profileId,
                changedByProfileId: adminUser.id,
                eventType: 'updated',
                entityType: 'commercial_settings',
                beforeState: currentSettingsState,
                afterState: targetSettingsState,
                notes: 'Atualizacao das configuracoes comerciais do representante.',
            })
        }

        if (!arraysEqual(currentPriceTableIds, allowedPriceTableIds)) {
            await logRepresentativeAccessAudit({
                supabaseAdmin,
                representativeId: profileId,
                changedByProfileId: adminUser.id,
                eventType: 'updated',
                entityType: 'price_tables',
                beforeState: { allowedPriceTableIds: currentPriceTableIds },
                afterState: { allowedPriceTableIds },
                notes: 'Atualizacao das tabelas de preco permitidas.',
            })
        }

        if (
            currentPolicyState.scopeMode !== targetPolicyState.scopeMode ||
            !arraysEqual(currentPolicyState.allowedStates, targetPolicyState.allowedStates) ||
            !arraysEqual(currentPolicyState.allowedCities, targetPolicyState.allowedCities)
        ) {
            await logRepresentativeAccessAudit({
                supabaseAdmin,
                representativeId: profileId,
                changedByProfileId: adminUser.id,
                eventType: 'updated',
                entityType: 'access_policy',
                beforeState: currentPolicyState,
                afterState: targetPolicyState,
                notes: 'Atualizacao da politica global de carteira do admin.',
            })
        }

        for (const [storeId, nextRule] of targetRulesMap.entries()) {
            const previousRule = currentRulesMap.get(storeId)
            if (!previousRule) {
                await logRepresentativeAccessAudit({
                    supabaseAdmin,
                    representativeId: profileId,
                    changedByProfileId: adminUser.id,
                    eventType: 'created',
                    entityType: 'manual_customer_rule',
                    storeId,
                    beforeState: null,
                    afterState: nextRule,
                    notes: 'Regra manual por cliente adicionada.',
                })
                continue
            }

            const normalizedPrevious = {
                storeId,
                decision: previousRule.decision,
                reason: previousRule.reason,
            }

            if (!jsonStatesEqual(normalizedPrevious, nextRule)) {
                await logRepresentativeAccessAudit({
                    supabaseAdmin,
                    representativeId: profileId,
                    changedByProfileId: adminUser.id,
                    eventType: 'updated',
                    entityType: 'manual_customer_rule',
                    storeId,
                    beforeState: normalizedPrevious,
                    afterState: nextRule,
                    notes: 'Regra manual por cliente atualizada.',
                })
            }
        }

        for (const storeId of rulesToDelete) {
            const previousRule = currentRulesMap.get(storeId)
            if (!previousRule) continue

            await logRepresentativeAccessAudit({
                supabaseAdmin,
                representativeId: profileId,
                changedByProfileId: adminUser.id,
                eventType: 'deleted',
                entityType: 'manual_customer_rule',
                storeId,
                beforeState: {
                    storeId,
                    decision: previousRule.decision,
                    reason: previousRule.reason,
                },
                afterState: null,
                notes: 'Regra manual por cliente removida.',
            })
        }

        return {
            success: true,
            data: {
                ...(settingsRow || {}),
                allowedPriceTableIds,
                customerAccessMode: policyRow?.scope_mode || 'assigned_only',
                allowedStates: policyRow?.allowed_states || [],
                allowedCities: policyRow?.allowed_cities || [],
                manualCustomerRules: manualRulesInput,
            },
        }
    } catch (err: unknown) {
        console.error('Upsert Representative Commercial Settings Error:', err)
        return { error: toErrorMessage(err, 'Erro ao salvar configuracoes do representante.') }
    }
}

export async function searchRepresentativePortfolioStores(input: {
    representativeId: string
    term?: string
    limit?: number
}) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const representativeId = toOptionalUuid(input.representativeId)
        if (!representativeId) {
            return { error: 'Representante invalido.' }
        }

        const safeLimit = Math.min(Math.max(Number(input.limit || 40), 5), 120)
        const term = (input.term || '').trim()

        let query = supabaseAdmin
            .from('stores')
            .select(`
                id,
                company_name,
                trade_name,
                customer_code,
                cnpj,
                city,
                state,
                representative_id,
                representative:profiles!stores_representative_id_fkey(id, full_name)
            `)
            .eq('is_active', true)
            .is('representative_id', null)
            .order('company_name', { ascending: true })
            .limit(safeLimit)

        if (term) {
            query = query.or(
                [
                    `company_name.ilike.%${term}%`,
                    `trade_name.ilike.%${term}%`,
                    `customer_code.ilike.%${term}%`,
                    `cnpj.ilike.%${term}%`,
                    `city.ilike.%${term}%`,
                    `state.ilike.%${term}%`,
                ].join(',')
            )
        }

        const { data, error } = await query
        if (error) throw error

        return { data: data || [] }
    } catch (err: unknown) {
        console.error('Search Representative Portfolio Stores Error:', err)
        return { error: toErrorMessage(err, 'Erro ao buscar clientes da carteira.') }
    }
}

// ==================== STORE ADDRESSES CRUD ====================

export async function getStoreAddresses(storeId: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const { data, error } = await supabaseAdmin
            .from('store_addresses')
            .select('*')
            .eq('store_id', storeId)
            .order('is_main', { ascending: false })
            .order('created_at', { ascending: true })

        if (error) throw error
        return { data: data || [] }
    } catch (err: unknown) {
        console.error('Get Addresses Error:', err)
        return { error: toErrorMessage(err, 'Erro ao buscar enderecos do cliente.') }
    }
}

export async function upsertStoreAddress(data: {
    id?: string,
    storeId: string,
    title: string,
    isMain: boolean,
    zipCode: string,
    address: string,
    number?: string,
    complement?: string,
    neighborhood?: string,
    city: string,
    state: string
}) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const payload = {
            store_id: data.storeId,
            title: data.title,
            is_main: data.isMain,
            zip_code: data.zipCode,
            address: data.address,
            number: data.number || null,
            complement: data.complement || null,
            neighborhood: data.neighborhood || null,
            city: data.city,
            state: data.state,
            updated_at: new Date().toISOString()
        }

        let result;
        if (data.id) {
            result = await supabaseAdmin.from('store_addresses')
                .update(payload)
                .eq('id', data.id)
        } else {
            // Se for o unico endereco, a trigger define como true, ou podemos confiar no formulario
            result = await supabaseAdmin.from('store_addresses')
                .insert(payload)
        }

        if (result.error) throw result.error
        return { success: true }
    } catch (err: unknown) {
        console.error('Upsert Address Error:', err)
        return { error: toErrorMessage(err, 'Erro ao salvar o endereco.') }
    }
}

export async function deleteStoreAddress(id: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        // Check if it's main. Although trigger handles new mains, deleting the only main might leave store without main.
        // We will just let them delete it for now.
        const { error } = await supabaseAdmin.from('store_addresses').delete().eq('id', id)

        if (error) throw error
        return { success: true }
    } catch (err: unknown) {
        console.error('Delete Address Error:', err)
        return { error: toErrorMessage(err, 'Erro ao excluir o endereco.') }
    }
}

// ==================== DELETE CUSTOMERS ====================

export async function deleteCustomerAction(id: string) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()
        return await deleteCustomerSafely(supabaseAdmin, id)
    } catch (err: unknown) {
        console.error('Delete Customer Action Error:', err)
        return { error: toErrorMessage(err, 'Erro ao excluir o cliente.') }
    }
}

export async function bulkDeleteCustomersAction(ids: string[]) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
        const deleteResults = await Promise.allSettled(uniqueIds.map((id) => deleteCustomerSafely(supabaseAdmin, id)))

        let successCount = 0
        const errorMessages: string[] = []

        deleteResults.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                if ('error' in result.value && result.value.error) {
                    console.error(`Error deleting customer ${uniqueIds[idx]}:`, result.value.error)
                    errorMessages.push(result.value.error)
                } else {
                    successCount++
                }
            } else {
                console.error(`Error deleting customer ${uniqueIds[idx]}:`, result.reason)
                errorMessages.push('Erro inesperado ao excluir cliente.')
            }
        })

        if (errorMessages.length > 0) {
            return { error: errorMessages.length === 1 ? errorMessages[0] : `Deletados: ${successCount}. Falhas: ${errorMessages.length}.` }
        }

        return { success: true }
    } catch (err: unknown) {
        console.error('Bulk Delete Customers Action Error:', err)
        return { error: toErrorMessage(err, 'Erro ao iniciar a exclusao em lote.') }
    }
}
