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
            .select('email')
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

        if (profile.role !== 'client') {
            return { error: 'Apenas clientes podem ter status alterado.' }
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
            .eq('role', 'client')

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
