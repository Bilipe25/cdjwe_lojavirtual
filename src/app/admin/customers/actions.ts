'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

// ==================== HELPER: Get Admin Supabase Client ====================

async function getAdminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('Chave SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.')
    }

    const cookieStore = await cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() { /* Don't mess with session cookies */ },
            },
        }
    )
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
    if (adminProfile?.role !== 'admin') throw new Error('Permissão negada')

    return user
}

// ==================== CREATE CUSTOMER ====================

export async function createCustomerAsAdmin(formData: FormData) {
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
        try { tagIds = JSON.parse(tagIdsJson) } catch (e) { }
    }
    const address = formData.get('address') as string
    const city = formData.get('city') as string
    const state = formData.get('state') as string
    const zipCode = formData.get('zipCode') as string

    if (!email || !password || !fullName || !companyName || !cnpj) {
        return { error: 'Campos obrigatórios faltando.' }
    }

    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: 'client'
            }
        })

        if (authError) throw authError

        // 2. Update Profile → approved
        await supabaseAdmin.from('profiles')
            .update({
                full_name: fullName,
                phone: phone || null,
                status: 'approved'
            })
            .eq('id', authData.user.id)

        // 3. Create Store
        const { data: storeData, error: storeError } = await supabaseAdmin.from('stores')
            .insert({
                profile_id: authData.user.id,
                company_name: companyName,
                trade_name: tradeName || null,
                cnpj,
                email,
                phone: phone || null,
                customer_type_id: customerTypeId || null,
                representative_id: representativeId || null,
                address: address || null,
                city: city || null,
                state: state || null,
                zip_code: zipCode || null,
            })
            .select('id')
            .single()

        if (storeError) throw storeError

        const newStoreId = storeData?.id

        // 4. Create tags if any
        if (newStoreId && tagIds.length > 0) {
            const tagsToInsert = tagIds.map(tagId => ({
                store_id: newStoreId,
                tag_id: tagId
            }))
            await supabaseAdmin.from('store_tags').insert(tagsToInsert)
        }

        // 4.5 Insert initial main address if provided
        if (newStoreId && (address || zipCode || city || state)) {
            await supabaseAdmin.from('store_addresses').insert({
                store_id: newStoreId,
                title: 'Endereço Principal',
                is_main: true,
                zip_code: zipCode || '',
                address: address || '',
                city: city || '',
                state: state || '',
                number: '',
                neighborhood: '',
            })
        }

        // 5. Send welcome email
        try {
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
                to: email,
                subject: `✅ Sua conta foi aprovada — ${systemName}`,
                senderName: systemName,
                react: React.createElement(AccountApprovedEmail, {
                    clientName: fullName,
                    systemName,
                    appUrl,
                }),
            })
        } catch (emailErr) {
            console.error('[ADMIN CREATE CUSTOMER EMAIL] Error:', emailErr)
        }

        return { success: true }
    } catch (err: any) {
        console.error('Customer Creation Error:', err)
        return { error: err.message || 'Erro ao criar o cliente no servidor.' }
    }
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
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        // Update profile
        const { error: profileError } = await supabaseAdmin.from('profiles')
            .update({
                full_name: data.fullName,
                phone: data.phone || null,
            })
            .eq('id', profileId)

        if (profileError) throw profileError

        // Update store
        const { error: storeError } = await supabaseAdmin.from('stores')
            .update({
                company_name: data.companyName,
                trade_name: data.tradeName || null,
                cnpj: data.cnpj,
                customer_type_id: data.customerTypeId || null,
                representative_id: data.representativeId || null,
                address: data.address || null,
                city: data.city || null,
                state: data.state || null,
                zip_code: data.zipCode || null,
            })
            .eq('id', storeId)

        if (storeError) throw storeError

        // Update tags
        if (data.tagIds !== undefined) {
            // Remove existing
            await supabaseAdmin.from('store_tags').delete().eq('store_id', storeId)
            
            // Insert new
            if (data.tagIds.length > 0) {
                const tagsToInsert = data.tagIds.map(tagId => ({
                    store_id: storeId,
                    tag_id: tagId
                }))
                await supabaseAdmin.from('store_tags').insert(tagsToInsert)
            }
        }

        return { success: true }
    } catch (err: any) {
        console.error('Customer Update Error:', err)
        return { error: err.message || 'Erro ao atualizar o cliente.' }
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
    } catch (err: any) {
        console.error('Set Password Error:', err)
        return { error: err.message || 'Erro ao alterar senha.' }
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

// ==================== IMPORT CUSTOMERS FROM CSV ====================

interface CSVCustomerRow {
    fullName: string
    email: string
    phone?: string
    companyName: string
    cnpj: string
    customerType?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
}

export async function importCustomersFromCSV(rows: CSVCustomerRow[]) {
    try {
        await verifyAdmin()
        const supabaseAdmin = await getAdminClient()

        // Load customer types for name→id mapping
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
            try {
                if (!row.email || !row.fullName || !row.companyName || !row.cnpj) {
                    results.push({ row: i + 1, status: 'error', message: 'Campos obrigatórios faltando' })
                    continue
                }

                // Generate a temporary password
                const tempPassword = Math.random().toString(36).slice(-8) + 'A1!'

                // Create Auth User
                const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email: row.email,
                    password: tempPassword,
                    email_confirm: true,
                    user_metadata: {
                        full_name: row.fullName,
                        role: 'client'
                    }
                })

                if (authError) {
                    results.push({ row: i + 1, status: 'error', message: authError.message })
                    continue
                }

                // Set profile as imported
                await supabaseAdmin.from('profiles')
                    .update({
                        full_name: row.fullName,
                        phone: row.phone || null,
                        status: 'imported'
                    })
                    .eq('id', authData.user.id)

                // Resolve customer type
                const typeId = row.customerType
                    ? typeMap.get(row.customerType.toLowerCase()) || null
                    : null

                // Create Store
                await supabaseAdmin.from('stores').insert({
                    profile_id: authData.user.id,
                    company_name: row.companyName,
                    cnpj: row.cnpj,
                    email: row.email,
                    phone: row.phone || null,
                    customer_type_id: typeId,
                    address: row.address || null,
                    city: row.city || null,
                    state: row.state || null,
                    zip_code: row.zipCode || null,
                })

                results.push({ row: i + 1, status: 'success', message: 'Importado com sucesso' })
            } catch (err: any) {
                results.push({ row: i + 1, status: 'error', message: err.message || 'Erro desconhecido' })
            }
        }

        const successCount = results.filter(r => r.status === 'success').length
        return { success: true, results, totalImported: successCount, totalErrors: results.length - successCount }
    } catch (err: any) {
        console.error('Import CSV Error:', err)
        return { error: err.message || 'Erro ao importar clientes.' }
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

        // Fetch customer data
        const { data: profile } = await supabaseAdmin.from('profiles')
            .select('full_name, email, phone')
            .eq('id', profileId)
            .single()

        if (!profile) return { error: 'Cliente não encontrado' }

        const { data: store } = await supabaseAdmin.from('stores')
            .select('company_name')
            .eq('profile_id', profileId)
            .single()

        const { data: settings } = await supabaseAdmin
            .from('system_settings')
            .select('system_name, whatsapp')
            .limit(1)
            .single()

        const systemName = settings?.system_name || 'CDJWE'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'
        const loginUrl = `${appUrl}/login`

        if (channel === 'whatsapp') {
            const phone = profile.phone?.replace(/\D/g, '')
            if (!phone) return { error: 'Cliente não possui telefone cadastrado' }

            const message = encodeURIComponent(
                `Olá ${profile.full_name}! 👋\n\n` +
                `Seu acesso ao *${systemName}* está liberado!\n\n` +
                `🔗 Link de acesso: ${loginUrl}\n` +
                `📧 Usuário: ${profile.email}\n` +
                (password ? `🔑 Senha: ${password}\n` : '') +
                `\nEm caso de dúvidas, entre em contato conosco.`
            )

            const whatsappUrl = `https://wa.me/55${phone}?text=${message}`
            return { success: true, whatsappUrl }
        }

        if (channel === 'email') {
            try {
                const { sendEmail } = await import('@/lib/email')
                const React = (await import('react')).default
                const { default: AccountApprovedEmail } = await import('@/emails/AccountApprovedEmail')

                await sendEmail({
                    to: profile.email,
                    subject: `🔑 Seus dados de acesso — ${systemName}`,
                    senderName: systemName,
                    react: React.createElement(AccountApprovedEmail, {
                        clientName: profile.full_name,
                        clientEmail: profile.email,
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

        return { error: 'Canal de envio inválido' }
    } catch (err: any) {
        console.error('Send Access Link Error:', err)
        return { error: err.message || 'Erro ao enviar link de acesso.' }
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
    } catch (err: any) {
        console.error('Get Audit Log Error:', err)
        return { error: err.message || 'Erro ao buscar histórico de acessos.' }
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
    } catch (err: any) {
        console.error('Get Customer Orders Error:', err)
        return { error: err.message || 'Erro ao buscar pedidos.' }
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
    } catch (err: any) {
        console.error('Get Tags Error:', err)
        return { error: err.message || 'Erro ao buscar tags.' }
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
    } catch (err: any) {
        console.error('Get Representatives Error:', err)
        return { error: err.message || 'Erro ao buscar representantes.' }
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
    } catch (err: any) {
        console.error('Get Addresses Error:', err)
        return { error: err.message || 'Erro ao buscar endereços do cliente.' }
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
            // Se for o único endereço, a trigger define como true, ou podemos confiar no formulário
            result = await supabaseAdmin.from('store_addresses')
                .insert(payload)
        }

        if (result.error) throw result.error
        return { success: true }
    } catch (err: any) {
        console.error('Upsert Address Error:', err)
        return { error: err.message || 'Erro ao salvar o endereço.' }
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
    } catch (err: any) {
        console.error('Delete Address Error:', err)
        return { error: err.message || 'Erro ao excluir o endereço.' }
    }
}
