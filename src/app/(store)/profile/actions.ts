'use server'

import { createClient } from '@/lib/supabase/server'

async function verifyClient() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado.')
    
    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('profile_id', user.id)
        .single()
        
    if (!store) throw new Error('Loja não encontrada para este usuário.')
    
    return { user, storeId: store.id, supabase }
}

export async function getMyAddresses() {
    try {
        const { storeId, supabase } = await verifyClient()

        const { data, error } = await supabase
            .from('store_addresses')
            .select('*')
            .eq('store_id', storeId)
            .order('is_main', { ascending: false })
            .order('created_at', { ascending: true })

        if (error) throw error
        return { data: data || [] }
    } catch (err: any) {
        return { error: err.message || 'Erro ao buscar endereços.' }
    }
}

export async function upsertMyAddress(data: {
    id?: string,
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
        const { storeId, supabase } = await verifyClient()

        const payload = {
            store_id: storeId,
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
            result = await supabase.from('store_addresses')
                .update(payload)
                .eq('id', data.id)
                .eq('store_id', storeId) // RLS já protege, mas é bom reforçar
        } else {
            result = await supabase.from('store_addresses')
                .insert(payload)
        }

        if (result.error) throw result.error
        return { success: true }
    } catch (err: any) {
        return { error: err.message || 'Erro ao salvar o endereço.' }
    }
}

export async function deleteMyAddress(id: string) {
    try {
        const { storeId, supabase } = await verifyClient()

        const { error } = await supabase
            .from('store_addresses')
            .delete()
            .eq('id', id)
            .eq('store_id', storeId) // Double check ownership

        if (error) throw error
        return { success: true }
    } catch (err: any) {
        return { error: err.message || 'Erro ao excluir o endereço.' }
    }
}
